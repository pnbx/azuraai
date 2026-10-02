-- ============================================================
-- Pricing Precision Fix: Per-Million-Token Integer Pricing
-- ============================================================
-- Problem: pricing_rules stored per-token prices as BIGINT.
--   $0.15/M tokens = 0.000015 cents/token → rounds to 0.
--   All inference was free.
--
-- Solution: Rename columns to per-million-token semantics.
--   $0.15/M = 900 TOMAN/M (integer, exact).
--   Cost formula: price_per_million * tokens / 1_000_000
--
-- RPCs are unaffected: they receive final computed BIGINT costs,
-- never per-token prices.
-- ============================================================

-- Rename columns to reflect new per-million-token semantics
ALTER TABLE public.pricing_rules
  RENAME COLUMN input_token_price_cents TO input_price_per_million_tokens;

ALTER TABLE public.pricing_rules
  RENAME COLUMN output_token_price_cents TO output_price_per_million_tokens;

-- Add validation constraint (non-negative per-million prices)
ALTER TABLE public.pricing_rules
  ADD CONSTRAINT pricing_per_million_non_negative
  CHECK (input_price_per_million_tokens >= 0 AND output_price_per_million_tokens >= 0);

-- Update column comments
COMMENT ON COLUMN public.pricing_rules.input_price_per_million_tokens IS
  'Input token price in TOMAN per 1,000,000 tokens (integer). '
  'Cost = price * tokens / 1_000_000, rounded at final boundary.';

COMMENT ON COLUMN public.pricing_rules.output_price_per_million_tokens IS
  'Output token price in TOMAN per 1,000,000 tokens (integer). '
  'Cost = price * tokens / 1_000_000, rounded at final boundary.';
