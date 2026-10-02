"use client";

import { useEffect, useState } from "react";
import Icon from "@/components/Icon";

type Key = {
  id: string;
  name: string | null;
  scope: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<Key[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [freshSecret, setFreshSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    fetch("/api/api-keys")
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setKeys(d.keys);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }

  useEffect(load, []);

  async function createKey() {
    setError(null);
    if (!newName.trim()) {
      setError("برای کلید یک نام انتخاب کنید.");
      return;
    }
    setCreating(true);
    const res = await fetch("/api/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim() }),
    });
    const d = await res.json();
    setCreating(false);
    if (d.success) {
      setFreshSecret(d.key.secret);
      setNewName("");
      load();
    } else {
      setError(d.error ?? "ساخت کلید ناموفق بود.");
    }
  }

  async function revokeKey(id: string) {
    if (!confirm("این کلید برای همیشه باطل شود؟ برنامه‌هایی که از آن استفاده می‌کنند متوقف می‌شوند.")) return;
    await fetch(`/api/api-keys/${id}`, { method: "DELETE" });
    load();
  }

  if (loading) return <div className="h-64 animate-pulse rounded-3xl bg-white/5" />;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-black text-white">کلیدهای API</h1>
        <p className="mt-1 text-xs leading-6 text-mist-400">
          با کلید API می‌توانید از مدل‌های Azura در برنامه‌های خودتان استفاده کنید. کلید محرمانه فقط یک بار نمایش داده می‌شود.
        </p>
      </div>

      {/* create */}
      <section className="card space-y-3 p-6">
        <h2 className="text-sm font-bold text-white">ساخت کلید جدید</h2>
        {error && <p className="rounded-2xl border border-white/15 bg-white/[0.06] px-3 py-2 text-[11px] text-white">{error}</p>}
        <div className="flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="نام کلید؛ مثلاً: اپ فروشگاه"
            className="input-dark flex-1"
            onKeyDown={(e) => e.key === "Enter" && createKey()}
          />
          <button onClick={createKey} disabled={creating} className="btn-primary !rounded-2xl !px-5 !py-2.5 !text-xs disabled:opacity-40">
            {creating ? "…" : "ساخت کلید"}
          </button>
        </div>
      </section>

      {/* fresh secret modal */}
      {freshSecret && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4" onClick={() => setFreshSecret(null)}>
          <div className="card w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-black text-white">کلید شما ساخته شد</h3>
            <p className="mt-2 text-[11px] leading-6 text-mist-400">
              این کلید فقط همین یک بار نمایش داده می‌شود. همین حالا کپی و در جای امن ذخیره کنید.
            </p>
            <div className="mt-4 flex items-center gap-2 rounded-2xl border border-white/15 bg-black p-3" dir="ltr">
              <code className="flex-1 overflow-x-auto whitespace-nowrap text-[11px] text-white">{freshSecret}</code>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(freshSecret);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-white text-black transition hover:shadow-glow"
              >
                <Icon name={copied ? "check" : "copy"} size={13} />
              </button>
            </div>
            <button onClick={() => setFreshSecret(null)} className="btn-primary mt-4 w-full !rounded-2xl !py-2.5 !text-xs">
              ذخیره کردم، بستن
            </button>
          </div>
        </div>
      )}

      {/* keys list */}
      <section className="card p-6">
        <h2 className="text-sm font-bold text-white">کلیدهای شما</h2>
        {keys.length === 0 ? (
          <p className="py-10 text-center text-xs text-mist-400">هنوز کلیدی نساخته‌اید.</p>
        ) : (
          <div className="mt-4 space-y-2">
            {keys.map((k) => {
              const active = !k.revokedAt;
              return (
                <div key={k.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3.5">
                  <div className="min-w-0">
                    <p className={`text-xs font-bold ${active ? "text-white" : "text-mist-400 line-through"}`}>{k.name ?? "بدون نام"}</p>
                    <p className="mt-1 text-[10px] text-mist-400">
                      ساخته‌شده {new Date(k.createdAt).toLocaleDateString("fa-IR")}
                      {k.lastUsedAt ? ` · آخرین استفاده ${new Date(k.lastUsedAt).toLocaleDateString("fa-IR")}` : " · استفاده نشده"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {active ? (
                      <>
                        <span className="badge !text-[9px]">فعال</span>
                        <button
                          onClick={() => revokeKey(k.id)}
                          className="rounded-xl border border-white/15 px-3 py-1.5 text-[10px] text-white transition hover:bg-white hover:text-black"
                        >
                          باطل کردن
                        </button>
                      </>
                    ) : (
                      <span className="badge !text-[9px] !text-mist-400">باطل‌شده</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* docs hint */}
      <section className="card p-6">
        <h2 className="text-sm font-bold text-white">استفاده از کلید</h2>
        <p className="mt-2 text-[11px] leading-6 text-mist-400">
          کلید را در هدر Authorization قرار دهید:
        </p>
        <pre className="mt-3 overflow-x-auto rounded-2xl border border-white/10 bg-black p-4 text-[11px] leading-6 text-mist-200" dir="ltr">
{`curl https://your-domain.com/api/inference \\
  -H "Authorization: Bearer az_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"gpt-4o-mini","operation":"chat","input":{"messages":[{"role":"user","content":"سلام"}]}}'`}
        </pre>
      </section>
    </div>
  );
}
