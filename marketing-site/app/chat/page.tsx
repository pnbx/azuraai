"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthProvider, useAuth } from "@/components/AuthProvider";
import Icon from "@/components/Icon";
import Sidebar, { type ConversationItem, type FolderItem } from "@/components/chat/Sidebar";
import ChatMessage, { type ChatMsg } from "@/components/chat/ChatMessage";
import ModelPicker, { type CatalogModel } from "@/components/chat/ModelPicker";
import Composer from "@/components/chat/Composer";
import CommandPalette from "@/components/chat/CommandPalette";
import type { PlanId } from "@/lib/plans-config";
import LogoMark from "@/components/LogoMark";

const DEFAULT_MODEL = "gpt-4o-mini";

function useDebouncedCallback<A extends unknown[]>(fn: (...args: A) => void, delay: number) {
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  return useCallback(
    (...args: A) => {
      if (timeout.current) clearTimeout(timeout.current);
      timeout.current = setTimeout(() => fn(...args), delay);
    },
    [fn, delay]
  );
}

function ChatInner() {
  const router = useRouter();
  const { user, loading: authLoading, signOut } = useAuth();

  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [catalog, setCatalog] = useState<CatalogModel[]>([]);
  const [generating, setGenerating] = useState(false);
  const [temporary, setTemporary] = useState(false);
  const [webSearch, setWebSearch] = useState(false);
  const [balanceCents, setBalanceCents] = useState<number | null>(null);
  const [quota, setQuota] = useState<{ used: number; limit: number; remaining: number } | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [compareModels, setCompareModels] = useState<string[]>([DEFAULT_MODEL, "claude-sonnet-5"]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [upgradePlan, setUpgradePlan] = useState<PlanId | null>(null);
  const [loadingConvo, setLoadingConvo] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }, []);

  // scroll to bottom on new content
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  // load catalog + wallet when logged in
  useEffect(() => {
    if (!user) return;
    fetch("/api/models")
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          const mapped: CatalogModel[] = d.models.map(
            (m: {
              publicSlug: string;
              displayName: string;
              capabilities: string[];
              allowed?: boolean;
              requiredPlan?: PlanId | null;
              isPremiumAllowance?: boolean;
              pricing?: { in: number; out: number } | null;
            }) => ({
              publicSlug: m.publicSlug,
              displayName: m.displayName,
              capabilities: Array.isArray(m.capabilities) ? m.capabilities : [],
              allowed: m.allowed,
              requiredPlan: m.requiredPlan ?? null,
              isPremiumAllowance: m.isPremiumAllowance ?? false,
              inputTomanPerM: m.pricing?.in ?? null,
              outputTomanPerM: m.pricing?.out ?? null,
            })
          );
          setCatalog(mapped);
          // if current selection is locked, fall back to first allowed model
          if (mapped.length > 0) {
            const currentLocked = mapped.find((m) => m.publicSlug === model)?.allowed === false;
            if (currentLocked) {
              const firstAllowed = mapped.find((m) => m.allowed !== false);
              if (firstAllowed) setModel(firstAllowed.publicSlug);
            }
          }
        }
      })
      .catch(() => {});
    fetch("/api/chat/quota")
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) return;
        if (d.subscribed && d.usage) {
          setQuota({
            used: d.usage.messages.used,
            limit: d.usage.messages.limit,
            remaining: Math.max(d.usage.messages.limit - d.usage.messages.used, 0),
          });
        } else if (typeof d.remaining === "number") {
          setQuota({ used: d.used, limit: d.limit, remaining: d.remaining });
        }
      })
      .catch(() => {});
    fetch("/api/wallet")
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setBalanceCents(d.balance.amount);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // load conversations + folders
  const loadConversations = useCallback(() => {
    if (!user) return;
    fetch("/api/conversations")
      .then((r) => r.json())
      .then((d) => d.success && setConversations(d.conversations))
      .catch(() => {});
    fetch("/api/folders")
      .then((r) => r.json())
      .then((d) => d.success && setFolders(d.folders))
      .catch(() => {});
  }, [user]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // command palette event
  useEffect(() => {
    const handler = () => setPaletteOpen(true);
    window.addEventListener("open-command-palette", handler);
    return () => window.removeEventListener("open-command-palette", handler);
  }, []);

  // keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        newChat();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function newChat() {
    setActiveId(null);
    setMessages([]);
    setError(null);
    setUpgradePlan(null);
    setTemporary(false);
    inputRef.current?.focus();
  }

  async function selectConversation(id: string) {
    setActiveId(id);
    setError(null);
    setLoadingConvo(true);
    try {
      const res = await fetch(`/api/conversations/${id}`);
      const d = await res.json();
      if (d.success) {
        setMessages(
          (d.messages as Array<Record<string, unknown>>).map((m) => ({
            id: String(m.id),
            role: m.role as "user" | "assistant",
            content: String(m.content),
            model: (m.model as string) ?? undefined,
            liked: (m.liked as boolean | null) ?? null,
            createdAt: m.created_at as string,
          }))
        );
        if (d.conversation?.model) setModel(d.conversation.model);
      }
    } finally {
      setLoadingConvo(false);
    }
  }

  // ── send / stream ────────────────────────────────────────────
  async function streamRequest(payload: Record<string, unknown>, onDelta: (t: string) => void) {
    const controller = new AbortController();
    abortRef.current = controller;
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.message ?? "خطا در پردازش درخواست.");
        // plan-gated model → offer upgrade
        if (d.code === "MODEL_PLAN_REQUIRED") {
          setUpgradePlan((d.requiredPlan as PlanId) ?? null);
        } else {
          setUpgradePlan(null);
        }
        // refresh quota after a limit rejection
        if (res.status === 429) {
          fetch("/api/chat/quota")
            .then((r) => r.json())
            .then((q) => {
              if (!q.success) return;
              if (q.subscribed && q.usage) {
                setQuota({
                  used: q.usage.messages.used,
                  limit: q.usage.messages.limit,
                  remaining: Math.max(q.usage.messages.limit - q.usage.messages.used, 0),
                });
              } else if (typeof q.remaining === "number") {
                setQuota({ used: q.used, limit: q.limit, remaining: q.remaining });
              }
            })
            .catch(() => {});
        }
        return null;
      }

      const reader = res.body?.getReader();
      if (!reader) return null;
      const decoder = new TextDecoder();
      let buf = "";
      let usage: ChatMsg["tokens"] | undefined;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          const t = line.trim();
          if (!t.startsWith("data:")) continue;
          try {
            const chunk = JSON.parse(t.slice(5).trim());
            if (chunk.type === "delta" && chunk.delta) onDelta(chunk.delta);
            if (chunk.type === "done" && chunk.usage) {
              usage = {
                input: chunk.usage.inputTokens,
                output: chunk.usage.outputTokens,
                costCents: chunk.usage.costCents,
              };
            }
            if (chunk.error) setError(chunk.message ?? "خطا");
          } catch {
            // ignore
          }
        }
      }
      return usage;
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setError("ارتباط قطع شد. دوباره تلاش کنید.");
      }
      return null;
    } finally {
      setGenerating(false);
      abortRef.current = null;
    }
  }

  async function send(text: string) {
    if (!user) {
      router.push("/auth/login?redirect=/chat");
      return;
    }
    const content = text.trim();
    if (!content || generating) return;

    setInput("");
    const userMsg: ChatMsg = { id: `u-${Date.now()}`, role: "user", content };
    setMessages((prev) => [...prev, userMsg]);

    // ensure a conversation row exists (not for temporary chats)
    let convoId = activeId;
    if (!convoId && !temporary) {
      try {
        const res = await fetch("/api/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: content.slice(0, 60), model }),
        });
        const d = await res.json();
        if (d.success) {
          convoId = d.conversation.id;
          setActiveId(d.conversation.id);
          setConversations((prev) => [d.conversation, ...prev]);
        }
      } catch {
        // offline-safe: chat still works
      }
    }

    const assistantId = `a-${Date.now()}`;
    setMessages((prev) => [...prev, { id: assistantId, role: "assistant", content: "", model, pending: true }]);

    const history = [...messages, userMsg].map((m) => ({ role: m.role, content: m.content }));

    const usage = await streamRequest(
      {
        model,
        messages: history,
        conversationId: convoId,
        temporary,
        webSearch,
      },
      (delta) => {
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, content: m.content + delta } : m))
        );
      }
    );

    setMessages((prev) =>
      prev.map((m): ChatMsg =>
        m.id === assistantId ? { ...m, pending: false, tokens: usage ?? undefined, createdAt: new Date().toISOString() } : m
      )
    );

    // decrement quota display after a successful non-temporary send
    if (!temporary) {
      setQuota((q) => (q ? { ...q, used: q.used + 1, remaining: Math.max(q.remaining - 1, 0) } : q));
    }
  }

  async function regenerate() {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUser || generating) return;
    // remove trailing assistant messages
    setMessages((prev) => {
      const copy = [...prev];
      while (copy.length > 0 && copy[copy.length - 1].role === "assistant") copy.pop();
      return copy;
    });
    await sendExisting(lastUser.content);
  }

  async function sendExisting(content: string) {
    const assistantId = `a-${Date.now()}`;
    setMessages((prev) => [...prev, { id: assistantId, role: "assistant", content: "", model, pending: true }]);
    const history = messages.filter((m) => !(m.role === "assistant" && m.pending)).map((m) => ({ role: m.role, content: m.content }));
    const usage = await streamRequest(
      { model, messages: history, conversationId: activeId, temporary, webSearch },
      (delta) => {
        setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: m.content + delta } : m)));
      }
    );
    setMessages((prev) =>
      prev.map((m): ChatMsg => (m.id === assistantId ? { ...m, pending: false, tokens: usage ?? undefined } : m))
    );
  }

  function stopGeneration() {
    abortRef.current?.abort();
  }

  async function editResend(messageId: string, newText: string) {
    const idx = messages.findIndex((m) => m.id === messageId);
    if (idx < 0) return;
    const trimmed = messages.slice(0, idx);
    setMessages([...trimmed, { id: `u-${Date.now()}`, role: "user", content: newText }]);
    await sendExisting(newText);
  }

  async function likeMessage(msg: ChatMsg, liked: boolean | null) {
    setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, liked } : m)));
    if (msg.id.startsWith("u-") || msg.id.startsWith("a-")) return; // not persisted yet
    fetch(`/api/messages/${msg.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ liked }),
    }).catch(() => {});
  }

  // ── conversation management ─────────────────────────────────
  async function patchConversation(id: string, update: Record<string, unknown>) {
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, ...update } : c)));
    fetch(`/api/conversations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(update),
    }).catch(() => {});
  }

  async function deleteConversation(id: string) {
    if (!confirm("این گفتگو برای همیشه حذف شود؟")) return;
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeId === id) newChat();
    fetch(`/api/conversations/${id}`, { method: "DELETE" }).catch(() => {});
  }

  async function createFolder(name: string) {
    const res = await fetch("/api/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const d = await res.json();
    if (d.success) setFolders((prev) => [...prev, d.folder]);
  }

  async function renameFolder(id: string, name: string) {
    setFolders((prev) => prev.map((f) => (f.id === id ? { ...f, name } : f)));
    fetch("/api/folders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, name }),
    }).catch(() => {});
  }

  async function deleteFolder(id: string) {
    setFolders((prev) => prev.filter((f) => f.id !== id));
    fetch(`/api/folders?id=${id}`, { method: "DELETE" }).catch(() => {});
  }

  async function shareConversation() {
    if (!activeId) return;
    const res = await fetch(`/api/conversations/${activeId}/share`, { method: "POST" });
    const d = await res.json();
    if (d.success) {
      const url = `${window.location.origin}/chat?share=${activeId}&token=${d.token}`;
      await navigator.clipboard.writeText(url).catch(() => {});
      showToast("لینک اشتراک‌گذاری کپی شد");
    }
  }

  function exportConversation() {
    const text = messages.map((m) => `## ${m.role === "user" ? "شما" : "Azura"}\n\n${m.content}`).join("\n\n---\n\n");
    const blob = new Blob([text], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "azura-conversation.md";
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── compare mode send ───────────────────────────────────────
  async function sendCompare(text: string) {
    if (!text.trim() || generating) return;
    setInput("");
    const userMsg: ChatMsg = { id: `u-${Date.now()}`, role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);

    const assistants = compareModels.map((m, i) => ({ id: `a-${Date.now()}-${i}`, model: m }));
    setMessages((prev) => [
      ...prev,
      ...assistants.map((a) => ({ id: a.id, role: "assistant" as const, content: "", model: a.model, pending: true })),
    ]);

    const history = [...messages, userMsg].map((m) => ({ role: m.role, content: m.content }));

    await Promise.all(
      assistants.map(async (a) => {
        const usage = await streamRequest(
          { model: a.model, messages: history, temporary: true },
          (delta) => {
            setMessages((prev) => prev.map((m) => (m.id === a.id ? { ...m, content: m.content + delta } : m)));
          }
        );
        setMessages((prev) =>
          prev.map((m): ChatMsg => (m.id === a.id ? { ...m, pending: false, tokens: usage ?? undefined } : m))
        );
      })
    );
  }

  // ── auth gate ────────────────────────────────────────────────
  if (authLoading) {
    return <div className="flex h-[calc(100vh-4rem)] items-center justify-center text-sm text-mist-400">در حال بارگذاری…</div>;
  }

  if (!user) {
    return (
      <div className="hero-glow flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center px-4 text-center">
        <LogoMark size={56} className="mx-auto" />
        <h1 className="mt-6 text-3xl font-black text-white">چت هوشمند Azura</h1>
        <p className="mt-3 max-w-md text-sm leading-8 text-mist-400">
          برای گفتگو با مدل‌های هوش مصنوعی، ابتدا وارد حساب خود شوید یا حساب رایگان بسازید.
        </p>
        <div className="mt-8 flex gap-3">
          <Link href="/auth/login?redirect=/chat" className="btn-primary">ورود</Link>
          <Link href="/auth/signup" className="btn-ghost">ثبت‌نام رایگان</Link>
        </div>
      </div>
    );
  }

  const showCompareLast = compareMode && messages.length > 0;

  return (
    <div className="flex h-[calc(100vh-4rem)] supports-[height:100dvh]:h-[calc(100dvh-4rem)] overflow-hidden" dir="rtl">
      {/* mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}
      <div
        className={`fixed inset-y-0 end-0 z-50 transform transition-transform duration-300 ease-smooth md:relative md:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <Sidebar
          conversations={conversations}
          folders={folders}
          activeId={activeId}
          onSelect={(id) => { selectConversation(id); if (window.innerWidth < 768) setSidebarOpen(false); }}
          onNewChat={() => { newChat(); if (window.innerWidth < 768) setSidebarOpen(false); }}
          onRename={(id, title) => patchConversation(id, { title })}
          onDelete={deleteConversation}
          onPin={(id, pinned) => patchConversation(id, { pinned })}
          onArchive={(id, archived) => patchConversation(id, { archived })}
          onMoveToFolder={(id, folderId) => patchConversation(id, { folderId })}
          onCreateFolder={createFolder}
          onRenameFolder={renameFolder}
          onDeleteFolder={deleteFolder}
          temporary={temporary}
          onToggleTemporary={() => { setTemporary((v) => !v); showToast(temporary ? "چت موقت خاموش شد" : "چت موقت روشن شد — تاریخچه ذخیره نمی‌شود"); }}
          user={{ email: user.email }}
          onSignOut={signOut}
        />
      </div>

      {/* main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* toolbar */}
        <div className="flex flex-wrap items-center gap-2 border-b border-white/5 px-3 py-2.5 sm:px-4">
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            className="grid h-8 w-8 place-items-center rounded-xl text-mist-400 transition hover:bg-white/[0.06] hover:text-white"
            title="منو (Ctrl+J گفتگوی جدید)"
          >
            <Icon name="menu" size={16} />
          </button>
          <ModelPicker models={catalog} value={model} onChange={setModel} disabled={generating} />
          <button
            onClick={() => { setCompareMode((v) => !v); showToast(compareMode ? "حالت مقایسه خاموش شد" : "حالت مقایسه روشن شد — یک پیام به چند مدل ارسال می‌شود"); }}
            className={`rounded-full border px-3 py-1.5 text-xs transition ${
              compareMode ? "border-white/30 bg-white/[0.1] text-white" : "border-white/10 bg-white/[0.04] text-mist-300 hover:text-white"
            }`}
          >
            مقایسه مدل‌ها
          </button>
          {quota && (
            <span
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[10px] ${
                quota.remaining > 3
                  ? "border-white/10 bg-white/[0.04] text-mist-300"
                  : "border-white/30 bg-white/[0.08] font-bold text-white"
              }`}
              title="سهمیه پیام رایگان این ماه"
            >
              <Icon name="chat" size={11} />
              {quota.remaining.toLocaleString("fa-IR")} از {quota.limit.toLocaleString("fa-IR")} پیام
            </span>
          )}
          {compareMode && (
            <div className="flex items-center gap-1" dir="ltr">
              <ModelPicker models={catalog} value={compareModels[1] ?? model} onChange={(m) => setCompareModels([compareModels[0], m])} />
            </div>
          )}
          <div className="ms-auto flex items-center gap-1">
            {activeId && (
              <>
                <button onClick={shareConversation} className="rounded-xl p-2 text-mist-400 transition hover:bg-white/[0.06] hover:text-white" title="اشتراک‌گذاری">
                  <Icon name="globe" size={15} />
                </button>
                <button onClick={exportConversation} className="rounded-xl p-2 text-mist-400 transition hover:bg-white/[0.06] hover:text-white" title="خروجی گفتگو">
                  <Icon name="copy" size={15} />
                </button>
              </>
            )}
            <button
              onClick={() => window.dispatchEvent(new CustomEvent("open-command-palette"))}
              className="hidden rounded-xl px-2.5 py-1.5 text-[10px] text-mist-400 transition hover:bg-white/[0.06] hover:text-white sm:block"
              title="Ctrl+K"
            >
              Ctrl+K
            </button>
          </div>
        </div>

        {/* messages */}
        <div ref={listRef} className="flex-1 overflow-y-auto px-3 py-6 sm:px-6">
          <div className="mx-auto max-w-3xl space-y-6">
            {loadingConvo && <p className="text-center text-xs text-mist-400">در حال بارگذاری گفتگو…</p>}
            {!loadingConvo && messages.length === 0 && (
              <div className="pt-20 text-center">
                <LogoMark size={56} className="mx-auto" />
                <h2 className="mt-6 text-2xl font-black text-white">چه کاری کمکتان کنم؟</h2>
                <p className="mt-3 text-sm leading-8 text-mist-400">
                  سؤالتان را بنویسید{compareMode ? " — پاسخ چند مدل را کنار هم می‌بینید" : ""}.
                </p>
              </div>
            )}
            {showCompareLast ? (
              // render compare pairs: group consecutive assistant messages after last user msg
              <CompareView messages={messages} models={compareModels} onLike={likeMessage} />
            ) : (
              messages.map((m) => (
                <ChatMessage
                  key={m.id}
                  msg={m}
                  onRegenerate={m.role === "assistant" ? () => regenerate() : undefined}
                  onEditResend={m.role === "user" ? (t: string) => editResend(m.id, t) : undefined}
                  onLike={m.role === "assistant" ? (l: boolean | null) => likeMessage(m, l) : undefined}
                />
              ))
            )}
            {error && (
              <div className="rounded-2xl border border-white/15 bg-white/[0.06] px-4 py-3 text-center text-xs leading-6 text-white">
                {error}
                {upgradePlan && (
                  <Link href="/account/subscription" className="ms-2 font-bold underline">
                    مشاهده پلن‌ها
                  </Link>
                )}
                <button
                  onClick={() => {
                    setError(null);
                    setUpgradePlan(null);
                  }}
                  className="ms-2 underline"
                >
                  بستن
                </button>
              </div>
            )}
          </div>
        </div>

        {/* composer */}
        <div className="mx-auto w-full max-w-3xl">
          <Composer
            value={input}
            onChange={setInput}
            onSend={compareMode ? sendCompare : send}
            onStop={stopGeneration}
            generating={generating}
            webSearch={webSearch}
            onToggleWebSearch={() => setWebSearch((v) => !v)}
            temporary={temporary}
            balanceToman={balanceCents}
            quota={quota}
            inputRef={inputRef}
          />
        </div>
      </div>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        conversations={conversations}
        onSelectConversation={selectConversation}
        onNewChat={newChat}
      />

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[110] -translate-x-1/2 animate-fade-up rounded-2xl border border-white/15 bg-ink-850 px-5 py-3 text-xs text-white shadow-card">
          {toast}
        </div>
      )}
    </div>
  );
}

function CompareView({
  messages,
  models,
  onLike,
}: {
  messages: ChatMsg[];
  models: string[];
  onLike: (m: ChatMsg, l: boolean | null) => void;
}) {
  // find last user message index; group assistant msgs after it
  let lastUserIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") { lastUserIdx = i; break; }
  }
  const before = messages.slice(0, lastUserIdx + 1);
  const assistants = messages.slice(lastUserIdx + 1);

  return (
    <>
      {before.map((m) => <ChatMessage key={m.id} msg={m} />)}
      {assistants.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {assistants.map((m) => (
            <div key={m.id} className="rounded-3xl border border-white/10 bg-ink-900/60 p-3">
              <p className="mb-2 text-center text-[10px] font-bold text-mist-300" dir="ltr">{m.model}</p>
              <div className="max-h-[28rem] overflow-y-auto">
                <ChatMessage msg={m} onLike={(l: boolean | null) => onLike(m, l)} showMeta={false} compact />
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export default function ChatPage() {
  return (
    <AuthProvider>
      <Suspense fallback={<div className="py-32 text-center text-sm text-mist-400">…</div>}>
        <ChatInner />
      </Suspense>
    </AuthProvider>
  );
}
