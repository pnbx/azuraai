"use client";

import { useEffect, useRef, useState } from "react";
import Icon from "@/components/Icon";
import { PLAN_LABEL_FA, type PlanId } from "@/lib/plans-config";

export type CatalogModel = {
  publicSlug: string;
  displayName: string;
  capabilities: string[];
  inputTomanPerM?: number | null;
  outputTomanPerM?: number | null;
  speed?: "fast" | "balanced" | "slow";
  /** Server-resolved: can the current user run this model? */
  allowed?: boolean;
  /** Minimum plan that grants access (shown on the lock badge). */
  requiredPlan?: PlanId | null;
  /** Access is via a capped monthly premium allowance. */
  isPremiumAllowance?: boolean;
  /** Legacy free-tier flag (used when allowed is not provided). */
  premium?: boolean;
};

const SPEED_LABEL: Record<string, string> = {
  fast: "سریع",
  balanced: "متعادل",
  slow: "دقیق",
};

export default function ModelPicker({
  models,
  value,
  onChange,
  disabled = false,
}: {
  models: CatalogModel[];
  value: string;
  onChange: (slug: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const isLocked = (m: CatalogModel) =>
    m.allowed === false || (m.allowed === undefined && m.premium === true);

  const current = models.find((m) => m.publicSlug === value);
  const filtered = models.filter(
    (m) =>
      m.displayName.toLowerCase().includes(query.toLowerCase()) ||
      m.publicSlug.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1.5 text-xs font-bold text-white transition hover:border-white/25 disabled:opacity-50"
      >
        {current && isLocked(current) && <Icon name="lock" size={12} className="text-mist-400" />}
        <span dir="ltr">{current?.displayName ?? value}</span>
        <Icon name="chevron-down" size={13} />
      </button>

      {open && (
        <div className="absolute end-0 top-10 z-50 w-80 rounded-3xl border border-white/10 bg-ink-900 p-2 shadow-card">
          <div className="relative mb-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="جستجوی مدل…"
              className="input-dark w-full !rounded-2xl !py-2 !text-xs"
              autoFocus
            />
            <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-mist-400">
              <Icon name="search" size={13} />
            </span>
          </div>
          <div className="max-h-80 space-y-0.5 overflow-y-auto">
            {filtered.map((m) => {
              const selected = m.publicSlug === value;
              const locked = isLocked(m);
              return (
                <button
                  key={m.publicSlug}
                  onClick={() => {
                    if (locked) return; // locked — never send
                    onChange(m.publicSlug);
                    setOpen(false);
                  }}
                  title={locked && m.requiredPlan ? `نیازمند پلن ${PLAN_LABEL_FA[m.requiredPlan]}` : undefined}
                  className={`flex w-full items-center gap-2.5 rounded-2xl px-3 py-2.5 text-start transition ${
                    selected
                      ? "bg-white/[0.08]"
                      : locked
                        ? "cursor-not-allowed opacity-55"
                        : "hover:bg-white/[0.05]"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-xs font-bold ${locked ? "text-mist-300" : "text-white"}`} dir="ltr">
                        {m.displayName}
                      </span>
                      {locked ? (
                        <span className="flex shrink-0 items-center gap-1 rounded-full border border-white/15 bg-white/[0.06] px-2 py-0.5 text-[9px] font-bold text-mist-200">
                          <Icon name="lock" size={9} />
                          {m.requiredPlan ? PLAN_LABEL_FA[m.requiredPlan] : "پریمیوم"}
                        </span>
                      ) : m.isPremiumAllowance ? (
                        <span className="shrink-0 rounded-full border border-white/15 bg-white/[0.06] px-2 py-0.5 text-[9px] text-mist-300">
                          سهمیه پریمیوم
                        </span>
                      ) : m.speed ? (
                        <span className="shrink-0 rounded-full bg-white/[0.07] px-2 py-0.5 text-[9px] text-mist-300">
                          {SPEED_LABEL[m.speed]}
                        </span>
                      ) : null}
                    </div>
                    {!locked && (
                      <div className="mt-1 text-[9px] text-mist-400" dir="ltr">
                        {m.inputTomanPerM != null
                          ? `in ${m.inputTomanPerM.toLocaleString("fa-IR")} / out ${m.outputTomanPerM?.toLocaleString("fa-IR")} تومان/1M`
                          : "بدون تعرفه — شامل اشتراک"}
                      </div>
                    )}
                  </div>
                  {selected && <Icon name="check" size={13} className="shrink-0 text-white" />}
                </button>
              );
            })}
            {filtered.length === 0 && (
              <p className="py-6 text-center text-xs text-mist-400">مدلی پیدا نشد.</p>
            )}
          </div>
          <p className="border-t border-white/5 px-3 pb-1 pt-2 text-[9px] leading-5 text-mist-400">
            مدل‌های قفل‌شده با ارتقای اشتراک باز می‌شوند.
          </p>
        </div>
      )}
    </div>
  );
}
