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

-- Create unique index for public_slug to enforce uniqueness.
-- Partial index allows multiple rows with NULL public_slug
-- but enforces uniqueness on non-NULL values.
CREATE UNIQUE INDEX IF NOT EXISTS idx_model_catalog_public_slug_unique
  ON public.model_catalog (public_slug)
  WHERE public_slug IS NOT NULL;

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
-- The existing policy "model_catalog_select_public" already restricts access to active models
-- We'll keep it as-is but update its comment to reflect new fields

-- Add comment to document new fields
COMMENT ON COLUMN public.model_catalog.public_slug IS
  'Stable public identifier for the model, used for API endpoints and public references';

COMMENT ON COLUMN public.model_catalog.display_name IS
  'Human-readable display name for the model';

COMMENT ON COLUMN public.model_catalog.enabled IS
  'Whether the model is available for use (tied to status = ''active'' for read-only access)';

COMMENT ON COLUMN public.providers.provider_registry_id IS
  'Provider Registry identifier (e.g., ''avali'') for bridging database UUID to TypeScript ProviderId union';