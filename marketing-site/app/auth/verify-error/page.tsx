"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Icon from "@/components/Icon";
import LogoMark from "@/components/LogoMark";

/**
 * Friendly screen for expired / already-used / invalid confirmation links.
 * Offers resend (via the anti-enumeration API) and signup recovery.
 */
function VerifyErrorInner() {
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    setEmail(params.get("email") ?? "");
  }, [params]);

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
        <div className="mx-auto mt-6 flex h-14 w-14 items-center justify-center rounded-full border border-amber-400/40 bg-amber-400/10">
          <Icon name="spark" size={24} className="text-amber-300" />
        </div>
        <h1 className="mt-5 text-2xl font-black text-white">لینک تأیید معتبر نیست</h1>
        <p className="mt-2 text-sm leading-7 text-mist-400">
          این لینک منقضی شده یا قبلاً استفاده شده است.
          {email ? " می‌توانید لینک جدید بگیرید." : ""}
        </p>

        <div className="card mt-8 space-y-4 p-6">
          {email ? (
            <>
              <button
                onClick={resend}
                disabled={resending || cooldown > 0}
                className="btn-primary w-full disabled:opacity-50"
              >
                {resending
                  ? "در حال ارسال…"
                  : cooldown > 0
                    ? `ارسال مجدد تا ${cooldown} ثانیه دیگر`
                    : resent
                      ? "لینک جدید ارسال شد ✓"
                      : "ارسال لینک تأیید جدید"}
              </button>
              <p className="text-[11px] text-mist-400">
                ایمیل اشتباه است؟{" "}
                <Link href="/auth/signup" className="text-white hover:underline">
                  با ایمیل درست ثبت‌نام کنید
                </Link>
              </p>
            </>
          ) : (
            <>
              <Link href="/auth/signup" className="btn-primary w-full">
                ثبت‌نام مجدد
                <Icon name="arrow-left" size={15} />
              </Link>
              <Link
                href="/auth/login"
                className="block text-[11px] text-mist-400 hover:text-white hover:underline"
              >
                از قبل حساب دارید؟ وارد شوید
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function VerifyErrorPage() {
  return (
    <Suspense fallback={<div className="py-32 text-center text-sm text-mist-400">…</div>}>
      <VerifyErrorInner />
    </Suspense>
  );
}
