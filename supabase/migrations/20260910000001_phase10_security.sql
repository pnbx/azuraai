-- Phase 10: Security, Rate Limiting & Usage Enforcement
-- Adds: revoked_at on api_keys, quotas table, reservations table,
--        atomic RPCs for rate limiting, reservation/settle/release, usage recording

-- ============================================================
-- 1. Fix missing revoked_at column on api_keys
-- ============================================================
ALTER TABLE public.api_keys
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;

-- ============================================================
-- 2. Per-key quota configuration
-- ============================================================
CREATE TABLE IF NOT EXISTS public.quotas (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key_id        UUID NOT NULL UNIQUE REFERENCES public.api_keys(id) ON DELETE CASCADE,
  max_requests_per_minute INT,
  max_tokens_per_month   BIGINT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quotas_key ON public.quotas(key_id);

ALTER TABLE public.quotas ENABLE ROW LEVEL SECURITY;
-- No policies — infrastructure table, service_role only

-- ============================================================
-- 3. Per-request fund reservations (overspend protection)
-- ============================================================
CREATE TYPE public.reservation_status AS ENUM ('pending', 'settled', 'released');

CREATE TABLE IF NOT EXISTS public.inference_reservations (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id          UUID NOT NULL REFERENCES public.users(id),
  key_id           UUID NOT NULL REFERENCES public.api_keys(id),
  request_id       UUID NOT NULL UNIQUE,
  reserved_amount  BIGINT NOT NULL,
  actual_cost      BIGINT,
  status           public.reservation_status NOT NULL DEFAULT 'pending',
  input_tokens     BIGINT,
  output_tokens    BIGINT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  settled_at       TIMESTAMPTZ,

  CONSTRAINT reservations_reserved_positive CHECK (reserved_amount > 0),
  CONSTRAINT reservations_actual_non_negative CHECK (actual_cost IS NULL OR actual_cost >= 0)
);

CREATE INDEX IF NOT EXISTS idx_reservations_user   ON public.inference_reservations(user_id);
CREATE INDEX IF NOT EXISTS idx_reservations_status ON public.inference_reservations(status);
CREATE INDEX IF NOT EXISTS idx_reservations_key    ON public.inference_reservations(key_id);

ALTER TABLE public.inference_reservations ENABLE ROW LEVEL SECURITY;
-- No policies — service_role only

-- ============================================================
-- 4. Rate limit check + increment (atomic, single RPC)
-- ============================================================
CREATE OR REPLACE FUNCTION public.check_and_increment_rate_limit(
  p_key_id       UUID,
  p_period_seconds INT DEFAULT 60,
  p_max_requests  INT DEFAULT 60
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
  -- Align to UTC window boundaries
  v_window_start := date_trunc('second', now()) - make_interval(secs => (extract(epoch FROM now())::INT % p_period_seconds));

  -- Atomic upsert: increment counter or create new window row
  INSERT INTO public.api_rate_limits (key_id, window_start, count, period_seconds)
  VALUES (p_key_id, v_window_start, 1, p_period_seconds)
  ON CONFLICT (key_id, window_start, period_seconds)
  DO UPDATE SET count = api_rate_limits.count + 1
  RETURNING count INTO v_new_count;

  RETURN QUERY SELECT (v_new_count <= p_max_requests), v_new_count, p_max_requests;
END;
$$;

REVOKE ALL ON FUNCTION public.check_and_increment_rate_limit(UUID, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_and_increment_rate_limit(UUID, INT, INT) TO service_role;

-- ============================================================
-- 5. Token quota check (monthly)
-- ============================================================
CREATE OR REPLACE FUNCTION public.check_token_quota(
  p_user_id UUID,
  p_max_tokens BIGINT DEFAULT NULL
)
RETURNS TABLE(allowed BOOLEAN, used_tokens BIGINT, quota_limit BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month_start TIMESTAMPTZ;
  v_used        BIGINT;
BEGIN
  v_month_start := date_trunc('month', now());

  SELECT COALESCE(SUM(input_tokens + output_tokens), 0)
    INTO v_used
  FROM public.usage_logs
  WHERE user_id = p_user_id
    AND request_ts >= v_month_start;

  IF p_max_tokens IS NULL THEN
    RETURN QUERY SELECT TRUE, v_used, NULL::BIGINT;
  ELSE
    RETURN QUERY SELECT (v_used < p_max_tokens), v_used, p_max_tokens;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.check_token_quota(UUID, BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_token_quota(UUID, BIGINT) TO service_role;

-- ============================================================
-- 6. Reserve funds atomically (SELECT FOR UPDATE on balances)
-- ============================================================
CREATE OR REPLACE FUNCTION public.reserve_funds_for_inference(
  p_user_id   UUID,
  p_key_id    UUID,
  p_request_id UUID,
  p_reserved_amount BIGINT
)
RETURNS TABLE(success BOOLEAN, reservation_id UUID, new_balance BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance_row RECORD;
  v_wallet_tx_id UUID;
  v_res_id       UUID;
BEGIN
  -- Lock balance row
  SELECT balance_cents, id INTO v_balance_row
  FROM public.balances
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::BIGINT;
    RETURN;
  END IF;

  -- Check sufficient balance
  IF v_balance_row.balance_cents < p_reserved_amount THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, v_balance_row.balance_cents;
    RETURN;
  END IF;

  -- Debit reserved amount
  UPDATE public.balances
  SET balance_cents = balance_cents - p_reserved_amount,
      updated_at    = now()
  WHERE id = v_balance_row.id;

  -- Ledger entry
  INSERT INTO public.wallet_transactions
    (user_id, transaction_type, amount_cents, currency, balance_before_cents,
     balance_after_cents, reference_id, status, metadata)
  VALUES
    (p_user_id, 'usage_charge', p_reserved_amount, 'TOMAN',
     v_balance_row.balance_cents,
     v_balance_row.balance_cents - p_reserved_amount,
     NULL, 'completed',
     jsonb_build_object('type', 'reservation', 'request_id', p_request_id))
  RETURNING id INTO v_wallet_tx_id;

  -- Reservation record
  INSERT INTO public.inference_reservations
    (user_id, key_id, request_id, reserved_amount, status)
  VALUES
    (p_user_id, p_key_id, p_request_id, p_reserved_amount, 'pending')
  RETURNING id INTO v_res_id;

  RETURN QUERY SELECT TRUE, v_res_id, v_balance_row.balance_cents - p_reserved_amount;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_funds_for_inference(UUID, UUID, UUID, BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_funds_for_inference(UUID, UUID, UUID, BIGINT) TO service_role;

-- ============================================================
-- 7. Settle reservation (debit difference or release surplus)
-- ============================================================
CREATE OR REPLACE FUNCTION public.settle_inference_reservation(
  p_reservation_id UUID,
  p_actual_cost    BIGINT,
  p_input_tokens   BIGINT,
  p_output_tokens  BIGINT
)
RETURNS TABLE(success BOOLEAN, refund_amount BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_res         RECORD;
  v_balance_row RECORD;
  v_diff        BIGINT;
  v_refund      BIGINT := 0;
BEGIN
  -- Lock reservation
  SELECT * INTO v_res
  FROM public.inference_reservations
  WHERE id = p_reservation_id AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 0::BIGINT;
    RETURN;
  END IF;

  -- Lock balance
  SELECT balance_cents, id INTO v_balance_row
  FROM public.balances
  WHERE user_id = v_res.user_id
  FOR UPDATE;

  v_diff := v_res.reserved_amount - p_actual_cost;

  IF v_diff > 0 THEN
    -- Surplus: credit back
    UPDATE public.balances
    SET balance_cents = balance_cents + v_diff,
        updated_at    = now()
    WHERE id = v_balance_row.id;

    INSERT INTO public.wallet_transactions
      (user_id, transaction_type, amount_cents, currency, balance_before_cents,
       balance_after_cents, reference_id, status, metadata)
    VALUES
      (v_res.user_id, 'refund', v_diff, 'TOMAN',
       v_balance_row.balance_cents,
       v_balance_row.balance_cents + v_diff,
       NULL, 'completed',
       jsonb_build_object('type', 'settle_release', 'reservation_id', p_reservation_id));

    v_refund := v_diff;
  ELSIF v_diff < 0 THEN
    -- Overage: debit extra
    UPDATE public.balances
    SET balance_cents = balance_cents + v_diff,
        updated_at    = now()
    WHERE id = v_balance_row.id;

    INSERT INTO public.wallet_transactions
      (user_id, transaction_type, amount_cents, currency, balance_before_cents,
       balance_after_cents, reference_id, status, metadata)
    VALUES
      (v_res.user_id, 'usage_charge', -v_diff, 'TOMAN',
       v_balance_row.balance_cents,
       v_balance_row.balance_cents + v_diff,
       NULL, 'completed',
       jsonb_build_object('type', 'settle_overage', 'reservation_id', p_reservation_id));
  END IF;

  -- Mark reservation settled
  UPDATE public.inference_reservations
  SET status      = 'settled',
      actual_cost = p_actual_cost,
      input_tokens  = p_input_tokens,
      output_tokens = p_output_tokens,
      settled_at  = now()
  WHERE id = p_reservation_id;

  RETURN QUERY SELECT TRUE, v_refund;
END;
$$;

REVOKE ALL ON FUNCTION public.settle_inference_reservation(UUID, BIGINT, BIGINT, BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.settle_inference_reservation(UUID, BIGINT, BIGINT, BIGINT) TO service_role;

-- ============================================================
-- 8. Release reservation (provider failure — refund full amount)
-- ============================================================
CREATE OR REPLACE FUNCTION public.release_inference_reservation(
  p_reservation_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_res         RECORD;
  v_balance_row RECORD;
BEGIN
  SELECT * INTO v_res
  FROM public.inference_reservations
  WHERE id = p_reservation_id AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  SELECT balance_cents, id INTO v_balance_row
  FROM public.balances
  WHERE user_id = v_res.user_id
  FOR UPDATE;

  -- Refund full reserved amount
  UPDATE public.balances
  SET balance_cents = balance_cents + v_res.reserved_amount,
      updated_at    = now()
  WHERE id = v_balance_row.id;

  INSERT INTO public.wallet_transactions
    (user_id, transaction_type, amount_cents, currency, balance_before_cents,
     balance_after_cents, reference_id, status, metadata)
  VALUES
    (v_res.user_id, 'refund', v_res.reserved_amount, 'TOMAN',
     v_balance_row.balance_cents,
     v_balance_row.balance_cents + v_res.reserved_amount,
     NULL, 'completed',
     jsonb_build_object('type', 'release', 'reservation_id', p_reservation_id));

  UPDATE public.inference_reservations
  SET status = 'released', settled_at = now()
  WHERE id = p_reservation_id;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.release_inference_reservation(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_inference_reservation(UUID) TO service_role;

-- ============================================================
-- 9. Idempotent usage recording
-- ============================================================
CREATE OR REPLACE FUNCTION public.insert_usage_if_needed(
  p_request_id           UUID,
  p_user_id              UUID,
  p_provider             TEXT,
  p_upstream_model_id    TEXT,
  p_azura_model_id       TEXT,
  p_input_tokens         BIGINT,
  p_output_tokens        BIGINT,
  p_upstream_cost_cents  BIGINT,
  p_markup_cents         BIGINT,
  p_charge_cents         BIGINT,
  p_pricing_rule_version INT,
  p_status               TEXT,
  p_status_detail        TEXT,
  p_response_ms          INT,
  p_metadata             JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.usage_logs AS ul (
    request_id, user_id, provider, upstream_model_id, azura_model_id,
    input_tokens, output_tokens, upstream_cost_cents, markup_cents,
    azura_customer_charge_cents, pricing_rule_version, status,
    status_detail, request_ts, response_ms, cached_tokens
  ) VALUES (
    p_request_id, p_user_id, p_provider, p_upstream_model_id, p_azura_model_id,
    p_input_tokens, p_output_tokens, p_upstream_cost_cents, p_markup_cents,
    p_charge_cents, p_pricing_rule_version, p_status::usage_status,
    p_status_detail, now(), p_response_ms,
    (p_metadata->>'cached_tokens')::BIGINT
  )
  ON CONFLICT (request_id) DO NOTHING
  RETURNING id INTO v_id;

  -- If conflict (already exists), fetch existing id
  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.usage_logs WHERE request_id = p_request_id;
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.insert_usage_if_needed(
  UUID, UUID, TEXT, TEXT, TEXT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT,
  INT, TEXT, TEXT, INT, JSONB
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.insert_usage_if_needed(
  UUID, UUID, TEXT, TEXT, TEXT, BIGINT, BIGINT, BIGINT, BIGINT, BIGINT,
  INT, TEXT, TEXT, INT, JSONB
) TO service_role;
