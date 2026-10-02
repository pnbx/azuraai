"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { models as staticModels, vendors as staticVendors } from "@/lib/data";
import { formatToman } from "@/components/Toman";
import Icon from "@/components/Icon";
import { PLAN_LABEL_FA, type PlanId } from "@/lib/plans-config";

type SortKey = "cheap" | "expensive" | "name";

/**
 * Truth table for one price cell:
 *  - priced            → «X تومان»
 *  - premium allowance → «سهمیه پریمیوم» (capped free requests)
 *  - unpriced, in any plan → «شامل اشتراک» (billing engine charges 0)
 *  - unpriced, in no plan  → «تعرفه ثبت نشده» (locked tool/asset models)
 */
function PriceCell({
  m,
  source,
  kind,
}: {
  m: CardModel;
  source: "loading" | "live" | "static";
  kind: "in" | "out";
}) {
  const price = kind === "in" ? m.inputToman : m.outputToman;
  if (price > 0) return <span className="font-bold text-white">{formatToman(price)} تومان</span>;
  if (m.isPremiumAllowance) return <span className="font-bold text-mist-200">سهمیه پریمیوم</span>;
  if (source === "live") {
    if (m.inAnyPlan) return <span className="font-bold text-mist-200">شامل اشتراک</span>;
    if (!m.allowed) return <span className="font-bold text-mist-300">تعرفه ثبت نشده</span>;
  }
  return <span className="text-mist-400">—</span>;
}

type CardModel = {
  key: string;
  slug: string;
  name: string;
  vendor: string;
  desc: string;
  tags: string[];
  inputToman: number;
  outputToman: number;
  contextLabel: string;
  allowed: boolean;
  requiredPlan: PlanId | null;
  isPremiumAllowance: boolean;
  /** model is granted by basic/plus/scale (or premium allowance) — unpriced ⇒ included in subscription */
  inAnyPlan: boolean;
};

const tagFilters = ["همه", "اقتصادی", "پریمیوم", "استدلال", "کدنویسی", "جستجو"];

function classify(slug: string, tags: string[]): string[] {
  const t: string[] = [];
  const s = slug.toLowerCase();
  if (/mini|flash|haiku|nano|lite|small|gemma|oss|embed/.test(s)) t.push("اقتصادی");
  if (/opus|pro|max|k3|astra|fable|reasoning|reasoner/.test(s)) t.push("پریمیوم");
  if (/reason|think|o[134]|qwq/.test(s)) t.push("استدلال");
  if (/coder|code/.test(s)) t.push("کدنویسی");
  if (/sonar|search|exa|firecrawl|dataforseo/.test(s)) t.push("جستجو");
  if (t.length === 0) t.push(tags[0] ?? "چت");
  return t;
}

const VENDOR_FA: Record<string, string> = {
  openai: "OpenAI", gpt: "OpenAI", anthropic: "Anthropic", claude: "Anthropic",
  google: "Google", gemini: "Google", xai: "xAI", grok: "xAI",
  deepseek: "DeepSeek", qwen: "Qwen", alibaba: "Qwen", meta: "Meta",
  llama: "Meta", mistral: "Mistral", kimi: "Moonshot", moonshot: "Moonshot",
  minimax: "MiniMax", nvidia: "NVIDIA", nemotron: "NVIDIA", perplexity: "Perplexity",
  sonar: "Perplexity", elevenlabs: "ElevenLabs", eleven: "ElevenLabs",
};

function vendorOf(slug: string, fallback = "سایر"): string {
  const first = slug.split("-")[0].toLowerCase();
  return VENDOR_FA[first] ?? (fallback !== "سایر" ? fallback : first.toUpperCase());
}

