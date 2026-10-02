import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth/server";
import { getSubscriptionInfo } from "@/lib/subscriptions";
import { getFreeUsage } from "@/lib/free-usage";

// GET /api/chat/quota — subscription usage (or free-tier remaining)
export async function GET() {
  let user;
  try {
    user = await getServerUser();
  } catch {
    return NextResponse.json({ success: false, error: "Unauthenticated" }, { status: 401 });
  }

  const info = await getSubscriptionInfo(user.id);
  if (info) {
    return NextResponse.json({
      success: true,
      subscribed: true,
      plan: info.plan,
      displayName: info.displayName,
      periodEnd: info.periodEnd,
      usage: info.usage,
    });
  }

  const usage = await getFreeUsage(user.id);
  return NextResponse.json({ success: true, subscribed: false, ...usage });
}
