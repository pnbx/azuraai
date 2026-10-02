"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Icon from "@/components/Icon";
import LogoMark from "@/components/LogoMark";

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const redirect = params.get("redirect") ?? "/chat";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Coming from /auth/verify-email: pre-fill the confirmed address
  useEffect(() => {
    const prefill = params.get("email");
    if (prefill) setEmail(prefill);
  }, [params]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { createBrowserClient } = await import("@supabase/ssr");
      const supa = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
      const { error } = await supa.auth.signInWithPassword({ email, password });
      if (error) {
        setError(
          error.message === "Invalid login credentials"
            ? "ایمیل یا رمز عبور اشتباه است."
            : error.message === "Email not confirmed"
              ? "ایمیل شما هنوز تأیید نشده — لینک ارسال‌شده را باز کنید."
              : error.message
        );
        setLoading(false);
        return;
      }
      router.push(redirect);
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
          <h1 className="mt-5 text-2xl font-black text-white">ورود به Azura AI</h1>
          <p className="mt-2 text-sm text-mist-400">
            حساب ندارید؟{" "}
            <Link href="/auth/signup" className="text-white hover:underline">
              ثبت‌نام کنید
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
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="input-dark w-full"
              dir="ltr"
            />
          </div>
          <button type="submit" disabled={loading} className="btn-primary w-full disabled:opacity-50">
            {loading ? "در حال ورود…" : "ورود"}
            {!loading && <Icon name="arrow-left" size={15} />}
          </button>
          <p className="text-center text-[11px] leading-6 text-mist-400">
            با ورود، <Link href="/" className="text-white hover:underline">شرایط استفاده</Link> و{" "}
            <Link href="/" className="text-white hover:underline">حریم خصوصی</Link> Azura AI را می‌پذیرید.
          </p>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="py-32 text-center text-sm text-mist-400">…</div>}>
      <LoginInner />
    </Suspense>
  );
}
