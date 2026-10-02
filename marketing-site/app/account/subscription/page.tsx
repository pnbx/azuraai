"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import { PLAN_ORDER, PLAN_LABEL_FA, NEXT_PLAN, type PlanId } from "@/lib/plans-config";

type SubInfo = {
  subscribed: boolean;
  plan: PlanId | null;
  displayName?: string | null;
  priceToman?: number | null;
  periodEnd?: string | null;
  usage?: {
    messages: { used: number; limit: number };
    inputTokens: { used: number; limit: number };
    outputTokens: { used: number; limit: number };
    premium: Array<{ slug: string; used: number; limit: number }>;
  } | null;
  free?: { used: number; limit: number; remaining: number };
};

type PlanLimits = {
  plan: string;
  display_name: string;
  price_toman: number;
  monthly_messages: number;
  monthly_input_tokens: number;
  monthly_output_tokens: number;
  max_output_tokens_per_request: number;
  max_context_tokens: number;
  requests_per_minute: number;
  modelCount?: number;
};

function fa(n: number) {
  return n.toLocaleString("fa-IR");
}

function UsageBar({
  label,
  used,
  limit,
}: {
  label: string;
  used: number;
  limit: number;
}) {
  const pct = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-mist-300">{label}</span>
        <span className="text-mist-400">
          {fa(used)} / {fa(limit)}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
        <div
          className="h-full rounded-full bg-white/80 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function SubscriptionPage() {
  const [info, setInfo] = useState<SubInfo | null | "unauth">(null);
  const [plans, setPlans] = useState<PlanLimits[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(() => {
    fetch("/api/subscription")
      .then(async (r) => {
        if (r.status === 401) return "unauth" as const;
        const d = await r.json();
        return d.success ? d : null;
      })
      .then((d) => setInfo(d))
      .catch(() => setInfo(null));
    fetch("/api/plans")
      .then((r) => r.json())
      .then((d) => d.success && setPlans(d.plans))
      .catch(() => {});
  }, []);

  useEffect(load, [load]);

  async function buy(plan: PlanId) {
    if (!confirm(`اشتراک «${PLAN_LABEL_FA[plan]}» از موجودی کیف پول خریداری شود؟`)) return;
    setBusy(plan);
    setMsg(null);
    try {
      const res = await fetch("/api/subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const d = await res.json();
      if (d.success) {
        setMsg({ kind: "ok", text: `اشتراک «${PLAN_LABEL_FA[plan]}» فعال شد.` });
        load();
      } else if (d.error === "INSUFFICIENT_BALANCE") {
        setMsg({
          kind: "err",
          text: `موجودی کافی نیست. لازم: ${fa(d.needed ?? 0)} تومان — موجودی: ${fa(d.balance ?? 0)} تومان.`,
        });
      } else {
        setMsg({ kind: "err", text: "خرید انجام نشد. دوباره تلاش کنید." });
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-black text-white">اشتراک و پلن</h1>
        <p className="mt-1 text-xs text-mist-400">
          پلن فعلی، مصرف واقعی این دوره و گزینه‌های ارتقا.
        </p>
      </div>

      {/* current plan / free tier */}
      <div className="card p-6">
        {info == null ? (
          <p className="text-xs text-mist-400">در حال بارگذاری…</p>
        ) : info === "unauth" ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs text-mist-400">پلن فعلی</p>
              <p className="mt-1 text-xl font-black text-white">برای مشاهده وارد شوید</p>
              <p className="mt-1 text-[11px] text-mist-400">
                پلن فعلی، مصرف واقعی و خرید اشتراک پس از ورود در دسترس است.
              </p>
            </div>
            <Link href="/auth/login?redirect=/account/subscription" className="btn-primary !rounded-full !px-5 !py-2 !text-xs">
              ورود
            </Link>
          </div>
        ) : info.subscribed ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs text-mist-400">پلن فعلی</p>
                <p className="mt-1 text-xl font-black text-white">
                  {PLAN_LABEL_FA[info.plan as PlanId]}
                </p>
                <p className="mt-1 text-[11px] text-mist-400">
                  {fa(info.priceToman ?? 0)} تومان در ماه · تمدید:{" "}
                  {info.periodEnd
                    ? new Date(info.periodEnd).toLocaleDateString("fa-IR")
                    : "—"}
                </p>
              </div>
              <span className="rounded-full border border-white/15 bg-white/[0.06] px-3 py-1 text-[10px] font-bold text-white">
                فعال
              </span>
            </div>
            {info.usage && (
              <div className="mt-5 space-y-4">
                <UsageBar label="پیام‌ها" used={info.usage.messages.used} limit={info.usage.messages.limit} />
                <UsageBar
                  label="توکن ورودی"
                  used={info.usage.inputTokens.used}
                  limit={info.usage.inputTokens.limit}
                />
                <UsageBar
                  label="توکن خروجی"
                  used={info.usage.outputTokens.used}
                  limit={info.usage.outputTokens.limit}
                />
                {info.usage.premium.length > 0 && (
                  <div className="space-y-3 border-t border-white/5 pt-4">
                    <p className="text-[11px] font-bold text-mist-300">سهمیه مدل‌های پریمیوم:</p>
                    {info.usage.premium.map((p) => (
                      <UsageBar key={p.slug} label={p.slug} used={p.used} limit={p.limit} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs text-mist-400">پلن فعلی</p>
              <p className="mt-1 text-xl font-black text-white">رایگان</p>
              <p className="mt-1 text-[11px] text-mist-400">
                {info.free
                  ? `${fa(info.free.remaining)} پیام رایگان باقی‌مانده از ${fa(info.free.limit)} این ماه — فقط مدل‌های اقتصادی.`
                  : "فقط مدل‌های اقتصادی."}
              </p>
            </div>
            <Link href="/#pricing" className="btn-primary !rounded-full !px-5 !py-2 !text-xs">
              مشاهده پلن‌ها
            </Link>
          </div>
        )}
      </div>

      {msg && (
        <div
          className={`rounded-2xl border px-4 py-3 text-xs leading-6 ${
            msg.kind === "ok"
              ? "border-white/20 bg-white/[0.08] text-white"
              : "border-white/15 bg-white/[0.05] text-white"
          }`}
        >
          {msg.text}
          {msg.kind === "err" && (
            <Link href="/account/wallet" className="ms-2 font-bold underline">
              شارژ کیف پول
            </Link>
          )}
        </div>
      )}

      {/* plans grid */}
      <div className="grid gap-4 md:grid-cols-3">
        {plans.map((p) => {
          const pid = p.plan as PlanId;
          const isCurrent = info !== "unauth" && info?.subscribed && info.plan === pid;
          const next = info && info !== "unauth" && info.subscribed ? NEXT_PLAN[info.plan as PlanId] : null;
          const isNext = next === pid;
          return (
            <div
              key={p.plan}
              className={`card flex flex-col p-6 ${isNext ? "border-white/40" : ""}`}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black text-white">{PLAN_LABEL_FA[pid]}</h3>
                {isCurrent ? (
                  <span className="rounded-full bg-white px-2.5 py-0.5 text-[9px] font-bold text-black">
                    پلن شما
                  </span>
                ) : isNext ? (
                  <span className="rounded-full border border-white/25 bg-white/[0.06] px-2.5 py-0.5 text-[9px] font-bold text-white">
                    پیشنهاد ارتقا
                  </span>
                ) : null}
              </div>
              <p className="mt-2 text-lg font-black text-white">
                {fa(p.price_toman)} <span className="text-[10px] font-medium text-mist-400">تومان/ماه</span>
              </p>
              <ul className="mt-4 flex-1 space-y-2 text-[11px] leading-6 text-mist-300">
                <li>{fa(p.monthly_messages)} پیام در ماه</li>
                <li>{fa(p.monthly_input_tokens)} توکن ورودی</li>
                <li>{fa(p.monthly_output_tokens)} توکن خروجی</li>
                <li>حداکثر {fa(p.max_output_tokens_per_request)} توکن خروجی در هر درخواست</li>
                <li>کانتکست تا {fa(p.max_context_tokens)} توکن</li>
                <li>{fa(p.requests_per_minute)} درخواست در دقیقه</li>
                <li>{fa(p.modelCount ?? 0)}+ مدل فعال</li>
              </ul>
              <button
                onClick={() => buy(pid)}
                disabled={busy !== null || isCurrent}
                className={`mt-5 w-full !py-2.5 !text-xs ${
                  isCurrent ? "btn-ghost" : isNext ? "btn-primary" : "btn-ghost"
                }`}
              >
                {busy === pid ? "…" : isCurrent ? "فعال" : `خرید ${PLAN_LABEL_FA[pid]}`}
              </button>
            </div>
          );
        })}
      </div>

      <p className="text-[10px] leading-6 text-mist-400">
        خرید اشتراک از موجودی کیف پول (تومان) انجام می‌شود. برای شارژ کیف پول به{" "}
        <Link href="/account/wallet" className="underline">
          کیف پول
        </Link>{" "}
        بروید.
      </p>
    </div>
  );
}
