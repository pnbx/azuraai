import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/supabase/admin";

// GET /api/plans — public read-only plan catalog.
// Pricing/limits are marketing data; purchase goes through POST /api/subscription
// and every entitlement check happens server-side there.
export async function GET() {
  const { data: limits, error } = await supabaseAdmin
    .from("plan_limits")
    .select("*")
    .order("price_toman");
  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  // Inheritance-aware counts: Plus includes Basic models, Scale includes all.
  const counts: Record<string, number> = {};
  for (const plan of ["basic", "plus", "scale"]) {
    const { count, error: rpcError } = await supabaseAdmin.rpc("list_models_for_plan", {
      p_plan: plan,
    }, { count: "exact", head: true });
    counts[plan] = rpcError ? 0 : (count ?? 0);
  }

  return NextResponse.json({
    success: true,
    plans: (limits ?? []).map((l) => ({ ...l, modelCount: counts[l.plan] ?? 0 })),
  });
}
