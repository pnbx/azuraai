-- ============================================================
-- Phase 2: Wallet & API Key Operations
-- ============================================================
-- Backend-only financial primitives.
-- All three functions are SECURITY DEFINER and restricted to the
-- server-side service_role. anon and authenticated users cannot
-- execute them directly. Authorization is enforced server-side
-- by the API routes (which authenticate the dashboard user with
-- Supabase Auth and supply that user's own user_id).
-- ============================================================

-- Create or replace the credit_balance RPC function
-- Uses row-level locking to prevent race conditions
DROP FUNCTION IF EXISTS public.credit_balance(uuid, bigint, uuid, jsonb);

CREATE FUNCTION public.credit_balance(
  p_user_id uuid,
  p_amount_cents bigint,
  p_reference_id uuid,
  p_metadata jsonb
)
RETURNS TABLE (
  new_balance_cents bigint,
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
BEGIN
  -- Reject non-positive amounts before any mutation
  IF p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than zero';
  END IF;

  -- Guard against arithmetic overflow with a sane upper bound
  IF p_amount_cents > 1000000000000000 THEN
    RAISE EXCEPTION 'Amount too large';
  END IF;

  -- Ensure a balance row exists for this user
  INSERT INTO public.balances (user_id, balance_cents, currency)
  VALUES (p_user_id, 0, 'USD')
  ON CONFLICT (user_id) DO NOTHING;

  -- Lock the user's balance row for the duration of this transaction
  UPDATE public.balances
  SET balance_cents = balance_cents + p_amount_cents,
      updated_at = now()
  WHERE user_id = p_user_id
  RETURNING balance_cents INTO v_new_balance;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Balance row missing for user %', p_user_id;
  END IF;

  -- Insert immutable ledger entry
  INSERT INTO public.wallet_transactions
    (user_id, transaction_type, amount_cents, currency, balance_before_cents, balance_after_cents, reference_id, status, metadata)
  VALUES
    (p_user_id, 'deposit', p_amount_cents, 'USD',
     v_new_balance - p_amount_cents, v_new_balance,
     p_reference_id, 'completed', p_metadata)
  RETURNING id INTO v_tx_id;

  RETURN QUERY SELECT v_new_balance, v_tx_id;
END;
$$;

-- Create or replace the debit_balance RPC function
DROP FUNCTION IF EXISTS public.debit_balance(uuid, bigint, uuid, jsonb);

CREATE FUNCTION public.debit_balance(
  p_user_id uuid,
  p_amount_cents bigint,
  p_reference_id uuid,
  p_metadata jsonb
)
RETURNS TABLE (
  new_balance_cents bigint,
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
BEGIN
  -- Reject non-positive amounts before any mutation
  IF p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than zero';
  END IF;

  -- Guard against arithmetic overflow with a sane upper bound
  IF p_amount_cents > 1000000000000000 THEN
    RAISE EXCEPTION 'Amount too large';
  END IF;

  -- Ensure a balance row exists for this user
  INSERT INTO public.balances (user_id, balance_cents, currency)
  VALUES (p_user_id, 0, 'USD')
  ON CONFLICT (user_id) DO NOTHING;

  -- Lock the user's balance row for the duration of this transaction
  UPDATE public.balances
  SET balance_cents = balance_cents - p_amount_cents,
      updated_at = now()
  WHERE user_id = p_user_id
  AND balance_cents - p_amount_cents >= 0  -- prevent negative balance
  RETURNING balance_cents INTO v_new_balance;

  IF NOT FOUND THEN
    -- Balance would go negative or row missing; rollback and signal error
    RAISE EXCEPTION 'Insufficient balance: attempting to go negative';
  END IF;

  -- Insert immutable ledger entry
  INSERT INTO public.wallet_transactions
    (user_id, transaction_type, amount_cents, currency, balance_before_cents, balance_after_cents, reference_id, status, metadata)
  VALUES
    (p_user_id, 'withdrawal', p_amount_cents, 'USD',
     v_new_balance + p_amount_cents, v_new_balance,
     p_reference_id, 'completed', p_metadata)
  RETURNING id INTO v_tx_id;

  RETURN QUERY SELECT v_new_balance, v_tx_id;
END;
$$;

-- Create or replace the API key revocation function
-- Marks a key as revoked; subsequent auth attempts will fail
-- Includes ownership verification to prevent users from revoking
-- other users' keys
DROP FUNCTION IF EXISTS public.revoke_api_key(uuid, uuid);

CREATE FUNCTION public.revoke_api_key(
  p_key_id uuid,
  p_user_id uuid
)
RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.api_keys
  SET revoked_at = now(),
      updated_at = now()
  WHERE id = p_key_id
  AND user_id = p_user_id;

  IF found THEN
    RETURN true;
  ELSE
    RETURN false;
  END IF;
END;
$$;

-- Restrict EXECUTE to the server-side service_role only.
-- anon and authenticated users must NOT be able to call these
-- financial primitives directly.
REVOKE EXECUTE ON FUNCTION public.credit_balance(uuid, bigint, uuid, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.debit_balance(uuid, bigint, uuid, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.revoke_api_key(uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.credit_balance(uuid, bigint, uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.debit_balance(uuid, bigint, uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.revoke_api_key(uuid, uuid) TO service_role;