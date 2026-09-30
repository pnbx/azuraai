-- ============================================================
-- Populate AzuraAI Model Catalog from Verified AvalAI Data
-- ============================================================
-- Generated: 2026-09-10
-- Updated: 2026-09-24 — per-million-token integer pricing
-- Source: Authenticated GET https://api.avalai.ir/v1/models
--
-- PRICING CONVENTION:
-- pricing_rules stores prices as INTEGER TOMAN per 1,000,000 tokens.
-- Cost formula: price_per_million * token_count / 1_000_000
-- Rounded at final boundary with Math.round().
--
-- Conversion: $0.15/M tokens × 6000 TOMAN/$ = 900 TOMAN/M tokens
-- ============================================================

-- 1. INSERT PROVIDER (idempotent)
INSERT INTO public.providers (name, base_url, provider_registry_id)
VALUES ('AvalAI', 'https://api.avalai.ir/v1', 'avali')
ON CONFLICT (name) DO UPDATE
  SET base_url = EXCLUDED.base_url,
      provider_registry_id = EXCLUDED.provider_registry_id;

-- 2. INSERT MODELS (idempotent on provider_id + provider_model_id)

-- gpt-4o-mini: OpenAI, $0.15/M in → 900 TOMAN/M, $0.60/M out → 3600 TOMAN/M
INSERT INTO public.model_catalog (
  azura_model_id, provider_id, provider_model_id,
  public_slug, display_name, capabilities, enabled, status
)
SELECT
  'gpt-4o-mini',
  (SELECT id FROM providers WHERE name = 'AvalAI'),
  'gpt-4o-mini',
  'gpt-4o-mini',
  'GPT-4o Mini',
  '["chat","generate"]'::jsonb,
  true,
  'active'
WHERE NOT EXISTS (
  SELECT 1 FROM model_catalog
  WHERE provider_id = (SELECT id FROM providers WHERE name = 'AvalAI')
    AND provider_model_id = 'gpt-4o-mini'
);

-- gpt-4.1-nano: OpenAI, $0.10/M in → 600 TOMAN/M, $0.40/M out → 2400 TOMAN/M
INSERT INTO public.model_catalog (
  azura_model_id, provider_id, provider_model_id,
  public_slug, display_name, capabilities, enabled, status
)
SELECT
  'gpt-4.1-nano',
  (SELECT id FROM providers WHERE name = 'AvalAI'),
  'gpt-4.1-nano',
  'gpt-4.1-nano',
  'GPT-4.1 Nano',
  '["chat","generate"]'::jsonb,
  true,
  'active'
WHERE NOT EXISTS (
  SELECT 1 FROM model_catalog
  WHERE provider_id = (SELECT id FROM providers WHERE name = 'AvalAI')
    AND provider_model_id = 'gpt-4.1-nano'
);

-- qwen-flash: Alibaba, $0.05/M in → 300 TOMAN/M, $0.40/M out → 2400 TOMAN/M
INSERT INTO public.model_catalog (
  azura_model_id, provider_id, provider_model_id,
  public_slug, display_name, capabilities, enabled, status
)
SELECT
  'qwen-flash',
  (SELECT id FROM providers WHERE name = 'AvalAI'),
  'qwen-flash',
  'qwen-flash',
  'Qwen Flash',
  '["chat","generate"]'::jsonb,
  true,
  'active'
WHERE NOT EXISTS (
  SELECT 1 FROM model_catalog
  WHERE provider_id = (SELECT id FROM providers WHERE name = 'AvalAI')
    AND provider_model_id = 'qwen-flash'
);

-- 3. INSERT PRICING RULES (idempotent on model_id + version)
-- Prices are per 1,000,000 tokens in TOMAN (integer).

-- gpt-4o-mini: $0.15/M in = 900 TOMAN/M, $0.60/M out = 3600 TOMAN/M
INSERT INTO public.pricing_rules (
  model_id, input_price_per_million_tokens, output_price_per_million_tokens,
  request_fee_cents, version, effective_at
)
SELECT
  (SELECT id FROM model_catalog WHERE provider_model_id = 'gpt-4o-mini'
    AND provider_id = (SELECT id FROM providers WHERE name = 'AvalAI')),
  900, 3600, 0, 1, now()
WHERE NOT EXISTS (
  SELECT 1 FROM pricing_rules
  WHERE model_id = (SELECT id FROM model_catalog WHERE provider_model_id = 'gpt-4o-mini'
    AND provider_id = (SELECT id FROM providers WHERE name = 'AvalAI'))
    AND version = 1
);

-- gpt-4.1-nano: $0.10/M in = 600 TOMAN/M, $0.40/M out = 2400 TOMAN/M
INSERT INTO public.pricing_rules (
  model_id, input_price_per_million_tokens, output_price_per_million_tokens,
  request_fee_cents, version, effective_at
)
SELECT
  (SELECT id FROM model_catalog WHERE provider_model_id = 'gpt-4.1-nano'
    AND provider_id = (SELECT id FROM providers WHERE name = 'AvalAI')),
  600, 2400, 0, 1, now()
WHERE NOT EXISTS (
  SELECT 1 FROM pricing_rules
  WHERE model_id = (SELECT id FROM model_catalog WHERE provider_model_id = 'gpt-4.1-nano'
    AND provider_id = (SELECT id FROM providers WHERE name = 'AvalAI'))
    AND version = 1
);

-- qwen-flash: $0.05/M in = 300 TOMAN/M, $0.40/M out = 2400 TOMAN/M
INSERT INTO public.pricing_rules (
  model_id, input_price_per_million_tokens, output_price_per_million_tokens,
  request_fee_cents, version, effective_at
)
SELECT
  (SELECT id FROM model_catalog WHERE provider_model_id = 'qwen-flash'
    AND provider_id = (SELECT id FROM providers WHERE name = 'AvalAI')),
  300, 2400, 0, 1, now()
WHERE NOT EXISTS (
  SELECT 1 FROM pricing_rules
  WHERE model_id = (SELECT id FROM model_catalog WHERE provider_model_id = 'qwen-flash'
    AND provider_id = (SELECT id FROM providers WHERE name = 'AvalAI'))
    AND version = 1
);
