import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type {
  Provider,
  ProviderConfig,
  ProviderOperation,
  ProviderRequest,
  ProviderResponse,
} from '../lib/provider/types';
import {
  getModelsByProvider,
  getModelBySlug,
  listEnabledModels,
  resolveModel,
  modelSupportsOperation,
  healthCheck,
} from '../lib/provider/model-catalog';
import { registerProvider } from '../lib/provider/registry';

type MockQuery = {
  select: jest.Mock;
  eq: jest.Mock;
  order: jest.Mock;
  single: jest.Mock;
  maybeSingle: jest.Mock;
};
type MockSupabase = { from: jest.Mock };

const createSupabaseServerClientMock = jest.fn<() => Promise<MockSupabase>>();
jest.mock('../lib/supabase/server', () => ({
  createSupabaseServerClient: () => createSupabaseServerClientMock(),
}));

class TestProvider implements Provider {
  readonly config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  canHandle(operation: ProviderOperation): boolean {
    return this.config.capabilities.includes(operation);
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

const deprecatedModel = {
  ...enabledModel,
  public_slug: 'deprecated-model',
  status: 'deprecated',
};

const suspendedModel = {
  ...enabledModel,
  public_slug: 'suspended-model',
  status: 'suspended',
};

const objectCapabilityModel = {
  ...enabledModel,
  public_slug: 'object-capability-model',
  capabilities: { generate: true, chat: false },
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

function createQuery<T>(rows: T[]): MockQuery {
  let filters: Array<[string, unknown]> = [];

  const filteredRows = () => rows.filter((row) =>
    filters.every(([column, value]) => {
      const rowAsRecord = row as Record<string, unknown>;
      return rowAsRecord[column] === value;
    })
  );

  const query: MockQuery = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn((column: string, value: unknown) => {
      filters = [...filters, [column, value]];
      return query;
    }),
    order: jest.fn(() => ({ data: filteredRows(), error: null })),
    single: jest.fn(() => {
      const data = filteredRows();
      return { data: data.length > 0 ? data[0] : null, error: data.length === 1 ? null : { code: 'PGRST116' } };
    }),
    maybeSingle: jest.fn(() => {
      const data = filteredRows();
      return { data: data.length > 0 ? data[0] : null, error: null };
    }),
  };

  return query;
}

function createSupabase(
  modelRows: unknown[],
  providerRows: unknown[] = [{ id: enabledModel.provider_id, provider_registry_id: 'avali' }]
): MockSupabase {
  const modelQuery = createQuery(modelRows);
  const providerQuery = createQuery(providerRows);

  return {
    from: jest.fn((table: string) => table === 'providers' ? providerQuery : modelQuery),
  };
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
  it('looks up a model by public slug and requires active/enabled state', async () => {
    const result = await getModelBySlug('test-model');

    expect(result).toEqual(enabledModel);
    expect(createSupabaseServerClientMock).toHaveBeenCalledTimes(1);
  });

  it('returns null for unknown slug', async () => {
    createSupabaseServerClientMock.mockResolvedValue(createSupabase([]));
    await expect(getModelBySlug('unknown-model')).resolves.toBeNull();
  });

  it('filters disabled models', async () => {
    createSupabaseServerClientMock.mockResolvedValue(createSupabase([disabledModel]));
    await expect(getModelBySlug('disabled-model')).resolves.toBeNull();
  });

  it('filters deprecated and suspended models', async () => {
    createSupabaseServerClientMock.mockResolvedValue(createSupabase([deprecatedModel]));
    await expect(getModelBySlug('deprecated-model')).resolves.toBeNull();

    createSupabaseServerClientMock.mockResolvedValue(createSupabase([suspendedModel]));
    await expect(getModelBySlug('suspended-model')).resolves.toBeNull();
  });
});

describe('Model Catalog - listEnabledModels', () => {
  it('returns only active and enabled models', async () => {
    createSupabaseServerClientMock.mockResolvedValue(
      createSupabase([enabledModel, disabledModel, deprecatedModel, suspendedModel])
    );

    await expect(listEnabledModels()).resolves.toEqual([enabledModel]);
  });
});

describe('Model Catalog - resolveModel', () => {
  it('resolves a database provider UUID through the explicit registry bridge', async () => {
    const result = await resolveModel('test-model');

    expect(result).toEqual({
      model: enabledModel,
      provider: expect.any(TestProvider),
      providerConfig: expect.objectContaining({ id: 'avali', name: 'Test Provider' }),
    });
  });

  it('throws for unknown model', async () => {
    createSupabaseServerClientMock.mockResolvedValue(createSupabase([]));
    await expect(resolveModel('unknown-model')).rejects.toMatchObject({
      type: 'not_found',
      providerErrorId: 'model_not_found',
    });
  });

  it('rejects missing provider mappings', async () => {
    createSupabaseServerClientMock.mockResolvedValue(
      createSupabase([enabledModel], [{ id: enabledModel.provider_id, provider_registry_id: null }])
    );
    await expect(resolveModel('test-model')).rejects.toMatchObject({
      type: 'provider_unavailable',
      providerErrorId: 'provider_not_registered',
    });
  });

  it('rejects unregistered provider mappings', async () => {
    createSupabaseServerClientMock.mockResolvedValue(
      createSupabase([enabledModel], [{ id: enabledModel.provider_id, provider_registry_id: 'unknown' }])
    );
    await expect(resolveModel('test-model')).rejects.toThrow('Provider not registered: unknown');
  });
});

describe('Model Catalog - modelSupportsOperation', () => {
  it('returns true for an array capability', async () => {
    await expect(modelSupportsOperation('test-model', 'generate')).resolves.toBe(true);
  });

  it('returns false when the model does not support an operation', async () => {
    await expect(modelSupportsOperation('test-model', 'chat')).resolves.toBe(false);
  });

  it('supports object-style capability records', async () => {
    createSupabaseServerClientMock.mockResolvedValue(createSupabase([objectCapabilityModel]));
    await expect(modelSupportsOperation('object-capability-model', 'generate')).resolves.toBe(true);
    await expect(modelSupportsOperation('object-capability-model', 'chat')).resolves.toBe(false);
  });

  it('returns false for unavailable or unknown models', async () => {
    createSupabaseServerClientMock.mockResolvedValue(createSupabase([disabledModel]));
    await expect(modelSupportsOperation('disabled-model', 'generate')).resolves.toBe(false);

    createSupabaseServerClientMock.mockResolvedValue(createSupabase([]));
    await expect(modelSupportsOperation('unknown-model', 'generate')).resolves.toBe(false);
  });
});

describe('Model Catalog - getModelsByProvider', () => {
  it('gets active/enabled models through the provider bridge', async () => {
    await expect(getModelsByProvider('avali')).resolves.toEqual([enabledModel]);
  });

  it('filters models by database provider UUID', async () => {
    const otherProviderModel = {
      ...enabledModel,
      id: '44444444-4444-4444-8444-444444444444',
      provider_id: '33333333-3333-4333-8333-333333333333',
      public_slug: 'other-provider-model',
    };
    createSupabaseServerClientMock.mockResolvedValue(
      createSupabase([enabledModel, otherProviderModel])
    );

    await expect(getModelsByProvider('avali')).resolves.toEqual([enabledModel]);
  });

  it('fails safely when the provider bridge row is missing', async () => {
    createSupabaseServerClientMock.mockResolvedValue(createSupabase([enabledModel], []));
    await expect(getModelsByProvider('avali')).rejects.toMatchObject({
      type: 'provider_unavailable',
      providerErrorId: 'provider_not_registered',
    });
  });
});

describe('Model Catalog - healthCheck', () => {
  it('returns true when catalog access succeeds', async () => {
    await expect(healthCheck()).resolves.toBe(true);
  });

  it('returns false when catalog access fails', async () => {
    createSupabaseServerClientMock.mockRejectedValue(new Error('Database connection failed'));
    await expect(healthCheck()).resolves.toBe(false);
  });
});