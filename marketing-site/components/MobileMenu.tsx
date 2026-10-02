"use client";

import Link from "next/link";
import { useState } from "react";
import { navLinks } from "@/lib/data";
import Icon from "@/components/Icon";

export default function MobileMenu() {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative md:hidden">
      <button
        aria-label="منو"
        onClick={() => setOpen((v) => !v)}
        className="btn-ghost !rounded-2xl !p-2.5"
      >
        <Icon name={open ? "close" : "menu"} size={18} />
      </button>

      {open && (
        <div className="absolute end-0 top-12 z-50 w-48 rounded-2xl border border-white/10 bg-ink-850 p-2 shadow-card">
          {navLinks.map((l) => (
            <Link
              key={l.label}
              href={l.href}
              onClick={() => setOpen(false)}
              className="block rounded-lg px-3 py-2 text-sm font-medium text-slate-200 hover:bg-white/5"
            >
              {l.label}
            </Link>
          ))}
          <div className="my-1 border-t border-white/5 sm:hidden" />
          <Link
            href="/account"
            onClick={() => setOpen(false)}
            className="block rounded-lg px-3 py-2 text-sm font-medium text-slate-200 hover:bg-white/5 sm:hidden"
          >
            حساب کاربری / ورود
          </Link>
        </div>
      )}
    </div>
  );
}
