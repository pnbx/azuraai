-- Guest free-chat quota
--
-- WHY THIS EXISTS
--   The per-user daily cap (increment_app_chat_usage) only ever ran when a
--   Supabase session was present. The mobile app ships with no accounts, so
--   essentially every real app user is a guest — and guests were UNLIMITED.
--   Any stranger could drain the OpenRouter free pool with one script.
--   This adds a second, anonymous counter keyed on a hashed device id so
--   guests are metered too, with a lower cap than signed-in users (signing
--   in should be worth something).
--
-- PRIVACY
--   guest_id is a SHA-256 of the client-supplied device UUID salted with
--   APP_GUEST_ID_PEPPER. It is not reversible to the device, not an IP, and
--   not tied to an account. Rotating the pepper resets every guest counter.
--
-- SECURITY
--   RLS on with no policies + service_role-only EXECUTE means the table is
--   unreachable from the anon/authenticated roles. Without the revokes any
--   visitor could both read the counters and inflate someone else's, which
--   would lock a victim out of the free tier.

CREATE TABLE IF NOT EXISTS public.app_guest_chat_usage (
  guest_id   TEXT        NOT NULL,
  usage_date DATE        NOT NULL,
  used       INT         NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (guest_id, usage_date)
);

ALTER TABLE public.app_guest_chat_usage ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.app_guest_chat_usage IS
  'Per-guest (anonymous device) daily free-chat counter. guest_id = sha256(device_uuid + pepper).';

-- Atomic guest counter, mirroring increment_app_chat_usage.
--
-- The target table is aliased `t` and `t.used` is qualified on purpose. With
-- RETURNS TABLE(allowed, used, cap), an unqualified `used` is ambiguous
-- between the OUT parameter and the column, and Postgres raises 42702 on every
-- single call. The routes fail open on RPC errors, so that would silently
-- disable the cap instead of surfacing it — which is exactly how the original
-- per-user cap went unenforced for so long.
CREATE OR REPLACE FUNCTION public.increment_app_guest_chat_usage(
  p_guest_id TEXT,
  p_daily_cap INT DEFAULT 10
)
RETURNS TABLE(allowed BOOLEAN, used INT, cap INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_used INT;
  v_today DATE := (now() AT TIME ZONE 'utc')::date;
BEGIN
  -- An empty key would collapse every guest onto one shared counter, turning
  -- the cap into a global limit that a single anonymous request could trip.
  IF p_guest_id IS NULL OR length(btrim(p_guest_id)) < 16 THEN
    RETURN QUERY SELECT false, p_daily_cap, p_daily_cap;
    RETURN;
  END IF;

  INSERT INTO public.app_guest_chat_usage AS t (guest_id, usage_date, used, updated_at)
  VALUES (btrim(p_guest_id), v_today, 1, now())
  ON CONFLICT (guest_id, usage_date)
  DO UPDATE SET used = t.used + 1, updated_at = now()
  RETURNING t.used INTO v_used;

  RETURN QUERY SELECT (v_used <= p_daily_cap), v_used, p_daily_cap;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_app_guest_chat_usage(TEXT, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.increment_app_guest_chat_usage(TEXT, INT) FROM anon;
REVOKE ALL ON FUNCTION public.increment_app_guest_chat_usage(TEXT, INT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.increment_app_guest_chat_usage(TEXT, INT) TO service_role;

-- Housekeeping: guests are cheap rows but the table grows one per active
-- device per day forever. Drop anything older than 45 days.
CREATE INDEX IF NOT EXISTS app_guest_chat_usage_date_idx
  ON public.app_guest_chat_usage (usage_date);