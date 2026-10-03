-- ============================================================
-- APP GATEWAY + MEMORY: apply the two migrations that were never run
-- Run this ENTIRE script in Supabase Dashboard → SQL Editor
-- Project: japamxendclmksbdokau
-- ============================================================
--
-- WHY THIS EXISTS
--
-- Audit on 2026-10-03 found that none of the app chat's own schema exists in
-- this project. Verified missing via PostgREST:
--
--   PGRST205  Could not find the table 'public.user_memory'
--   PGRST202  Could not find the function public.increment_app_chat_usage(...)
--   PGRST205  Could not find the table 'public.app_chat_usage'
--   PGRST205  Could not find the table 'public.openrouter_keys'
--
-- Nothing crashed, which is exactly why it went unnoticed:
--   - Both chat routes fail OPEN on a usage-RPC error, so every request is
--     served uncapped. The 30/day free cap has never once been enforced.
--   - /api/app/memory 500s, and the client silently keeps its stale
--     localStorage mirror, so the panel looks merely "empty".
--   - The key pool falls back to OPENROUTER_KEYS env keys, so replies still
--     work — but daily limits and cooldowns are in-memory only and reset on
--     every Vercel cold start.
--
-- Source of truth:
--   supabase/migrations/20260929000000_app_free_gateway.sql
--   supabase/migrations/20261001000000_user_memory.sql
-- This script is those two files concatenated, plus verification at the end.
--
-- SAFE TO RE-RUN: every object is CREATE TABLE IF NOT EXISTS or CREATE OR
-- REPLACE, and every policy is dropped before it is recreated. No existing
-- data is read, written or destroyed.
--
-- AFTER RUNNING: no deploy is needed. The next request picks the tables up.
--
-- STATUS: applied to the live project on 2026-10-03 via the Supabase MCP
-- apply_migration tool. Two defects in this script were found while applying
-- it and fixed here, so re-running the older text reintroduces them:
--   1. increment_app_chat_usage raised 42702 "column reference used is
--      ambiguous" on every call (RETURNS TABLE declares an OUT param named
--      `used`). Fixed with an `AS t` alias.
--   2. REVOKE ... FROM PUBLIC left both functions callable by `anon`.
--      Fixed by revoking from anon/authenticated explicitly.

-- ============================================================
-- 1. OpenRouter API keys (server-side pool; plaintext key never returned)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.openrouter_keys (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  label            TEXT NOT NULL DEFAULT 'key',
  api_key          TEXT NOT NULL UNIQUE,
  enabled          BOOLEAN NOT NULL DEFAULT TRUE,
  daily_limit      INT  NOT NULL DEFAULT 50,
  used_today       INT  NOT NULL DEFAULT 0,
  usage_date       DATE NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  cooldown_until   TIMESTAMPTZ,
  failure_count    INT  NOT NULL DEFAULT 0,
  last_used_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_openrouter_keys_pick
  ON public.openrouter_keys(enabled, usage_date, used_today)
  WHERE enabled;

ALTER TABLE public.openrouter_keys ENABLE ROW LEVEL SECURITY;
-- No policies: infrastructure table, service_role only.

-- ============================================================
-- 2. Daily per-user message cap for the free app chat
-- ============================================================
CREATE TABLE IF NOT EXISTS public.app_chat_usage (
  user_id        UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  usage_date     DATE NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  used           INT  NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, usage_date)
);

ALTER TABLE public.app_chat_usage ENABLE ROW LEVEL SECURITY;
-- No policies: service_role only.

