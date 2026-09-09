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
import { requireServerUser } from '@/lib/auth/server'
import { resolveModel, modelSupportsOperation } from '@/lib/provider/model-catalog';
import {
  ProviderError,
  ProviderOperation,
  ProviderRequest,
} from '@/lib/provider/types';
import { executeThroughGateway } from '@/lib/gateway/gateway';

const operationNames = new Set<ProviderOperation>([
  'generate',
  'generate-image',
  'transcribe',
  'embed',
  'chat',
  'stream',
]);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalidRequest(message: string) {
  return NextResponse.json({ success: false, error: message }, { status: 400 });
}

function safeError(error: unknown): string {
  return error instanceof ProviderError ? error.message : 'Model resolution failed';
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    await requireServerUser();
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unauthenticated' },
      { status: 401 }
    );
  }

  try {
    const body: unknown = await request.json();
    if (!isObject(body)) {
      return invalidRequest('Request body must be an object');
    }

    if (typeof body.model !== 'string' || body.model.trim().length === 0) {
      return invalidRequest('Model is required and must be a string');
    }

    if (typeof body.operation !== 'string' || body.operation.trim().length === 0) {
      return invalidRequest('Operation is required and must be a string');
    }

    if (!operationNames.has(body.operation.trim() as ProviderOperation)) {
      return invalidRequest('Operation is not supported');
    }

    if (body.parameters !== undefined && !isObject(body.parameters)) {
      return invalidRequest('Parameters must be an object');
    }

    const modelSlug = body.model.trim();
    const operation = body.operation as ProviderOperation;

    let resolved;
    try {
      resolved = await resolveModel(modelSlug);
    } catch (error) {
      return NextResponse.json(
        { success: false, error: safeError(error) },
        { status: 403 }
      );
    }

    if (!(await modelSupportsOperation(modelSlug, operation))) {
      return invalidRequest(`Model '${modelSlug}' does not support operation '${operation}'`);
    }

    const providerRequest: ProviderRequest = {
      provider: resolved.provider.config.id,
      model: resolved.model.provider_model_id,
      input: body.input ?? {},
      operation,
      parameters: body.parameters ?? {},
      requestId: crypto.randomUUID(),
    };

    const gatewayResponse = await executeThroughGateway(providerRequest);

    return NextResponse.json(
      {
        success: true,
        result: gatewayResponse.providerResponse,
        model: {
          id: resolved.model.id,
          azura_model_id: resolved.model.azura_model_id,
          public_slug: resolved.model.public_slug,
          display_name: resolved.model.display_name,
          provider_id: resolved.model.provider_id,
          provider_model_id: resolved.model.provider_model_id,
          capabilities: resolved.model.capabilities,
          enabled: resolved.model.enabled,
          status: resolved.model.status,
          created_at: resolved.model.created_at,
          updated_at: resolved.model.updated_at,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof ProviderError) {
      const status = error.type === 'invalid_request' ? 400 : 403;
      return NextResponse.json({ success: false, error: error.message }, { status });
    }

    console.error('[Inference API] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}