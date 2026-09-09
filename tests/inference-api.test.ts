import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { ProviderResponse, ProviderOperation } from '../lib/provider/types';
import { requireServerUser } from '@/lib/auth/server';
import { registerProvider } from '../lib/provider/registry';
import type { Provider, ProviderConfig } from '../lib/provider/types';
import { resolveModel } from '../lib/provider/model-catalog';
import { executeThroughGateway } from '../lib/gateway/gateway';

// ─── Mock supabaseAdmin ─────────────────────────────────────────────────────
// The real security functions (auth, rate-limit, reservation, usage) all use
// supabaseAdmin. By mocking it, the real functions run against our mock DB,
// avoiding the jest.mock() interception issue with dynamic imports entirely.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockSupabaseAdmin = { from: jest.fn(), rpc: jest.fn() } as any;
jest.mock('@/supabase/admin', () => ({ supabaseAdmin: mockSupabaseAdmin }));

jest.mock('@/lib/auth/server', () => ({ requireServerUser: jest.fn(), getServerUser: jest.fn() }));
jest.mock('../lib/provider/model-catalog', () => ({ resolveModel: jest.fn() }));
jest.mock('../lib/gateway/gateway', () => ({ executeThroughGateway: jest.fn() }));

const mockRequireServerUser = requireServerUser as jest.MockedFunction<typeof requireServerUser>;
const mockResolveModel = resolveModel as jest.MockedFunction<typeof resolveModel>;
const mockExecuteThroughGateway = executeThroughGateway as jest.MockedFunction<typeof executeThroughGateway>;

// ─── Test fixtures ──────────────────────────────────────────────────────────

class MockProvider implements Provider {
  readonly config: ProviderConfig;
  constructor(config: ProviderConfig) { this.config = config; }
  canHandle(op: ProviderOperation): boolean { return this.config.capabilities.includes(op); }
  async execute(): Promise<ProviderResponse> {
    return { provider: this.config.id, model: this.config.defaultModel, operation: 'generate' as ProviderOperation, content: 'mock response' };
  }
}

const testUser = { id: 'test-user-id', email: 'test@example.com', app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: '2026-09-09T00:00:00.000Z' };
const testProviderConfig: ProviderConfig = { id: 'avali', name: 'Test Provider', defaultModel: 'test-model', capabilities: ['generate'] as ProviderOperation[], enabled: true };
const enabledModel = {
  id: '11111111-1111-4111-8111-111111111111', azura_model_id: 'azura-test-model', public_slug: 'test-model',
  display_name: 'Test Model', provider_id: '22222222-2222-4222-8222-222222222222',
  provider_model_id: 'provider-test-model', capabilities: ['generate'] as ProviderOperation[],
  enabled: true, status: 'active' as const, created_at: '2026-09-09T00:00:00.000Z', updated_at: '2026-09-09T00:00:00.000Z',
};
const testPricingRow = { input_token_price_cents: 10, output_token_price_cents: 30, request_fee_cents: 5, version: 1 };
const VALID_AUTH_HEADER = 'Bearer az_test-secret-key-12345';
/** Valid API key data returned by `from('api_keys')` chain for authentication */
const okApiKey = okChain({ id: 'key-001', user_id: testUser.id, scope: 'full', users: { id: testUser.id, is_active: true } });

// ─── Mock DB helpers ─────────────────────────────────────────────────────────

