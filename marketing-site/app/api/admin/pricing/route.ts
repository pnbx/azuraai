import { NextResponse } from "next/server";
import { requireAdmin, logAuditEvent } from "@/lib/auth/admin";
import { supabaseAdmin } from "@/supabase/admin";

const OPEN = `expires_at.is.null,expires_at.gt.${new Date().toISOString()}`;

// GET /api/admin/pricing — every model with its open tariff
export async function GET() {
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }
  void admin;

  const { data, error } = await supabaseAdmin
    .from("pricing_rules")
    .select("id, model_id, input_price_per_million_tokens, output_price_per_million_tokens, model_catalog(public_slug, display_name)")
    .or(OPEN)
    .order("id");

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  const models = (data ?? [])
    .map((r) => {
      const cat = Array.isArray(r.model_catalog) ? r.model_catalog[0] : r.model_catalog;
      return {
        ruleId: r.id as string,
        modelId: r.model_id as string,
        slug: (cat?.public_slug as string) ?? "",
        name: (cat?.display_name as string) ?? "",
        input: Number(r.input_price_per_million_tokens) || 0,
        output: Number(r.output_price_per_million_tokens) || 0,
      };
    })
    .sort((a, b) => a.slug.localeCompare(b.slug));

  return NextResponse.json({ success: true, models });
}

// PATCH /api/admin/pricing
//   { action: "percent", percent: 10 }              → raise ALL open tariffs by 10%
//   { action: "single", modelId, input, output }    → set one model's tariff
export async function PATCH(request: Request) {
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

  const action = body.action;

  if (action === "percent") {
    const pct = Number(body.percent);
    if (!Number.isFinite(pct) || pct < -99 || pct > 1000) {
      return NextResponse.json({ success: false, error: "INVALID_PERCENT" }, { status: 400 });
    }
    // Integer-safe percent math: x * (100 + pct) / 100 avoids the
    // floating-point noise of ×1.1 (90000 × 1.1 → 99000.00…01 → ceil → 99001).
    if (!Number.isInteger(pct)) {
      return NextResponse.json({ success: false, error: "INVALID_PERCENT" }, { status: 400 });
    }
    const numerator = 100 + pct;

    const { data: rules, error } = await supabaseAdmin
      .from("pricing_rules")
      .select("id, input_price_per_million_tokens, output_price_per_million_tokens")
      .or(OPEN);
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

    // Group rules by their computed new values — tiered pricing means most
    // rules share the same (input, output) pair, so a handful of grouped
    // `.in('id', …)` updates replaces hundreds of single-row round trips.
    const groups = new Map<string, { ids: string[]; input: number; output: number }>();
    for (const r of rules ?? []) {
      const input = Math.max(0, Math.ceil((Number(r.input_price_per_million_tokens) * numerator) / 100));
      const output = Math.max(0, Math.ceil((Number(r.output_price_per_million_tokens) * numerator) / 100));
      const key = `${input}:${output}`;
      const g = groups.get(key);
      if (g) g.ids.push(r.id as string);
      else groups.set(key, { ids: [r.id as string], input, output });
    }

    let updated = 0;
    const groupList = [...groups.values()];
    for (let i = 0; i < groupList.length; i += 6) {
      const results = await Promise.all(
        groupList.slice(i, i + 6).map((g) =>
          supabaseAdmin
            .from("pricing_rules")
            .update({ input_price_per_million_tokens: g.input, output_price_per_million_tokens: g.output })
            .in("id", g.ids)
        )
      );
      for (const r of results) {
        if (r.error) return NextResponse.json({ success: false, error: r.error.message }, { status: 500 });
      }
      for (const g of groupList.slice(i, i + 6)) updated += g.ids.length;
    }

    await logAuditEvent({
      actorId: admin.id,
      action: "pricing_percent_changed",
      targetType: "pricing_rules",
      metadata: { percent: pct, updated },
    });

    return NextResponse.json({ success: true, updated, percent: pct });
  }

  if (action === "single") {
    const modelId = String(body.modelId ?? "");
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(modelId)) {
      return NextResponse.json({ success: false, error: "INVALID_MODEL" }, { status: 400 });
    }
    const input = Math.floor(Number(body.input));
    const output = Math.floor(Number(body.output));
    if (!Number.isFinite(input) || !Number.isFinite(output) || input < 0 || output < 0) {
      return NextResponse.json({ success: false, error: "INVALID_PRICE" }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("pricing_rules")
      .update({ input_price_per_million_tokens: input, output_price_per_million_tokens: output })
      .eq("model_id", modelId)
      .or(OPEN);
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

    await logAuditEvent({
      actorId: admin.id,
      action: "pricing_model_updated",
      targetType: "pricing_rules",
      targetId: modelId,
      metadata: { input, output },
    });

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ success: false, error: "UNKNOWN_ACTION" }, { status: 400 });
}
