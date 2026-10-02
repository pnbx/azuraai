-- ============================================================
-- Phase 7: Currency Migration — USD → TOMAN
-- ============================================================
-- Azura is a Persian/Iranian platform. Wallet currency is Toman.
-- 1 Toman = 10 IRR (Iranian Rial).
-- All wallet values are stored as integer Toman.
--
-- This migration:
-- 1. Changes table defaults from 'USD' to 'TOMAN'
-- 2. Updates existing data from 'USD' to 'TOMAN'
-- 3. Safely recreates credit_balance/debit_balance RPCs with currency parameter
--    (DROP + CREATE, not ALTER FUNCTION, for safety)
-- 4. Preserves all existing atomicity guarantees (SELECT FOR UPDATE)
-- ============================================================

-- Update table defaults
ALTER TABLE public.balances ALTER COLUMN currency SET DEFAULT 'TOMAN';
ALTER TABLE public.wallet_transactions ALTER COLUMN currency SET DEFAULT 'TOMAN';

-- Update existing data (all current rows are USD, change to TOMAN)
UPDATE public.balances SET currency = 'TOMAN' WHERE currency = 'USD';
UPDATE public.wallet_transactions SET currency = 'TOMAN' WHERE currency = 'USD';

-- ============================================================
-- Recreate credit_balance RPC with currency parameter
-- ============================================================
-- DROP the old function first (explicit parameter types to avoid ambiguity)
DROP FUNCTION IF EXISTS public.credit_balance(uuid, bigint, uuid, jsonb);

CREATE FUNCTION public.credit_balance(
  p_user_id uuid,
  p_amount bigint,
  p_reference_id uuid,
  p_metadata jsonb,
  p_currency text DEFAULT 'TOMAN'
)
RETURNS TABLE (
  new_balance bigint,
  transaction_id uuid
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_balance bigint;
  v_tx_id uuid;
  v_balance_before bigint;
BEGIN
  -- Reject non-positive amounts before any mutation
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than zero';
  END IF;

  -- Guard against arithmetic overflow with a sane upper bound
  IF p_amount > 1000000000000000 THEN
    RAISE EXCEPTION 'Amount too large';
  END IF;

  -- Ensure a balance row exists for this user
  INSERT INTO public.balances (user_id, balance_cents, currency)
  VALUES (p_user_id, 0, p_currency)
  ON CONFLICT (user_id) DO NOTHING;

  -- Lock the user's balance row for the duration of this transaction
  SELECT balance_cents INTO v_balance_before
  FROM public.balances
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Balance row missing for user %', p_user_id;
  END IF;

  UPDATE public.balances
  SET balance_cents = balance_cents + p_amount,
      updated_at = now()
  WHERE user_id = p_user_id
  RETURNING balance_cents INTO v_new_balance;

  -- Insert immutable ledger entry
  INSERT INTO public.wallet_transactions
    (user_id, transaction_type, amount_cents, currency, balance_before_cents, balance_after_cents, reference_id, status, metadata)
  VALUES
    (p_user_id, 'deposit', p_amount, p_currency,
     v_balance_before, v_new_balance,
     p_reference_id, 'completed', p_metadata)
  RETURNING id INTO v_tx_id;

  RETURN QUERY SELECT v_new_balance, v_tx_id;
END;
$$;

-- ============================================================
-- Recreate debit_balance RPC with currency parameter
-- ============================================================
DROP FUNCTION IF EXISTS public.debit_balance(uuid, bigint, uuid, jsonb);

CREATE FUNCTION public.debit_balance(
  p_user_id uuid,
  p_amount bigint,
  p_reference_id uuid,
  p_metadata jsonb,
  p_currency text DEFAULT 'TOMAN'
)
RETURNS TABLE (
  new_balance bigint,
  transaction_id uuid
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_balance bigint;
  v_tx_id uuid;
  v_balance_before bigint;
BEGIN
  -- Reject non-positive amounts before any mutation
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than zero';
  END IF;

  -- Guard against arithmetic overflow with a sane upper bound
  IF p_amount > 1000000000000000 THEN
    RAISE EXCEPTION 'Amount too large';
  END IF;

  -- Ensure a balance row exists for this user
  INSERT INTO public.balances (user_id, balance_cents, currency)
  VALUES (p_user_id, 0, p_currency)
  ON CONFLICT (user_id) DO NOTHING;

  -- Lock the user's balance row for the duration of this transaction
  SELECT balance_cents INTO v_balance_before
  FROM public.balances
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Balance row missing for user %', p_user_id;
  END IF;

  UPDATE public.balances
  SET balance_cents = balance_cents - p_amount,
      updated_at = now()
  WHERE user_id = p_user_id
  AND balance_cents - p_amount >= 0
  RETURNING balance_cents INTO v_new_balance;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Insufficient balance: attempting to go negative';
  END IF;

  -- Insert immutable ledger entry
  INSERT INTO public.wallet_transactions
    (user_id, transaction_type, amount_cents, currency, balance_before_cents, balance_after_cents, reference_id, status, metadata)
  VALUES
    (p_user_id, 'withdrawal', p_amount, p_currency,
     v_balance_before, v_new_balance,
     p_reference_id, 'completed', p_metadata)
  RETURNING id INTO v_tx_id;

  RETURN QUERY SELECT v_new_balance, v_tx_id;
END;
$$;

-- ============================================================
-- Recreate revoke_api_key (unchanged, but must be re-granted after DROP)
-- ============================================================
-- revoke_api_key was not changed, but re-grant to ensure permissions are correct
REVOKE EXECUTE ON FUNCTION public.credit_balance(uuid, bigint, uuid, jsonb, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.debit_balance(uuid, bigint, uuid, jsonb, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.credit_balance(uuid, bigint, uuid, jsonb, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.debit_balance(uuid, bigint, uuid, jsonb, text) TO service_role;
