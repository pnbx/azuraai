-- Phase 11: Hardening — Database constraint, RLS, RPC, and index fixes
-- Addresses findings from comprehensive system-wide security audit

-- ============================================================
-- 1. Balance non-negative constraint (defense-in-depth)
-- ============================================================
ALTER TABLE public.balances
  ADD CONSTRAINT balances_non_negative CHECK (balance_cents >= 0);

-- ============================================================
-- 2. API keys scope constraint
-- ============================================================
ALTER TABLE public.api_keys
  ADD CONSTRAINT api_keys_scope_valid CHECK (scope IN ('full', 'read_write', 'read_only', 'write_only'));

-- ============================================================
-- 3. Model catalog RLS: only expose enabled models to public
-- ============================================================
DROP POLICY IF EXISTS "model_catalog_select_public" ON public.model_catalog;
CREATE POLICY "model_catalog_select_public" ON public.model_catalog
    FOR SELECT USING (status = 'active' AND enabled = true);

-- ============================================================
-- 4. Input validation: reserve_funds_for_inference
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
  -- Validate reserved amount
  IF p_reserved_amount IS NULL OR p_reserved_amount <= 0 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 0::BIGINT;
    RETURN;
  END IF;

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
-- 5. Input validation: settle_inference_reservation
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
  -- Validate actual cost
  IF p_actual_cost IS NULL OR p_actual_cost < 0 THEN
    RETURN QUERY SELECT FALSE, 0::BIGINT;
    RETURN;
  END IF;

  -- Validate token counts
  IF p_input_tokens < 0 OR p_output_tokens < 0 THEN
    RETURN QUERY SELECT FALSE, 0::BIGINT;
    RETURN;
  END IF;

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
-- 6. Index on inference_reservations.request_id for lookup perf
-- ============================================================
-- UNIQUE constraint already creates an implicit index,
-- but add explicit one for queries that filter by request_id
CREATE INDEX IF NOT EXISTS idx_reservations_request_id
  ON public.inference_reservations(request_id);

-- ============================================================
-- 7. TTL index on api_rate_limits for automatic cleanup
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_rate_limits_window
  ON public.api_rate_limits(window_start);

-- ============================================================
-- Done. All RPCs retain SECURITY DEFINER + REVOKE ALL + GRANT service_role.
-- ============================================================
