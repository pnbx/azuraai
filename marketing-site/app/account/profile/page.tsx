"use client";

import { useEffect, useState } from "react";
import Icon from "@/components/Icon";

export default function ProfilePage() {
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/user").then((r) => r.json()),
      fetch("/api/settings").then((r) => r.json()),
    ]).then(([user, settings]) => {
      if (user.success) setEmail(user.value?.email ?? user.user.email);
      if (settings.success && settings.settings) {
        setDisplayName(settings.settings.display_name ?? "");
        setUsername(settings.settings.username ?? "");
        setBio(settings.settings.bio ?? "");
      }
      setLoading(false);
    });
  }, []);

  async function save() {
    setError(null);
    if (username && !/^[a-zA-Z0-9_-]{3,20}$/.test(username)) {
      setError("نام کاربری فقط حروف انگلیسی، عدد، خط تیره و زیرخط (۳ تا ۲۰ کاراکتر).");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ display_name: displayName, username, bio }),
    });
    const d = await res.json();
    setSaving(false);
    if (d.success) {
      setSaved(true);
      setDirty(false);
      setTimeout(() => setSaved(false), 2500);
    } else {
      setError("ذخیره‌سازی ناموفق بود. دوباره تلاش کنید.");
    }
  }

  if (loading) return <div className="h-64 animate-pulse rounded-3xl bg-white/5" />;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-black text-white">پروفایل</h1>
        <p className="mt-1 text-xs text-mist-400">اطلاعات عمومی حساب خود را مدیریت کنید.</p>
      </div>

      <div className="card space-y-5 p-6">
        <div className="flex items-center gap-4">
          <span className="grid h-16 w-16 place-items-center rounded-3xl bg-white text-2xl font-black text-black">
            {(displayName || email || "?").slice(0, 1).toUpperCase()}
          </span>
          <div>
            <p className="text-sm font-bold text-white">{displayName || "کاربر Azura"}</p>
            <p className="text-xs text-mist-400" dir="ltr">{email}</p>
          </div>
        </div>

        {error && (
          <div className="rounded-2xl border border-white/15 bg-white/[0.06] px-4 py-3 text-xs text-white">{error}</div>
        )}

        <div>
          <label className="mb-1.5 block text-xs font-medium text-mist-300">نام نمایشی</label>
          <input
            value={displayName}
            onChange={(e) => { setDisplayName(e.target.value); setDirty(true); }}
            placeholder="مثلاً: سارا محمدی"
            className="input-dark w-full"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-mist-300">نام کاربری</label>
          <input
            value={username}
            onChange={(e) => { setUsername(e.target.value); setDirty(true); }}
            placeholder="azura_user"
            dir="ltr"
            className="input-dark w-full"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-mist-300">درباره من</label>
          <textarea
            value={bio}
            onChange={(e) => { setBio(e.target.value); setDirty(true); }}
            rows={3}
            placeholder="چند جمله درباره خودتان…"
            className="input-dark w-full resize-none"
          />
        </div>

        <div className="flex items-center justify-between border-t border-white/5 pt-4">
          {dirty ? (
            <span className="text-[11px] text-mist-400">تغییرات ذخیره نشده</span>
          ) : saved ? (
            <span className="flex items-center gap-1 text-[11px] text-white"><Icon name="check" size={12} /> ذخیره شد</span>
          ) : <span />}
          <button onClick={save} disabled={saving || !dirty} className="btn-primary !rounded-full !px-5 !py-2 !text-xs disabled:opacity-40">
            {saving ? "در حال ذخیره…" : "ذخیره تغییرات"}
          </button>
        </div>
      </div>
    </div>
  );
}
