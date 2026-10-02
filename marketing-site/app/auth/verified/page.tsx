"use client";

import Link from "next/link";
import Icon from "@/components/Icon";
import LogoMark from "@/components/LogoMark";

/**
 * Green "email confirmed" landing page after the user clicks the
 * confirmation link. The PKCE callback already exchanged the code for a
 * session on this device, so "ورود به چت" goes straight in.
 */
export default function VerifiedPage() {
  return (
    <div className="hero-glow flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-white shadow-glow">
          <LogoMark size={30} variant="black" />
        </span>
        <div className="mx-auto mt-6 flex h-14 w-14 items-center justify-center rounded-full border border-emerald-400/40 bg-emerald-400/10">
          <Icon name="check" size={26} className="text-emerald-300" />
        </div>
        <h1 className="mt-5 text-2xl font-black text-white">ایمیل شما تأیید شد!</h1>
        <p className="mt-2 text-sm leading-7 text-mist-400">
          حسابتان فعال است. خوش آمدید به Azura AI 🎉
        </p>
        <div className="card mt-8 space-y-3 p-6">
          <Link href="/chat" className="btn-primary w-full">
            رفتن به چت
            <Icon name="arrow-left" size={15} />
          </Link>
          <Link
            href="/account/wallet"
            className="block text-[11px] text-mist-400 hover:text-white hover:underline"
          >
            شارژ کیف پول و مشاهده پلن‌ها
          </Link>
        </div>
      </div>
    </div>
  );
}
