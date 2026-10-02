-- ============================================================
-- Azura Phase 3 Database Migration
-- Adds wallet initialization trigger for new users
-- Ensures every user gets exactly one balance row (0 cents, USD currency)
-- Idempotent and secure implementation
-- ============================================================

-- Create function to initialize user balance on creation
-- SECURITY DEFINER: runs with the privileges of the trigger's owner
-- SET search_path = public: prevents search_path injection attacks
DROP FUNCTION IF EXISTS public.init_user_balance();
CREATE OR REPLACE FUNCTION public.init_user_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance_exists BOOLEAN;
BEGIN
  -- Check if balance row already exists for this user
  SELECT EXISTS (
    SELECT 1
    FROM public.balances
    WHERE user_id = NEW.id
  ) INTO v_balance_exists;

  -- Only create balance if it doesn't exist (idempotent)
  IF NOT v_balance_exists THEN
    INSERT INTO public.balances (
      user_id,
      balance_cents,
      currency
    )
    VALUES (
      NEW.id,
      0,
      'USD'
    );
  END IF;

  -- Always return the new user row
  RETURN NEW;
END;
$$;

-- Create trigger on users table
-- AFTER INSERT: user row already committed, balance can reference users.id
DROP TRIGGER IF EXISTS init_user_balance ON public.users;
CREATE TRIGGER init_user_balance
  AFTER INSERT ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.init_user_balance();

-- Add comment to document the trigger
COMMENT ON TRIGGER init_user_balance ON public.users IS 'Automatically creates balance row for new users (0 USD cents)';

-- Verify trigger exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'init_user_balance'
    AND tgrelid = 'public.users'::regclass
  ) THEN
    RAISE EXCEPTION 'init_user_balance trigger not found';
  END IF;
END;
$$;