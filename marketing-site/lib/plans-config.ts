/**
 * Shared subscription plan constants (safe for client import).
 * Limits/prices live in the DB (plan_limits) — these are just types + labels.
 */

export type PlanId = "basic" | "plus" | "scale";

export const PLAN_ORDER: PlanId[] = ["basic", "plus", "scale"];

export const PLAN_LABEL_FA: Record<PlanId, string> = {
  basic: "پایه",
  plus: "پلاس",
  scale: "سازمانی",
};

/** Upgrade hint order: the next plan up. */
export const NEXT_PLAN: Partial<Record<PlanId, PlanId>> = {
  basic: "plus",
  plus: "scale",
};

/** Rank for comparing plans (server + UI hints). */
export const PLAN_RANK: Record<PlanId, number> = { basic: 0, plus: 1, scale: 2 };
