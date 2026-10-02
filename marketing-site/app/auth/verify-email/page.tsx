"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Icon from "@/components/Icon";
import LogoMark from "@/components/LogoMark";

/**
 * "Check your inbox" screen shown right after signup.
 *
 * Resend goes through /api/auth/resend-verification (anti-enumeration +
 * fresh one-time code, 60s client cooldown). After confirming — usually
 * on the same device — the login page is pre-filled via ?email=.
 */
function VerifyInner() {
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    setEmail(params.get("email") ?? "");
  }, [params]);

  // Resend cooldown ticker
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => c - 1), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  async function resend() {
    if (cooldown > 0 || !email) return;
    setResending(true);
    try {
      await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setResent(true);
      setCooldown(60);
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="hero-glow flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-white shadow-glow">
          <LogoMark size={30} variant="black" />
        </span>
        <h1 className="mt-5 text-2xl font-black text-white">ایمیلت را چک کن</h1>
        <p className="mt-2 text-sm leading-7 text-mist-400">
          لینک تأیید به <span className="text-white" dir="ltr">{email || "ایمیل شما"}</span> ارسال شد.
          <br />
          روی لینک ایمیل بزنید تا حسابتان فعال شود.
        </p>

        <div className="card mt-8 space-y-4 p-6">
          <button
            onClick={resend}
            disabled={resending || cooldown > 0 || !email}
            className="btn-ghost w-full disabled:opacity-50"
          >
            {resending
              ? "در حال ارسال…"
              : cooldown > 0
                ? `ارسال مجدد تا ${cooldown} ثانیه دیگر`
                : resent
                  ? "ارسال مجدد لینک تأیید"
                  : "ایمیل نرسید؟ ارسال مجدد"}
          </button>
          <p className="text-[11px] leading-6 text-mist-400">
            ایمیل را در اسپم هم چک کنید. آدرس اشتباه وارد کرده‌اید؟{" "}
            <Link href="/auth/signup" className="text-white hover:underline">
              ثبت‌نام مجدد
            </Link>
          </p>
        </div>

        <p className="mt-6 text-[11px] text-mist-400">
          لینک را روی همین دستگاه باز کرده‌اید؟{" "}
          <Link
            href={`/auth/login?email=${encodeURIComponent(email)}`}
            className="text-white hover:underline"
          >
            بعد از تأیید وارد شوید
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="py-32 text-center text-sm text-mist-400">…</div>}>
      <VerifyInner />
    </Suspense>
  );
}
