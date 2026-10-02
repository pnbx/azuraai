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
