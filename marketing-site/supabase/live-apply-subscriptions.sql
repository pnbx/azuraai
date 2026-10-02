-- ==============================================================
-- LIVE APPLY: Subscriptions + plan limits + model locks + C2C
-- Paste this ENTIRE file into Supabase Dashboard → SQL Editor → Run.
-- Idempotent: safe to run multiple times.
-- Generated 2026-09-15
-- ==============================================================

-- ============================================================
-- Subscriptions: plan config, user subscriptions, per-period usage
-- and atomic quota RPCs (concurrency-safe, server-side only).
--
-- Money still flows through the existing wallet/ledger. Tables here
-- track QUOTA only (messages/tokens/premium requests).
--
-- Plan model access is seeded ONLY from models that exist in the live
-- model_catalog. Display names without a real catalog slug
-- (GPT-5.6 Luna/Terra/Sol, GLM 5.3 Flash, Grok 4.6, Qwen3.8 Flash/Max,
-- Nemotron 3.5 Lightning) are NOT seeded — closest existing economy /
-- flagship equivalents are used and documented in the report.
--
-- Idempotent: safe to run multiple times.
-- ============================================================

-- ------------------------------------------------------------
-- Plan configuration (admin-editable, no deploy needed)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.plan_limits (
  plan TEXT PRIMARY KEY CHECK (plan IN ('basic','plus','scale')),
  display_name TEXT NOT NULL,
  price_toman BIGINT NOT NULL,
  monthly_messages INT NOT NULL CHECK (monthly_messages > 0),
  monthly_input_tokens BIGINT NOT NULL CHECK (monthly_input_tokens > 0),
  monthly_output_tokens BIGINT NOT NULL CHECK (monthly_output_tokens > 0),
  max_output_tokens_per_request INT NOT NULL CHECK (max_output_tokens_per_request > 0),
  max_context_tokens INT NOT NULL CHECK (max_context_tokens > 0),
  requests_per_minute INT NOT NULL CHECK (requests_per_minute > 0),
  priority TEXT NOT NULL DEFAULT 'normal',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.plan_models (
  plan TEXT NOT NULL REFERENCES public.plan_limits(plan) ON DELETE CASCADE,
  public_slug TEXT NOT NULL,
  PRIMARY KEY (plan, public_slug)
);

CREATE TABLE IF NOT EXISTS public.premium_allowances (
  plan TEXT NOT NULL REFERENCES public.plan_limits(plan) ON DELETE CASCADE,
  public_slug TEXT NOT NULL,
  monthly_requests INT NOT NULL CHECK (monthly_requests > 0),
  PRIMARY KEY (plan, public_slug)
);

ALTER TABLE public.plan_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.premium_allowances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "plan_config_read" ON public.plan_limits;
CREATE POLICY "plan_config_read" ON public.plan_limits FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "plan_models_read" ON public.plan_models;
CREATE POLICY "plan_models_read" ON public.plan_models FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "premium_allowances_read" ON public.premium_allowances;
CREATE POLICY "premium_allowances_read" ON public.premium_allowances FOR SELECT TO authenticated USING (true);

-- Seed plan limits (idempotent)
INSERT INTO public.plan_limits (plan, display_name, price_toman, monthly_messages, monthly_input_tokens, monthly_output_tokens, max_output_tokens_per_request, max_context_tokens, requests_per_minute, priority)
VALUES
  ('basic', 'پایه', 199000, 300, 1000000, 500000, 4000, 32000, 5, 'normal'),
  ('plus', 'پلاس', 499000, 1000, 5000000, 2000000, 8000, 128000, 15, 'high'),
  ('scale', 'سازمانی', 1299000, 2500, 15000000, 6000000, 16000, 200000, 30, 'highest')
ON CONFLICT (plan) DO NOTHING;

-- Seed model access (existing catalog slugs only; idempotent)
INSERT INTO public.plan_models (plan, public_slug)
VALUES
  -- BASIC: economy class
  ('basic','gpt-4o-mini'),('basic','gpt-5-mini'),('basic','gpt-5-nano'),
  ('basic','gemini-flash-latest'),('basic','gemini-flash-lite-latest'),('basic','gemini-2.5-flash'),('basic','gemini-2.5-flash-lite'),('basic','gemini-3.1-flash-lite'),('basic','gemini-3.5-flash'),
  ('basic','claude-haiku-4-5'),('basic','deepseek-flash'),('basic','deepseek-v4-flash'),('basic','deepseek-chat'),
  ('basic','grok-3-mini'),('basic','grok-3-mini-fast'),('basic','grok-4-fast-non-reasoning'),('basic','grok-4-1-fast-non-reasoning'),
  ('basic','qwen3-flash'),('basic','qwen3-8b'),('basic','qwen3-30b-a3b'),('basic','qwen-flash'),('basic','qwen3-vl-flash'),
  ('basic','gemma-4-31b-it'),('basic','gemma-4-26b-a4b-it'),('basic','gpt-oss-120b'),('basic','nemotron-3-ultra'),
  ('basic','llama-4-scout-17b-16e-instruct'),('basic','llama-4-maverick-17b-128e-instruct-fp8'),('basic','mistral-small-2503'),
  -- PLUS: everything in Basic +
  ('plus','claude-sonnet-5'),('plus','claude-sonnet-4-6'),('plus','claude-sonnet-4-5'),
  ('plus','gpt-5'),('plus','gpt-4o'),('plus','o3'),('plus','o4-mini'),('plus','o1'),
  ('plus','grok-4'),('plus','grok-4-0709'),('plus','grok-3'),('plus','grok-code-fast-1'),
  ('plus','qwen3-max'),('plus','qwen3-max-preview'),('plus','qwq-plus'),
  ('plus','deepseek-v4-pro'),('plus','deepseek-v3.2'),('plus','deepseek-reasoner'),('plus','deepseek-coder'),
  ('plus','mistral-large-3'),('plus','kimi-latest'),('plus','minimax-m3'),
  -- SCALE: everything in Plus +
  ('scale','claude-opus-5'),('scale','claude-opus-4-8'),('scale','claude-opus-4-7'),('scale','claude-opus-4-6'),('scale','claude-opus-4-5'),
  ('scale','claude-fable-5'),('scale','claude-fable-5-1'),
  ('scale','gpt-5-pro'),('scale','o3-pro'),('scale','o1-pro'),('scale','gpt-6-astra'),
  ('scale','kimi-k3'),('scale','qwen3-coder-plus'),('scale','qwen3-coder-480b-a35b-instruct'),
  ('scale','sonar-pro'),('scale','sonar-reasoning-pro'),('scale','sonar-deep-research')
ON CONFLICT (plan, public_slug) DO NOTHING;

-- SCALE inherits PLUS (plus inherits basic) via service helper; explicit
-- rows are not needed for inheritance — enforced in RPC below.

-- Premium monthly allowances (per-model request caps)
INSERT INTO public.premium_allowances (plan, public_slug, monthly_requests)
VALUES
  ('plus','claude-sonnet-5',100),
  ('plus','grok-4',100),
  ('scale','claude-sonnet-5',400),
  ('scale','claude-opus-5',50),
  ('scale','gpt-5-pro',50),
  ('scale','o3-pro',50),
  ('scale','grok-4',300),
  ('scale','kimi-k3',100)
ON CONFLICT (plan, public_slug) DO NOTHING;

-- ------------------------------------------------------------
-- Subscriptions (one active per user) + per-subscription usage
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  plan TEXT NOT NULL REFERENCES public.plan_limits(plan),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired','cancelled','superseded')),
  current_period_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  current_period_end TIMESTAMPTZ NOT NULL,
  payment_transaction_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON public.subscriptions(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_one_active
  ON public.subscriptions(user_id) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS public.subscription_usage (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subscription_id UUID NOT NULL UNIQUE REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  messages_used INT NOT NULL DEFAULT 0 CHECK (messages_used >= 0),
  input_tokens_used BIGINT NOT NULL DEFAULT 0 CHECK (input_tokens_used >= 0),
  output_tokens_used BIGINT NOT NULL DEFAULT 0 CHECK (output_tokens_used >= 0),
  premium_used JSONB NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(premium_used) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_usage ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "subscriptions_select_own" ON public.subscriptions;
CREATE POLICY "subscriptions_select_own" ON public.subscriptions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "subscription_usage_select_own" ON public.subscription_usage;
CREATE POLICY "subscription_usage_select_own" ON public.subscription_usage
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.subscriptions s WHERE s.id = subscription_id AND s.user_id = auth.uid())
  );

DROP TRIGGER IF EXISTS subscriptions_updated_at ON public.subscriptions;
CREATE TRIGGER subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS subscription_usage_updated_at ON public.subscription_usage;
CREATE TRIGGER subscription_usage_updated_at
  BEFORE UPDATE ON public.subscription_usage
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ------------------------------------------------------------
-- RPC: active subscription with lazy expiry (no cron dependency)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_active_subscription(p_user_id uuid)
RETURNS TABLE (sub_id uuid, sub_plan text, period_start timestamptz, period_end timestamptz)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.subscriptions
  SET status = 'expired'
  WHERE user_id = p_user_id AND status = 'active' AND current_period_end < now();

  RETURN QUERY
  SELECT s.id, s.plan, s.current_period_start, s.current_period_end
  FROM public.subscriptions s
  WHERE s.user_id = p_user_id AND s.status = 'active'
  ORDER BY s.created_at DESC
  LIMIT 1;
END $$;

-- ------------------------------------------------------------
-- RPC: atomic quota consumption (model access + all limits).
-- Premium access is derived server-side from plan config — the client
-- can never influence which model tier it gets.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.consume_chat_quota(
  p_user_id uuid,
  p_slug text,
  p_est_input_tokens int,
  p_est_max_output int
)
RETURNS json
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sub RECORD;
  v_limits RECORD;
  v_usage RECORD;
  v_base boolean;
  v_allowance int;
  v_premium_used int;
  v_reserve_out int;
  v_plan_probe text;
BEGIN
  SELECT * INTO v_sub FROM public.get_active_subscription(p_user_id);
  IF NOT FOUND THEN
    RETURN json_build_object('allowed', false, 'code', 'NO_SUBSCRIPTION');
  END IF;

  SELECT * INTO v_limits FROM public.plan_limits WHERE plan = v_sub.sub_plan;
  IF NOT FOUND THEN
    RETURN json_build_object('allowed', false, 'code', 'CONFIG_ERROR');
  END IF;

  -- Model access: base plan_models OR premium allowance.
  -- Inheritance: scale ⊃ plus ⊃ basic.
  SELECT EXISTS(
    SELECT 1 FROM public.plan_models
    WHERE public_slug = p_slug
      AND plan IN (
        SELECT p FROM (VALUES ('basic'),('plus'),('scale')) AS t(p)
        WHERE (v_sub.sub_plan = 'basic'  AND p = 'basic')
           OR (v_sub.sub_plan = 'plus'   AND p IN ('basic','plus'))
           OR (v_sub.sub_plan = 'scale'  AND p IN ('basic','plus','scale'))
      )
  ) INTO v_base;

  SELECT monthly_requests INTO v_allowance
  FROM public.premium_allowances
  WHERE plan = v_sub.sub_plan AND public_slug = p_slug;

  IF NOT v_base AND v_allowance IS NULL THEN
    -- Report the minimum plan that grants this model (server-derived)
    SELECT MIN(plan) INTO v_plan_probe FROM (
      SELECT plan FROM public.plan_models WHERE public_slug = p_slug
      UNION
      SELECT plan FROM public.premium_allowances WHERE public_slug = p_slug
    ) x;
    RETURN json_build_object('allowed', false, 'code', 'MODEL_PLAN_REQUIRED',
      'requiredPlan', COALESCE(v_plan_probe, 'scale'));
  END IF;

  -- Context limit
  IF p_est_input_tokens > v_limits.max_context_tokens THEN
    RETURN json_build_object('allowed', false, 'code', 'CONTEXT_TOO_LARGE',
      'maxContext', v_limits.max_context_tokens);
  END IF;

  -- Lock the usage row (serializes concurrent requests)
  SELECT * INTO v_usage FROM public.subscription_usage
  WHERE subscription_id = v_sub.sub_id FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.subscription_usage (subscription_id, period_start, period_end)
    VALUES (v_sub.sub_id, v_sub.period_start, v_sub.period_end);
    SELECT * INTO v_usage FROM public.subscription_usage
    WHERE subscription_id = v_sub.sub_id FOR UPDATE;
  END IF;

  -- Monthly message limit
  IF v_usage.messages_used >= v_limits.monthly_messages THEN
    RETURN json_build_object('allowed', false, 'code', 'MESSAGE_LIMIT',
      'used', v_usage.messages_used, 'limit', v_limits.monthly_messages);
  END IF;

  -- Monthly input-token budget (reserve the estimate)
  IF v_usage.input_tokens_used + p_est_input_tokens > v_limits.monthly_input_tokens THEN
    RETURN json_build_object('allowed', false, 'code', 'INPUT_TOKEN_LIMIT',
      'used', v_usage.input_tokens_used, 'limit', v_limits.monthly_input_tokens);
  END IF;

  -- Monthly output budget: reserve worst-case (capped at per-request max)
  v_reserve_out := LEAST(
    v_limits.max_output_tokens_per_request,
    v_limits.monthly_output_tokens - v_usage.output_tokens_used
  );
  IF v_reserve_out <= 0 THEN
    RETURN json_build_object('allowed', false, 'code', 'OUTPUT_TOKEN_LIMIT',
      'used', v_usage.output_tokens_used, 'limit', v_limits.monthly_output_tokens);
  END IF;

  -- Premium allowance
  v_premium_used := COALESCE((v_usage.premium_used ->> p_slug)::int, 0);
  IF v_allowance IS NOT NULL AND v_premium_used >= v_allowance THEN
    RETURN json_build_object('allowed', false, 'code', 'PREMIUM_ALLOWANCE_EXCEEDED',
      'model', p_slug, 'used', v_premium_used, 'limit', v_allowance);
  END IF;

  -- Commit reservation
  UPDATE public.subscription_usage SET
    messages_used = messages_used + 1,
    input_tokens_used = input_tokens_used + p_est_input_tokens,
    output_tokens_used = output_tokens_used + v_reserve_out,
    premium_used = CASE
      WHEN v_allowance IS NOT NULL THEN jsonb_set(premium_used, ARRAY[p_slug], to_jsonb(v_premium_used + 1))
      ELSE premium_used END,
    updated_at = now()
  WHERE id = v_usage.id;

  RETURN json_build_object(
    'allowed', true,
    'usageRowId', v_usage.id,
    'plan', v_sub.sub_plan,
    'reservedInput', p_est_input_tokens,
    'reservedOutput', v_reserve_out,
    'maxOutputCap', v_limits.max_output_tokens_per_request,
    'isPremium', v_allowance IS NOT NULL,
    'rpm', v_limits.requests_per_minute
  );
END $$;

-- ------------------------------------------------------------
-- RPC: reconcile reservation with ACTUAL provider-reported usage.
-- Deltas can be negative (refund of over-reserved output).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reconcile_chat_usage(
  p_usage_row_id uuid,
  p_reserved_input int,
  p_actual_input int,
  p_reserved_output int,
  p_actual_output int
)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.subscription_usage SET
    input_tokens_used  = GREATEST(0, input_tokens_used  + (GREATEST(0, p_actual_input)  - p_reserved_input)),
    output_tokens_used = GREATEST(0, output_tokens_used + (GREATEST(0, p_actual_output) - p_reserved_output)),
    updated_at = now()
  WHERE id = p_usage_row_id;
END $$;

-- ------------------------------------------------------------
-- RPC: models accessible for a plan (inheritance-aware; for UI)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_models_for_plan(p_plan text)
RETURNS TABLE (public_slug text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT pm.public_slug
  FROM public.plan_models pm
  WHERE pm.plan IN (
    SELECT p FROM (VALUES ('basic'),('plus'),('scale')) AS t(p)
    WHERE (p_plan = 'basic' AND p = 'basic')
       OR (p_plan = 'plus'  AND p IN ('basic','plus'))
       OR (p_plan = 'scale' AND p IN ('basic','plus','scale'))
  )
  UNION
  SELECT pa.public_slug FROM public.premium_allowances pa WHERE pa.plan = p_plan;
$$;

-- ------------------------------------------------------------
-- RPC: purchase a subscription with wallet balance (Toman).
-- Debits through the EXISTING wallet ledger (balances + wallet_transactions,
-- transaction_type 'withdrawal', metadata.plan) — no second billing system.
-- Atomic: FOR UPDATE on the balance row; supersedes any active subscription.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.purchase_subscription_with_wallet(
  p_user_id uuid,
  p_plan text
)
RETURNS json
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_limits RECORD;
  v_balance RECORD;
  v_old_active uuid;
  v_sub_id uuid;
  v_period_end timestamptz;
BEGIN
  SELECT * INTO v_limits FROM public.plan_limits WHERE plan = p_plan;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'UNKNOWN_PLAN');
  END IF;

  -- Lock the wallet row (serializes concurrent purchases)
  SELECT balance_cents, id INTO v_balance
  FROM public.balances
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'NO_WALLET');
  END IF;

  IF v_balance.balance_cents < v_limits.price_toman THEN
    RETURN json_build_object(
      'success', false,
      'error', 'INSUFFICIENT_BALANCE',
      'needed', v_limits.price_toman,
      'balance', v_balance.balance_cents
    );
  END IF;

  -- Supersede current active subscription (history preserved)
  SELECT id INTO v_old_active FROM public.subscriptions
  WHERE user_id = p_user_id AND status = 'active'
  FOR UPDATE;
  IF FOUND THEN
    UPDATE public.subscriptions SET status = 'superseded', updated_at = now()
    WHERE id = v_old_active;
  END IF;

  v_period_end := now() + interval '30 days';

  INSERT INTO public.subscriptions (user_id, plan, status, current_period_start, current_period_end)
  VALUES (p_user_id, p_plan, 'active', now(), v_period_end)
  RETURNING id INTO v_sub_id;

  -- Debit wallet + ledger entry (existing architecture)
  UPDATE public.balances
  SET balance_cents = balance_cents - v_limits.price_toman, updated_at = now()
  WHERE id = v_balance.id
  RETURNING balance_cents INTO v_balance.balance_cents;

  INSERT INTO public.wallet_transactions (
    user_id, transaction_type, amount_cents, currency,
    balance_before_cents, balance_after_cents,
    reference_id, status, metadata
  ) VALUES (
    p_user_id, 'withdrawal', -v_limits.price_toman, 'TOMAN',
    v_balance.balance_cents + v_limits.price_toman, v_balance.balance_cents,
    v_sub_id, 'completed',
    json_build_object('kind', 'subscription', 'plan', p_plan)
  );

  RETURN json_build_object('success', true, 'subscriptionId', v_sub_id,
    'plan', p_plan, 'periodEnd', v_period_end, 'newBalance', v_balance.balance_cents);
END $$;

-- ------------------------------------------------------------
-- RPC: refund a failed request (failed requests never consume usage)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refund_chat_quota(
  p_usage_row_id uuid,
  p_slug text,
  p_reserved_input int,
  p_reserved_output int,
  p_was_premium boolean
)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_used int;
BEGIN
  UPDATE public.subscription_usage SET
    messages_used = GREATEST(0, messages_used - 1),
    input_tokens_used = GREATEST(0, input_tokens_used - p_reserved_input),
    output_tokens_used = GREATEST(0, output_tokens_used - p_reserved_output),
    updated_at = now()
  WHERE id = p_usage_row_id;

  IF p_was_premium THEN
    SELECT COALESCE((premium_used ->> p_slug)::int, 0) INTO v_used
    FROM public.subscription_usage WHERE id = p_usage_row_id;
    UPDATE public.subscription_usage SET
      premium_used = jsonb_set(premium_used, ARRAY[p_slug], to_jsonb(GREATEST(0, v_used - 1)))
    WHERE id = p_usage_row_id;
  END IF;
END $$;
