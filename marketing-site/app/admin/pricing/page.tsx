"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Tariff = {
  ruleId: string;
  modelId: string;
  slug: string;
  name: string;
  input: number;
  output: number;
};

const fa = (n: number) => n.toLocaleString("fa-IR");
const faNum = (s: string) => s.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));

export default function AdminPricingPage() {
  const [models, setModels] = useState<Tariff[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // percent raise
  const [percent, setPercent] = useState("10");
  const [applying, setApplying] = useState(false);
  const [confirming, setConfirming] = useState(false);

  // single edit
  const [editing, setEditing] = useState<string | null>(null);
  const [editIn, setEditIn] = useState("");
  const [editOut, setEditOut] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/admin/pricing")
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setModels(d.models);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return models;
    return models.filter((m) => m.slug.toLowerCase().includes(q) || m.name.toLowerCase().includes(q));
  }, [models, query]);

  const stats = useMemo(() => {
    if (models.length === 0) return null;
    const avgIn = Math.round(models.reduce((s, m) => s + m.input, 0) / models.length);
    const avgOut = Math.round(models.reduce((s, m) => s + m.output, 0) / models.length);
    return { count: models.length, avgIn, avgOut };
  }, [models]);

  async function applyPercent() {
    const pct = Number(faNum(percent));
    if (!Number.isFinite(pct) || pct === 0) {
      setMsg({ kind: "err", text: "درصد نامعتبر است." });
      return;
    }
    setApplying(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/pricing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "percent", percent: pct }),
      });
      const d = await res.json();
      if (d.success) {
        setMsg({ kind: "ok", text: `قیمت همه ${fa(d.updated)} مدل ${pct > 0 ? "افزایش" : "کاهش"} یافت (${fa(Math.abs(pct))}٪).` });
        load();
      } else {
        setMsg({ kind: "err", text: d.error === "INVALID_PERCENT" ? "درصد باید بین -۹۹ تا ۱۰۰۰ باشد." : "اعمال نشد." });
      }
    } catch {
      setMsg({ kind: "err", text: "خطا در ارتباط با سرور." });
    }
    setApplying(false);
    setConfirming(false);
  }

  function startEdit(m: Tariff) {
    setEditing(m.modelId);
    setEditIn(String(m.input));
    setEditOut(String(m.output));
    setMsg(null);
  }

  async function saveEdit() {
    if (!editing) return;
    const input = Number(faNum(editIn));
    const output = Number(faNum(editOut));
    if (!Number.isFinite(input) || !Number.isFinite(output) || input < 0 || output < 0) {
      setMsg({ kind: "err", text: "قیمت نامعتبر است." });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/pricing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "single", modelId: editing, input, output }),
      });
      const d = await res.json();
      if (d.success) {
        setMsg({ kind: "ok", text: "تعرفه به‌روزرسانی شد." });
        load();
      } else {
        setMsg({ kind: "err", text: "ذخیره نشد." });
      }
    } catch {
      setMsg({ kind: "err", text: "خطا در ارتباط با سرور." });
    }
    setSaving(false);
    setEditing(null);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-white">قیمت‌گذاری مدل‌ها</h1>
        <p className="mt-1 text-xs text-mist-400">
          تعرفه همه مدل‌ها (تومان به ازای هر یک میلیون توکن). تغییرات بلافاصله روی سایت و صورتحساب اعمال می‌شود.
        </p>
      </div>

      {msg && (
        <div
          className={`rounded-2xl border px-4 py-3 text-xs ${
            msg.kind === "ok" ? "border-white/20 bg-white/[0.08] text-white" : "border-red-400/30 bg-red-500/10 text-red-100"
          }`}
        >
          {msg.text}
        </div>
      )}

      {/* bulk percent raise */}
      <div className="card p-6">
        <p className="text-xs font-bold text-white">تغییر گروهی قیمت‌ها</p>
        <p className="mt-1 text-[10px] leading-5 text-mist-400">
          درصد مثبت = افزایش، منفی = کاهش. روی همه مدل‌ها اعمال می‌شود.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="relative w-36">
            <input
              inputMode="numeric"
              value={percent}
              onChange={(e) => setPercent(faNum(e.target.value).replace(/[^0-9.-]/g, ""))}
              className="w-full rounded-2xl border border-white/10 bg-ink-900 px-4 py-2.5 pe-8 text-sm text-white focus:border-white/40 focus:outline-none"
            />
            <span className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-xs text-mist-400">٪</span>
          </div>
          {[-10, -5, 5, 10, 20].map((p) => (
            <button
              key={p}
              onClick={() => setPercent(String(p))}
              className="rounded-xl border border-white/10 px-3 py-2 text-[11px] text-mist-300 transition hover:border-white/30 hover:text-white"
            >
              {p > 0 ? `+${fa(p)}` : fa(p)}٪
            </button>
          ))}
          {confirming ? (
            <span className="flex items-center gap-2">
              <span className="text-[11px] text-mist-300">
                مطمئنی؟ قیمت {fa(stats?.count ?? 0)} مدل ±{fa(Math.abs(Number(faNum(percent)) || 0))}٪ می‌شود.
              </span>
              <button
                onClick={applyPercent}
                disabled={applying}
                className="btn-primary !rounded-xl !px-4 !py-2 !text-[11px] disabled:opacity-40"
              >
                {applying ? "…" : "بله، اعمال"}
              </button>
              <button
                onClick={() => setConfirming(false)}
                className="rounded-xl border border-white/10 px-3 py-2 text-[11px] text-mist-300 hover:text-white"
              >
                انصراف
              </button>
            </span>
          ) : (
            <button
              onClick={() => setConfirming(true)}
              disabled={!stats}
              className="btn-primary !rounded-xl !px-4 !py-2 !text-[11px] disabled:opacity-40"
            >
              اعمال روی همه مدل‌ها
            </button>
          )}
          {stats && (
            <span className="ms-auto text-[10px] text-mist-400">
              میانگین فعلی: ورودی {fa(stats.avgIn)} / خروجی {fa(stats.avgOut)}
            </span>
          )}
        </div>
      </div>

      {/* search */}
      <div className="relative min-w-56">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="جستجوی مدل…"
          className="w-full rounded-2xl border border-white/10 bg-ink-900 py-2.5 px-4 text-sm text-white placeholder:text-mist-400 focus:border-white/40 focus:outline-none"
        />
      </div>

      {/* table */}
      <div className="card overflow-x-auto p-6">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-white/10 text-mist-400">
              <th className="pb-3 text-start font-medium">مدل</th>
              <th className="pb-3 text-start font-medium">ورودی / 1M</th>
              <th className="pb-3 text-start font-medium">خروجی / 1M</th>
              <th className="pb-3 text-start font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="py-10 text-center text-mist-400">در حال بارگذاری…</td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-10 text-center text-mist-400">مدلی پیدا نشد.</td>
              </tr>
            ) : (
              filtered.map((m) => (
                <tr key={m.modelId} className="border-b border-white/5 last:border-0">
                  <td className="py-2.5">
                    <p className="font-bold text-white" dir="auto">{m.name}</p>
                    <p className="text-[10px] text-mist-400" dir="ltr">{m.slug}</p>
                  </td>
                  {editing === m.modelId ? (
                    <>
                      <td className="py-2">
                        <input
                          inputMode="numeric"
                          value={editIn}
                          onChange={(e) => setEditIn(faNum(e.target.value).replace(/[^0-9]/g, ""))}
                          className="w-28 rounded-xl border border-white/20 bg-ink-900 px-3 py-1.5 text-xs text-white focus:border-white/50 focus:outline-none"
                        />
                      </td>
                      <td className="py-2">
                        <input
                          inputMode="numeric"
                          value={editOut}
                          onChange={(e) => setEditOut(faNum(e.target.value).replace(/[^0-9]/g, ""))}
                          className="w-28 rounded-xl border border-white/20 bg-ink-900 px-3 py-1.5 text-xs text-white focus:border-white/50 focus:outline-none"
                        />
                      </td>
                      <td className="py-2">
                        <span className="flex gap-1.5">
                          <button onClick={saveEdit} disabled={saving} className="btn-primary !rounded-lg !px-3 !py-1.5 !text-[10px] disabled:opacity-40">
                            {saving ? "…" : "ذخیره"}
                          </button>
                          <button
                            onClick={() => setEditing(null)}
                            className="rounded-lg border border-white/10 px-3 py-1.5 text-[10px] text-mist-300 hover:text-white"
                          >
                            انصراف
                          </button>
                        </span>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="py-2.5 font-bold text-white">{fa(m.input)}</td>
                      <td className="py-2.5 font-bold text-white">{fa(m.output)}</td>
                      <td className="py-2.5">
                        <button
                          onClick={() => startEdit(m)}
                          className="rounded-lg border border-white/10 px-3 py-1.5 text-[10px] text-mist-300 transition hover:border-white/30 hover:text-white"
                        >
                          ویرایش
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
