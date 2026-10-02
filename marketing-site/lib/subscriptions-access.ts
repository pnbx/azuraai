/**
 * Per-user model access resolution (server-side).
 *
 * Loads plan_models + premium_allowances once and answers access questions
 * in memory. Inheritance: scale ⊃ plus ⊃ basic. Premium allowance models are
 * plan-specific (not inherited) and capped by monthly_requests.
 */

import { supabaseAdmin } from "@/supabase/admin";
import { getActiveSubscription } from "@/lib/subscriptions";
import { PLAN_RANK, type PlanId } from "@/lib/plans-config";
import { isCheapModel } from "@/lib/tiers";

export interface ModelAccess {
  allowed: boolean;
  /** Minimum plan that grants this model (null when allowed already). */
  requiredPlan: PlanId | null;
  /** true when access comes from a capped premium allowance. */
  isPremiumAllowance: boolean;
}

export interface PlanAccess {
  plan: PlanId | null;
  subscribed: boolean;
  forModel: (slug: string) => ModelAccess;
  allowedSlugs: Set<string>;
}

export async function getModelPlanAccess(userId: string): Promise<PlanAccess> {
  const sub = await getActiveSubscription(userId);

  if (!sub) {
    // Free tier: cheap models only.
    return {
      plan: null,
      subscribed: false,
      allowedSlugs: new Set(),
      forModel: (slug) => ({
        allowed: isCheapModel(slug),
        requiredPlan: isCheapModel(slug) ? null : "basic",
        isPremiumAllowance: false,
      }),
    };
  }

  const inherited = (["basic", "plus", "scale"] as PlanId[]).filter(
    (p) => PLAN_RANK[p] <= PLAN_RANK[sub.plan]
  );

  const [{ data: baseRows }, { data: allowanceRows }, { data: allBase }, { data: allAllow }] =
    await Promise.all([
      supabaseAdmin.from("plan_models").select("plan, public_slug").in("plan", inherited),
      supabaseAdmin.from("premium_allowances").select("plan, public_slug").eq("plan", sub.plan),
      supabaseAdmin.from("plan_models").select("plan, public_slug"),
      supabaseAdmin.from("premium_allowances").select("plan, public_slug"),
    ]);

  const allowedSlugs = new Set<string>([
    ...(baseRows ?? []).map((r) => r.public_slug as string),
    ...(allowanceRows ?? []).map((r) => r.public_slug as string),
  ]);
  const allowanceSet = new Set<string>((allowanceRows ?? []).map((r) => r.public_slug as string));

  // Minimum plan granting each slug (for upgrade hints).
  const minPlanBySlug = new Map<string, PlanId>();
  for (const row of [...(allBase ?? []), ...(allAllow ?? [])]) {
    const p = row.plan as PlanId;
    const cur = minPlanBySlug.get(row.public_slug as string);
    if (!cur || PLAN_RANK[p] < PLAN_RANK[cur]) minPlanBySlug.set(row.public_slug as string, p);
  }

  return {
    plan: sub.plan,
    subscribed: true,
    allowedSlugs,
    forModel: (slug) => {
      if (allowedSlugs.has(slug)) {
        return { allowed: true, requiredPlan: null, isPremiumAllowance: allowanceSet.has(slug) };
      }
      return {
        allowed: false,
        requiredPlan: minPlanBySlug.get(slug) ?? null,
        isPremiumAllowance: false,
      };
    },
  };
}
