"use strict";

/**
 * Phase 4 AvalAI Provider Adapter
 *
 * Provider adapter for AvalAI AI service.
 *
 * IMPORTANT:
 * - The exact AvalAI API endpoint, authentication mechanism, request/response
 *   formats are NOT yet verified in this repository.
 * - This file defines the STRUCTURE and CONTRACT that must be completed
 *   when the AvalAI API contract is known.
 * - Do NOT invent endpoints, headers, or schemas.
 * - Do NOT make actual HTTP requests to AvalAI from this code until the
 *   external API contract is verified and documented.
 *
 * The architecture is designed to be correct when the real AvalAI integration
 * is added; currently it is a skeleton that will fail at runtime until the
 * missing external API details are provided.
 */

import { Provider, ProviderId, ProviderRequest, ProviderResponse, ProviderError, ProviderConfig } from "./types";
import type { ProviderOperation } from "./types";

/**
 * AvalAI Provider Configuration.
 * Fill in the actual AvalAI values when the API contract is known.
 */
export const avalaiDefaultConfig: ProviderConfig = {
  id: "avali",
  name: "AvalAI",
  defaultModel: "default", // To be set when contract is verified
  capabilities: ["generate", "generate-image", "chat", "stream"],
  enabled: false, // Disabled until external API contract is verified
};

/**
 * AvalAI Provider Adapter class.
 * Implements the Provider interface.
 *
 * CAUTION: This adapter currently has NO functional HTTP requests.
 * It will throw errors indicating missing external API contract information.
 * Do NOT use in production until the AvalAI API endpoint, headers, and
 * request/response formats are verified and documented.
 */
export class AvalAIProvider implements Provider {
  public readonly config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  canHandle(operation: ProviderOperation): boolean {
    return this.config.capabilities.includes(operation);
  }

  /**
   * Execute a request against AvalAI.
   * Currently throws ProviderError indicating the external API contract
   * is not yet verified in this repository.
   *
   * @param request The normalized provider request.
   * @returns ProviderResponse on success (never reached currently).
   * @throws ProviderError Always thrown until external API contract is verified.
   */
  async execute(request: ProviderRequest): Promise<ProviderResponse> {
    // Throw error indicating missing external API contract
    throw new ProviderError({
      type: "provider_unavailable",
      message:
        "AvalAI provider adapter is a skeleton — external API contract not yet verified in this repository. " +
        "Cannot execute requests until AvalAI endpoint, headers, and request/response schemas are documented and validated.",
      providerErrorId: "avali_contract_missing",
      requestId: request.requestId,
    });
  }
}

/**
 * Create an AvalAI provider instance using environment-based configuration.
 * Returns a provider that is currently disabled until the external API contract
 * is verified. This function documents exactly what information is missing.
 */
export function createAvalAIProvider(): AvalAIProvider {
  // Check if AVALAI_API_KEY exists in environment
  // NOTE: The exact env variable name should match project conventions.
  // Currently we cannot verify the external API contract, so the provider
  // is created in a disabled state.
  const isEnabled = process.env.AVALAI_API_KEY !== undefined && process.env.AVALAI_API_KEY !== "";

  const config: ProviderConfig = {
    ...avalaiDefaultConfig,
    enabled: isEnabled,
  };

  return new AvalAIProvider(config);
}

/**
 * Verify that the AvalAI external API contract is satisfied.
 * This function documents the exact information that must be provided
 * before the AvalAI provider can be used in production.
 *
 * Returns a list of missing requirements. Empty array means the contract
 * is satisfied and the provider can be used.
 *
 * THIS FUNCTION SHOULD BE CALLED during application startup. If it returns
 * non-empty results, the AvalAI provider should be disabled until the
 * missing information is provided.
 *
 * @returns Array of missing requirement descriptions.
 */
export function verifyAvalAIContract(): ReadonlyArray<string> {
  const missing: Array<string> = [];

  // Check AVALAI_API_KEY exists
  if (process.env.AVALAI_API_KEY === undefined || process.env.AVALAI_API_KEY === "") {
    missing.push(
      "AVALAI_API_KEY environment variable is not set or is empty"
    );
  }

  // Check AVALAI_API_BASE_URL exists (if needed)
  // The exact env variable name and format should match AvalAI's documented API.
  // Currently not verified — comment out if base URL is not required.
  // if (process.env.AVALAI_API_BASE_URL === undefined || process.env.AVALAI_API_BASE_URL === "") {
  //   missing.push("AVALAI_API_BASE_URL environment variable is not set or is empty");
  // }

  // Check that the default model is configured
  if (avalaiDefaultConfig.defaultModel === "default") {
    missing.push(
      "AvalAI defaultModel is not configured — set avalaiDefaultConfig.defaultModel to the actual AvalAI model identifier"
    );
  }

  // Check that base URL is configured (if needed)
  // if (avalaiDefaultConfig.baseUrl === undefined || avalaiDefaultConfig.baseUrl === "") {
  //   missing.push("AvalAI baseUrl is not configured — set avalaiDefaultConfig.baseUrl to the actual AvalAI API base URL");
  // }

  return missing;
}