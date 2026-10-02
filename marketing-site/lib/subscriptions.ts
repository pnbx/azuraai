/**
 * Subscription enforcement service (server-side only).
 *
 * Every check resolves from the database — the client is never trusted
 * for plan, model access, usage, or subscription status. Pure helpers
 * here are unit-tested; DB RPCs provide atomicity/concurrency safety.
 */

import { supabaseAdmin } from "@/supabase/admin";
import type { PlanId } from "@/lib/plans-config";

export interface QuotaConsumeResult {
  allowed: boolean;
  code?:
    | "NO_SUBSCRIPTION"
    | "CONFIG_ERROR"
    | "MODEL_PLAN_REQUIRED"
    | "CONTEXT_TOO_LARGE"
    | "MESSAGE_LIMIT"
    | "INPUT_TOKEN_LIMIT"
    | "OUTPUT_TOKEN_LIMIT"
    | "PREMIUM_ALLOWANCE_EXCEEDED";
  requiredPlan?: string;
  maxContext?: number;
  used?: number;
  limit?: number;
  model?: string;
  usageRowId?: string;
  plan?: PlanId;
  reservedInput?: number;
  reservedOutput?: number;
  isPremium?: boolean;
  rpm?: number;
  maxOutputCap?: number;
}

/** Estimate input tokens for the request (server-side; provider reports actuals later). */
export function estimateInputTokens(messages: Array<{ content: string }>): number {
  const chars = messages.reduce((n, m) => n + (m?.content?.length ?? 0), 0);
  return Math.min(Math.max(Math.ceil(chars / 3), 32), 200_000);
}

/** Estimated worst-case output reservation (actual usage reconciled after the stream). */
export function estimateMaxOutput(remainingMonthlyOutput: number, perRequestCap: number): number {
  return Math.max(Math.min(perRequestCap, remainingMonthlyOutput), 0);
}

/** Lazily expire + fetch the user's active subscription (no cron dependency). */
export async function getActiveSubscription(userId: string): Promise<{
  subId: string;
  plan: PlanId;
  periodStart: string;
  periodEnd: string;
} | null> {
  const { data, error } = await supabaseAdmin.rpc("get_active_subscription", {
    p_user_id: userId,
  });
  if (error) {
    console.error("[Subscriptions] get_active_subscription failed:", error.message);
    return null;
  }
  const row = Array.isArray(data) ? data[0] : data?.[0] ?? data;
  if (!row) return null;
  return {
    subId: row.sub_id,
    plan: row.sub_plan as PlanId,
    periodStart: row.period_start,
    periodEnd: row.period_end,
  };
}

/** Atomically consume quota for one chat request (runs the full plan check). */
export async function consumeChatQuota(params: {
  userId: string;
  slug: string;
  estInputTokens: number;
  estMaxOutput: number;
}): Promise<QuotaConsumeResult> {
  const { data, error } = await supabaseAdmin.rpc("consume_chat_quota", {
    p_user_id: params.userId,
    p_slug: params.slug,
    p_est_input_tokens: params.estInputTokens,
    p_est_max_output: params.estMaxOutput,
  });
  if (error) {
    console.error("[Subscriptions] consume_chat_quota failed:", error.message);
    return { allowed: false, code: "CONFIG_ERROR" };
  }
  const row = typeof data === "string" ? JSON.parse(data) : data;
  return row as QuotaConsumeResult;
}

/** Purchase a plan with wallet balance through the atomic DB RPC. */
export async function purchaseSubscriptionWithWallet(
  userId: string,
  plan: PlanId
): Promise<{
  success: boolean;
  error?: string;
  needed?: number;
  balance?: number;
  subscriptionId?: string;
  periodEnd?: string;
  newBalance?: number;
}> {
  const { data, error } = await supabaseAdmin.rpc("purchase_subscription_with_wallet", {
    p_user_id: userId,
    p_plan: plan,
  });
  if (error) {
    console.error("[Subscriptions] purchase RPC failed:", error.message);
    return { success: false, error: "PURCHASE_FAILED" };
  }
  const row = typeof data === "string" ? JSON.parse(data) : data;
  return row as {
    success: boolean;
    error?: string;
    needed?: number;
    balance?: number;
    subscriptionId?: string;
    periodEnd?: string;
    newBalance?: number;
  };
}

/** Reconcile reservation with the provider-reported actual token counts. */
export async function reconcileChatUsage(params: {
  usageRowId: string;
  reservedInput: number;
  actualInput: number;
  reservedOutput: number;
  actualOutput: number;
}): Promise<void> {
  await supabaseAdmin.rpc("reconcile_chat_usage", {
    p_usage_row_id: params.usageRowId,
    p_reserved_input: params.reservedInput,
    p_actual_input: params.actualInput,
    p_reserved_output: params.reservedOutput,
    p_actual_output: params.actualOutput,
  });
}

/** Refund a failed request so failures never consume successful usage. */
export async function refundChatQuota(params: {
  usageRowId: string;
  slug: string;
  reservedInput: number;
  reservedOutput: number;
  wasPremium: boolean;
}): Promise<void> {
  await supabaseAdmin.rpc("refund_chat_quota", {
    p_usage_row_id: params.usageRowId,
    p_slug: params.slug,
    p_reserved_input: params.reservedInput,
    p_reserved_output: params.reservedOutput,
    p_was_premium: params.wasPremium,
  });
}

/** Plan catalog + model access for the dashboard/selector (server-resolved). */
export async function getSubscriptionInfo(userId: string): Promise<{
  plan: PlanId | null;
  priceToman: number | null;
  periodEnd: string | null;
  displayName: string | null;
  usage: {
    messages: { used: number; limit: number };
    inputTokens: { used: number; limit: number };
    outputTokens: { used: number; limit: number };
    premium: Array<{ slug: string; used: number; limit: number }>;
  } | null;
} | null> {
  const sub = await getActiveSubscription(userId);
  if (!sub) return null;

  const [{ data: limits }, { data: usage }, { data: allowances }, { data: allowed }] =
    await Promise.all([
      supabaseAdmin.from("plan_limits").select("*").eq("plan", sub.plan).maybeSingle(),
      supabaseAdmin.from("subscription_usage").select("*").eq("subscription_id", sub.subId).maybeSingle(),
      supabaseAdmin
        .from("premium_allowances")
        .select("public_slug, monthly_requests")
        .eq("plan", sub.plan),
      supabaseAdmin.rpc("list_models_for_plan", { p_plan: sub.plan }),
    ]);

  const premiumUsed = (usage?.premium_used ?? {}) as Record<string, number>;

  return {
    plan: sub.plan,
    displayName: limits?.display_name ?? sub.plan,
    priceToman: limits?.price_toman ?? null,
    periodEnd: sub.periodEnd,
    usage: {
      messages: {
        used: usage?.messages_used ?? 0,
        limit: limits?.monthly_messages ?? 0,
      },
      inputTokens: {
        used: usage?.input_tokens_used ?? 0,
        limit: limits?.monthly_input_tokens ?? 0,
      },
      outputTokens: {
        used: usage?.output_tokens_used ?? 0,
        limit: limits?.monthly_output_tokens ?? 0,
      },
      premium: (allowances ?? []).map((a) => ({
        slug: a.public_slug,
        used: premiumUsed[a.public_slug] ?? 0,
        limit: a.monthly_requests,
      })),
    },
    ...({ allowedModels: allowed ?? [] } as object),
  };
}

/** Which plans can use a given model (for upgrade hints). */
export { PLAN_RANK } from "@/lib/plans-config";
