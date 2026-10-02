import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/supabase/admin";

type Params = { params: { id: string } };

// POST — create (or reuse) a share link for a conversation
export async function POST(_request: Request, { params }: Params) {
  let user;
  try {
    user = await getServerUser();
  } catch {
    return NextResponse.json({ success: false, error: "Unauthenticated" }, { status: 401 });
  }

  const supa = await createSupabaseServerClient();
  const { data: convo } = await supa
    .from("conversations")
    .select("id")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!convo) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

  // reuse existing share
  const { data: existing } = await supa
    .from("conversation_shares")
    .select("token")
    .eq("conversation_id", params.id)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ success: true, token: existing.token });
  }

  const { data: created, error } = await supa
    .from("conversation_shares")
    .insert({ conversation_id: params.id, user_id: user.id })
    .select("token")
    .single();

  if (error) return NextResponse.json({ success: false, error: "Failed" }, { status: 500 });
  return NextResponse.json({ success: true, token: created.token });
}

// DELETE — revoke share link
export async function DELETE(_request: Request, { params }: Params) {
  let user;
  try {
    user = await getServerUser();
  } catch {
    return NextResponse.json({ success: false, error: "Unauthenticated" }, { status: 401 });
  }

  const supa = await createSupabaseServerClient();
  await supa
    .from("conversation_shares")
    .delete()
    .eq("conversation_id", params.id)
    .eq("user_id", user.id);
  return NextResponse.json({ success: true });
}

// GET ?token= — public read-only fetch (token grants access, no login needed)
export async function GET(request: Request, { params }: Params) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");
  if (!token) return NextResponse.json({ success: false, error: "Bad request" }, { status: 400 });

  const { data: share } = await supabaseAdmin
    .from("conversation_shares")
    .select("conversation_id")
    .eq("token", token)
    .eq("conversation_id", params.id)
    .maybeSingle();
  if (!share) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

  const { data: convo } = await supabaseAdmin
    .from("conversations")
    .select("id, title, model, created_at")
    .eq("id", params.id)
    .single();
  const { data: messages } = await supabaseAdmin
    .from("messages")
    .select("role, content, model, created_at")
    .eq("conversation_id", params.id)
    .order("created_at", { ascending: true })
    .limit(500);

  return NextResponse.json({
    success: true,
    conversation: convo,
    messages: (messages ?? []).map((m) => ({ role: m.role, content: m.content, model: m.model })),
    readOnly: true,
  });
}
