import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/auth/server";
import { getSubscriptionInfo, getActiveSubscription } from "@/lib/subscriptions";
import { purchaseSubscriptionWithWallet } from "@/lib/subscriptions";
import { getFreeUsage } from "@/lib/free-usage";
import { PLAN_ORDER, type PlanId } from "@/lib/plans-config";

// GET /api/subscription — current plan + real usage (never client-trusted)
export async function GET() {
  let user;
  try {
    user = await getServerUser();
  } catch {
    return NextResponse.json({ success: false, error: "Unauthenticated" }, { status: 401 });
  }

  const info = await getSubscriptionInfo(user.id);
  if (info) {
    return NextResponse.json({ success: true, subscribed: true, ...info });
  }

  // No active subscription → free tier usage (authoritative from usage_logs)
  const free = await getFreeUsage(user.id);
  return NextResponse.json({ success: true, subscribed: false, plan: null, free });
}

// POST /api/subscription — purchase { plan } with wallet balance (Toman)
export async function POST(request: Request) {
  let user;
  try {
    user = await getServerUser();
  } catch {
    return NextResponse.json({ success: false, error: "Unauthenticated" }, { status: 401 });
  }

  let body: { plan?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "BAD_REQUEST" }, { status: 400 });
  }

  const plan = body.plan as PlanId | undefined;
  if (!plan || !PLAN_ORDER.includes(plan)) {
    return NextResponse.json({ success: false, error: "UNKNOWN_PLAN" }, { status: 400 });
  }

  const result = await purchaseSubscriptionWithWallet(user.id, plan);

  if (!result.success) {
    const status = result.error === "INSUFFICIENT_BALANCE" ? 402 : 400;
    return NextResponse.json(
      { success: false, error: result.error, needed: result.needed, balance: result.balance },
      { status }
    );
  }

  const sub = await getActiveSubscription(user.id);
  return NextResponse.json({
    success: true,
    plan,
    periodEnd: sub?.periodEnd ?? result.periodEnd ?? null,
    newBalance: result.newBalance,
  });
}
