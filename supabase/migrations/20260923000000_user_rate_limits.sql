-- User-based rate limiting for session-authenticated inference
-- Separate table from api_rate_limits to keep API-key and session rate limits independent

-- ============================================================
-- 1. User rate limit tracking table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_rate_limits (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  window_start    TIMESTAMPTZ NOT NULL,
  count           INT NOT NULL DEFAULT 1,
  period_seconds  INT NOT NULL DEFAULT 60,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT user_rate_limits_unique_window UNIQUE (user_id, window_start, period_seconds)
);

CREATE INDEX IF NOT EXISTS idx_user_rate_limits_user_window
  ON public.user_rate_limits(user_id, window_start);

ALTER TABLE public.user_rate_limits ENABLE ROW LEVEL SECURITY;
-- No policies — infrastructure table, service_role only

-- ============================================================
-- 2. Atomic check-and-increment for user rate limits
-- ============================================================
CREATE OR REPLACE FUNCTION public.check_and_increment_user_rate_limit(
  p_user_id         UUID,
  p_period_seconds  INT DEFAULT 60,
  p_max_requests    INT DEFAULT 20
)
RETURNS TABLE(allowed BOOLEAN, current_count INT, limit_val INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window_start TIMESTAMPTZ;
  v_new_count    INT;
BEGIN
  v_window_start := date_trunc('second', now()) - make_interval(secs => (extract(epoch FROM now())::INT % p_period_seconds));

  INSERT INTO public.user_rate_limits (user_id, window_start, count, period_seconds)
  VALUES (p_user_id, v_window_start, 1, p_period_seconds)
  ON CONFLICT (user_id, window_start, period_seconds)
  DO UPDATE SET count = user_rate_limits.count + 1
  RETURNING count INTO v_new_count;

  RETURN QUERY SELECT (v_new_count <= p_max_requests), v_new_count, p_max_requests;
END;
$$;

REVOKE ALL ON FUNCTION public.check_and_increment_user_rate_limit(UUID, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_and_increment_user_rate_limit(UUID, INT, INT) TO service_role;
