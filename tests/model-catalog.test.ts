import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Provider, ProviderConfig, ProviderOperation, ProviderRequest, ProviderResponse } from '../lib/provider/types';
import {
  getModelsByProvider,
  getModelBySlug,
  listEnabledModels,
  resolveModel,
  modelSupportsOperation,
  healthCheck,
} from '../lib/provider/model-catalog';
import { registerProvider } from '../lib/provider/registry';

type MockSupabase = ReturnType<typeof createSupabase>;
const createSupabaseServerClientMock = jest.fn<() => Promise<MockSupabase>>();
jest.mock('../lib/supabase/server', () => ({
  createSupabaseServerClient: (...args: unknown[]) => createSupabaseServerClientMock(...args),
}));

class TestProvider implements Provider {
  readonly config: ProviderConfig = {
    id: 'avali',
    name: 'Test Provider',
    defaultModel: 'test-model',
    capabilities: ['generate'] as ProviderOperation[],
    enabled: true,
  };

  canHandle(operation: ProviderOperation): boolean {
    return operation === 'generate';
  }

  async execute(_request: ProviderRequest): Promise<ProviderResponse> {
    throw new Error('Provider execution is intentionally unavailable in tests');
  }
}

const enabledModel = {
  id: '11111111-1111-4111-8111-111111111111',
  azura_model_id: 'azura-test-model',
  public_slug: 'test-model',
  display_name: 'Test Model',
  provider_id: '22222222-2222-4222-8222-222222222222',
  provider_model_id: 'provider-test-model',
  capabilities: ['generate'],
  enabled: true,
  status: 'active',
  created_at: '2026-09-09T00:00:00.000Z',
  updated_at: '2026-09-09T00:00:00.000Z',
};

const disabledModel = {
  ...enabledModel,
  public_slug: 'disabled-model',
  enabled: false,
};

const suspendedModel = {
  ...enabledModel,
  public_slug: 'suspended-model',
  status: 'suspended',
};

const providerRegistration = {
  provider: 'avali' as const,
  implementation: TestProvider,
  configProvider: (): ProviderConfig => ({
    id: 'avali',
    name: 'Test Provider',
    defaultModel: 'test-model',
    capabilities: ['generate'],
    enabled: true,
  }),
};

function createQuery<T>(rows: T[]) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: rows[0] ?? null, error: null }),
    maybeSingle: jest.fn().mockResolvedValue({ data: rows[0] ?? null, error: null }),
  };
}

function createSupabase(modelRows: unknown[], providerRows: unknown[] = [{ id: enabledModel.provider_id, provider_registry_id: 'avali' }]): MockSupabase {
  const modelQuery = createQuery(modelRows);
  const providerQuery = createQuery(providerRows);
  return {
    from: jest.fn((table: string) => {
      if (table === 'providers') {
        return providerQuery;
      }
      return modelQuery;
    }) as unknown as MockSupabase['from'],
  } as MockSupabase;
}