/**
 * Create a chainable mock for Supabase query builder.
 *
 * All chain methods (select, eq, lte, or, order, etc.) return the same chain
 * object, so they can be called in any order. Terminal methods (single,
 * maybeSingle, limit) resolve with `{ data, error }`.
 *
 * `limit(1)` returns a thenable so the real code's `chain.limit(1).maybeSingle()`
 * and `await chain.limit(1)` both work correctly.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function okChain(data: any, error: null = null) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: Record<string, any> = {};
  for (const m of ['select', 'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'or', 'in', 'order', 'update', 'insert']) {
    chain[m] = jest.fn(() => chain);
  }
  const result = { data, error };
  chain.single = jest.fn(() => Promise.resolve(result));
  chain.maybeSingle = jest.fn(() => Promise.resolve(result));
  // thenable: resolves the whole chain (used by `await chain`)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  chain.then = jest.fn((resolve: (value: any) => void) => resolve(result));
  // limit() returns a sub-chain with thenable + single/maybeSingle
  chain.limit = jest.fn(() => ({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    then: (resolve: (value: any) => void) => resolve(result),
    single: jest.fn(() => Promise.resolve(result)),
    maybeSingle: jest.fn(() => Promise.resolve(result)),
  }));
  return chain;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Inference API Route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireServerUser.mockResolvedValue(testUser);
    mockResolveModel.mockResolvedValue({
      model: enabledModel,
      provider: new MockProvider(testProviderConfig),
      providerConfig: testProviderConfig,
    });
    registerProvider({ provider: 'avali' as const, implementation: MockProvider, configProvider: () => testProviderConfig });
  });

  afterEach(() => { jest.restoreAllMocks(); });

  describe('POST /api/inference', () => {
    it('requires authentication', async () => {
      mockRequireServerUser.mockRejectedValue(new Error('Unauthenticated'));
      const { POST } = await import('../app/api/inference/route');
      const res = await POST(new Request('http://localhost/api/inference', {
        method: 'POST', body: JSON.stringify({ model: 'test-model', operation: 'generate', input: 'test' }),
      }));
      expect(res.status).toBe(401);
      expect((await res.json()).success).toBe(false);
    });

    it('requires model field', async () => {
      const { POST } = await import('../app/api/inference/route');
      const res = await POST(new Request('http://localhost/api/inference', {
        method: 'POST', body: JSON.stringify({ operation: 'generate', input: 'test' }),
      }));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('Model is required and must be a string');
    });

    it('requires operation field', async () => {
      const { POST } = await import('../app/api/inference/route');
      const res = await POST(new Request('http://localhost/api/inference', {
        method: 'POST', body: JSON.stringify({ model: 'test-model', input: 'test' }),
      }));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('Operation is required and must be a string');
    });

    it('returns 403 for model not found', async () => {
      mockResolveModel.mockRejectedValue(new Error('Model not found'));
      const { POST } = await import('../app/api/inference/route');
      const res = await POST(new Request('http://localhost/api/inference', {
        method: 'POST', body: JSON.stringify({ model: 'unknown-model', operation: 'generate', input: 'test' }),
      }));
      expect(res.status).toBe(403);
    });

    it('returns 200 on successful inference', async () => {
      mockExecuteThroughGateway.mockResolvedValue({
        providerResponse: { provider: 'avali', model: 'test-model', operation: 'generate' as ProviderOperation, content: 'inference successful', metadata: { prompt_tokens: 100, completion_tokens: 50 } },
        gatewayMetadata: { processedAt: Date.now(), providerUsed: 'avali', gatewayVersion: '1.0.0' },
      });

      // RPCs: rate-limit allows, quota allows, reserve succeeds, settle succeeds, usage recorded
      mockSupabaseAdmin.rpc.mockImplementation((fn: string) => {
        if (fn === 'check_and_increment_rate_limit') return Promise.resolve({ data: [{ allowed: true, current_count: 1, limit_val: 60 }], error: null });
        if (fn === 'check_token_quota') return Promise.resolve({ data: [{ allowed: true, used_tokens: 100, quota_limit: 100000000 }], error: null });
        if (fn === 'reserve_funds_for_inference') return Promise.resolve({ data: [{ success: true, reservation_id: 'res-001', new_balance: 9000 }], error: null });
        if (fn === 'settle_inference_reservation') return Promise.resolve({ data: [{ success: true, refund_amount: 3495 }], error: null });
        if (fn === 'insert_usage_if_needed') return Promise.resolve({ data: 'usage-001', error: null });
        return Promise.resolve({ data: null, error: null });
      });

      // DB queries: pricing lookup returns test row, api_keys auth returns valid key
      mockSupabaseAdmin.from.mockImplementation((table: string) => {
        if (table === 'pricing_rules') return okChain(testPricingRow);
        if (table === 'api_keys') return okApiKey;
        return okChain(null);
      });

      const { POST } = await import('../app/api/inference/route');
      const res = await POST(new Request('http://localhost/api/inference', {
        method: 'POST',
        headers: { Authorization: VALID_AUTH_HEADER },
        body: JSON.stringify({ model: 'test-model', operation: 'generate', input: 'hello world', parameters: { temperature: 0.7 } }),
      }));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.result.content).toBe('inference successful');
      expect(json.model.public_slug).toBe('test-model');
      expect(json.usage).toEqual({ input_tokens: 100, output_tokens: 50, cached_tokens: 0 });
    });

    it('returns 402 when wallet balance is insufficient', async () => {
      mockSupabaseAdmin.rpc.mockImplementation((fn: string) => {
        if (fn === 'check_and_increment_rate_limit') return Promise.resolve({ data: [{ allowed: true, current_count: 1, limit_val: 60 }], error: null });
        if (fn === 'check_token_quota') return Promise.resolve({ data: [{ allowed: true, used_tokens: 100, quota_limit: 100000000 }], error: null });
        if (fn === 'reserve_funds_for_inference') return Promise.resolve({ data: [{ success: false, reservation_id: null, new_balance: 0 }], error: null });
        return Promise.resolve({ data: null, error: null });
      });

      mockSupabaseAdmin.from.mockImplementation((table: string) => {
        if (table === 'pricing_rules') return okChain(testPricingRow);
        if (table === 'api_keys') return okApiKey;
        return okChain(null);
      });

      const { POST } = await import('../app/api/inference/route');
      const res = await POST(new Request('http://localhost/api/inference', {
        method: 'POST',
        headers: { Authorization: VALID_AUTH_HEADER },
        body: JSON.stringify({ model: 'test-model', operation: 'generate', input: 'test' }),
      }));
      expect(res.status).toBe(402);
      expect((await res.json()).error).toMatch(/Insufficient/);
    });

    it('returns 429 when rate limited', async () => {
      mockSupabaseAdmin.rpc.mockImplementation((fn: string) => {
        if (fn === 'check_and_increment_rate_limit') return Promise.resolve({ data: [{ allowed: false, current_count: 61, limit_val: 60 }], error: null });
        return Promise.resolve({ data: null, error: null });
      });

      mockSupabaseAdmin.from.mockImplementation((table: string) => {
        if (table === 'api_keys') return okApiKey;
        return okChain(null);
      });

      const { POST } = await import('../app/api/inference/route');
      const res = await POST(new Request('http://localhost/api/inference', {
        method: 'POST',
        headers: { Authorization: VALID_AUTH_HEADER },
        body: JSON.stringify({ model: 'test-model', operation: 'generate', input: 'test' }),
      }));
      expect(res.status).toBe(429);
    });
  });
});
