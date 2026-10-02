import { NextResponse } from "next/server";
import { requireAdmin, logAuditEvent } from "@/lib/auth/admin";
import { supabaseAdmin } from "@/supabase/admin";

// GET /api/admin/plans — all plan configs + model counts
export async function GET() {
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  const [{ data: limits }, { data: modelCounts }, { data: allowances }] = await Promise.all([
    supabaseAdmin.from("plan_limits").select("*").order("price_toman"),
    supabaseAdmin.from("plan_models").select("plan, public_slug"),
    supabaseAdmin.from("premium_allowances").select("*"),
  ]);

  const counts: Record<string, number> = {};
  for (const r of modelCounts ?? []) {
    counts[r.plan] = (counts[r.plan] ?? 0) + 1;
  }

  return NextResponse.json({
    success: true,
    plans: (limits ?? []).map((l) => ({ ...l, modelCount: counts[l.plan] ?? 0 })),
    allowances: allowances ?? [],
  });
}

// PUT /api/admin/plans — update plan limits (no deploy required)
export async function PUT(request: Request) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "BAD_REQUEST" }, { status: 400 });
  }

  const plan = String(body.plan ?? "");
  if (!["basic", "plus", "scale"].includes(plan)) {
    return NextResponse.json({ success: false, error: "UNKNOWN_PLAN" }, { status: 400 });
  }

  // Whitelist of editable fields (limits only — never price tricks)
  const allowedFields = [
    "monthly_messages",
    "monthly_input_tokens",
    "monthly_output_tokens",
    "max_output_tokens_per_request",
    "max_context_tokens",
    "requests_per_minute",
    "price_toman",
  ] as const;

  const update: Record<string, unknown> = {};
  for (const f of allowedFields) {
    const v = body[f];
    if (v !== undefined) {
      const n = Number(v);
      if (!Number.isFinite(n) || n <= 0) {
        return NextResponse.json({ success: false, error: `INVALID_${f.toUpperCase()}` }, { status: 400 });
      }
      update[f] = Math.floor(n);
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ success: false, error: "NO_CHANGES" }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from("plan_limits").update(update).eq("plan", plan);
  if (error) {
    return NextResponse.json({ success: false, error: "UPDATE_FAILED" }, { status: 500 });
  }

  await logAuditEvent({
    actorId: admin.id,
    action: "plan_limits_updated",
    targetType: "plan_limits",
    targetId: plan,
    metadata: update,
  });

  return NextResponse.json({ success: true });
}
