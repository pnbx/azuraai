"use strict";

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getProvider, getProviderConfig, listProviders } from './registry';
import {
  Provider,
  ProviderConfig,
  ProviderError,
  ProviderId,
  ProviderOperation,
} from './types';

export interface ModelCatalog {
  readonly id: string;
  readonly azura_model_id: string;
  readonly public_slug: string;
  readonly display_name: string;
  readonly provider_id: string;
  readonly provider_model_id: string;
  readonly capabilities: ProviderOperation[] | Record<string, unknown>;
  readonly enabled: boolean;
  readonly status: 'active' | 'deprecated' | 'suspended';
  readonly created_at: string;
  readonly updated_at: string;
}

interface ProviderRegistryRow {
  readonly provider_registry_id: string | null;
}

function providerUnavailable(message: string): ProviderError {
  return new ProviderError({
    type: 'provider_unavailable',
    message,
    providerErrorId: 'provider_not_registered',
  });
}

function requireRegisteredProvider(registryId: string | null | undefined): ProviderId {
  if (!registryId) {
    throw providerUnavailable('Provider registry mapping is missing');
  }

  const providerId = listProviders().find((registeredId) => registeredId === registryId);
  if (!providerId) {
    throw providerUnavailable(`Provider not registered: ${registryId}`);
  }

  return providerId;
}

async function getProviderRegistryRow(providerId: string): Promise<ProviderRegistryRow | null> {
  const supa = await createSupabaseServerClient();
  const { data, error } = await supa
    .from('providers')
    .select('provider_registry_id')
    .eq('id', providerId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

export async function getModelBySlug(slug: string): Promise<ModelCatalog | null> {
  const supa = await createSupabaseServerClient();
  const { data, error } = await supa
    .from('model_catalog')
    .select('*')
    .eq('public_slug', slug)
    .eq('enabled', true)
    .eq('status', 'active')
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    throw error;
  }

  return data;
}

export async function listEnabledModels(): Promise<ModelCatalog[]> {
  const supa = await createSupabaseServerClient();
  const { data, error } = await supa
    .from('model_catalog')
    .select('*')
    .eq('enabled', true)
    .eq('status', 'active')
    .order('display_name');

  if (error) {
    throw error;
  }

  return data || [];
}

export async function resolveModel(
  slug: string
): Promise<{ model: ModelCatalog; provider: Provider; providerConfig: ProviderConfig }> {
  const model = await getModelBySlug(slug);
  if (!model) {
    throw new ProviderError({
      type: 'not_found',
      message: `Model not found: ${slug}`,
      providerErrorId: 'model_not_found',
    });
  }

  const providerRow = await getProviderRegistryRow(model.provider_id);
  const providerId = requireRegisteredProvider(providerRow?.provider_registry_id);
  const provider = getProvider(providerId);
  const providerConfig = getProviderConfig(providerId);

  return { model, provider, providerConfig };
}

export async function modelSupportsOperation(
  slug: string,
  operation: ProviderOperation
): Promise<boolean> {
  const model = await getModelBySlug(slug);
  if (!model) {
    return false;
  }

  if (Array.isArray(model.capabilities)) {
    return model.capabilities.includes(operation);
  }

  const capabilities = model.capabilities as Record<ProviderOperation, unknown>;
  return capabilities[operation] === true;
}

export async function getModelsByProvider(providerId: ProviderId): Promise<ModelCatalog[]> {
  const providerRow = await getProviderRegistryRowByRegistryId(providerId);
  if (!providerRow) {
    throw providerUnavailable('Provider registry row is missing');
  }
  const supa = await createSupabaseServerClient();
  const { data, error } = await supa
    .from('model_catalog')
    .select('*')
    .eq('provider_id', providerRow.id)
    .eq('enabled', true)
    .eq('status', 'active')
    .order('display_name');

  if (error) {
    throw error;
  }

  return data || [];
}

async function getProviderRegistryRowByRegistryId(
  providerId: ProviderId
): Promise<(ProviderRegistryRow & { id: string }) | null> {
  const supa = await createSupabaseServerClient();
  const { data, error } = await supa
    .from('providers')
    .select('id, provider_registry_id')
    .eq('provider_registry_id', providerId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

export async function healthCheck(): Promise<boolean> {
  try {
    await listEnabledModels();
    return true;
  } catch {
    return false;
  }
}