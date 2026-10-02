"use client";

import { useEffect, useState } from "react";
import Icon from "@/components/Icon";

type Notif = { id: string; type: string; title: string; body: string | null; read: boolean; created_at: string };

const TYPE_ICON: Record<string, Parameters<typeof Icon>[0]["name"]> = {
  system: "spark",
  security: "lock",
  wallet: "key",
  api_key: "key",
  usage: "chart",
  account: "shield",
};

export default function NotificationsPage() {
  const [items, setItems] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);

  function load() {
    fetch("/api/notifications")
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setItems(d.notifications);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }

  useEffect(load, []);

  async function markRead(id?: string) {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(id ? { id } : { all: true }),
    });
    load();
  }

  if (loading) return <div className="h-64 animate-pulse rounded-3xl bg-white/5" />;

  const unread = items.filter((n) => !n.read).length;

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-white">اعلان‌ها</h1>
          <p className="mt-1 text-xs text-mist-400">
            {unread > 0 ? `${unread.toLocaleString("fa-IR")} اعلان خوانده‌نشده` : "همه اعلان‌ها خوانده شده‌اند"}
          </p>
        </div>
        {unread > 0 && (
          <button onClick={() => markRead()} className="btn-ghost !rounded-full !px-4 !py-2 !text-[11px]">
            خواندن همه
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="card p-12 text-center text-xs text-mist-400">اعلانی ندارید.</div>
      ) : (
        <div className="space-y-2">
          {items.map((n) => (
            <button
              key={n.id}
              onClick={() => !n.read && markRead(n.id)}
              className={`card card-hover flex w-full items-start gap-3 p-5 text-start ${!n.read ? "!border-white/25" : ""}`}
            >
              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-2xl ${n.read ? "bg-white/[0.05] text-mist-400" : "bg-white text-black"}`}>
                <Icon name={TYPE_ICON[n.type] ?? "spark"} size={15} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className={`text-xs ${n.read ? "text-mist-200" : "font-black text-white"}`}>{n.title}</span>
                  <span className="shrink-0 text-[9px] text-mist-400">{new Date(n.created_at).toLocaleDateString("fa-IR")}</span>
                </span>
                {n.body && <span className="mt-1 block text-[11px] leading-6 text-mist-400">{n.body}</span>}
              </span>
              {!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-white" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
