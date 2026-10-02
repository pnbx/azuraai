import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Params = { params: { id: string } };

async function messageOwnedBy(supa: Awaited<ReturnType<typeof createSupabaseServerClient>>, messageId: string, userId: string) {
  const { data } = await supa
    .from("messages")
    .select("id, conversation_id")
    .eq("id", messageId)
    .maybeSingle();
  if (!data) return null;
  const { data: convo } = await supa
    .from("conversations")
    .select("id")
    .eq("id", data.conversation_id)
    .eq("user_id", userId)
    .maybeSingle();
  return convo ? data : null;
}

// PATCH — like / dislike / clear feedback on a message
export async function PATCH(request: Request, { params }: Params) {
  let user;
  try {
    user = await getServerUser();
  } catch {
    return NextResponse.json({ success: false, error: "Unauthenticated" }, { status: 401 });
  }

  const supa = await createSupabaseServerClient();
  const owned = await messageOwnedBy(supa, params.id, user.id);
  if (!owned) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  if (!("liked" in body) || (body.liked !== null && typeof body.liked !== "boolean")) {
    return NextResponse.json({ success: false, error: "Bad request" }, { status: 400 });
  }

  const { error } = await supa.from("messages").update({ liked: body.liked }).eq("id", params.id);
  if (error) return NextResponse.json({ success: false, error: "Failed" }, { status: 500 });
  return NextResponse.json({ success: true });
}

// DELETE — remove a message (used by edit-and-resend flow)
export async function DELETE(_request: Request, { params }: Params) {
  let user;
  try {
    user = await getServerUser();
  } catch {
    return NextResponse.json({ success: false, error: "Unauthenticated" }, { status: 401 });
  }

  const supa = await createSupabaseServerClient();
  const owned = await messageOwnedBy(supa, params.id, user.id);
  if (!owned) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

  const { error } = await supa.from("messages").delete().eq("id", params.id);
  if (error) return NextResponse.json({ success: false, error: "Failed" }, { status: 500 });
  return NextResponse.json({ success: true });
}
