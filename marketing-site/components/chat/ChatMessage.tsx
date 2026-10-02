"use client";

import { useState } from "react";
import Icon from "@/components/Icon";
import Markdown from "./Markdown";

export type ChatMsg = {
  id: string;
  role: "user" | "assistant";
  content: string;
  model?: string;
  liked?: boolean | null;
  createdAt?: string;
  tokens?: { input: number; output: number; costCents: number };
  pending?: boolean;
};

export default function ChatMessage({
  msg,
  onRegenerate,
  onEditResend,
  onLike,
  showMeta = true,
  compact = false,
}: {
  msg: ChatMsg;
  onRegenerate?: () => void;
  onEditResend?: (newText: string) => void;
  onLike?: (liked: boolean | null) => void;
  showMeta?: boolean;
  compact?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(msg.content);
  const isUser = msg.role === "user";

  function copy() {
    navigator.clipboard.writeText(msg.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const time = msg.createdAt
    ? new Date(msg.createdAt).toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" })
    : null;

  if (isUser) {
    return (
      <div className={`group flex justify-start ${compact ? "" : "animate-fade-up"}`}>
        <div className="max-w-[85%] sm:max-w-[75%]">
          {editing ? (
            <div className="rounded-3xl rounded-ss-lg border border-white/20 bg-ink-800 p-3">
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                rows={3}
                className="input-dark min-h-20 w-full resize-none text-sm leading-7"
                autoFocus
              />
              <div className="mt-2 flex justify-end gap-2">
                <button onClick={() => setEditing(false)} className="btn-ghost !rounded-full !px-4 !py-1.5 !text-xs">
                  انصراف
                </button>
                <button
                  onClick={() => {
                    setEditing(false);
                    onEditResend?.(editText.trim());
                  }}
                  disabled={!editText.trim()}
                  className="btn-primary !rounded-full !px-4 !py-1.5 !text-xs disabled:opacity-40"
                >
                  ارسال مجدد
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-3xl rounded-ss-lg bg-ink-700 px-4 py-3 text-sm leading-8 text-mist-100">
              {msg.content}
            </div>
          )}
          {!editing && (
            <div className="mt-1 flex items-center gap-1 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
              <button onClick={copy} className="rounded-lg p-1.5 text-mist-400 transition hover:bg-white/10 hover:text-white" title="کپی">
                <Icon name={copied ? "check" : "copy"} size={13} />
              </button>
              {onEditResend && (
                <button
                  onClick={() => {
                    setEditText(msg.content);
                    setEditing(true);
                  }}
                  className="rounded-lg p-1.5 text-mist-400 transition hover:bg-white/10 hover:text-white"
                  title="ویرایش و ارسال مجدد"
                >
                  <Icon name="plus" size={13} />
                </button>
              )}
              {showMeta && time && <span className="ms-1 text-[10px] text-mist-400">{time}</span>}
            </div>
          )}
        </div>
      </div>
    );
  }

  // assistant
  return (
    <div className={`group flex justify-end ${compact ? "" : "animate-fade-up"}`}>
      <div className="max-w-[92%] sm:max-w-[85%]">
        <div className="rounded-3xl rounded-ee-lg border border-white/10 bg-white/[0.05] px-5 py-4">
          {msg.content ? (
            <Markdown content={msg.content} />
          ) : (
            <span className="inline-flex items-center gap-2 text-sm text-mist-400">
              <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-white" />
              در حال فکر کردن…
            </span>
          )}
        </div>
        {showMeta && (
          <div className="mt-1.5 flex flex-wrap items-center justify-end gap-1 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
            {msg.model && !compact && (
              <span className="me-1 rounded-full bg-white/[0.06] px-2 py-0.5 text-[9px] text-mist-300" dir="ltr">
                {msg.model}
              </span>
            )}
            <button onClick={copy} className="rounded-lg p-1.5 text-mist-400 transition hover:bg-white/10 hover:text-white" title="کپی پاسخ">
              <Icon name={copied ? "check" : "copy"} size={13} />
            </button>
            {onLike && (
              <>
                <button
                  onClick={() => onLike(msg.liked === true ? null : true)}
                  className={`rounded-lg p-1.5 transition hover:bg-white/10 ${msg.liked === true ? "text-white" : "text-mist-400 hover:text-white"}`}
                  title="پاسخ خوب بود"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill={msg.liked === true ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M7 10v11m0-11 4.5-7.5c1.5 0 2.5 1 2.5 2.5V9h5a2 2 0 0 1 2 2.3l-1.2 7A2 2 0 0 1 17.8 20H7m0-10H4v11h3" /></svg>
                </button>
                <button
                  onClick={() => onLike(msg.liked === false ? null : false)}
                  className={`rounded-lg p-1.5 transition hover:bg-white/10 ${msg.liked === false ? "text-white" : "text-mist-400 hover:text-white"}`}
                  title="پاسخ خوب نبود"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill={msg.liked === false ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 14V3m0 11-4.5 7.5c-1.5 0-2.5-1-2.5-2.5V15H5a2 2 0 0 1-2-2.3l1.2-7A2 2 0 0 1 6.2 4H17m0 10h3V3h-3" /></svg>
                </button>
              </>
            )}
            {onRegenerate && !msg.pending && (
              <button onClick={onRegenerate} className="rounded-lg p-1.5 text-mist-400 transition hover:bg-white/10 hover:text-white" title="تولید مجدد">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" /></svg>
              </button>
            )}
            {msg.tokens && msg.tokens.input + msg.tokens.output > 0 && !compact && (
              <span className="ms-1 text-[9px] text-mist-400" dir="ltr">
                {msg.tokens.input + msg.tokens.output} tokens
                {msg.tokens.costCents > 0 && ` · ${msg.tokens.costCents.toLocaleString("fa-IR")} تومان`}
              </span>
            )}
            {time && <span className="ms-1 text-[10px] text-mist-400">{time}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
