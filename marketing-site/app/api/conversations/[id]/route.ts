import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Params = { params: { id: string } };

async function requireOwn(supa: Awaited<ReturnType<typeof createSupabaseServerClient>>, id: string, userId: string) {
  const { data } = await supa
    .from("conversations")
    .select("id")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  return data;
}

// GET — conversation + its messages
export async function GET(_request: Request, { params }: Params) {
  let user;
  try {
    user = await getServerUser();
  } catch {
    return NextResponse.json({ success: false, error: "Unauthenticated" }, { status: 401 });
  }

  const supa = await createSupabaseServerClient();
  const own = await requireOwn(supa, params.id, user.id);
  if (!own) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

  const { data: convo } = await supa
    .from("conversations")
    .select("id, title, model, pinned, archived, folder_id, created_at, updated_at")
    .eq("id", params.id)
    .single();

  const { data: messages } = await supa
    .from("messages")
    .select("id, role, content, model, input_tokens, output_tokens, cost_cents, liked, created_at")
    .eq("conversation_id", params.id)
    .order("created_at", { ascending: true })
    .limit(500);

  return NextResponse.json({ success: true, conversation: convo, messages: messages ?? [] });
}

// PATCH — rename / pin / archive / move to folder / change model
export async function PATCH(request: Request, { params }: Params) {
  let user;
  try {
    user = await getServerUser();
  } catch {
    return NextResponse.json({ success: false, error: "Unauthenticated" }, { status: 401 });
  }

  const supa = await createSupabaseServerClient();
  const own = await requireOwn(supa, params.id, user.id);
  if (!own) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

  const body = await request.json();
  const update: Record<string, unknown> = {};
  if (typeof body.title === "string" && body.title.trim()) update.title = body.title.trim().slice(0, 120);
  if (typeof body.pinned === "boolean") update.pinned = body.pinned;
  if (typeof body.archived === "boolean") update.archived = body.archived;
  if (typeof body.model === "string") update.model = body.model;
  if (body.folderId === null || typeof body.folderId === "string") update.folder_id = body.folderId || null;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ success: false, error: "Nothing to update" }, { status: 400 });
  }

  const { data, error } = await supa
    .from("conversations")
    .update(update)
    .eq("id", params.id)
    .select("id, title, model, pinned, archived, folder_id, updated_at")
    .single();

  if (error) return NextResponse.json({ success: false, error: "Update failed" }, { status: 500 });
  return NextResponse.json({ success: true, conversation: data });
}

// DELETE — delete conversation (messages cascade)
export async function DELETE(_request: Request, { params }: Params) {
  let user;
  try {
    user = await getServerUser();
  } catch {
    return NextResponse.json({ success: false, error: "Unauthenticated" }, { status: 401 });
  }

  const supa = await createSupabaseServerClient();
  const { error } = await supa
    .from("conversations")
    .delete()
    .eq("id", params.id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ success: false, error: "Delete failed" }, { status: 500 });
  return NextResponse.json({ success: true });
}
