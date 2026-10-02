import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// GET /api/conversations — list user conversations (excludes temporary)
export async function GET() {
  let user;
  try {
    user = await getServerUser();
  } catch {
    return NextResponse.json({ success: false, error: "Unauthenticated" }, { status: 401 });
  }

  const supa = await createSupabaseServerClient();
  const { data, error } = await supa
    .from("conversations")
    .select("id, title, model, pinned, archived, folder_id, created_at, updated_at")
    .eq("user_id", user.id)
    .eq("temporary", false)
    .order("pinned", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(200);

  if (error) {
    return NextResponse.json({ success: false, error: "Failed to load" }, { status: 500 });
  }
  return NextResponse.json({ success: true, conversations: data ?? [] });
}

// POST /api/conversations — create a conversation
export async function POST(request: Request) {
  let user;
  try {
    user = await getServerUser();
  } catch {
    return NextResponse.json({ success: false, error: "Unauthenticated" }, { status: 401 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    // defaults
  }

  const supa = await createSupabaseServerClient();
  const { data, error } = await supa
    .from("conversations")
    .insert({
      user_id: user.id,
      title: typeof body.title === "string" && body.title ? body.title.slice(0, 120) : "گفتگوی جدید",
      model: typeof body.model === "string" ? body.model : "gpt-4o-mini",
      folder_id: typeof body.folderId === "string" && body.folderId ? body.folderId : null,
      temporary: body.temporary === true,
    })
    .select("id, title, model, pinned, archived, folder_id, created_at, updated_at")
    .single();

  if (error) {
    return NextResponse.json({ success: false, error: "Failed to create" }, { status: 500 });
  }
  return NextResponse.json({ success: true, conversation: data });
}
