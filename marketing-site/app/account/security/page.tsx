"use client";

import { useEffect, useState } from "react";
import Icon from "@/components/Icon";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

export default function SecurityPage() {
  const [password, setPassword] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<Array<{ id: string; createdAt?: string; userAgent?: string }>>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const supa = getSupabaseBrowserClient();
    // current session is shown from local session data (Supabase doesn't expose all sessions client-side)
    supa.auth.getSession().then(({ data }: { data: { session: { access_token: string; user: { last_sign_in_at?: string } } | null } }) => {
      if (data.session) {
        setSessions([
          {
            id: data.session.access_token.slice(0, 8),
            createdAt: data.session.user.last_sign_in_at ?? undefined,
            userAgent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 60) : undefined,
          },
        ]);
      }
    });
  }, []);

  async function changePassword() {
    setError(null);
    setMsg(null);
    if (password.length < 8) {
      setError("رمز عبور باید حداقل ۸ کاراکتر باشد.");
      return;
    }
    if (password !== confirmPwd) {
      setError("رمز عبور و تکرار آن یکسان نیستند.");
      return;
    }
    setBusy(true);
    const supa = getSupabaseBrowserClient();
    const { error: updateError } = await supa.auth.updateUser({ password });
    setBusy(false);
    if (updateError) {
      setError("تغییر رمز ناموفق بود: " + updateError.message);
    } else {
      setMsg("رمز عبور با موفقیت تغییر کرد.");
      setPassword("");
      setConfirmPwd("");
      fetch("/api/activity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "password_changed" }),
      }).catch(() => {});
    }
  }

  async function signOutAll() {
    if (!confirm("از همه دستگاه‌ها خارج می‌شوید؟")) return;
    const supa = getSupabaseBrowserClient();
    await supa.auth.signOut({ scope: "global" });
    window.location.href = "/";
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-black text-white">امنیت</h1>
        <p className="mt-1 text-xs text-mist-400">مدیریت رمز عبور، نشست‌ها و فعالیت‌های امنیتی.</p>
      </div>

      {/* change password */}
      <section className="card space-y-4 p-6">
        <h2 className="text-sm font-bold text-white">تغییر رمز عبور</h2>
        {error && <div className="rounded-2xl border border-white/15 bg-white/[0.06] px-4 py-3 text-xs text-white">{error}</div>}
        {msg && <div className="flex items-center gap-2 rounded-2xl border border-white/15 bg-white/[0.06] px-4 py-3 text-xs text-white"><Icon name="check" size={13} /> {msg}</div>}
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="رمز عبور جدید (حداقل ۸ کاراکتر)"
          dir="ltr"
          className="input-dark w-full"
        />
        <input
          type="password"
          value={confirmPwd}
          onChange={(e) => setConfirmPwd(e.target.value)}
          placeholder="تکرار رمز عبور جدید"
          dir="ltr"
          className="input-dark w-full"
        />
        <button onClick={changePassword} disabled={busy} className="btn-primary !rounded-full !px-5 !py-2 !text-xs disabled:opacity-40">
          {busy ? "در حال تغییر…" : "تغییر رمز عبور"}
        </button>
      </section>

      {/* sessions */}
      <section className="card p-6">
        <h2 className="text-sm font-bold text-white">نشست‌های فعال</h2>
        <p className="mt-1 text-[10px] text-mist-400">دستگاه‌هایی که الان وارد حساب شما هستند.</p>
        <div className="mt-4 space-y-2">
          {sessions.map((s) => (
            <div key={s.id} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
              <div>
                <p className="text-xs font-bold text-white">این دستگاه</p>
                <p className="mt-0.5 truncate text-[10px] text-mist-400" dir="ltr">{s.userAgent ?? "—"}</p>
                {s.createdAt && (
                  <p className="mt-0.5 text-[10px] text-mist-400">آخرین ورود: {new Date(s.createdAt).toLocaleString("fa-IR")}</p>
                )}
              </div>
              <span className="badge !text-[10px]">فعال</span>
            </div>
          ))}
        </div>
        <button onClick={signOutAll} className="mt-5 flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-xs text-white transition hover:bg-white hover:text-black">
          <Icon name="arrow-left" size={13} />
          خروج از همه دستگاه‌ها
        </button>
      </section>

      {/* recent security activity */}
      <RecentSecurity />
    </div>
  );
}

function RecentSecurity() {
  const [items, setItems] = useState<Array<{ id: string; event: string; detail: string | null; created_at: string }>>([]);

  useEffect(() => {
    fetch("/api/activity")
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setItems((d.activity as typeof items).filter((a) =>
            ["password_changed", "login", "logout", "api_key_created", "api_key_revoked"].includes(a.event)
          ));
        }
      })
      .catch(() => {});
  }, []);

  if (items.length === 0) return null;

  return (
    <section className="card p-6">
      <h2 className="text-sm font-bold text-white">فعالیت‌های امنیتی اخیر</h2>
      <div className="mt-4 space-y-2.5">
        {items.slice(0, 8).map((a) => (
          <div key={a.id} className="flex items-center justify-between text-xs">
            <span className="text-mist-200">{a.detail ?? a.event}</span>
            <span className="text-[10px] text-mist-400">{new Date(a.created_at).toLocaleString("fa-IR")}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
