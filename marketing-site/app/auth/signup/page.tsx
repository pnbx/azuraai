"use client";

import { Suspense, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Icon from "@/components/Icon";
import LogoMark from "@/components/LogoMark";

function SignupInner() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("رمز عبور و تکرار آن یکسان نیستند.");
      return;
    }
    if (password.length < 8) {
      setError("رمز عبور باید حداقل ۸ کاراکتر باشد.");
      return;
    }
    setLoading(true);
    try {
      // Server-side signup: returns needsEmailVerification when the
      // confirmation email is on its way (new-signup email verification).
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, fullName: "" }),
      });
      const d = await res.json();
      if (!d.success) {
        setError(
          typeof d.error === "string" && d.error.includes("already registered")
            ? "این ایمیل قبلاً ثبت شده است. وارد شوید."
            : d.error ?? "ثبت‌نام ناموفق بود."
        );
        setLoading(false);
        return;
      }
      if (d.needsEmailVerification) {
        // New flow: confirm your email first
        router.push(`/auth/verify-email?email=${encodeURIComponent(email)}`);
        router.refresh();
        return;
      }
      // Auto-confirmed (verification disabled / dev mode)
      router.push("/chat");
      router.refresh();
    } catch {
      setError("خطا در برقراری ارتباط با سرور.");
      setLoading(false);
    }
  }

  return (
    <div className="hero-glow flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <div className="text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-white text-xl font-black text-black shadow-glow">
            <LogoMark size={30} variant="black" />
          </span>
          <h1 className="mt-5 text-2xl font-black text-white">ساخت حساب Azura AI</h1>
          <p className="mt-2 text-sm text-mist-400">
            قبلاً ثبت‌نام کرده‌اید؟{" "}
            <Link href="/auth/login" className="text-white hover:underline">
              وارد شوید
            </Link>
          </p>
        </div>

        <form onSubmit={submit} className="card mt-8 space-y-4 p-6">
          {error && (
            <div className="rounded-2xl border border-white/15 bg-white/[0.06] px-4 py-3 text-xs leading-6 text-white">
              {error}
            </div>
          )}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-mist-300">ایمیل</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="input-dark w-full"
              dir="ltr"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-mist-300">رمز عبور</label>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="حداقل ۸ کاراکتر"
              className="input-dark w-full"
              dir="ltr"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-mist-300">تکرار رمز عبور</label>
            <input
              type="password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="••••••••"
              className="input-dark w-full"
              dir="ltr"
            />
          </div>
          <button type="submit" disabled={loading} className="btn-primary w-full disabled:opacity-50">
            {loading ? "در حال ساخت حساب…" : "ساخت حساب رایگان"}
            {!loading && <Icon name="arrow-left" size={15} />}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={<div className="py-32 text-center text-sm text-mist-400">…</div>}>
      <SignupInner />
    </Suspense>
  );
}
