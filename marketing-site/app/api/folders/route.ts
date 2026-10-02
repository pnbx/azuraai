import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// GET — list folders
export async function GET() {
  let user;
  try {
    user = await getServerUser();
  } catch {
    return NextResponse.json({ success: false, error: "Unauthenticated" }, { status: 401 });
  }

  const supa = await createSupabaseServerClient();
  const { data, error } = await supa
    .from("folders")
    .select("id, name, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ success: false, error: "Failed" }, { status: 500 });
  return NextResponse.json({ success: true, folders: data ?? [] });
}

// POST — create folder
export async function POST(request: Request) {
  let user;
  try {
    user = await getServerUser();
  } catch {
    return NextResponse.json({ success: false, error: "Unauthenticated" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 60) : "";
  if (!name) return NextResponse.json({ success: false, error: "نام پوشه لازم است" }, { status: 400 });

  const supa = await createSupabaseServerClient();
  const { data, error } = await supa
    .from("folders")
    .insert({ user_id: user.id, name })
    .select("id, name, created_at")
    .single();

  if (error) return NextResponse.json({ success: false, error: "Failed" }, { status: 500 });
  return NextResponse.json({ success: true, folder: data });
}

// PATCH — rename folder
export async function PATCH(request: Request) {
  let user;
  try {
    user = await getServerUser();
  } catch {
    return NextResponse.json({ success: false, error: "Unauthenticated" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  if (typeof body.id !== "string" || typeof body.name !== "string" || !body.name.trim()) {
    return NextResponse.json({ success: false, error: "Bad request" }, { status: 400 });
  }

  const supa = await createSupabaseServerClient();
  const { error } = await supa
    .from("folders")
    .update({ name: body.name.trim().slice(0, 60) })
    .eq("id", body.id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ success: false, error: "Failed" }, { status: 500 });
  return NextResponse.json({ success: true });
}

// DELETE — delete folder (conversations keep, folder_id becomes null via FK)
export async function DELETE(request: Request) {
  let user;
  try {
    user = await getServerUser();
  } catch {
    return NextResponse.json({ success: false, error: "Unauthenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ success: false, error: "Bad request" }, { status: 400 });

  const supa = await createSupabaseServerClient();
  const { error } = await supa.from("folders").delete().eq("id", id).eq("user_id", user.id);
  if (error) return NextResponse.json({ success: false, error: "Failed" }, { status: 500 });
  return NextResponse.json({ success: true });
}
