"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import type { ConversationItem } from "./Sidebar";

type Action = { id: string; label: string; hint?: string; run: () => void };

export default function CommandPalette({
  open,
  onClose,
  conversations,
  onSelectConversation,
  onNewChat,
}: {
  open: boolean;
  onClose: () => void;
  conversations: ConversationItem[];
  onSelectConversation: (id: string) => void;
  onNewChat: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (open) setQuery("");
  }, [open]);

  const actions = useMemo<Action[]>(() => {
    const q = query.trim().toLowerCase();
    const list: Action[] = [
      { id: "new", label: "گفتگوی جدید", hint: "N", run: () => { onNewChat(); onClose(); } },
      { id: "account", label: "حساب کاربری", run: () => { router.push("/account"); onClose(); } },
      { id: "models", label: "فهرست مدل‌ها", run: () => { router.push("/models"); onClose(); } },
      { id: "keys", label: "کلیدهای API", run: () => { router.push("/account/api-keys"); onClose(); } },
      { id: "wallet", label: "کیف پول", run: () => { router.push("/account/wallet"); onClose(); } },
      { id: "usage", label: "مصرف", run: () => { router.push("/account/usage"); onClose(); } },
      { id: "settings", label: "تنظیمات", run: () => { router.push("/account/settings"); onClose(); } },
    ];
    const convos: Action[] = conversations.slice(0, 30).map((c) => ({
      id: c.id,
      label: c.title,
      hint: "گفتگو",
      run: () => { onSelectConversation(c.id); onClose(); },
    }));
    const all = [...list, ...convos];
    if (!q) return all.slice(0, 12);
    return all.filter((a) => a.label.toLowerCase().includes(q)).slice(0, 12);
  }, [query, conversations, router, onClose, onNewChat, onSelectConversation]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        open ? onClose() : window.dispatchEvent(new CustomEvent("open-command-palette"));
      }
      if (e.key === "Escape" && open) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-black/70 p-4 pt-24 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-lg animate-fade-up rounded-3xl border border-white/10 bg-ink-900 p-2 shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="جستجوی دستور یا گفتگو…"
            autoFocus
            className="input-dark w-full !rounded-2xl !border-white/15 !py-3"
          />
          <span className="pointer-events-none absolute end-4 top-1/2 -translate-y-1/2 text-mist-400">
            <Icon name="search" size={15} />
          </span>
        </div>
        <div className="mt-2 max-h-80 space-y-0.5 overflow-y-auto">
          {actions.map((a) => (
            <button
              key={a.id}
              onClick={a.run}
              className="flex w-full items-center justify-between rounded-2xl px-4 py-2.5 text-start text-xs text-mist-200 transition hover:bg-white/[0.06] hover:text-white"
            >
              {a.label}
              {a.hint && <span className="text-[9px] text-mist-400">{a.hint}</span>}
            </button>
          ))}
          {actions.length === 0 && <p className="py-8 text-center text-xs text-mist-400">نتیجه‌ای پیدا نشد.</p>}
        </div>
        <p className="border-t border-white/5 px-4 py-2 text-[9px] text-mist-400">
          Ctrl+K برای باز/بستن · Esc برای خروج
        </p>
      </div>
    </div>
  );
}
