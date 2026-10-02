import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// GET — list memories
export async function GET() {
  let user;
  try {
    user = await getServerUser();
  } catch {
    return NextResponse.json({ success: false, error: "Unauthenticated" }, { status: 401 });
  }

  const supa = await createSupabaseServerClient();
  const { data, error } = await supa
    .from("user_memories")
    .select("id, content, source, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ success: false, error: "Failed" }, { status: 500 });
  return NextResponse.json({ success: true, memories: data ?? [] });
}

// POST — add a memory
export async function POST(request: Request) {
  let user;
  try {
    user = await getServerUser();
  } catch {
    return NextResponse.json({ success: false, error: "Unauthenticated" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const content = typeof body.content === "string" ? body.content.trim().slice(0, 500) : "";
  if (!content) return NextResponse.json({ success: false, error: "متن خالی است" }, { status: 400 });

  const supa = await createSupabaseServerClient();
  const { data, error } = await supa
    .from("user_memories")
    .insert({ user_id: user.id, content, source: "manual" })
    .select("id, content, source, created_at")
    .single();

  if (error) return NextResponse.json({ success: false, error: "Failed" }, { status: 500 });
  return NextResponse.json({ success: true, memory: data });
}

// DELETE — remove a memory
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
  const { error } = await supa.from("user_memories").delete().eq("id", id).eq("user_id", user.id);
  if (error) return NextResponse.json({ success: false, error: "Failed" }, { status: 500 });
  return NextResponse.json({ success: true });
}
