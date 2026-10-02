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
