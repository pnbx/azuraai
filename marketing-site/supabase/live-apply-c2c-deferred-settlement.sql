-- ============================================================
-- LIVE APPLY: Deferred card-to-card settlement (fast window)
-- ============================================================
-- Paste this whole file into Supabase SQL Editor → Run.
-- Idempotent: safe to run multiple times.
--
-- What it does:
--   1. Adds defer_status / defer_reason / received_at to c2c_deposits
--   2. Guarantees at most ONE deferred deposit per top-up intent
--   3. Adds the drain index used to settle the queue oldest-first
--      when the fast window (12:00–24:00 Tehran) reopens
-- ============================================================

ALTER TABLE public.c2c_deposits
  ADD COLUMN IF NOT EXISTS defer_status TEXT NOT NULL DEFAULT 'unprocessed'
    CHECK (defer_status IN ('unprocessed', 'deferred', 'processing', 'settled', 'failed'));

ALTER TABLE public.c2c_deposits
  ADD COLUMN IF NOT EXISTS defer_reason TEXT;

ALTER TABLE public.c2c_deposits
  ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ;

UPDATE public.c2c_deposits SET received_at = created_at WHERE received_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS c2c_deposits_one_deferred_per_intent
  ON public.c2c_deposits (matched_intent_id)
  WHERE defer_status IN ('deferred', 'processing') AND matched_intent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_c2c_deposits_deferred
  ON public.c2c_deposits (received_at)
  WHERE defer_status = 'deferred';
