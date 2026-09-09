import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { ProviderRequest, ProviderResponse, ProviderOperation } from '../lib/provider/types';
import { requireServerUser } from '@/lib/auth/server';
import { registerProvider } from '../lib/provider/registry';
import type { Provider, ProviderConfig } from '../lib/provider/types';
import { resolveModel, modelSupportsOperation } from '../lib/provider/model-catalog';
import { executeThroughGateway } from '../lib/gateway/gateway';

jest.mock('@/lib/auth/server', () => ({
  requireServerUser: jest.fn(),
}));
jest.mock('../lib/provider/model-catalog', () => ({
  resolveModel: jest.fn(),
  modelSupportsOperation: jest.fn(),
}));
jest.mock('../lib/gateway/gateway', () => ({
  executeThroughGateway: jest.fn(),
}));

const mockRequireServerUser = jest.mocked(requireServerUser);
const mockResolveModel = jest.mocked(resolveModel);
const mockModelSupportsOperation = jest.mocked(modelSupportsOperation);
const mockExecuteThroughGateway = jest.mocked(executeThroughGateway);

// Mock Provider for tests
class MockProvider implements Provider {
  readonly config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  canHandle(operation: ProviderOperation): boolean {
    return this.config.capabilities.includes(operation);
  }

  async execute(_request: ProviderRequest): Promise<ProviderResponse> {
    return {
      provider: this.config.id,
      model: this.config.defaultModel,
      operation: 'generate' as ProviderOperation,
      content: 'mock response',
    };
  }
}

// Test data
const testUser = {
  id: 'test-user-id',
  email: 'test@example.com',
  app_metadata: {},
  user_metadata: {},
  aud: 'authenticated',
  created_at: '2026-09-09T00:00:00.000Z',
};
const testProviderConfig: ProviderConfig = {
  id: 'avali',
  name: 'Test Provider',
  defaultModel: 'test-model',
  capabilities: ['generate'] as ProviderOperation[],
  enabled: true,
};

const testProviderRegistration = {
  provider: 'avali' as const,
  implementation: MockProvider,
  configProvider: () => testProviderConfig,
};

const enabledModel = {
  id: '11111111-1111-4111-8111-111111111111',
  azura_model_id: 'azura-test-model',
  public_slug: 'test-model',
  display_name: 'Test Model',
  provider_id: '22222222-2222-4222-8222-222222222222',
  provider_model_id: 'provider-test-model',
  capabilities: ['generate'] as ProviderOperation[],
  enabled: true,
  status: 'active' as const,
  created_at: '2026-09-09T00:00:00.000Z',
  updated_at: '2026-09-09T00:00:00.000Z',
};

describe('Inference API Route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireServerUser.mockResolvedValue(testUser);
    registerProvider(testProviderRegistration);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('POST /api/inference', () => {
    it('requires authentication', async () => {
      mockRequireServerUser.mockRejectedValue(new Error('Unauthenticated'));

      const { POST } = await import('../app/api/inference/route');
      const request = new Request('http://localhost/api/inference', {
        method: 'POST',
        body: JSON.stringify({
          model: 'test-model',
          operation: 'generate',
          input: 'test',
        }),
      });

      const response = await POST(request);
      expect(response.status).toBe(401);
      const json = await response.json();
      expect(json.success).toBe(false);
      expect(json.error).toBe('Unauthenticated');
    });

    it('requires model field', async () => {
      mockRequireServerUser.mockResolvedValue(testUser);

      const { POST } = await import('../app/api/inference/route');
      const request = new Request('http://localhost/api/inference', {
        method: 'POST',
        body: JSON.stringify({
          operation: 'generate',
          input: 'test',
        }),
      });

      const response = await POST(request);
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.success).toBe(false);
      expect(json.error).toBe('Model is required and must be a string');
    });

    it('requires operation field', async () => {
      mockRequireServerUser.mockResolvedValue(testUser);

      const { POST } = await import('../app/api/inference/route');
      const request = new Request('http://localhost/api/inference', {
        method: 'POST',
        body: JSON.stringify({
          model: 'test-model',
          input: 'test',
        }),
      });

      const response = await POST(request);
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.success).toBe(false);
      expect(json.error).toBe('Operation is required and must be a string');
    });

    it('returns 403 for model not found', async () => {
      mockRequireServerUser.mockResolvedValue(testUser);
      mockResolveModel.mockRejectedValue(new Error('Model not found'));

      const { POST } = await import('../app/api/inference/route');
      const request = new Request('http://localhost/api/inference', {
        method: 'POST',
        body: JSON.stringify({
          model: 'unknown-model',
          operation: 'generate',
          input: 'test',
        }),
      });

      const response = await POST(request);
      expect(response.status).toBe(403);
      const json = await response.json();
      expect(json.success).toBe(false);
      expect(json.error).toBe('Model resolution failed');
    });

    it('returns 400 when model does not support operation', async () => {
      mockRequireServerUser.mockResolvedValue(testUser);
      mockResolveModel.mockResolvedValue({
        model: enabledModel,
        provider: new MockProvider(testProviderConfig),
        providerConfig: testProviderConfig,
      });
      mockModelSupportsOperation.mockResolvedValue(false);

      const { POST } = await import('../app/api/inference/route');
      const request = new Request('http://localhost/api/inference', {
        method: 'POST',
        body: JSON.stringify({
          model: 'test-model',
          operation: 'chat',
          input: 'test',
        }),
      });

      const response = await POST(request);
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.success).toBe(false);
      expect(json.error).toBe("Model 'test-model' does not support operation 'chat'");
    });

    it('returns 200 on successful inference', async () => {
      mockRequireServerUser.mockResolvedValue(testUser);
      mockResolveModel.mockResolvedValue({
        model: enabledModel,
        provider: new MockProvider(testProviderConfig),
        providerConfig: testProviderConfig,
      });
      mockModelSupportsOperation.mockResolvedValue(true);
      mockExecuteThroughGateway.mockResolvedValue({
        providerResponse: {
          provider: 'avali',
          model: 'test-model',
          operation: 'generate' as ProviderOperation,
          content: 'inference successful',
        },
        gatewayMetadata: {
          processedAt: Date.now(),
          providerUsed: 'avali',
          gatewayVersion: '1.0.0',
        },
      });

      const { POST } = await import('../app/api/inference/route');
      const request = new Request('http://localhost/api/inference', {
        method: 'POST',
        body: JSON.stringify({
          model: 'test-model',
          operation: 'generate',
          input: 'hello world',
          parameters: { temperature: 0.7 },
        }),
      });

      const response = await POST(request);
      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.result).toEqual({
        provider: 'avali',
        model: 'test-model',
        operation: 'generate',
        content: 'inference successful',
      });
      expect(json.model).toEqual({
        id: enabledModel.id,
        azura_model_id: enabledModel.azura_model_id,
        public_slug: enabledModel.public_slug,
        display_name: enabledModel.display_name,
        provider_id: enabledModel.provider_id,
        provider_model_id: enabledModel.provider_model_id,
        capabilities: enabledModel.capabilities,
        enabled: enabledModel.enabled,
        status: enabledModel.status,
        created_at: enabledModel.created_at,
        updated_at: enabledModel.updated_at,
      });
    });
  });
});