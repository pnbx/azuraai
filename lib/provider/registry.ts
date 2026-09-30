"use strict";

/**
 * Phase 4 Provider Registry
 *
 * Deterministic, strongly-typed provider registry.
 * Maps ProviderId to the concrete Provider implementation class/function.
 * Server-side only — never exposed to browsers.
 */

import { Provider, ProviderId, ProviderConfig } from "./types";

/**
 * Registry entry for a provider.
 */
type ProviderRegistration = {
  readonly provider: ProviderId;
  readonly implementation: new (config: ProviderConfig) => Provider;
  readonly configProvider: () => ProviderConfig;
};

/**
 * Internal registry map — populated at application bootstrap.
 * Kept in memory for the lifetime of the process; provider implementations
 * are server-side modules that resolve to their config from environment variables.
 */
const registry: Map<ProviderId, ProviderRegistration> = new Map();

/**
 * Auto-initialize providers on first access.
 * This ensures the registry is populated even if init.ts is never explicitly imported.
 */
let initialized = false;

function ensureInitialized(): void {
  if (initialized) return;
  // Skip auto-init in test environment to allow mock providers
  if (process.env.NODE_ENV === 'test') return;
  initialized = true;
  try {
    // Dynamic import to avoid circular dependencies
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { initializeProviders } = require('./init');
    initializeProviders();
  } catch {
    // Provider init failed — registry remains empty
    // This is expected when AVALAI_API_KEY is not set
  }
}

/**
 * Register a provider implementation with its configuration factory.
 */
export function registerProvider(
  registration: ProviderRegistration
): void {
  registry.set(registration.provider, registration);
}

/**
 * Get a provider implementation by its ID.
 * Returns the Provider instance ready for use.
 * Throws if the provider is not registered.
 */
export function getProvider(providerId: ProviderId): Provider {
  ensureInitialized();
  const registration = registry.get(providerId);
  if (!registration) {
    throw new Error(`Provider not registered: ${providerId}`);
  }
  return new registration.implementation(registration.configProvider());
}

/**
 * Check if a provider is registered and available.
 */
export function isProviderRegistered(providerId: ProviderId): boolean {
  ensureInitialized();
  return registry.has(providerId);
}

/**
 * List all registered provider IDs (for introspection/admin use).
 */
export function listProviders(): ProviderId[] {
  ensureInitialized();
  return Array.from(registry.keys());
}

/**
 * Retrieve configuration for a specific provider.
 */
export function getProviderConfig(providerId: ProviderId): ProviderConfig {
  ensureInitialized();
  const registration = registry.get(providerId);
  if (!registration) {
    throw new Error(`Provider not registered: ${providerId}`);
  }
  return registration.configProvider();
}

// Export the registry for application initialization
export { registry };