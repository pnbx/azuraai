-- ============================================================
-- Azura Phase 1 Database Schema
-- ============================================================
-- This schema is designed to be run against a Supabase PostgreSQL database.
-- It creates all core tables with proper constraints, indexes, and RLS policies.
-- ============================================================

-- Enable required extensions for GiST exclusion constraints on UUID
CREATE EXTENSION IF NOT EXISTS "btree_gist";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- users table
-- 1:1 with Supabase auth.users
-- ============================================================
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger to keep updated_at fresh
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_updated_at ON public.users;
CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- providers table
-- Platform configuration, not customer-owned
-- ============================================================
CREATE TABLE IF NOT EXISTS public.providers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  base_url TEXT NOT NULL,
  api_version TEXT,
  auth_method TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS providers_updated_at ON public.providers;
CREATE TRIGGER providers_updated_at
  BEFORE UPDATE ON public.providers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- model_catalog table
-- Azura's canonical model definitions
-- ============================================================
CREATE TABLE IF NOT EXISTS public.model_catalog (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  azura_model_id TEXT NOT NULL UNIQUE,
  provider_id UUID NOT NULL REFERENCES public.providers(id) ON DELETE RESTRICT,
  provider_model_id TEXT NOT NULL,
  capabilities JSONB DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deprecated', 'suspended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider_id, provider_model_id)
);

DROP TRIGGER IF EXISTS model_catalog_updated_at ON public.model_catalog;
CREATE TRIGGER model_catalog_updated_at
  BEFORE UPDATE ON public.model_catalog
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_model_catalog_provider ON public.model_catalog(provider_id);
CREATE INDEX idx_model_catalog_status ON public.model_catalog(status);

-- ============================================================
-- pricing_rules table
-- Platform-owned pricing configuration (not customer-owned)
-- Versioned to prevent overlap ambiguity
-- ============================================================
CREATE TABLE IF NOT EXISTS public.pricing_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  model_id UUID NOT NULL REFERENCES public.model_catalog(id) ON DELETE CASCADE,
  input_token_price_cents BIGINT NOT NULL DEFAULT 0,
  output_token_price_cents BIGINT NOT NULL DEFAULT 0,
  cached_input_token_price_cents BIGINT,
  image_input_price_cents BIGINT,
  request_fee_cents BIGINT NOT NULL DEFAULT 0,
  effective_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pricing_rules_no_overlap EXCLUDE USING gist (
    model_id WITH =,
    tstzrange(effective_at, COALESCE(expires_at, 'infinity'::timestamptz)) WITH &&
  )
);

DROP TRIGGER IF EXISTS pricing_rules_updated_at ON public.pricing_rules;
CREATE TRIGGER pricing_rules_updated_at
  BEFORE UPDATE ON public.pricing_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_pricing_rules_model ON public.pricing_rules(model_id);
CREATE INDEX idx_pricing_rules_effective ON public.pricing_rules(effective_at, expires_at);

-- ============================================================
-- markup_rules table
-- Platform-owned markup configuration
-- ============================================================
CREATE TABLE IF NOT EXISTS public.markup_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  model_id UUID NOT NULL REFERENCES public.model_catalog(id) ON DELETE CASCADE,
  rule_type TEXT NOT NULL CHECK (rule_type IN ('percent', 'fixed')),
  value BIGINT NOT NULL, -- percentage points * 100 (e.g., 2000 = 20.00%) or fixed cents
  description TEXT,
  effective_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT markup_rules_no_overlap EXCLUDE USING gist (
    model_id WITH =,
    tstzrange(effective_at, COALESCE(expires_at, 'infinity'::timestamptz)) WITH &&
  )
);

DROP TRIGGER IF EXISTS markup_rules_updated_at ON public.markup_rules;
CREATE TRIGGER markup_rules_updated_at
  BEFORE UPDATE ON public.markup_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_markup_rules_model ON public.markup_rules(model_id);
CREATE INDEX idx_markup_rules_effective ON public.markup_rules(effective_at, expires_at);

-- ============================================================
-- api_keys table
-- Customer API keys (hashed only, raw key never stored)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.api_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL UNIQUE, -- SHA-256 hex digest of raw key
  name TEXT,
  scope TEXT NOT NULL DEFAULT 'read_write',
  expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS api_keys_updated_at ON public.api_keys;
CREATE TRIGGER api_keys_updated_at
  BEFORE UPDATE ON public.api_keys
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_api_keys_user ON public.api_keys(user_id);

