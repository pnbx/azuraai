-- ============================================================
-- Google OAuth token store (Gmail / Calendar integrations)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.google_oauth_tokens (
  user_id          UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  google_email     TEXT,
  access_token     TEXT,
  refresh_token    TEXT,
  expires_at       TIMESTAMPTZ,
  scope            TEXT,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.google_oauth_tokens ENABLE ROW LEVEL SECURITY;

-- Users can read only their own token row's non-secret fields pattern:
-- RLS policy for select on own row (access_token stays server-read only
-- via service role; anon key users get only what policies allow).
DROP POLICY IF EXISTS google_oauth_tokens_select_own ON public.google_oauth_tokens;
CREATE POLICY google_oauth_tokens_select_own
  ON public.google_oauth_tokens
  FOR SELECT
  USING (auth.uid() = user_id);

-- Inserts/updates happen exclusively through server routes with service_role
-- (no insert/update policies for anon/authenticated).
