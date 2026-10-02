import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/supabase/admin";

// GET — list notifications; seeds a welcome notification the first time
export async function GET() {
  let user;
  try {
    user = await getServerUser();
  } catch {
    return NextResponse.json({ success: false, error: "Unauthenticated" }, { status: 401 });
  }

  const supa = await createSupabaseServerClient();

  // seed welcome notification once per user
  const { count } = await supa
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);
  if (count === 0) {
    await supabaseAdmin.from("notifications").insert({
      user_id: user.id,
      type: "system",
      title: "به Azura AI خوش آمدید 🎉".replace(" 🎉", ""),
      body: "حساب شما ساخته شد. برای شروع، وارد چت شوید یا اولین کلید API خود را بسازید.",
    });
  }

  const { data, error } = await supa
    .from("notifications")
    .select("id, type, title, body, read, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ success: false, error: "Failed" }, { status: 500 });
  return NextResponse.json({ success: true, notifications: data ?? [] });
}

// PATCH — mark one or all as read
export async function PATCH(request: Request) {
  let user;
  try {
    user = await getServerUser();
  } catch {
    return NextResponse.json({ success: false, error: "Unauthenticated" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const supa = await createSupabaseServerClient();

  if (typeof body.id === "string") {
    await supa.from("notifications").update({ read: true }).eq("id", body.id).eq("user_id", user.id);
  } else if (body.all === true) {
    await supa.from("notifications").update({ read: true }).eq("user_id", user.id);
  } else {
    return NextResponse.json({ success: false, error: "Bad request" }, { status: 400 });
  }
  return NextResponse.json({ success: true });
}
