"use client";

import { useEffect, useState } from "react";
import Icon from "@/components/Icon";

type Settings = Record<string, unknown> & {
  language?: string;
  timezone?: string;
  appearance?: string;
  default_model?: string | null;
  response_style?: string | null;
  custom_instructions?: string | null;
  memory_enabled?: boolean;
  web_search_default?: boolean;
  auto_model?: boolean;
};

const TIMEZONES = ["Asia/Tehran", "Asia/Dubai", "Europe/Berlin", "Europe/London", "America/New_York"];
const RESPONSE_STYLES = [
  { value: "", label: "پیش‌فرض" },
  { value: "concise", label: "کوتاه و دقیق" },
  { value: "detailed", label: "مفصل و آموزشی" },
  { value: "friendly", label: "صمیمی" },
  { value: "professional", label: "رسمی" },
];

export default function SettingsPage() {
  const [s, setS] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [models, setModels] = useState<Array<{ publicSlug: string; displayName: string }>>([]);

  useEffect(() => {
    fetch("/api/settings").then((r) => r.json()).then((d) => d.success && setS(d.settings));
    fetch("/api/models").then((r) => r.json()).then((d) => {
      if (d.success) setModels(d.models.map((m: { publicSlug: string; displayName: string }) => m));
    });
  }, []);

  async function save(update: Partial<Settings>) {
    setSaving(true);
    const next = { ...s, ...update };
    setS(next);
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(update),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (!s) return <div className="h-64 animate-pulse rounded-3xl bg-white/5" />;

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-white">تنظیمات</h1>
          <p className="mt-1 text-xs text-mist-400">تنظیمات کلی و ترجیحات هوش مصنوعی.</p>
        </div>
        {saved && <span className="flex items-center gap-1 text-[11px] text-white"><Icon name="check" size={12} /> ذخیره شد</span>}
        {saving && <span className="text-[11px] text-mist-400">در حال ذخیره…</span>}
      </div>

      {/* General */}
      <section className="card space-y-5 p-6">
        <h2 className="text-sm font-bold text-white">عمومی</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-mist-300">زبان</label>
            <select
              value={s.language ?? "fa"}
              onChange={(e) => save({ language: e.target.value })}
              className="input-dark w-full"
            >
              <option value="fa">فارسی</option>
              <option value="en">English</option>
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-mist-300">منطقه زمانی</label>
            <select
              value={s.timezone ?? "Asia/Tehran"}
              onChange={(e) => save({ timezone: e.target.value })}
              className="input-dark w-full"
              dir="ltr"
            >
              {TIMEZONES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>
      </section>

      {/* AI preferences */}
      <section className="card space-y-5 p-6">
        <h2 className="text-sm font-bold text-white">ترجیحات هوش مصنوعی</h2>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-mist-300">مدل پیش‌فرض چت</label>
          <select
            value={s.default_model ?? ""}
            onChange={(e) => save({ default_model: e.target.value || null })}
            className="input-dark w-full"
            dir="ltr"
          >
            <option value="">انتخاب نکنم (خودکار)</option>
            {models.map((m) => (
              <option key={m.publicSlug} value={m.publicSlug}>{m.displayName}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-mist-300">سبک پاسخ‌دهی</label>
          <select
            value={s.response_style ?? ""}
            onChange={(e) => save({ response_style: e.target.value || null })}
            className="input-dark w-full"
          >
            {RESPONSE_STYLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-mist-300">دستورالعمل سفارشی</label>
          <textarea
            value={s.custom_instructions ?? ""}
            onChange={(e) => setS({ ...s, custom_instructions: e.target.value })}
            onBlur={() => save({ custom_instructions: s.custom_instructions })}
            rows={4}
            placeholder="مثلاً: همیشه فارسی جواب بده، لحن حرفه‌ای داشته باش…"
            className="input-dark w-full resize-none leading-7"
          />
          <p className="mt-1.5 text-[10px] text-mist-400">این متن به همه گفتگوها اضافه می‌شود (خارج از چت موقت).</p>
        </div>

        <Toggle
          label="انتخاب خودکار مدل"
          desc="Azura بسته به نوع کار، مناسب‌ترین مدل را انتخاب کند."
          value={s.auto_model ?? true}
          onChange={(v) => save({ auto_model: v })}
        />
        <Toggle
          label="جستجوی وب به‌صورت پیش‌فرض"
          desc="در هر گفتگوی جدید، جستجوی وب روشن باشد."
          value={s.web_search_default ?? false}
          onChange={(v) => save({ web_search_default: v })}
        />
      </section>

      {/* Memory */}
      <section className="card space-y-3 p-6">
        <h2 className="text-sm font-bold text-white">حافظه</h2>
        <Toggle
          label="حافظه فعال باشد"
          desc="Azura نکات مهم گفتگوها را یاد بگیرد و در پاسخ‌های بعدی به کار ببرد."
          value={s.memory_enabled ?? true}
          onChange={(v) => save({ memory_enabled: v })}
        />
        <a href="/account/data" className="flex items-center gap-1.5 text-[11px] text-white hover:underline">
          <Icon name="shield" size={12} />
          مدیریت و حذف خاطره‌ها
        </a>
      </section>
    </div>
  );
}

function Toggle({ label, desc, value, onChange }: { label: string; desc: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-xs font-bold text-white">{label}</p>
        <p className="mt-1 text-[10px] leading-5 text-mist-400">{desc}</p>
      </div>
      <button
        onClick={() => onChange(!value)}
        className={`h-5 w-9 shrink-0 rounded-full p-0.5 transition-colors duration-300 ${value ? "bg-white" : "bg-white/15"}`}
        aria-pressed={value}
      >
        <span className={`block h-4 w-4 rounded-full bg-black transition-transform duration-300 ${value ? "-translate-x-4" : ""}`} />
      </button>
    </div>
  );
}
