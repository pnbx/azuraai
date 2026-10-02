"use strict";

/**
 * AvalAI Provider Adapter
 *
 * Production adapter for AvalAI (https://api.avalai.ir/v1).
 * AvalAI is OpenAI-compatible: uses the same request/response format,
 * authentication via Bearer token, and standard chat completions endpoint.
 *
 * API contract verified from:
 *   - https://docs.avalai.ir/en/api-reference/introduction
 *   - Base URL: https://api.avalai.ir/v1
 *   - Auth: Authorization: Bearer <AVALAI_API_KEY>
 *   - Chat endpoint: POST /v1/chat/completions
 *   - Response format: OpenAI-compatible (choices, usage)
 *
 * Security:
 *   - Only sends: model, messages, user-specified parameters
 *   - Never sends: Supabase keys, session tokens, wallet data, internal metadata
 */

import {
  Provider,
  ProviderRequest,
  ProviderResponse,
  ProviderError,
  ProviderConfig,
} from "./types";
import type { ProviderOperation } from "./types";

/** AvalAI configuration from environment */
interface AvalAIEnvConfig {
  apiKey: string;
  baseUrl: string;
}

function getEnvConfig(): AvalAIEnvConfig {
  const apiKey = process.env.AVALAI_API_KEY;
  if (!apiKey) {
    throw new ProviderError({
      type: "provider_unavailable",
      message: "AVALAI_API_KEY environment variable is not set",
      providerErrorId: "avalai_missing_api_key",
    });
  }

  const baseUrl = (process.env.AVALAI_BASE_URL || "https://api.avalai.ir/v1").replace(/\/+$/, "");
  return { apiKey, baseUrl };
}

/** AvalAI chat completion response shape (OpenAI-compatible) */
interface AvalAIChatResponse {
  id?: string;
  object?: string;
  created?: number;
  model?: string;
  choices?: Array<{
    message?: { role?: string; content?: string };
    finish_reason?: string;
    index?: number;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

/** Normalize user input into OpenAI-compatible messages array */
function normalizeMessages(input: unknown): Array<{ role: string; content: string }> {
  if (typeof input === "string") {
    return [{ role: "user", content: input }];
  }

  if (Array.isArray(input)) {
    return input.map((item) => {
      if (typeof item === "string") {
        return { role: "user", content: item };
      }
      if (item && typeof item === "object" && "role" in item && "content" in item) {
        return { role: String(item.role), content: String(item.content) };
      }
      return { role: "user", content: JSON.stringify(item) };
    });
  }

  if (input && typeof input === "object") {
    const obj = input as Record<string, unknown>;
    if (Array.isArray(obj.messages)) {
      return normalizeMessages(obj.messages);
    }
  }

  return [{ role: "user", content: JSON.stringify(input) }];
}

/** Map HTTP status to ProviderError type */
function mapHttpStatusToErrorType(status: number): ProviderError["type"] {
  if (status === 401) return "authentication_error";
  if (status === 403) return "authorization_error";
  if (status === 404) return "not_found";
  if (status === 429) return "rate_limit_exceeded";
  if (status >= 400 && status < 500) return "invalid_request";
  if (status >= 500) return "provider_unavailable";
  return "provider_error";
}

export const avalaiDefaultConfig: ProviderConfig = {
  id: "avali",
  name: "AvalAI",
  defaultModel: "gpt-4o-mini",
  capabilities: ["generate", "chat", "stream"],
  enabled: false,
};

export class AvalAIProvider implements Provider {
  public readonly config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  canHandle(operation: ProviderOperation): boolean {
    return this.config.capabilities.includes(operation);
  }

  async execute(request: ProviderRequest): Promise<ProviderResponse> {
    const { apiKey, baseUrl } = getEnvConfig();

    const messages = normalizeMessages(request.input);

    const body: Record<string, unknown> = {
      model: request.model,
      messages,
      ...request.parameters,
    };

    let response: Response;
    try {
      response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Network error";
      throw new ProviderError({
        type: "provider_unavailable",
        message: `AvalAI network error: ${message}`,
        providerErrorId: "avalai_network_error",
        requestId: request.requestId,
      });
    }

    // Parse response body
    let data: AvalAIChatResponse;
    try {
      data = await response.json() as AvalAIChatResponse;
    } catch {
      throw new ProviderError({
        type: "invalid_response",
        message: `AvalAI returned invalid JSON (HTTP ${response.status})`,
        providerErrorId: "avalai_invalid_json",
        requestId: request.requestId,
      });
    }

    // Handle HTTP errors
    if (!response.ok) {
      const errorType = mapHttpStatusToErrorType(response.status);
      const detail = (data as unknown as Record<string, unknown>)?.error;
      const errorMsg = detail && typeof detail === "object" && "message" in detail
        ? String((detail as Record<string, unknown>).message)
        : `HTTP ${response.status}`;

      throw new ProviderError({
        type: errorType,
        message: `AvalAI error: ${errorMsg}`,
        code: response.status,
        providerErrorId: "avalai_http_error",
        requestId: request.requestId,
      });
    }

    // Validate response structure
    if (!data.choices || !Array.isArray(data.choices) || data.choices.length === 0) {
      throw new ProviderError({
        type: "invalid_response",
        message: "AvalAI returned response with no choices",
        providerErrorId: "avalai_no_choices",
        requestId: request.requestId,
      });
    }

    const firstChoice = data.choices[0];
    const content = firstChoice?.message?.content;

    if (content === undefined || content === null) {
      throw new ProviderError({
        type: "invalid_response",
        message: "AvalAI returned choice with no content",
        providerErrorId: "avalai_no_content",
        requestId: request.requestId,
      });
    }

    // Extract token usage (OpenAI-compatible fields)
    const usage = data.usage ?? {};
    const promptTokens = Number(usage.prompt_tokens) || 0;
    const completionTokens = Number(usage.completion_tokens) || 0;

    return {
      provider: "avali",
      model: request.model,
      operation: request.operation,
      content,
      created: data.created,
      id: data.id,
      metadata: {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: promptTokens + completionTokens,
        avalai_request_id: response.headers.get("avalai-request-id") ?? undefined,
        finish_reason: firstChoice?.finish_reason,
      },
    };
  }
}

/**
 * Create an AvalAI provider instance.
 * Enabled when AVALAI_API_KEY is set.
 */
export function createAvalAIProvider(): AvalAIProvider {
  const isEnabled = !!(process.env.AVALAI_API_KEY && process.env.AVALAI_API_KEY.length > 0);

  const config: ProviderConfig = {
    ...avalaiDefaultConfig,
    enabled: isEnabled,
  };

  return new AvalAIProvider(config);
}