export default function ModelsPage() {
  const [query, setQuery] = useState("");
  const [vendor, setVendor] = useState("همه");
  const [tag, setTag] = useState("همه");
  const [sort, setSort] = useState<SortKey>("cheap");
  // null = still loading · "live" = catalog from server · "static" = logged-out fallback
  const [serverModels, setServerModels] = useState<CardModel[] | null>(null);
  const [source, setSource] = useState<"loading" | "live" | "static">("loading");

  // Logged-in → full live catalog with per-user plan locks.
  // Logged-out → 401 → keep the static marketing list (no flash of wrong data).
  useEffect(() => {
    let cancelled = false;
    fetch("/api/models")
      .then(async (r) => {
        if (!r.ok) return "static" as const;
        const d = await r.json();
        if (!d?.success || !Array.isArray(d.models) || d.models.length === 0) return "static" as const;
        const mapped: CardModel[] = d.models.map(
          (m: {
            id: string;
            publicSlug: string;
            displayName: string;
            allowed?: boolean;
            requiredPlan?: PlanId | null;
            isPremiumAllowance?: boolean;
            pricing?: { in: number; out: number } | null;
          }) => ({
            key: m.id,
            slug: m.publicSlug,
            name: m.displayName,
            vendor: vendorOf(m.publicSlug),
            desc: m.displayName,
            tags: classify(m.publicSlug, []),
            inputToman: m.pricing?.in ?? 0,
            outputToman: m.pricing?.out ?? 0,
            contextLabel: "—",
            allowed: m.allowed !== false,
            requiredPlan: m.requiredPlan ?? null,
            isPremiumAllowance: m.isPremiumAllowance ?? false,
            inAnyPlan: m.allowed !== false || m.requiredPlan != null,
          })
        );
        if (cancelled) return "static" as const;
        setServerModels(mapped);
        return "live" as const;
      })
      .then((s) => {
        if (!cancelled && s) setSource(s);
      })
      .catch(() => {
        if (!cancelled) setSource("static");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const all: CardModel[] = useMemo(() => {
    if (serverModels) return serverModels;
    if (source === "loading") return []; // skeleton until real data lands
    return staticModels.map((m) => ({
      key: m.id,
      slug: m.id,
      name: m.name,
      vendor: m.vendor,
      desc: m.desc,
      tags: m.tags,
      inputToman: m.inputToman,
      outputToman: m.outputToman,
      contextLabel: m.context,
      allowed: true,
      requiredPlan: null,
      isPremiumAllowance: false,
      inAnyPlan: true,
    }));
  }, [serverModels]);

  const vendors = useMemo(() => {
    const set = new Set(all.map((m) => m.vendor));
    return ["همه", ...(serverModels ? [...set].sort() : staticVendors)];
  }, [all, serverModels]);

  const filtered = useMemo(() => {
    let list = all.filter((m) => {
      const q = query.trim().toLowerCase();
      const matchQ = !q || m.name.toLowerCase().includes(q) || m.slug.toLowerCase().includes(q);
      const matchVendor = vendor === "همه" || m.vendor === vendor;
      const matchTag = tag === "همه" || m.tags.includes(tag);
      return matchQ && matchVendor && matchTag;
    });

    list = [...list].sort((a, b) => {
      switch (sort) {
        case "cheap":
          return a.inputToman - b.inputToman;
        case "expensive":
          return b.inputToman - a.inputToman;
        case "name":
          return a.name.localeCompare(b.name);
      }
    });

    return list;
  }, [all, query, vendor, tag, sort]);

  return (
    <div className="container-site py-16">
      <div className="text-center">
        <span className="badge">
          <Icon name="spark" size={13} />
          مدل‌ها
        </span>
        <h1 className="section-title mt-5">فهرست کامل مدل‌های هوش مصنوعی.</h1>
        <p className="section-sub mx-auto">
          {source === "loading"
            ? "در حال دریافت فهرست مدل‌ها…"
            : all.length > 0
              ? `${all.length.toLocaleString("fa-IR")} مدل`
              : "همه مدل‌های معروف دنیا"}{" "}
          با یک کلید Azura و قیمت تومانی. مدل‌های قفل‌شده با اشتراک پلاس یا سازمانی باز می‌شوند.
        </p>
      </div>

      {/* Controls */}
      <div className="mt-10 flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="جستجوی مدل…"
            className="w-full rounded-2xl border border-white/10 bg-ink-900 py-2.5 pe-11 ps-4 text-sm text-white placeholder:text-mist-400 transition-colors duration-300 focus:border-white/40 focus:outline-none"
          />
          <span className="pointer-events-none absolute end-4 top-1/2 -translate-y-1/2 text-mist-400">
            <Icon name="search" size={16} />
          </span>
        </div>
        <select
          value={vendor}
          onChange={(e) => setVendor(e.target.value)}
          className="rounded-2xl border border-white/10 bg-ink-900 px-4 py-2.5 text-sm text-white transition-colors duration-300 focus:border-white/40 focus:outline-none"
        >
          {vendors.map((v) => (
            <option key={v} value={v} className="bg-ink-900">
              {v}
            </option>
          ))}
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="rounded-2xl border border-white/10 bg-ink-900 px-4 py-2.5 text-sm text-white transition-colors duration-300 focus:border-white/40 focus:outline-none"
        >
          <option value="cheap" className="bg-ink-900">ارزان‌ترین</option>
          <option value="expensive" className="bg-ink-900">گران‌ترین</option>
          <option value="name" className="bg-ink-900">حروف الفبا</option>
        </select>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {tagFilters.map((t) => (
          <button
            key={t}
            onClick={() => setTag(t)}
            className={`rounded-full px-4 py-1.5 text-xs font-medium transition-all duration-300 ease-smooth ${
              tag === t
                ? "bg-white text-black"
                : "border border-white/10 bg-white/[0.04] text-mist-300 hover:border-white/30 hover:text-white"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((m) => (
          <div key={m.key} className="card card-hover flex flex-col p-6">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate text-sm font-black text-white" dir="auto">{m.name}</h3>
                <p className="mt-1 text-xs text-mist-400">{m.vendor}</p>
              </div>
              {m.allowed ? (
                m.isPremiumAllowance ? (
                  <span className="shrink-0 rounded-full border border-white/15 bg-white/[0.06] px-2.5 py-0.5 text-[10px] font-bold text-white">
                    سهمیه پریمیوم
                  </span>
                ) : null
              ) : (
                <span className="flex shrink-0 items-center gap-1 rounded-full border border-white/15 bg-white/[0.06] px-2.5 py-0.5 text-[10px] font-bold text-mist-200">
                  <Icon name="lock" size={10} />
                  {m.requiredPlan ? PLAN_LABEL_FA[m.requiredPlan] : "پریمیوم"}
                </span>
              )}
            </div>

            <p className="mt-3 flex-1 truncate-2 text-xs leading-6 text-mist-400" dir="ltr">
              {m.slug}
            </p>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {m.tags.map((t) => (
                <span key={t} className="rounded-full bg-white/[0.05] px-2.5 py-0.5 text-[10px] text-mist-300">
                  {t}
                </span>
              ))}
            </div>

            <div className="mt-4 space-y-1.5 rounded-2xl border border-white/5 bg-black p-3.5 text-xs">
              <div className="flex justify-between">
                <span className="text-mist-400">ورودی / میلیون توکن</span>
                <PriceCell m={m} source={source} kind="in" />
              </div>
              <div className="flex justify-between">
                <span className="text-mist-400">خروجی / میلیون توکن</span>
                <PriceCell m={m} source={source} kind="out" />
              </div>
              {m.contextLabel !== "—" && (
                <div className="flex justify-between border-t border-white/5 pt-1.5">
                  <span className="text-mist-400">طول کارتان</span>
                  <span className="text-mist-200">{m.contextLabel}</span>
                </div>
              )}
            </div>

            {m.allowed ? (
              <Link
                href={`/chat?model=${encodeURIComponent(m.slug)}`}
                className="btn-primary mt-5 w-full !py-2.5 !text-xs"
              >
                چت با این مدل
              </Link>
            ) : (
              <Link href="/account/subscription" className="btn-ghost mt-5 w-full !py-2.5 !text-xs">
                <Icon name="lock" size={12} className="me-1.5 inline" />
                باز شدن با اشتراک {m.requiredPlan ? PLAN_LABEL_FA[m.requiredPlan] : "پریمیوم"}
              </Link>
            )}
          </div>
        ))}
      </div>

      {source !== "loading" && filtered.length === 0 && (
        <div className="mt-16 text-center text-sm text-mist-400">
          مدلی با این مشخصات پیدا نشد.
        </div>
      )}
    </div>
  );
}
