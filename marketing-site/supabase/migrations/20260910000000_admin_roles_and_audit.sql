-- Phase 9: Admin Roles & Audit Log
-- Adds role-based authorization and append-only audit trail.

-- 1. Add role column to users
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user'
  CHECK (role IN ('user', 'admin'));

CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);

-- 2. user_roles table — server-side role assignment ledger
CREATE TABLE IF NOT EXISTS public.user_roles (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('user', 'admin')),
  granted_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);

-- One active role per user (partial UNIQUE must be an index, not inline DDL)
CREATE UNIQUE INDEX IF NOT EXISTS user_roles_one_active_role
  ON public.user_roles (user_id, role) WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_user_roles_user ON public.user_roles(user_id);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- No RLS policies — only accessible via service_role (server-side admin checks)

-- 3. audit_log table — append-only privileged action log
CREATE TABLE IF NOT EXISTS public.audit_log (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_id   UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  action     TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id  TEXT,
  result     TEXT NOT NULL DEFAULT 'success' CHECK (result IN ('success', 'failure', 'denied')),
  metadata   JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON public.audit_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON public.audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON public.audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_target ON public.audit_log(target_type, target_id);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- No RLS policies — only accessible via service_role

-- Prevent deletes on audit_log from application role
REVOKE DELETE ON public.audit_log FROM PUBLIC;
REVOKE UPDATE ON public.audit_log FROM PUBLIC;

-- 4. RPC: check if a user is admin (used by requireAdmin)
CREATE OR REPLACE FUNCTION public.is_admin(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = p_user_id AND role = 'admin'
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_admin(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin(UUID) TO service_role;

-- 5. RPC: log an audit event (append-only)
CREATE OR REPLACE FUNCTION public.log_audit_event(
  p_actor_id    UUID,
  p_action      TEXT,
  p_target_type TEXT,
  p_target_id   TEXT,
  p_result      TEXT DEFAULT 'success',
  p_metadata    JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.audit_log (actor_id, action, target_type, target_id, result, metadata)
  VALUES (p_actor_id, p_action, p_target_type, p_target_id, p_result, p_metadata)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.log_audit_event(UUID, TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_audit_event(UUID, TEXT, TEXT, TEXT, TEXT, JSONB) TO service_role;

-- 6. RPC: set user role (admin operation)
CREATE OR REPLACE FUNCTION public.set_user_role(
  p_user_id   UUID,
  p_role      TEXT,
  p_granted_by UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_role NOT IN ('user', 'admin') THEN
    RAISE EXCEPTION 'Invalid role: %', p_role;
  END IF;

  -- Update the users table
  UPDATE public.users SET role = p_role WHERE id = p_user_id;

  -- Revoke any existing active role
  UPDATE public.user_roles
  SET revoked_at = now()
  WHERE user_id = p_user_id AND revoked_at IS NULL;

  -- Insert new role assignment
  INSERT INTO public.user_roles (user_id, role, granted_by)
  VALUES (p_user_id, p_role, p_granted_by);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_user_role(UUID, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_user_role(UUID, TEXT, UUID) TO service_role;
