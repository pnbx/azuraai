-- Deferred card-to-card settlement (fast window 12:00–24:00 Tehran)
--
-- Deposits received OUTSIDE the fast window are matched but their wallet
-- credit is deferred until the window reopens. This migration adds the
-- deferral state to c2c_deposits and received_at bookkeeping.
--
-- Idempotent. Safe to paste repeatedly into the Supabase SQL Editor.

-- 1. Deferral lifecycle on deposits.
--    unprocessed → deferred → processing → settled | failed
ALTER TABLE public.c2c_deposits
  ADD COLUMN IF NOT EXISTS defer_status TEXT NOT NULL DEFAULT 'unprocessed'
    CHECK (defer_status IN ('unprocessed', 'deferred', 'processing', 'settled', 'failed'));

ALTER TABLE public.c2c_deposits
  ADD COLUMN IF NOT EXISTS defer_reason TEXT;

-- When the notification arrived (vs created_at = when we stored it).
-- Backfilled for legacy rows so the drain ordering is always defined.
ALTER TABLE public.c2c_deposits
  ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ;

UPDATE public.c2c_deposits SET received_at = created_at WHERE received_at IS NULL;

-- 2. At most one deferred/processing deposit per intent: duplicate
--    notifications for the same top-up resolve to alreadyDeferred
--    (HTTP 23505 handled in code) instead of double-crediting.
CREATE UNIQUE INDEX IF NOT EXISTS c2c_deposits_one_deferred_per_intent
  ON public.c2c_deposits (matched_intent_id)
  WHERE defer_status IN ('deferred', 'processing') AND matched_intent_id IS NOT NULL;

-- 3. Drain lookup: oldest-deferred-first while the window is open.
CREATE INDEX IF NOT EXISTS idx_c2c_deposits_deferred
  ON public.c2c_deposits (received_at)
  WHERE defer_status = 'deferred';
