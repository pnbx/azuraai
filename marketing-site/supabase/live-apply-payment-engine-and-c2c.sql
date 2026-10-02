-- ============================================================
-- LIVE APPLY: Payment engine + Card-to-card + signup sync
-- Paste this ENTIRE file into Supabase Dashboard → SQL Editor → Run.
-- Safe to run multiple times (idempotent).
-- Applies (in order):
--   1. set_updated_at helper (defensive re-create)
--   2. 20260922000001_payment_engine.sql  (intents, webhook ledger, RPC)
--   3. 20260926120000_card_to_card_deposits.sql (c2c SMS deposit log)
--   4. 20260926130000_signup_user_sync.sql (signup trigger + backfill, self-contained)
-- ============================================================

-- 1. helper -------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_updated_at ON public.users;

-- 2. payment engine -----------------------------------------
-- ============================================================
-- Phase 7: Payment Engine
-- ============================================================
-- Provider-agnostic payment system for wallet funding.
-- All monetary values are integer Toman.
-- Webhook verification is the only trusted path for wallet credit.
-- ============================================================

-- ============================================================
-- payment_intents table
-- Tracks the lifecycle of a funding request from creation to completion.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.payment_intents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  amount_toman BIGINT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'TOMAN',
  provider TEXT NOT NULL,
  provider_payment_id TEXT,
  provider_event_id TEXT,
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'created'
    CHECK (status IN ('created', 'pending', 'processing', 'succeeded', 'failed', 'cancelled')),
  wallet_transaction_id UUID,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  succeeded_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  failure_reason TEXT,

  -- Amount must be positive
  CONSTRAINT payment_intents_amount_positive CHECK (amount_toman > 0),
  -- Amount must not exceed 10,000,000 Toman (max funding)
  CONSTRAINT payment_intents_amount_max CHECK (amount_toman <= 10000000),
  -- Currency must be supported
  CONSTRAINT payment_intents_currency_valid CHECK (currency IN ('TOMAN')),
  -- Per-user idempotency: same user cannot reuse the same key
  CONSTRAINT payment_intents_user_idempotency_unique UNIQUE (user_id, idempotency_key),
  -- Provider payment ID uniqueness per provider
  CONSTRAINT payment_intents_provider_payment_unique UNIQUE (provider, provider_payment_id)
);

