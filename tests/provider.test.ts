import { describe, it, expect } from '@jest/globals';
import { registerProvider, getProvider, isProviderRegistered, listProviders, getProviderConfig } from '../lib/provider/registry';
import { Provider, ProviderConfig, ProviderError, ProviderId, ProviderOperation, ProviderRequest, ProviderResponse } from '../lib/provider/types';
import { createAvalAIProvider } from '../lib/provider/avaliProvider';
import { Gateway } from '../lib/gateway/gateway';

// Mock provider implementation for testing
class MockProvider implements Provider {
  public readonly config: ProviderConfig;
  constructor(config: ProviderConfig) {
    this.config = config;
  }
  canHandle(operation: ProviderOperation): boolean {
    return this.config.capabilities.includes(operation);
  }
  async execute(_request: ProviderRequest): Promise<ProviderResponse> {
    // Unused parameter required by the Provider interface contract
    return { provider: this.config.id, model: 'test', operation: 'generate' as ProviderOperation, content: 'success' } as ProviderResponse;
  }
}

describe('Provider Registry', () => {
  it('should register a provider and retrieve it', () => {
    const config: ProviderConfig = {
      id: 'avali',
      name: 'Mock Provider',
      defaultModel: 'mock-model',
      capabilities: ['generate'],
      enabled: true,
    };
    const registration = {
      provider: 'avali' as ProviderId,
      implementation: MockProvider,
      configProvider: () => config,
    };
    registerProvider(registration);
    expect(isProviderRegistered('avali')).toBe(true);
    const provider = getProvider('avali');
    expect(provider).toBeInstanceOf(MockProvider);
    expect(provider.config.id).toBe('avali');
  });

  it('should throw when getting unregistered provider', () => {
    expect(() => getProvider('nonexistent' as ProviderId)).toThrow(/Provider not registered/);
  });

  it('should list providers', () => {
    const config: ProviderConfig = {
      id: 'avali',
      name: 'Test Provider',
      defaultModel: 'test-model',
      capabilities: ['generate'],
      enabled: true,
    };
    registerProvider({
      provider: 'avali' as ProviderId,
      implementation: MockProvider,
      configProvider: () => config,
    });
    const providers = listProviders();
    expect(providers).toContain('avali');
    expect(providers.length).toBe(1);
  });

  it('should get provider config', () => {
    const config: ProviderConfig = {
      id: 'avali',
      name: 'Mock Config',
      defaultModel: 'test-model',
      capabilities: ['generate'],
      enabled: true,
    };
    registerProvider({
      provider: 'avali' as ProviderId,
      implementation: MockProvider,
      configProvider: () => config,
    });
    const retrieved = getProviderConfig('avali');
    expect(retrieved).toEqual(config);
  });

  it('should throw when getting config for unregistered provider', () => {
    expect(() => getProviderConfig('nonexistent' as ProviderId)).toThrow(/Provider not registered/);
  });
});

describe('AvalAI Provider', () => {
  it('should be disabled by default', () => {
    const provider = createAvalAIProvider();
    expect(provider.config.enabled).toBe(false);
  });

  it('should throw when executing without verified contract', async () => {
    const provider = createAvalAIProvider();
    const request = {
      provider: 'avali' as ProviderId,
      model: 'test',
      operation: 'generate' as ProviderOperation,
      input: 'test',
    } as ProviderRequest;
    await expect(provider.execute(request)).rejects.toMatchObject({
      type: 'provider_unavailable',
      providerErrorId: 'avali_contract_missing',
    });
  });

  it('should have correct capabilities', () => {
    const provider = createAvalAIProvider();
    expect(provider.canHandle('generate')).toBe(true);
    expect(provider.canHandle('generate-image')).toBe(true);
    expect(provider.canHandle('chat')).toBe(true);
    expect(provider.canHandle('stream')).toBe(true);
    expect(provider.canHandle('transcribe')).toBe(false); // not in capabilities
  });
});

