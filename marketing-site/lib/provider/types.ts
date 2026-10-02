"use strict";

/**
 * Phase 4 Provider Abstraction - Types
 *
 * Strongly-typed provider interface and related contracts.
 * All provider implementations must follow this interface to be registered
 * and used by the Gateway.
 */

/**
 * Provider identifiers supported by Azura Gateway.
 * Extend as new providers are added.
 */
export type ProviderId = "avali";

/**
 * Supported operation categories for providers.
 * Defines the key capabilities that the provider abstraction supports.
 */
export type ProviderOperation =
  | "generate"
  | "generate-image"
  | "transcribe"
  | "embed"
  | "chat"
  | "stream"; // For streaming responses

/**
 * Normalized request payload for provider operations.
 * The Gateway will transform incoming API requests into this standardized format.
 */
export interface ProviderRequest {
  readonly provider: ProviderId;
  readonly model: string;
  readonly input: unknown; // Use specific types like string | Array<InputItem> in provider implementations
  readonly operation: ProviderOperation;
  readonly parameters?: Record<string, unknown>; // e.g., temperature, maxTokens, etc.
  readonly userId?: string; // May be needed for provider-specific routing
  readonly requestId?: string; // Tracking ID for debugging
}

/**
 * Normalized response payload from providers.
 * All provider adapters should return this structure.
 */
export interface ProviderResponse {
  readonly provider: ProviderId;
  readonly model: string;
  readonly operation: ProviderOperation;
  readonly created?: number;
  readonly content: unknown;
  readonly metadata?: Record<string, unknown>;
  readonly id?: string;
}

/**
 * Normalized provider error structure.
 * Provider adapters should map their errors into this structure.
 */
export class ProviderError extends Error {
  readonly type:
    | "invalid_request"
    | "authentication_error"
    | "authorization_error"
    | "not_found"
    | "rate_limit_exceeded"
    | "provider_unavailable"
    | "provider_error"
    | "invalid_response"
    | "internal_error";
  readonly code?: string | number; // Provider-specific error code if available
  readonly providerErrorId?: string; // Provider-specific error identifier
  readonly requestId?: string; // Reference to the original request

  constructor(init: {
    type: ProviderError["type"];
    message: string;
    code?: string | number;
    providerErrorId?: string;
    requestId?: string;
  }) {
    super(init.message);
    this.type = init.type;
    this.code = init.code;
    this.providerErrorId = init.providerErrorId;
    this.requestId = init.requestId;
  }
}


/**
 * Configuration for a specific provider.
 * Stored in the Provider Registry; contains provider‑specific settings.
 */
export interface ProviderConfig {
  readonly id: ProviderId;
  readonly name: string;
  readonly baseUrl?: string; // Optional if using SDK
  readonly defaultModel: string;
  readonly capabilities: ProviderOperation[];
  readonly enabled: boolean;
}

/**
 * Full provider interface that adapters must implement.
 * The Gateway will only interact with this interface, ensuring decoupling
 * between the core system and specific provider implementations.
 */
export interface Provider {
  readonly config: ProviderConfig;

  /**
   * Validate if this provider can handle the requested operation.
   */
  canHandle(operation: ProviderOperation): boolean;

  /**
   * Make a request to the provider.
   * Throws ProviderError on failure; returns ProviderResponse on success.
   */
  execute(request: ProviderRequest): Promise<ProviderResponse>;
}