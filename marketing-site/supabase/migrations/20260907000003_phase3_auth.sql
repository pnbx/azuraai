-- ============================================================
-- Phase 3: Authentication & User Management
-- ============================================================
-- This migration adds authentication-related tables and enhances security
-- for user management in the Azura platform.

-- Add additional user profile information
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS full_name TEXT,
ADD COLUMN IF NOT EXISTS phone TEXT,
ADD COLUMN IF NOT EXISTS avatar_url TEXT,
ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS preferred_language TEXT DEFAULT 'en';

-- Create user_profiles table for extended user information
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  display_name TEXT,
  bio TEXT,
  location TEXT,
  website TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_profiles_user_id_unique UNIQUE (user_id)
);

-- Create user_sessions table for tracking active sessions (complementing Supabase Auth)
CREATE TABLE IF NOT EXISTS public.user_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  session_token TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  CONSTRAINT user_sessions_user_id_expires_unique UNIQUE (user_id, expires_at)
);

-- Update RLS policies for new tables
-- user_profiles: users can only see their own profile
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_profiles_select_own" ON public.user_profiles
  FOR SELECT USING (auth.uid() = user_id);

-- user_sessions: users can only see their own sessions
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_sessions_select_own" ON public.user_sessions
  FOR SELECT USING (auth.uid() = user_id);

-- Revoke public access to these tables (no policies = no access)
-- These tables are platform-managed and not directly accessible by normal users

-- Add indexes for better query performance
CREATE INDEX idx_user_profiles_user_id ON public.user_profiles(user_id);
CREATE INDEX idx_user_sessions_user_id ON public.user_sessions(user_id);
CREATE INDEX idx_user_sessions_expires ON public.user_sessions(expires_at);

-- Add triggers to maintain updated_at timestamps
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Apply triggers to user_profiles
DROP TRIGGER IF EXISTS user_profiles_updated_at ON public.user_profiles;
CREATE TRIGGER user_profiles_updated_at
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Apply triggers to user_sessions (for expires_at updates)
DROP TRIGGER IF EXISTS user_sessions_updated_at ON public.user_sessions;
CREATE TRIGGER user_sessions_updated_at
  BEFORE UPDATE ON public.user_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Add constraint to ensure expires_at is always in the future
ALTER TABLE public.user_sessions
ADD CONSTRAINT user_sessions_expires_future
  CHECK (expires_at > now());