-- ============================================================
-- 3. Atomic pool checkout: marks one healthy key as used, rolls over
--    daily counters, returns nothing when the pool is exhausted/cooling.
-- ============================================================
CREATE OR REPLACE FUNCTION public.pick_openrouter_key(
  p_daily_limit_cap INT DEFAULT 50
)
RETURNS TABLE(id UUID, api_key TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row RECORD;
  v_today DATE := (now() AT TIME ZONE 'utc')::date;
BEGIN
  -- Reset counters that rolled over to a new UTC day
  UPDATE public.openrouter_keys
     SET used_today = 0, usage_date = v_today
   WHERE usage_date < v_today;

  FOR v_row IN
    SELECT *
      FROM public.openrouter_keys
     WHERE enabled = TRUE
       AND usage_date = v_today
       AND used_today < LEAST(daily_limit, p_daily_limit_cap)
       AND (cooldown_until IS NULL OR cooldown_until <= now())
     ORDER BY used_today ASC, last_used_at NULLS FIRST, created_at ASC
     FOR UPDATE SKIP LOCKED
     LIMIT 1
  LOOP
    UPDATE public.openrouter_keys
       SET used_today = used_today + 1,
           last_used_at = now(),
           failure_count = 0
     WHERE id = v_row.id;

    RETURN QUERY SELECT v_row.id, v_row.api_key;
    RETURN;
  END LOOP;

  -- Pool exhausted or all keys cooling down
  RETURN;
END;
$$;

-- CRITICAL: the anon/authenticated revokes are load-bearing.
-- REVOKE ... FROM PUBLIC alone does NOT lock these down on Supabase: both
-- roles hold direct EXECUTE grants on public-schema functions via ALTER
-- DEFAULT PRIVILEGES. Without these lines pick_openrouter_key — SECURITY
-- DEFINER, RETURNS api_key — answers any anonymous visitor at
-- /rest/v1/rpc/pick_openrouter_key with your plaintext OpenRouter keys.
REVOKE ALL ON FUNCTION public.pick_openrouter_key(INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pick_openrouter_key(INT) FROM anon;
REVOKE ALL ON FUNCTION public.pick_openrouter_key(INT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.pick_openrouter_key(INT) TO service_role;

-- ============================================================
-- 4. Atomic per-user daily counter (true upsert, PK conflict target)
--
-- NOTE the `AS t` alias: RETURNS TABLE(allowed, used, cap) declares an
-- implicit OUT parameter named `used`, so an unqualified `used` in the body
-- is ambiguous between that parameter and the column, and Postgres throws
-- 42702 on every call. The chat routes allow the request on an RPC error, so
-- that bug is invisible — the cap silently stops being enforced, exactly as
-- when the function was missing altogether.
-- ============================================================
CREATE OR REPLACE FUNCTION public.increment_app_chat_usage(
  p_user_id UUID,
  p_daily_cap INT DEFAULT 30
)
RETURNS TABLE(allowed BOOLEAN, used INT, cap INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_used INT;
  v_today DATE := (now() AT TIME ZONE 'utc')::date;
BEGIN
  INSERT INTO public.app_chat_usage AS t (user_id, usage_date, used)
  VALUES (p_user_id, v_today, 1)
  ON CONFLICT (user_id, usage_date)
  DO UPDATE SET used = t.used + 1
  RETURNING t.used INTO v_used;

  RETURN QUERY SELECT (v_used <= p_daily_cap), v_used, p_daily_cap;
END;
$$;

-- Without the anon/authenticated revokes, any visitor could inflate another
-- user's counter and lock them out of the free tier.
REVOKE ALL ON FUNCTION public.increment_app_chat_usage(UUID, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.increment_app_chat_usage(UUID, INT) FROM anon;
REVOKE ALL ON FUNCTION public.increment_app_chat_usage(UUID, INT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.increment_app_chat_usage(UUID, INT) TO service_role;

-- ============================================================
-- 5. User long-term memory
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_memory (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  content    TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 500),
  source     TEXT NOT NULL DEFAULT 'auto',   -- auto | manual
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_memory_user
  ON public.user_memory(user_id, created_at DESC);

ALTER TABLE public.user_memory ENABLE ROW LEVEL SECURITY;

-- Owner can manage their own memories from client code (anon/authenticated key).
DROP POLICY IF EXISTS user_memory_select_own ON public.user_memory;
CREATE POLICY user_memory_select_own ON public.user_memory
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS user_memory_insert_own ON public.user_memory;
CREATE POLICY user_memory_insert_own ON public.user_memory
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS user_memory_delete_own ON public.user_memory;
CREATE POLICY user_memory_delete_own ON public.user_memory
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- service_role (chat route) may read + write without policies (bypasses RLS).

-- ============================================================
-- 6. VERIFICATION — every row must say "ok".
--    Run this as a separate query afterwards.
-- ============================================================
-- SELECT 'table user_memory' AS check,
--        to_regclass('public.user_memory') IS NOT NULL AS ok
-- UNION ALL SELECT 'table app_chat_usage',
--        to_regclass('public.app_chat_usage') IS NOT NULL
-- UNION ALL SELECT 'table openrouter_keys',
--        to_regclass('public.openrouter_keys') IS NOT NULL
-- UNION ALL SELECT 'fn increment_app_chat_usage',
--        to_regprocedure('public.increment_app_chat_usage(uuid,int)') IS NOT NULL
-- UNION ALL SELECT 'fn pick_openrouter_key',
--        to_regprocedure('public.pick_openrouter_key(int)') IS NOT NULL;
--
-- Then confirm the cap actually counts (this DOES insert one row for your
-- own user id — harmless, and it is the same counter the app writes):
--   SELECT * FROM public.increment_app_chat_usage(
--     '140bf42b-b0f1-4c66-aa23-79fc14982561'::uuid, 30);
--
-- NOTE: openrouter_keys is intentionally left empty. With no rows,
-- pick_openrouter_key returns nothing and the app keeps using the
-- OPENROUTER_KEYS env fallback, which is the current behaviour. To move the
-- 11 env keys into the table instead, INSERT them from the dashboard — do not
-- paste raw keys into a shared SQL file.