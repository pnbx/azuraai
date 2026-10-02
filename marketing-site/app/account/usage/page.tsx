"use client";

import { useEffect, useState } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";
import Icon from "@/components/Icon";

type Summary = {
  days: number;
  totalRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalCostCents: number;
  errorCount: number;
  byModel: Array<{ model: string; requests: number; tokens: number; cost: number }>;
  recent: Array<{ id: string; model: string; inputTokens: number; outputTokens: number; cost: number; status: string; requestTs: string; responseMs: number | null }>;
};

const RANGES = [
  { days: 1, label: "امروز" },
  { days: 7, label: "۷ روز" },
  { days: 30, label: "۳۰ روز" },
  { days: 90, label: "۹۰ روز" },
];

export default function UsagePage() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/usage/summary?days=${days}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setData(d.summary);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [days]);

  const fmt = (n: number) => n.toLocaleString("fa-IR");
  const fmtCents = (c: number) => `$${(c / 100).toLocaleString("fa-IR", { maximumFractionDigits: 2 })}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-white">مصرف</h1>
          <p className="mt-1 text-xs text-mist-400">آمار واقعی مصرف مدل‌ها و هزینه‌ها.</p>
        </div>
        <div className="flex gap-1 rounded-2xl border border-white/10 bg-white/[0.03] p-1">
          {RANGES.map((r) => (
            <button
              key={r.days}
              onClick={() => setDays(r.days)}
              className={`rounded-xl px-3 py-1.5 text-[11px] transition ${
                days === r.days ? "bg-white font-bold text-black" : "text-mist-300 hover:text-white"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-24 animate-pulse rounded-3xl bg-white/5" />)}
        </div>
      ) : !data || data.totalRequests === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-sm text-mist-400">در این بازه مصرفی ثبت نشده است.</p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="درخواست‌ها" value={fmt(data.totalRequests)} icon="chart" />
            <Stat label="توکن ورودی" value={fmt(data.totalInputTokens)} icon="arrow-left" />
            <Stat label="توکن خروجی" value={fmt(data.totalOutputTokens)} icon="send" />
            <Stat label="هزینه کل" value={fmtCents(data.totalCostCents)} icon="key" />
          </div>

          {/* by model */}
          <section className="card p-6">
            <h2 className="text-sm font-bold text-white">مصرف به تفکیک مدل</h2>
            <div className="mt-5 space-y-3">
              {data.byModel.map((m) => {
                const max = data.byModel[0]?.tokens || 1;
                return (
                  <div key={m.model}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-white" dir="ltr">{m.model}</span>
                      <span className="text-mist-400">{fmt(m.tokens)} توکن · {fmtCents(m.cost)}</span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/[0.06]">
                      <div
                        className="h-full rounded-full bg-white/70 transition-all duration-700"
                        style={{ width: `${Math.max((m.tokens / max) * 100, 3)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* recent requests */}
          <section className="card p-6">
            <h2 className="text-sm font-bold text-white">آخرین درخواست‌ها</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[10px] text-mist-400">
                    <th className="pb-2 text-start font-medium">زمان</th>
                    <th className="pb-2 text-start font-medium">مدل</th>
                    <th className="pb-2 text-start font-medium">توکن</th>
                    <th className="pb-2 text-start font-medium">هزینه</th>
                    <th className="pb-2 text-start font-medium">وضعیت</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recent.map((r) => (
                    <tr key={r.id} className="border-t border-white/5">
                      <td className="py-2.5 text-mist-300">{new Date(r.requestTs).toLocaleString("fa-IR")}</td>
                      <td className="py-2.5 text-white" dir="ltr">{r.model}</td>
                      <td className="py-2.5 text-mist-300" dir="ltr">{fmt(r.inputTokens + r.outputTokens)}</td>
                      <td className="py-2.5 text-mist-300" dir="ltr">{fmtCents(r.cost)}</td>
                      <td className="py-2.5">
                        <span className={`badge !text-[9px] ${r.status !== "succeeded" ? "!text-mist-400" : ""}`}>
                          {r.status === "succeeded" ? "موفق" : "ناموفق"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon: Parameters<typeof Icon>[0]["name"] }) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-mist-400">{label}</span>
        <span className="text-mist-400"><Icon name={icon} size={14} /></span>
      </div>
      <p className="mt-3 text-xl font-black text-white" dir="ltr">{value}</p>
    </div>
  );
}
