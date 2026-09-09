/**
 * Usage metering
 *
 * Records every inference request as an authoritative usage_log row
 * via the insert_usage_if_needed RPC (idempotent on request_id).
 * Also handles pricing resolution and cost calculation.
 */

import { supabaseAdmin } from '@/supabase/admin'

export interface PricingInfo {
  inputTokenPrice: number
  outputTokenPrice: number
  requestFee: number
  ruleVersion: number
}

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  cachedTokens?: number
}

export interface UsageRecordInput {
  requestId: string
  userId: string
  provider: string
  upstreamModelId: string
  azuraModelId: string
  tokens: TokenUsage
  upstreamCost: number
  markup: number
  customerCharge: number
  pricingRuleVersion: number
  status: 'succeeded' | 'failed' | 'error'
  statusDetail?: string
  responseMs?: number
}

// ─── Pricing resolution ──────────────────────────────────────────────────────

/**
 * Resolve the active pricing rule for a model.
 * Returns the latest effective rule or null if none exists.
 */
export async function resolvePricing(modelId: string): Promise<PricingInfo | null> {
  const { data, error } = await supabaseAdmin
    .from('pricing_rules')
    .select('input_token_price_cents, output_token_price_cents, request_fee_cents, version, effective_at, expires_at')
    .eq('model_id', modelId)
    .lte('effective_at', new Date().toISOString())
    .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())
    .order('effective_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data) return null

  return {
    inputTokenPrice: Number(data.input_token_price_cents),
    outputTokenPrice: Number(data.output_token_price_cents),
    requestFee: Number(data.request_fee_cents),
    ruleVersion: data.version,
  }
}

/**
 * Calculate the estimated cost for a reservation (pre-call).
 * Uses request fee + estimated input tokens (default 1000).
 */
export function estimateReservationCost(
  pricing: PricingInfo,
  estimatedInputTokens = 1000,
): number {
  return pricing.requestFee + pricing.inputTokenPrice * estimatedInputTokens
}

/**
 * Calculate the actual cost from real token usage.
 */
export function calculateActualCost(
  pricing: PricingInfo,
  tokens: TokenUsage,
): number {
  return (
    pricing.requestFee +
    pricing.inputTokenPrice * tokens.inputTokens +
    pricing.outputTokenPrice * tokens.outputTokens
  )
}

// ─── Usage recording ─────────────────────────────────────────────────────────

/**
 * Record an inference request in usage_logs (idempotent).
 */
export async function recordUsage(input: UsageRecordInput): Promise<string | null> {
  const { data, error } = await supabaseAdmin.rpc('insert_usage_if_needed', {
    p_request_id: input.requestId,
    p_user_id: input.userId,
    p_provider: input.provider,
    p_upstream_model_id: input.upstreamModelId,
    p_azura_model_id: input.azuraModelId,
    p_input_tokens: input.tokens.inputTokens,
    p_output_tokens: input.tokens.outputTokens,
    p_upstream_cost_cents: input.upstreamCost,
    p_markup_cents: input.markup,
    p_charge_cents: input.customerCharge,
    p_pricing_rule_version: input.pricingRuleVersion,
    p_status: input.status,
    p_status_detail: input.statusDetail ?? null,
    p_response_ms: input.responseMs ?? null,
    p_metadata: input.tokens.cachedTokens
      ? { cached_tokens: input.tokens.cachedTokens }
      : {},
  })

  if (error) {
    console.error('[Usage] Record RPC failed:', error.message)
    return null
  }

  return data as string | null
}

/**
 * Extract token usage from provider response metadata.
 * Handles various provider response shapes gracefully.
 */
export function extractTokenUsage(
  metadata: Record<string, unknown> | undefined,
): TokenUsage {
  if (!metadata) return { inputTokens: 0, outputTokens: 0 }

  const inputTokens =
    Number(metadata.prompt_tokens ?? metadata.input_tokens ?? metadata.inputTokens ?? 0) || 0
  const outputTokens =
    Number(metadata.completion_tokens ?? metadata.output_tokens ?? metadata.outputTokens ?? 0) || 0
  const cachedTokens =
    Number(metadata.cached_tokens ?? metadata.cachedTokens ?? 0) || undefined

  return {
    inputTokens,
    outputTokens,
    cachedTokens: cachedTokens && cachedTokens > 0 ? cachedTokens : undefined,
  }
}