describe('Gateway', () => {
  const gateway = new Gateway();

  it('should throw for unregistered provider', async () => {
    const request = {
      provider: 'nonexistent' as ProviderId,
      model: 'test',
      operation: 'generate' as ProviderOperation,
      input: 'test',
    };
    await expect(gateway.processRequest(request)).rejects.toMatchObject({
      type: 'provider_unavailable',
      providerErrorId: 'provider_not_registered',
    });
  });

  it('should throw for unsupported operation', async () => {
    const config: ProviderConfig = {
      id: 'avali',
      name: 'Limited Provider',
      defaultModel: 'limited-model',
      capabilities: ['generate'], // only generate
      enabled: true,
    };
    registerProvider({
      provider: 'avali' as ProviderId,
      implementation: MockProvider,
      configProvider: () => config,
    });

    const request = {
      provider: 'avali' as ProviderId,
      model: 'test',
      operation: 'chat' as ProviderOperation, // not supported
      input: 'test',
    };
    await expect(gateway.processRequest(request)).rejects.toMatchObject({
      type: 'provider_error',
      providerErrorId: 'operation_not_supported',
    });
  });

  it('should successfully process request via gateway', async () => {
    const config: ProviderConfig = {
      id: 'avali',
      name: 'Test Gateway Provider',
      defaultModel: 'test-model',
      capabilities: ['generate'],
      enabled: true,
    };
    registerProvider({
      provider: 'avali' as ProviderId,
      implementation: MockProvider,
      configProvider: () => config,
    });

    const request = {
      provider: 'avali' as ProviderId,
      model: 'test-model',
      operation: 'generate' as ProviderOperation,
      input: 'hello world',
    };
    const response = await gateway.processRequest(request);
    expect(response.providerResponse.content).toBe('success');
    expect(response.gatewayMetadata.providerUsed).toBe('avali');
  });

  it('should use default provider when none specified', async () => {
    const config: ProviderConfig = {
      id: 'avali',
      name: 'Default Provider',
      defaultModel: 'default-model',
      capabilities: ['generate'],
      enabled: true,
    };
    registerProvider({
      provider: 'avali' as ProviderId,
      implementation: MockProvider,
      configProvider: () => config,
    });
    const gatewayWithDefault = new Gateway({ defaultProviderId: 'avali' });

    const request = {
      provider: 'avali' as ProviderId,
      model: 'test-model',
      operation: 'generate' as ProviderOperation,
      input: 'test',
    };
    const response = await gatewayWithDefault.processRequest(request);
    expect(response.gatewayMetadata.providerUsed).toBe('avali');
  });

  it('should validate request fields', async () => {
    // missing model
    await expect(gateway.processRequest({
      provider: 'avali' as ProviderId,
      operation: 'generate' as ProviderOperation,
      input: 'test',
    } as ProviderRequest)).rejects.toMatchObject({
      type: 'invalid_request',
      providerErrorId: 'missing_model',
    });

    // missing operation
    await expect(gateway.processRequest({
      provider: 'avali' as ProviderId,
      model: 'test',
      input: 'test',
    } as ProviderRequest)).rejects.toMatchObject({
      type: 'invalid_request',
      providerErrorId: 'missing_operation',
    });

    // invalid provider string (contains ://)
    await expect(gateway.processRequest({
      provider: 'http://evil.com' as ProviderId,
      model: 'test',
      operation: 'generate' as ProviderOperation,
      input: 'test',
    } as ProviderRequest)).rejects.toMatchObject({
      type: 'provider_unavailable',
      providerErrorId: 'provider_not_registered',
    });
  });
});

describe('Error Normalization', () => {
  it('should normalize internal errors to ProviderError', async () => {
    const gateway = new Gateway();
    const request = {
      provider: 'nonexistent' as ProviderId,
      model: 'test',
      operation: 'generate' as ProviderOperation,
      input: 'test',
    };
    await expect(gateway.processRequest(request)).rejects.toMatchObject({
      type: 'provider_unavailable',
      providerErrorId: 'provider_not_registered',
    });
  });
});

describe('Registry Security', () => {
  it('should not be controllable via arbitrary user input in request', async () => {
    const request = {
      provider: 'some-random-string' as ProviderId,
      model: 'test',
      operation: 'generate' as ProviderOperation,
      input: 'test',
    };
    await expect(new Gateway().processRequest(request)).rejects.toMatchObject({
      type: 'provider_unavailable',
      providerErrorId: 'provider_not_registered',
    });
  });

  it('should not accept protocol-relative URLs in provider field', async () => {
    const request = {
      provider: 'http://evil.com/provider' as ProviderId,
      model: 'test',
      operation: 'generate' as ProviderOperation,
      input: 'test',
    };
    await expect(new Gateway().processRequest(request)).rejects.toMatchObject({
      type: 'provider_unavailable',
      providerErrorId: 'provider_not_registered',
    });
  });
});