"use strict";

/**
 * Phase 4 Provider Initialization
 *
 * Sets up the provider registry during application bootstrap.
 * All providers are registered here, ensuring they are server-side only.
 * This module should be imported from the main application entry point.
 */

import { registerProvider } from "./registry";
import { createAvalAIProvider } from "./avaliProvider";
import type { ProviderId, Provider } from "./types";
import { listProviders, getProviderConfig, isProviderRegistered } from "./registry";

/**
 * Initialize all available providers.
 *
 * This function should be called during application startup to populate
 * the provider registry. Each provider is responsible for its own
 * configuration and implementation.
 *
 * Security Note:
 * - Provider credentials are resolved from environment variables
 * - Only registered providers can be used
 * - Secrets are not exposed through this interface
 */
export function initializeProviders(): void {
  // Register AvalAI provider (first supported provider)
  // The provider is created via factory function that respects env vars
  const avalAIProvider = createAvalAIProvider();

  // Register the provider with the registry
  registerProvider({
    provider: "avali" as ProviderId,
    implementation: avalAIProvider.constructor as new (
      config: ReturnType<typeof getProviderConfig>
    ) => Provider,
    configProvider: () => avalAIProvider.config,
  });

  // Log initialization
  const registered = listProviders();
  console.warn(
    `[ProviderRegistry] Initialized providers: ${registered.join(", ")}`
  );
}

/**
 * Get the list of registered provider IDs.
 *
 * This is useful for introspection and admin tools.
 */
export function getRegisteredProviders(): ProviderId[] {
  return listProviders();
}

/**
 * Verify provider configurations.
 * Checks if any registered providers are misconfigured.
 *
 * @returns Array of error messages, empty if all providers are correctly configured.
 */
export function verifyProviderConfigurations(): string[] {
  const errors: string[] = [];
  const providers = listProviders();

  for (const providerId of providers) {
    try {
      const config = getProviderConfig(providerId);

      // Basic validation
      if (!config.id) {
        errors.push(`Provider '${providerId}' has no ID`);
      }

      if (!config.name) {
        errors.push(`Provider '${providerId}' has no name`);
      }

      if (!config.defaultModel) {
        errors.push(`Provider '${providerId}' has no default model`);
      }

      if (config.enabled === false) {
        // Note: a provider can be intentionally disabled, so this is a warning
        // not an error
        console.warn(`[ProviderRegistry] Provider '${providerId}' is disabled`);
      }
    } catch (error) {
      errors.push(
        `Failed to validate provider configuration for '${providerId}': ${(
          error as Error
        ).message}`
      );
    }
  }

  return errors;
}

/**
 * Get a specific provider configuration by ID.
 * Returns undefined if the provider is not registered.
 */
export function getProviderConfiguration(
  providerId: ProviderId
):
  | ReturnType<typeof getProviderConfig>
  | undefined {
  try {
    return getProviderConfig(providerId);
  } catch {
    return undefined;
  }
}

/**
 * Check if a specific provider is available.
 */
export function isProviderAvailable(providerId: ProviderId): boolean {
  return isProviderRegistered(providerId);
}