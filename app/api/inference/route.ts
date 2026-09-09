/**
 * Phase 6 Inference API
 *
 * Internal inference endpoint that routes authenticated requests
 * through the Model Catalog and Provider Gateway.
 *
 * Security:
 * - Requires authenticated user (via requireServerUser)
 * - Resolves model via model_catalog (status=active, enabled=true)
 * - Maps database UUID to ProviderId via explicit provider_registry_id bridge
 * - Provider credentials remain server-side only
 * - No public inference API — authenticated only
 *
 * Request:
 *   POST /api/inference
 *   {
 *     "provider": "avali" | null,       // optional; defaults to config default
 *     "model": "public_slug",          // model catalog public_slug
 *     "operation": "generate",         // ProviderOperation
 *     "input": any,                    // provider-specific input
 *     "parameters": {}                 // optional provider parameters
 *   }
 *
 * Response:
 *   200 — { success: true, result: ProviderResponse, model: ModelCatalog }
 *   401 — Unauthenticated
 *   403 — Model not found/inactive/disabled, provider unavailable
 *   400 — Missing required fields
 */

import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { requireServerUser } from '@/lib/auth/server'
import {
  getModelBySlug,
  listEnabledModels,
  resolveModel,
  modelSupportsOperation,
  healthCheck,
} from '@/lib/provider/model-catalog';
import {
  ProviderRequest,
  ProviderResponse,
  ProviderError,
  ProviderOperation,
  ProviderId,
} from '@/lib/provider/types';
import { executeThroughGateway } from '@/lib/gateway/gateway';

// ---------- helpers ----------

function parseJsonBody(request: Request): Promise<{
  provider?: string;
  model: string;
  operation: ProviderOperation;
  input?: unknown;
  parameters?: Record<string, unknown>;
}> {
  return request.json();
}

// ---------- main handler ----------

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const user = await requireServerUser();
    const { provider: providerParam, model: modelSlug, operation, input, parameters } =
      await parseJsonBody(request);

    if (!modelSlug) {
      return NextResponse.json(
        { success: false, error: 'Model is required' },
        { status: 400 }
      );
    }

    if (!operation) {
      return NextResponse.json(
        { success: false, error: 'Operation is required' },
        { status: 400 }
      );
    }

    // Resolve model through catalog -> provider -> config bridge
    // This uses the explicit provider_registry_id mapping (database UUID → ProviderId)
    // rather than unsafe UUID casts
    let providerId: string;
    let model: any;

    try {
      const resolved = await resolveModel(modelSlug);
      model = resolved.model;
      providerId = resolved.provider.config.id;
    } catch (resolveError: any) {
      // Model not found, disabled, or provider unregistered/unavailable
      const errorMessage = resolveError instanceof ProviderError
        ? resolveError.message
        : 'Model resolution failed';

      return NextResponse.json(
        { success: false, error: errorMessage },
        { status: 403 }
      );
    }

    // Verify the model supports the requested operation (client-side guard)
    if (!modelSupportsOperation(modelSlug, operation)) {
      return NextResponse.json(
        { success: false, error: `Model '${modelSlug}' does not support operation '${operation}'` },
        { status: 400 }
      );
    }

    // Build the provider request using the resolved model + provider config
    const providerRequest: ProviderRequest = {
      provider: providerId as ProviderId,
      model: model.azura_model_id,
      input: input ?? {},
      operation,
      parameters: parameters ?? {},
      requestId: crypto.randomUUID(),
    };

    // Execute through the gateway (validates provider registration, capability, etc.)
    const gatewayResponse = await executeThroughGateway(providerRequest);

    return NextResponse.json(
      {
        success: true,
        result: gatewayResponse.providerResponse,
        model: {
          id: model.id,
          azura_model_id: model.azura_model_id,
          public_slug: model.public_slug,
          display_name: model.display_name,
          provider_id: model.provider_id,
          provider_model_id: model.provider_model_id,
          capabilities: model.capabilities,
          enabled: model.enabled,
          status: model.status,
          created_at: model.created_at,
          updated_at: model.updated_at,
        },
      },
      { status: 200 }
    );

  } catch (error: any) {
    // Authentication error (401 — unauthenticated)
    if (error.message === 'Unauthenticated') {
      return NextResponse.json(
        { success: false, error: 'Unauthenticated' },
        { status: 401 }
      );
    }

    // Provider / gateway error (403 — authorization/unavailable)
    if (error.type === 'provider_unavailable' || error.type === 'provider_error') {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 403 }
      );
    }

    // Unexpected error — 500
    console.error('[Inference API] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}