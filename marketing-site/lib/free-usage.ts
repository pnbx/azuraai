/**
 * Free-tier usage tracking for session (dashboard) chat.
 *
 * Counts the user's assistant messages this calendar month directly from
 * the authoritative usage_logs table — no extra tables, no client trust.
 * Fail-open on DB error is intentional: never block a paying flow because
 * a counter read failed; upstream rate limits + pricing still protect us.
 */

import { supabaseAdmin } from "@/supabase/admin";
import { FREE_MONTHLY_MESSAGES } from "@/lib/tiers";

export async function getFreeUsage(userId: string): Promise<{
  used: number;
  limit: number;
  remaining: number;
}> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const { data, error } = await supabaseAdmin
    .from("usage_logs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "succeeded")
    .gte("request_ts", monthStart);

  const used = error ? 0 : (data?.length ?? 0);
  return { used, limit: FREE_MONTHLY_MESSAGES, remaining: Math.max(FREE_MONTHLY_MESSAGES - used, 0) };
}
