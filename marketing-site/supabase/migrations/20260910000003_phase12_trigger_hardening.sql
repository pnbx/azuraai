-- Phase 12: Trigger function hardening
--
-- Fixes two production-critical issues discovered during migration audit:
-- 1. init_user_balance() still inserts 'USD' (never migrated by currency_toman)
-- 2. Both trigger functions lack SECURITY DEFINER and SET search_path = public

-- ============================================================
-- 1. Fix init_user_balance trigger: TOMAN currency + SECURITY DEFINER
-- ============================================================
CREATE OR REPLACE FUNCTION public.init_user_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.balances (user_id, balance_cents, currency)
  VALUES (NEW.id, 0, 'TOMAN')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- ============================================================
-- 2. Fix set_updated_at trigger: SECURITY DEFINER + SET search_path
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
