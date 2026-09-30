-- ============================================================
-- App Free Gateway: OpenRouter key pool + app chat usage
-- ============================================================

-- 1. OpenRouter API keys (server-side pool; plaintext key never returned to clients)
CREATE TABLE IF NOT EXISTS public.openrouter_keys (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  label            TEXT NOT NULL DEFAULT 'key',
  api_key          TEXT NOT NULL UNIQUE,
  enabled          BOOLEAN NOT NULL DEFAULT TRUE,
  daily_limit      INT  NOT NULL DEFAULT 50,
  used_today       INT  NOT NULL DEFAULT 0,
  usage_date       DATE NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  cooldown_until   TIMESTAMPTZ,
  failure_count    INT  NOT NULL DEFAULT 0,
  last_used_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_openrouter_keys_pick
  ON public.openrouter_keys(enabled, usage_date, used_today)
  WHERE enabled;

ALTER TABLE public.openrouter_keys ENABLE ROW LEVEL SECURITY;
-- No policies: infrastructure table, service_role only.

-- 2. Daily per-user message cap for the free app chat
CREATE TABLE IF NOT EXISTS public.app_chat_usage (
  user_id        UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  usage_date     DATE NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  used           INT  NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, usage_date)
);

ALTER TABLE public.app_chat_usage ENABLE ROW LEVEL SECURITY;
-- No policies: service_role only.

-- 3. Atomic pool checkout: marks one healthy key as used, rolls over
--    daily counters, returns NULL when the pool is exhausted/cooling down.
CREATE OR REPLACE FUNCTION public.pick_openrouter_key(
  p_daily_limit_cap INT DEFAULT 50
)
RETURNS TABLE(id UUID, api_key TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row RECORD;
  v_today DATE := (now() AT TIME ZONE 'utc')::date;
BEGIN
  -- Reset counters that rolled over to a new UTC day
  UPDATE public.openrouter_keys
     SET used_today = 0, usage_date = v_today
   WHERE usage_date < v_today;

  FOR v_row IN
    SELECT *
      FROM public.openrouter_keys
     WHERE enabled = TRUE
       AND usage_date = v_today
       AND used_today < LEAST(daily_limit, p_daily_limit_cap)
       AND (cooldown_until IS NULL OR cooldown_until <= now())
     ORDER BY used_today ASC, last_used_at NULLS FIRST, created_at ASC
     FOR UPDATE SKIP LOCKED
     LIMIT 1
  LOOP
    UPDATE public.openrouter_keys
       SET used_today = used_today + 1,
           last_used_at = now(),
           failure_count = 0
     WHERE id = v_row.id;

    RETURN QUERY SELECT v_row.id, v_row.api_key;
    RETURN;
  END LOOP;

  -- Pool exhausted or all keys cooling down
  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.pick_openrouter_key(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pick_openrouter_key(INT) TO service_role;

-- 4. Atomic per-user daily counter (true upsert, PK conflict target)
CREATE OR REPLACE FUNCTION public.increment_app_chat_usage(
  p_user_id UUID,
  p_daily_cap INT DEFAULT 30
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
  INSERT INTO public.app_chat_usage (user_id, usage_date, used)
  VALUES (p_user_id, v_today, 1)
  ON CONFLICT (user_id, usage_date)
  DO UPDATE SET used = app_chat_usage.used + 1
  RETURNING used INTO v_used;

  RETURN QUERY SELECT (v_used <= p_daily_cap), v_used, p_daily_cap;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_app_chat_usage(UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_app_chat_usage(UUID, INT) TO service_role;
