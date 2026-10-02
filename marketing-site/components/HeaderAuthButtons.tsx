"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

export function HeaderAuthButtons() {
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);

  useEffect(() => {
    const supa = getSupabaseBrowserClient();
    supa.auth
      .getUser()
      .then(({ data }: { data: { user: unknown | null } }) => setLoggedIn(!!data.user));
    const {
      data: { subscription },
    } = supa.auth.onAuthStateChange((_e: string, session: { user: unknown } | null) =>
      setLoggedIn(!!session)
    );
    return () => subscription.unsubscribe();
  }, []);

  if (loggedIn === null) return <span className="h-8 w-16 animate-pulse rounded-full bg-white/5" />;

  if (loggedIn) {
    return (
      <Link
        href="/account"
        className="rounded-full border border-white/15 bg-white/[0.04] px-4 py-2 text-xs font-semibold text-white transition hover:border-white/30"
      >
        حساب من
      </Link>
    );
  }

  return (
    <Link
      href="/auth/login"
      className="rounded-full border border-white/15 bg-white/[0.04] px-4 py-2 text-xs font-semibold text-white transition hover:border-white/30"
    >
      ورود
    </Link>
  );
}
