import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// GET — load user settings (creates default row if missing)
export async function GET() {
  let user;
  try {
    user = await getServerUser();
  } catch {
    return NextResponse.json({ success: false, error: "Unauthenticated" }, { status: 401 });
  }

  const supa = await createSupabaseServerClient();
  const { data } = await supa.from("user_settings").select("*").eq("user_id", user.id).maybeSingle();

  if (!data) {
    const { data: created } = await supa
      .from("user_settings")
      .insert({ user_id: user.id })
      .select("*")
      .single();
    return NextResponse.json({ success: true, settings: created ?? null });
  }
  return NextResponse.json({ success: true, settings: data });
}

const ALLOWED = new Set([
  "display_name",
  "username",
  "bio",
  "avatar_url",
  "language",
  "timezone",
  "appearance",
  "default_model",
  "response_style",
  "custom_instructions",
  "memory_enabled",
  "web_search_default",
  "auto_model",
]);

// PATCH — update settings fields (whitelisted)
export async function PATCH(request: Request) {
  let user;
  try {
    user = await getServerUser();
  } catch {
    return NextResponse.json({ success: false, error: "Unauthenticated" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const update: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (ALLOWED.has(k)) update[k] = v;
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ success: false, error: "Nothing to update" }, { status: 400 });
  }

  const supa = await createSupabaseServerClient();
  // ensure row exists
  const { data: existing } = await supa
    .from("user_settings")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!existing) {
    await supa.from("user_settings").insert({ user_id: user.id });
  }

  const { data, error } = await supa
    .from("user_settings")
    .update(update)
    .eq("user_id", user.id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ success: false, error: "Update failed" }, { status: 500 });
  return NextResponse.json({ success: true, settings: data });
}
