-- ============================================================
-- User long-term memory: durable facts the assistant remembers
-- across conversations (app chat). One row per memory.
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
CREATE POLICY user_memory_select_own ON public.user_memory
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY user_memory_insert_own ON public.user_memory
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY user_memory_delete_own ON public.user_memory
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- service_role (chat route) may read + write without policies (bypasses RLS).