beforeEach(() => {
  createSupabaseServerClientMock.mockReset();
  createSupabaseServerClientMock.mockResolvedValue(createSupabase([enabledModel]));
  registerProvider(providerRegistration);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('Model Catalog - getModelBySlug', () => {
  it('looks up a model by public slug', async () => {
    const result = await getModelBySlug('test-model');

    expect(result).toEqual(enabledModel);
    expect(createSupabaseServerClientMock).toHaveBeenCalledTimes(1);
    const mockSupabase = createSupabaseServerClientMock().mock.results[0].value;
    expect(mockSupabase.from).toHaveBeenCalledWith('model_catalog');
    expect(mockSupabase.from('model_catalog').eq).toHaveBeenCalledWith('public_slug', 'test-model');
    expect(mockSupabase.from('model_catalog').eq).toHaveBeenCalledWith('enabled', true);
    expect(mockSupabase.from('model_catalog').eq).toHaveBeenCalledWith('status', 'active');
  });

  it('returns null for unknown slug', async () => {
    createSupabaseServerClientMock.mockResolvedValue(createSupabase([]));
    const result = await getModelBySlug('unknown-model');

    expect(result).toBeNull();
  });

  it('filters disabled models', async () => {
    createSupabaseServerClientMock.mockResolvedValue(createSupabase([disabledModel]));
    const result = await getModelBySlug('disabled-model');

    expect(result).toBeNull();
  });

  it('filters suspended models', async () => {
    createSupabaseServerClientMock.mockResolvedValue(createSupabase([suspendedModel]));
    const result = await getModelBySlug('suspended-model');

    expect(result).toBeNull();
  });
});

describe('Model Catalog - listEnabledModels', () => {
  it('lists enabled models', async () => {
    createSupabaseServerClientMock.mockResolvedValue(createSupabase([enabledModel, disabledModel, suspendedModel]));
    const result = await listEnabledModels();

    expect(result).toEqual([enabledModel]);
  });
});

describe('Model Catalog - resolveModel', () => {
  it('resolves model to provider and config', async () => {
    const result = await resolveModel('test-model');

    expect(result).toEqual({
      model: enabledModel,
      provider: expect.any(TestProvider),
      providerConfig: expect.objectContaining({
        id: 'avali',
        name: 'Test Provider',
      }),
    });
  });

  it('throws for unknown model', async () => {
    createSupabaseServerClientMock.mockResolvedValue(createSupabase([]));
    await expect(resolveModel('unknown-model')).rejects.toThrow('Model not found');
  });

  it('rejects invalid provider mappings', async () => {
    createSupabaseServerClientMock.mockResolvedValue(createSupabase([enabledModel], [{ id: enabledModel.provider_id, provider_registry_id: null }]));
    await expect(resolveModel('test-model')).rejects.toThrow('Provider registry mapping is missing');
  });

  it('rejects unregistered provider mappings', async () => {
    createSupabaseServerClientMock.mockResolvedValue(createSupabase([enabledModel], [{ id: enabledModel.provider_id, provider_registry_id: 'unknown' }]));
    await expect(resolveModel('test-model')).rejects.toThrow('Provider not registered: unknown');
  });
});

describe('Model Catalog - modelSupportsOperation', () => {
  it('returns true when model supports operation', async () => {
    createSupabaseServerClientMock.mockResolvedValue(createSupabase([enabledModel]));
    const result = await modelSupportsOperation('test-model', 'generate');

    expect(result).toBe(true);
  });

  it('returns false when model does not support operation', async () => {
    createSupabaseServerClientMock.mockResolvedValue(createSupabase([disabledModel]));
    const result = await modelSupportsOperation('disabled-model', 'generate');

    expect(result).toBe(false);
  });

  it('returns false for unknown model', async () => {
    createSupabaseServerClientMock.mockResolvedValue(createSupabase([]));
    const result = await modelSupportsOperation('unknown-model', 'generate');

    expect(result).toBe(false);
  });
});

describe('Model Catalog - getModelsByProvider', () => {
  it('gets models by provider', async () => {
    const result = await getModelsByProvider('avali');

    expect(result).toEqual([enabledModel]);
  });

  it('filters by provider ID', async () => {
    const rows = [
      enabledModel,
      { ...enabledModel, provider_id: '33333333-3333-4333-8333-333333333333' },
    ];
    createSupabaseServerClientMock.mockResolvedValue(createSupabase(rows));
    const result = await getModelsByProvider('avali');

    expect(result).toEqual([enabledModel]);
  });
});

describe('Model Catalog - healthCheck', () => {
  it('returns true when catalog accessible', async () => {
    const result = await healthCheck();

    expect(result).toBe(true);
  });

  it('returns false when catalog access fails', async () => {
    createSupabaseServerClientMock.mockRejectedValue(new Error('Database connection failed'));
    const result = await healthCheck();

    expect(result).toBe(false);
  });
});