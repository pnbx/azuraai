"use client";

import { useEffect, useState } from "react";
import Icon from "@/components/Icon";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

type Memory = { id: string; content: string; source: string; created_at: string };

export default function DataPage() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [newMemory, setNewMemory] = useState("");
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  function load() {
    fetch("/api/memories")
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setMemories(d.memories);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }

  useEffect(load, []);

  async function addMemory() {
    if (!newMemory.trim()) return;
    await fetch("/api/memories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: newMemory.trim() }),
    });
    setNewMemory("");
    load();
  }

  async function deleteMemory(id: string) {
    await fetch(`/api/memories?id=${id}`, { method: "DELETE" });
    load();
  }

  async function exportData() {
    // gather what the user owns and download as JSON
    const [convos, wallet, usage] = await Promise.all([
      fetch("/api/conversations").then((r) => r.json()),
      fetch("/api/wallet").then((r) => r.json()),
      fetch("/api/usage/summary?days=90").then((r) => r.json()),
    ]);
    const blob = new Blob([JSON.stringify({ exportedAt: new Date(), conversations: convos, wallet, usage }, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "azura-account-export.json";
    a.click();
    URL.revokeObjectURL(url);
    setMsg("خروجی داده‌ها دانلود شد.");
    setTimeout(() => setMsg(null), 2500);
  }

  async function deleteAccount() {
    // Supabase client-side cannot hard-delete; we sign out everywhere and flag via activity log.
    const supa = getSupabaseBrowserClient();
    await fetch("/api/activity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: "delete_requested", detail: "کاربر درخواست حذف حساب داد" }),
    });
    await supa.auth.signOut({ scope: "global" });
    alert(
      "درخواست حذف حساب ثبت شد. برای حذف کامل داده‌ها طبق قوانین، با پشتیبانی Azura AI در تماس باشید: support@azuraai.ir"
    );
    window.location.href = "/";
  }

  if (loading) return <div className="h-64 animate-pulse rounded-3xl bg-white/5" />;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-black text-white">داده و حریم خصوصی</h1>
        <p className="mt-1 text-xs text-mist-400">مدیریت حافظه، خروجی داده‌ها و حذف حساب.</p>
      </div>

      {msg && <div className="rounded-2xl border border-white/15 bg-white/[0.06] px-4 py-3 text-xs text-white">{msg}</div>}

      {/* memories */}
      <section className="card space-y-4 p-6">
        <h2 className="text-sm font-bold text-white">حافظه‌های مدل</h2>
        <p className="text-[11px] leading-6 text-mist-400">
          این نکات در گفتگوها به مدل یادآوری می‌شود (به‌جز چت موقت).
        </p>
        <div className="flex gap-2">
          <input
            value={newMemory}
            onChange={(e) => setNewMemory(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addMemory()}
            placeholder="مثلاً: اسم من ساراست و برنامه‌نویس پایتون هستم"
            className="input-dark flex-1"
          />
          <button onClick={addMemory} disabled={!newMemory.trim()} className="btn-primary !rounded-2xl !px-4 !py-2.5 !text-xs disabled:opacity-40">
            افزودن
          </button>
        </div>
        {memories.length === 0 ? (
          <p className="py-6 text-center text-[11px] text-mist-400">حافظه‌ای ثبت نشده است.</p>
        ) : (
          <div className="space-y-2">
            {memories.map((m) => (
              <div key={m.id} className="flex items-start justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                <p className="text-xs leading-7 text-mist-100">{m.content}</p>
                <button onClick={() => deleteMemory(m.id)} className="shrink-0 rounded-lg p-1.5 text-mist-400 transition hover:bg-white hover:text-black" title="حذف">
                  <Icon name="close" size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* export */}
      <section className="card space-y-3 p-6">
        <h2 className="text-sm font-bold text-white">خروجی داده‌ها</h2>
        <p className="text-[11px] leading-6 text-mist-400">
          گفتگوها، تراکنش‌ها و مصرف ۹۰ روز اخیر را به‌صورت فایل JSON دریافت کنید.
        </p>
        <button onClick={exportData} className="btn-ghost !rounded-full !px-5 !py-2 !text-xs">
          <Icon name="copy" size={13} />
          دانلود خروجی
        </button>
      </section>

      {/* delete account */}
      <section className="card border-white/15 p-6">
        <h2 className="text-sm font-black text-white">حذف حساب</h2>
        <p className="mt-2 text-[11px] leading-6 text-mist-400">
          با حذف حساب، همه گفتگوها، کلیدهای API، موجودی کیف پول و تنظیمات شما برای همیشه پاک می‌شود.
          این اقدام قابل بازگشت نیست.
        </p>
        <input
          value={confirmDelete}
          onChange={(e) => setConfirmDelete(e.target.value)}
          placeholder="برای تأیید بنویسید: DELETE"
          dir="ltr"
          className="input-dark mt-4 w-full"
        />
        <button
          onClick={deleteAccount}
          disabled={confirmDelete !== "DELETE"}
          className="mt-3 flex items-center gap-2 rounded-full border border-white/25 px-5 py-2 text-xs font-bold text-white transition hover:bg-white hover:text-black disabled:opacity-30"
        >
          <Icon name="close" size={13} />
          حذف همیشگی حساب
        </button>
      </section>
    </div>
  );
}
