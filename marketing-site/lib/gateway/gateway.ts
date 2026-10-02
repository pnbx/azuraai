"use strict";

/**
 * Phase 4 Gateway Layer
 *
 * Centralized gateway for routing requests to appropriate providers.
 * Provides a clean abstraction layer between API routes and provider implementations.
 */

import { ProviderRequest, ProviderResponse, ProviderError } from "../provider/types";
import { getProvider, listProviders, isProviderRegistered } from "../provider/registry";

/**
 * Gateway configuration.
 * Controls overall gateway behavior.
 */
export interface GatewayConfig {
  /** Default provider to use when none is specified */
  defaultProviderId: "avali";
  /** Whether to log gateway operations (avoid in production if it might leak secrets) */
  enableLogging: boolean;
  /** Provider call timeout in milliseconds (default: 30s) */
  providerTimeoutMs: number;
}

/**
 * Gateway response wrapper that includes gateway-level metadata.
 */
export interface GatewayResponse {
  readonly providerResponse: ProviderResponse;
  readonly gatewayMetadata: {
    readonly processedAt: number; // Unix timestamp
    readonly providerUsed: string;
    readonly gatewayVersion: string;
  };
}

/**
 * Main Gateway class.
 * Handles request routing, provider selection, and response normalization.
 */
export class Gateway {
  private config: GatewayConfig;

  constructor(config: Partial<GatewayConfig> = {}) {
    this.config = {
      defaultProviderId: "avali",
      enableLogging: false,
      providerTimeoutMs: 30_000,
      ...config,
    };
  }

  /**
   * Process a request through the gateway.
   *
   * @param request The normalized provider request
   * @returns GatewayResponse containing the provider response and gateway metadata
   * @throws ProviderError if the provider is not found or unavailable
   * @throws Error for gateway-level errors
   */
  async processRequest(request: ProviderRequest): Promise<GatewayResponse> {
    try {
      // Validate request
      this.validateRequest(request);

      // Determine provider to use
      const providerId = request.provider || this.config.defaultProviderId;

      // Check if provider is registered
      if (!isProviderRegistered(providerId)) {
        throw new ProviderError({
          type: "provider_unavailable",
          message: `Provider '${providerId}' is not registered or not available`,
          providerErrorId: "provider_not_registered",
          requestId: request.requestId,
        });
      }

      // Get provider instance
      const provider = getProvider(providerId);

      // Check if provider can handle the operation
      if (!provider.canHandle(request.operation)) {
        throw new ProviderError({
          type: "provider_error",
          message: `Provider '${providerId}' does not support operation '${request.operation}'`,
          providerErrorId: "operation_not_supported",
          requestId: request.requestId,
        });
      }

      // Log request (if enabled) - BE CAREFUL NOT TO LOG SECRETS
      if (this.config.enableLogging) {
        // Log only safe information
        console.info(`[Gateway] Processing request`, {
          provider: providerId,
          operation: request.operation,
          model: request.model,
          requestId: request.requestId,
          timestamp: new Date().toISOString(),
        });
      }

      // Execute request with timeout
      const timeoutMs = this.config.providerTimeoutMs;
      const providerResponse = await Promise.race([
        provider.execute(request),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new ProviderError({
            type: "provider_unavailable",
            message: `Provider '${providerId}' timed out after ${timeoutMs}ms`,
            providerErrorId: "provider_timeout",
            requestId: request.requestId,
          })), timeoutMs)
        ),
      ]);

      // Log response (if enabled)
      if (this.config.enableLogging) {
        console.info(`[Gateway] Request completed`, {
          provider: providerId,
          operation: request.operation,
          success: true,
          requestId: request.requestId,
          timestamp: new Date().toISOString(),
        });
      }

      return {
        providerResponse,
        gatewayMetadata: {
          processedAt: Date.now(),
          providerUsed: providerId,
          gatewayVersion: "1.0.0",
        },
      };
    } catch (error) {
      // Handle ProviderError
      if (error && typeof error === "object" && "type" in error) {
        if (this.config.enableLogging) {
          console.error(`[Gateway] Provider error:`, {
            error: error as ProviderError,
            requestId: request.requestId,
            timestamp: new Date().toISOString(),
          });
        }
        throw error as ProviderError;
      }

      // Handle other errors
      const gatewayError = new ProviderError({
        type: "internal_error",
        message: error instanceof Error ? error.message : "Unknown gateway error",
        providerErrorId: "gateway_internal_error",
        requestId: request.requestId,
      });

      if (this.config.enableLogging) {
        console.error(`[Gateway] Internal error:`, {
          error: gatewayError,
          requestId: request.requestId,
          timestamp: new Date().toISOString(),
        });
      }

      throw gatewayError;
    }
  }

  /**
   * Validate the incoming request.
   * Throws ProviderError if validation fails.
   */
  private validateRequest(request: ProviderRequest): void {
    if (!request.provider && !this.config.defaultProviderId) {
      throw new ProviderError({
        type: "invalid_request",
        message: "No provider specified and no default provider configured",
        providerErrorId: "missing_provider",
        requestId: request.requestId,
      });
    }

    if (!request.model) {
      throw new ProviderError({
        type: "invalid_request",
        message: "Model is required",
        providerErrorId: "missing_model",
        requestId: request.requestId,
      });
    }

    if (!request.operation) {
      throw new ProviderError({
        type: "invalid_request",
        message: "Operation is required",
        providerErrorId: "missing_operation",
        requestId: request.requestId,
      });
    }

    // Validate provider is known (if specified)
    if (request.provider && !isProviderRegistered(request.provider)) {
      throw new ProviderError({
        type: "provider_unavailable",
        message: `Provider '${request.provider}' is not registered`,
        providerErrorId: "provider_not_registered",
        requestId: request.requestId,
      });
    }
  }

  /**
   * Check gateway health.
   * Returns true when the configured default provider is registered and enabled.
   */
  async healthCheck(): Promise<boolean> {
    if (!this.config.defaultProviderId || !isProviderRegistered(this.config.defaultProviderId)) {
      return false;
    }

    const provider = getProvider(this.config.defaultProviderId);
    return provider.config.enabled;
  }

  /**
   * Get gateway status information.
   */
  getStatus() {
    return {
      gatewayVersion: "1.0.0",
      config: this.config,
      registeredProviders: listProviders(),
      defaultProvider: this.config.defaultProviderId,
      timestamp: Date.now(),
    };
  }
}

/**
 * Create a gateway instance with default configuration.
 */
export function createGateway(config: Partial<GatewayConfig> = {}): Gateway {
  return new Gateway(config);
}

/**
 * Execute a request through the gateway with default configuration.
 * Convenience function for simple use cases.
 */
export async function executeThroughGateway(
  request: ProviderRequest,
  config: Partial<GatewayConfig> = {},
): Promise<GatewayResponse> {
  const gateway = createGateway(config);
  return await gateway.processRequest(request);
}