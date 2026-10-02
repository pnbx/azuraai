import { NextResponse } from "next/server";
import { requireAdmin, logAuditEvent } from "@/lib/auth/admin";
import { supabaseAdmin } from "@/supabase/admin";

// GET /api/admin/plan-models — grouped access map
export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  const [{ data: pm }, { data: pa }, { data: catalog }] = await Promise.all([
    supabaseAdmin.from("plan_models").select("plan, public_slug"),
    supabaseAdmin.from("premium_allowances").select("plan, public_slug, monthly_requests"),
    supabaseAdmin.from("model_catalog").select("public_slug, display_name").eq("enabled", true).order("display_name"),
  ]);

  return NextResponse.json({ success: true, planModels: pm ?? [], allowances: pa ?? [], catalog: catalog ?? [] });
}

// POST — add access { plan, slug, monthlyRequests? } (allowance when monthlyRequests set)
export async function POST(request: Request) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  let body: { plan?: string; slug?: string; monthlyRequests?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "BAD_REQUEST" }, { status: 400 });
  }

  const plan = body.plan ?? "";
  const slug = body.slug?.trim() ?? "";
  if (!["basic", "plus", "scale"].includes(plan) || !slug) {
    return NextResponse.json({ success: false, error: "BAD_REQUEST" }, { status: 400 });
  }

  if (typeof body.monthlyRequests === "number" && body.monthlyRequests > 0) {
    const { error } = await supabaseAdmin.from("premium_allowances").upsert(
      { plan, public_slug: slug, monthly_requests: Math.floor(body.monthlyRequests) },
      { onConflict: "plan,public_slug" }
    );
    if (error) {
      return NextResponse.json({ success: false, error: "UPDATE_FAILED" }, { status: 500 });
    }
    await logAuditEvent({
      actorId: admin.id,
      action: "premium_allowance_set",
      targetType: "premium_allowances",
      targetId: `${plan}:${slug}`,
      metadata: { monthlyRequests: Math.floor(body.monthlyRequests) },
    });
  } else {
    const { error } = await supabaseAdmin.from("plan_models").upsert({ plan, public_slug: slug });
    if (error) {
      return NextResponse.json({ success: false, error: "UPDATE_FAILED" }, { status: 500 });
    }
    await logAuditEvent({
      actorId: admin.id,
      action: "plan_model_added",
      targetType: "plan_models",
      targetId: `${plan}:${slug}`,
    });
  }

  return NextResponse.json({ success: true });
}

// DELETE — remove access ?plan=&slug=
export async function DELETE(request: Request) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const plan = url.searchParams.get("plan") ?? "";
  const slug = url.searchParams.get("slug") ?? "";
  if (!plan || !slug) {
    return NextResponse.json({ success: false, error: "BAD_REQUEST" }, { status: 400 });
  }

  const [{ error: e1 }, { error: e2 }] = await Promise.all([
    supabaseAdmin.from("plan_models").delete().match({ plan, public_slug: slug }),
    supabaseAdmin.from("premium_allowances").delete().match({ plan, public_slug: slug }),
  ]);
  if (e1 || e2) {
    return NextResponse.json({ success: false, error: "UPDATE_FAILED" }, { status: 500 });
  }

  await logAuditEvent({
    actorId: admin.id,
    action: "plan_model_removed",
    targetType: "plan_models",
    targetId: `${plan}:${slug}`,
  });

  return NextResponse.json({ success: true });
}