CREATE INDEX IF NOT EXISTS idx_payment_intents_user ON public.payment_intents(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_intents_status ON public.payment_intents(status);
CREATE INDEX IF NOT EXISTS idx_payment_intents_provider_payment ON public.payment_intents(provider, provider_payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_intents_idempotency ON public.payment_intents(user_id, idempotency_key);

DROP TRIGGER IF EXISTS payment_intents_updated_at ON public.payment_intents;
CREATE TRIGGER payment_intents_updated_at
  BEFORE UPDATE ON public.payment_intents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- payment_webhook_events table
-- Authoritative event ledger for webhook replay protection.
-- Every verified webhook event is recorded here.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.payment_webhook_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider TEXT NOT NULL,
  provider_event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  provider_payment_id TEXT,
  amount_toman BIGINT,
  currency TEXT,
  payload JSONB NOT NULL,
  processed BOOLEAN NOT NULL DEFAULT false,
  processed_at TIMESTAMPTZ,
  payment_intent_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Unique constraint: prevents duplicate event processing at database level
  CONSTRAINT payment_webhook_events_provider_event_unique UNIQUE (provider, provider_event_id)
);

CREATE INDEX IF NOT EXISTS idx_payment_webhook_events_provider ON public.payment_webhook_events(provider, provider_event_id);
CREATE INDEX IF NOT EXISTS idx_payment_webhook_events_payment ON public.payment_webhook_events(payment_intent_id);

-- ============================================================
-- process_successful_payment RPC
-- Atomically: verifies payment, credits wallet, records ledger, marks succeeded.
-- Uses SELECT FOR UPDATE on both payment_intents and balances to prevent races.
-- ============================================================
DROP FUNCTION IF EXISTS public.process_successful_payment(uuid, text, text, bigint, text);

CREATE FUNCTION public.process_successful_payment(
  p_payment_intent_id uuid,
  p_provider_event_id text,
  p_provider_payment_id text,
  p_amount_toman bigint,
  p_currency text
)
RETURNS TABLE (
  wallet_transaction_id uuid,
  new_balance bigint,
  already_processed boolean
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_intent record;
  v_wallet_tx_id uuid;
  v_new_balance bigint;
  v_balance_before bigint;
  v_user_id uuid;
BEGIN
  -- Lock the payment intent row to prevent concurrent processing
  SELECT * INTO v_intent
  FROM public.payment_intents
  WHERE id = p_payment_intent_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment intent not found: %', p_payment_intent_id;
  END IF;

  -- If already succeeded, return idempotently (no double credit)
  IF v_intent.status = 'succeeded' THEN
    RETURN QUERY SELECT v_intent.wallet_transaction_id, 0::bigint, true;
    RETURN;
  END IF;

  -- If in a terminal state (failed, cancelled), reject
  IF v_intent.status IN ('failed', 'cancelled') THEN
    RAISE EXCEPTION 'Payment intent is in terminal state: %', v_intent.status;
  END IF;

  -- Validate amount matches stored intent (never trust webhook amount alone)
  IF v_intent.amount_toman != p_amount_toman THEN
    RAISE EXCEPTION 'Amount mismatch: expected %, got %', v_intent.amount_toman, p_amount_toman;
  END IF;

  -- Validate currency matches
  IF v_intent.currency != p_currency THEN
    RAISE EXCEPTION 'Currency mismatch: expected %, got %', v_intent.currency, p_currency;
  END IF;

  -- Validate provider payment ID matches
  IF v_intent.provider_payment_id IS NOT NULL
     AND v_intent.provider_payment_id != p_provider_payment_id THEN
    RAISE EXCEPTION 'Provider payment ID mismatch';
  END IF;

  v_user_id := v_intent.user_id;

  -- Lock the user's balance row
  SELECT balance_cents INTO v_balance_before
  FROM public.balances
  WHERE user_id = v_user_id
  FOR UPDATE;

  -- If no balance row exists, create one
  IF NOT FOUND THEN
    INSERT INTO public.balances (user_id, balance_cents, currency)
    VALUES (v_user_id, 0, p_currency)
    ON CONFLICT (user_id) DO NOTHING;

    SELECT balance_cents INTO v_balance_before
    FROM public.balances
    WHERE user_id = v_user_id
    FOR UPDATE;
  END IF;

  -- Credit the wallet
  UPDATE public.balances
  SET balance_cents = balance_cents + p_amount_toman,
      updated_at = now()
  WHERE user_id = v_user_id
  RETURNING balance_cents INTO v_new_balance;

  -- Insert immutable ledger entry
  INSERT INTO public.wallet_transactions
    (user_id, transaction_type, amount_cents, currency, balance_before_cents, balance_after_cents, reference_id, status, metadata)
  VALUES
    (v_user_id, 'deposit', p_amount_toman, p_currency,
     v_balance_before, v_new_balance,
     p_payment_intent_id, 'completed',
     jsonb_build_object('provider_payment_id', p_provider_payment_id, 'provider_event_id', p_provider_event_id))
  RETURNING id INTO v_wallet_tx_id;

  -- Update payment intent: mark succeeded, link wallet transaction
  UPDATE public.payment_intents
  SET status = 'succeeded',
      wallet_transaction_id = v_wallet_tx_id,
      provider_event_id = p_provider_event_id,
      succeeded_at = now()
  WHERE id = p_payment_intent_id;

  RETURN QUERY SELECT v_wallet_tx_id, v_new_balance, false;
END;
$$;

-- ============================================================
-- Permissions: restrict to service_role only
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.process_successful_payment(uuid, text, text, bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_successful_payment(uuid, text, text, bigint, text) TO service_role;

-- ============================================================
-- RLS Policies
-- ============================================================

-- payment_intents: users can only see their own
ALTER TABLE public.payment_intents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "payment_intents_select_own" ON public.payment_intents;
CREATE POLICY "payment_intents_select_own" ON public.payment_intents
  FOR SELECT USING (auth.uid() = user_id);

-- payment_webhook_events: no user access (server-only)
ALTER TABLE public.payment_webhook_events ENABLE ROW LEVEL SECURITY;
-- No policies = no access for normal users (server uses service_role)

-- 3. card-to-card deposits ----------------------------------
-- ============================================================
-- Card-to-Card deposits (کارت به کارت)
--
-- Records raw bank-deposit notifications (SMS webhook payloads) so every
-- incoming deposit is stored exactly once, even when no pending top-up
-- matches it yet. Unmatched deposits can later be credited manually via
-- the existing admin wallet routes.
--
-- Conventions follow the existing migration set:
--   - integer Toman amounts (bigint), currency 'TOMAN'
--   - idempotency via UNIQUE constraint (message hash)
--   - RLS enabled, service-role only (admin client bypasses RLS)
--   - additive; no existing tables or functions are modified
-- ============================================================

CREATE TABLE IF NOT EXISTS public.c2c_deposits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Raw notification (SMS or other source). Never delete: audit trail.
  raw_text TEXT,

  -- SHA-256 hash of normalized message text. UNIQUE => the same SMS
  -- delivered twice is stored and processed exactly once.
  message_hash TEXT NOT NULL,

  -- Parsed deposit fields (best effort; NULL when parsing failed)
  amount_toman BIGINT,
  card_tail TEXT,
  bank TEXT,

  -- Matching result
  matched_intent_id UUID REFERENCES public.payment_intents(id) ON DELETE SET NULL,
  matched_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One deposit per unique message content (dedupe across retries)
CREATE UNIQUE INDEX IF NOT EXISTS c2c_deposits_message_hash_unique
  ON public.c2c_deposits(message_hash);

-- Matching lookup: amount + time window
CREATE INDEX IF NOT EXISTS idx_c2c_deposits_amount
  ON public.c2c_deposits(amount_toman, created_at);

CREATE INDEX IF NOT EXISTS idx_c2c_deposits_intent
  ON public.c2c_deposits(matched_intent_id);

-- ============================================================
-- RLS: locked to service role. Only the server (admin client) and the
-- SMS webhook write here; users never see raw deposit notifications.
-- ============================================================
ALTER TABLE public.c2c_deposits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "c2c_deposits_no_direct_access" ON public.c2c_deposits;
CREATE POLICY "c2c_deposits_no_direct_access" ON public.c2c_deposits
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- 4. signup sync (NEW — fixes FK failures for fresh signups) --
-- ============================================================
-- Signup sync: keep public.users 1:1 with Supabase auth.users
--
-- public.users is referenced by wallet/payment tables (payment_intents,
-- balances, wallet_transactions, ...), but no trigger created rows for new
-- signups — payments for fresh users failed with FK violations.
--
-- Idempotent: safe to run multiple times. Also backfills any existing
-- auth users that are missing a public.users row.
-- ============================================================

-- Defensive: ensure profile columns exist (normally added by
-- 20260907000003_phase3_auth.sql; some live DBs skipped that migration)
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS preferred_language TEXT DEFAULT 'en';

-- Create a public.users row for every new auth user
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill: rows for auth users created before this trigger existed
INSERT INTO public.users (id, email, full_name)
SELECT u.id, COALESCE(u.email, ''), COALESCE(u.raw_user_meta_data ->> 'full_name', '')
FROM auth.users u
ON CONFLICT (id) DO NOTHING;