-- ============================================================
-- balances table
-- Current balance snapshot (updated atomically with ledger)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.balances (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  balance_cents BIGINT NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS balances_updated_at ON public.balances;
CREATE TRIGGER balances_updated_at
  BEFORE UPDATE ON public.balances
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- wallet_transactions table (ledger)
-- Append-only financial record
-- ============================================================
CREATE TYPE transaction_type AS ENUM (
  'deposit',
  'withdrawal',
  'usage_charge',
  'refund',
  'adjustment'
);

CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  transaction_type transaction_type NOT NULL,
  amount_cents BIGINT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  balance_before_cents BIGINT NOT NULL,
  balance_after_cents BIGINT NOT NULL,
  reference_id UUID,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed', 'reversed')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_wallet_tx_user ON public.wallet_transactions(user_id);
CREATE INDEX idx_wallet_tx_created ON public.wallet_transactions(created_at);
CREATE INDEX idx_wallet_tx_type ON public.wallet_transactions(transaction_type);

-- ============================================================
-- usage_logs table
-- Immutable audit/billing records
-- ============================================================
CREATE TYPE usage_status AS ENUM (
  'succeeded',
  'failed',
  'error',
  'usage_unavailable'
);

CREATE TABLE IF NOT EXISTS public.usage_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_id UUID NOT NULL UNIQUE DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  upstream_model_id TEXT NOT NULL,
  azura_model_id TEXT NOT NULL,
  input_tokens BIGINT NOT NULL DEFAULT 0,
  output_tokens BIGINT NOT NULL DEFAULT 0,
  cached_tokens BIGINT,
  upstream_cost_cents BIGINT NOT NULL DEFAULT 0,
  markup_cents BIGINT,
  azura_customer_charge_cents BIGINT NOT NULL DEFAULT 0,
  pricing_rule_version INT,
  markup_rule_version INT,
  status usage_status NOT NULL DEFAULT 'succeeded',
  status_detail TEXT,
  request_ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  response_ms INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_usage_logs_user ON public.usage_logs(user_id);
CREATE INDEX idx_usage_logs_ts ON public.usage_logs(request_ts);
CREATE INDEX idx_usage_logs_model ON public.usage_logs(azura_model_id);
CREATE INDEX idx_usage_logs_status ON public.usage_logs(status);

-- ============================================================
-- api_rate_limits table
-- Internal infrastructure table for rate limiting
-- ============================================================
CREATE TABLE IF NOT EXISTS public.api_rate_limits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key_id UUID NOT NULL REFERENCES public.api_keys(id) ON DELETE CASCADE,
  window_start TIMESTAMPTZ NOT NULL,
  count INT NOT NULL DEFAULT 0,
  period_seconds INT NOT NULL DEFAULT 60,
  UNIQUE (key_id, window_start, period_seconds)
);

CREATE INDEX idx_rate_limits_key_window ON public.api_rate_limits(key_id, window_start);

-- ============================================================
-- Enable RLS on all tables
-- ============================================================
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.model_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.markup_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Row Level Security Policies
-- ============================================================

-- users table: users can only see their own row
DROP POLICY IF EXISTS "users_select_own" ON public.users;
CREATE POLICY "users_select_own" ON public.users
    FOR SELECT USING (auth.uid() = id);

-- api_keys table: users can only see their own API keys (metadata only)
DROP POLICY IF EXISTS "api_keys_select_own" ON public.api_keys;
CREATE POLICY "api_keys_select_own" ON public.api_keys
    FOR SELECT USING (auth.uid() = user_id);

-- model_catalog table: users can see active models
DROP POLICY IF EXISTS "model_catalog_select_public" ON public.model_catalog;
CREATE POLICY "model_catalog_select_public" ON public.model_catalog
    FOR SELECT USING (status = 'active');

-- pricing_rules table: no normal user access (platform/server only)
-- RLS enabled but no policies = no access for normal users

-- markup_rules table: no normal user access (platform/server only)
-- RLS enabled but no policies = no access for normal users

-- usage_logs table: users can only see their own usage logs
DROP POLICY IF EXISTS "usage_logs_select_own" ON public.usage_logs;
CREATE POLICY "usage_logs_select_own" ON public.usage_logs
    FOR SELECT USING (auth.uid() = user_id);

-- balances table: users can only see their own balance
DROP POLICY IF EXISTS "balances_select_own" ON public.balances;
CREATE POLICY "balances_select_own" ON public.balances
    FOR SELECT USING (auth.uid() = user_id);

-- wallet_transactions table: users can only see their own transactions
DROP POLICY IF EXISTS "wallet_transactions_select_own" ON public.wallet_transactions;
CREATE POLICY "wallet_transactions_select_own" ON public.wallet_transactions
    FOR SELECT USING (auth.uid() = user_id);

-- providers table: no normal user access (platform/server only)
-- RLS enabled but no policies = no access for normal users

-- api_rate_limits table: no normal user access (infrastructure only)
-- RLS enabled but no policies = no access for normal users