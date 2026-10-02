import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/supabase/admin";

// GET — recent activity (logs this view as 'account_viewed' if log is empty)
export async function GET() {
  let user;
  try {
    user = await getServerUser();
  } catch {
    return NextResponse.json({ success: false, error: "Unauthenticated" }, { status: 401 });
  }

  const supa = await createSupabaseServerClient();
  const { count } = await supa
    .from("activity_log")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  if (count === 0) {
    await supabaseAdmin.from("activity_log").insert({
      user_id: user.id,
      event: "account_created",
      detail: "حساب Azura AI شما فعال شد",
    });
  }

  const { data, error } = await supa
    .from("activity_log")
    .select("id, event, detail, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ success: false, error: "Failed" }, { status: 500 });
  return NextResponse.json({ success: true, activity: data ?? [] });
}

// POST — record an activity event (called after sensitive actions)
export async function POST(request: Request) {
  let user;
  try {
    user = await getServerUser();
  } catch {
    return NextResponse.json({ success: false, error: "Unauthenticated" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const event = typeof body.event === "string" ? body.event.slice(0, 60) : "";
  const detail = typeof body.detail === "string" ? body.detail.slice(0, 200) : null;
  if (!event) return NextResponse.json({ success: false, error: "Bad request" }, { status: 400 });

  await supabaseAdmin.from("activity_log").insert({ user_id: user.id, event, detail });
  return NextResponse.json({ success: true });
}
