-- ============================================================
-- Extend existing model_catalog table for Phase 5 Model Catalog
-- This migration adds fields needed for the Model Catalog layer while
-- maintaining backward compatibility with existing Phase 1 schema.
-- ============================================================

-- Add public_slug column for unique public identifier.
-- Nullable initially to avoid migration failure on existing rows.
-- A partial unique index enforces uniqueness when values are present.
ALTER TABLE public.model_catalog ADD COLUMN IF NOT EXISTS public_slug TEXT;

-- Add display_name column for human-readable model name.
ALTER TABLE public.model_catalog ADD COLUMN IF NOT EXISTS display_name TEXT;

-- Add enabled column for runtime availability (instead of relying solely on status).
-- NOT NULL DEFAULT TRUE is safe: PostgreSQL sets TRUE for existing rows.
ALTER TABLE public.model_catalog ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT TRUE;

-- Deterministic backfill for existing rows.
-- azura_model_id is already NOT NULL UNIQUE in the Phase 1 schema, so it is a
-- safe source for deriving public_slug and display_name without guessing.
-- Idempotent: only backfills rows where the derived column is currently NULL.
UPDATE public.model_catalog
   SET public_slug = azura_model_id
 WHERE public_slug IS NULL;

UPDATE public.model_catalog
   SET display_name = azura_model_id
 WHERE display_name IS NULL;

-- Enforce NOT NULL only AFTER the backfill so existing rows remain usable.
ALTER TABLE public.model_catalog ALTER COLUMN public_slug SET NOT NULL;
ALTER TABLE public.model_catalog ALTER COLUMN display_name SET NOT NULL;

-- Create unique index for public_slug to enforce uniqueness.
-- After the backfill, public_slug is derived from the already-unique
-- azura_model_id, so this index is safe to make non-partial.
CREATE UNIQUE INDEX IF NOT EXISTS idx_model_catalog_public_slug_unique
  ON public.model_catalog (public_slug);

-- Create index for enabled status for efficient filtering
CREATE INDEX IF NOT EXISTS idx_model_catalog_enabled
  ON public.model_catalog (enabled);

-- Create index for display_name to support search/filtering
CREATE INDEX IF NOT EXISTS idx_model_catalog_display_name
  ON public.model_catalog (display_name);

-- Add provider_registry_id column to providers table to bridge database UUIDs
-- to ProviderId registry keys. Nullable to avoid migration failure on existing rows.
ALTER TABLE public.providers ADD COLUMN IF NOT EXISTS provider_registry_id TEXT;

-- Update existing RLS policy comment to reflect new fields
-- The existing policy "model_catalog_select_public" already restricts access to
-- active models. The application additionally filters enabled = true at the
-- query layer, so disabled models are never exposed through the catalog.
COMMENT ON POLICY "model_catalog_select_public" ON public.model_catalog IS
  'Read-only public catalog access: SELECT for rows where status = ''active''. '
  'The application layer additionally filters enabled = true, so disabled, '
  'deprecated, and suspended models are never exposed through the catalog.';

-- Add comment to document new fields
COMMENT ON COLUMN public.model_catalog.public_slug IS
  'Stable public identifier for the model, used for API endpoints and public references. '
  'Backfilled deterministically from azura_model_id for existing rows.';

COMMENT ON COLUMN public.model_catalog.display_name IS
  'Human-readable display name for the model. '
  'Backfilled deterministically from azura_model_id for existing rows.';

COMMENT ON COLUMN public.model_catalog.enabled IS
  'Whether the model is available for use at runtime. Independent of status; '
  'catalog queries require both enabled = true and status = ''active''.';

COMMENT ON COLUMN public.providers.provider_registry_id IS
  'Provider Registry identifier (e.g., ''avali'') for bridging database UUID to TypeScript ProviderId union. Nullable; populated only for explicitly registered providers.';