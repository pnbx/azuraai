"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";

export default function Composer({
  value,
  onChange,
  onSend,
  onStop,
  generating,
  webSearch,
  onToggleWebSearch,
  temporary,
  balanceToman,
  quota,
  inputRef,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: (text: string) => void;
  onStop: () => void;
  generating: boolean;
  webSearch: boolean;
  onToggleWebSearch: () => void;
  temporary: boolean;
  balanceToman: number | null;
  quota: { used: number; limit: number; remaining: number } | null;
  inputRef: React.RefObject<HTMLTextAreaElement>;
}) {
  // auto-grow
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, [value, inputRef]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!generating && value.trim()) onSend(value);
    }
  }

  function startVoice() {
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!SR) {
      alert("مرورگر شما از ورودی صوتی پشتیبانی نمی‌کند.");
      return;
    }
    const rec = new SR();
    rec.lang = "fa-IR";
    rec.onresult = (e: SpeechResultEvent) => {
      const text = Array.from(e.results).map((r) => r[0].transcript).join(" ");
      onChange(value + (value ? " " : "") + text);
    };
    rec.start();
  }

  const quotaExhausted = quota != null && quota.remaining <= 0;

  return (
    <div className="border-t border-white/5 p-3 sm:p-4">
      {/* active mode chips */}
      {(webSearch || temporary) && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {webSearch && (
            <span className="badge !py-1 !text-[10px]">
              <Icon name="globe" size={11} />
              جستجوی وب فعال
            </span>
          )}
          {temporary && (
            <span className="badge !py-1 !text-[10px]">
              <Icon name="shield" size={11} />
              چت موقت — ذخیره نمی‌شود
            </span>
          )}
        </div>
      )}

      {quotaExhausted && (
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/20 bg-white/[0.06] px-4 py-3">
          <span className="text-[11px] leading-6 text-white">
            سهمیه پیام رایگان این ماه تمام شد.
          </span>
          <Link href="/#pricing" className="btn-primary !rounded-full !px-4 !py-1.5 !text-[11px]">
            ارتقای حساب
          </Link>
        </div>
      )}

      <div className="flex items-end gap-2 rounded-3xl border border-white/10 bg-ink-900 p-2 transition-colors focus-within:border-white/25">
        <button
          onClick={() => alert("بارگذاری فایل به‌زودی فعال می‌شود.")}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl text-mist-400 transition hover:bg-white/[0.06] hover:text-white sm:h-9 sm:w-9"
          title="پیوست فایل"
        >
          <Icon name="plus" size={16} />
        </button>
        <textarea
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          placeholder="پیام خود را بنویسید… (Shift+Enter برای خط جدید)"
          className="max-h-48 flex-1 resize-none bg-transparent px-2 py-2 text-base leading-7 text-white placeholder:text-mist-400 focus:outline-none sm:text-sm"
        />
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-1">
          <button
            onClick={onToggleWebSearch}
            className={`grid h-10 w-10 place-items-center rounded-2xl transition sm:h-9 sm:w-9 ${
              webSearch ? "bg-white text-black" : "text-mist-400 hover:bg-white/[0.06] hover:text-white"
            }`}
            title="جستجوی وب"
          >
            <Icon name="globe" size={16} />
          </button>
          <button
            onClick={startVoice}
            className="hidden h-9 w-9 place-items-center rounded-2xl text-mist-400 transition hover:bg-white/[0.06] hover:text-white sm:grid"
            title="ورودی صوتی"
          >
            <Icon name="spark" size={16} />
          </button>
          {generating ? (
            <button
              onClick={onStop}
              className="grid h-10 w-10 place-items-center rounded-2xl bg-white text-black transition hover:shadow-glow sm:h-9 sm:w-9"
              title="توقف تولید"
            >
              <span className="h-3 w-3 rounded-[3px] bg-black" />
            </button>
          ) : (
            <button
              onClick={() => value.trim() && onSend(value)}
              disabled={!value.trim() || quotaExhausted}
              className="grid h-10 w-10 place-items-center rounded-2xl bg-white text-black transition-all duration-300 hover:shadow-glow active:scale-95 disabled:opacity-25 sm:h-9 sm:w-9"
              title="ارسال (Enter)"
            >
              <Icon name="send" size={16} />
            </button>
          )}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 px-2 text-[10px] text-mist-400">
        <span>
          {generating
            ? "مدل در حال پاسخ است…"
            : balanceToman != null && balanceToman > 0
              ? `موجودی: ${balanceToman.toLocaleString("fa-IR")} تومان`
              : quota
                ? `باقی‌مانده سهمیه رایگان: ${quota.remaining.toLocaleString("fa-IR")} پیام`
                : ""}
        </span>
        <span>Enter ارسال · Shift+Enter خط جدید</span>
      </div>
    </div>
  );
}

type SpeechRecognitionLike = {
  lang: string;
  onresult: (e: SpeechResultEvent) => void;
  start: () => void;
};

interface SpeechResultEvent {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
}
