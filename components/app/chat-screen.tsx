'use client'

/**
 * AppChatScreen — the Azura mobile-first chat experience.
 *
 * Modeled on the ChatGPT / Grok Android apps: collapsible conversations
 * drawer with search + recency groups, mode selector (Fast / Deep thinking /
 * Research), streaming markdown answers with a live caret, message actions
 * (copy / regenerate / edit), voice input, and haptic feedback.
 *
 * UI state lives here; the wire protocol lives in useAppChatStream.
 */

import * as React from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Zap,
  Brain,
  Globe,
  Send,
  Square,
  RotateCcw,
  Menu,
  ArrowDown,
  Mic,
  MicOff,
  X,
} from 'lucide-react'
import { useAppChatStream } from './use-chat-stream'
import type { ChatMode } from './use-chat-stream'
import {
  type ChatMsg,
  type Conversation,
  newConversation,
  autoTitle,
} from './conversations'
import { useConversations } from './use-conversations'
import { AppChatMessage, AzuraAvatar } from './chat-message'
import { ThinkingPanel, StageRail } from './thinking-panel'
import { ConversationsDrawer } from './drawer'
import { useVoiceInput } from './voice-input'
import { haptic } from './haptics'

const spring = { type: 'spring' as const, stiffness: 380, damping: 30 }

const MODES: Array<{ key: ChatMode; label: string; icon: typeof Zap; hint: string }> = [
  { key: 'fast', label: 'Fast', icon: Zap, hint: 'Quick answers' },
  { key: 'thinking', label: 'Deep thinking', icon: Brain, hint: 'R1-class reasoning' },
  { key: 'research', label: 'Research', icon: Globe, hint: 'Web-grounded answers' },
]

export function AppChatScreen({ authed = true }: { authed?: boolean }) {
  // ── Conversations ──────────────────────────────────────────────────────────
  const { conversations, upsert, remove, togglePin, rename } = useConversations()
  const [activeId, setActiveId] = React.useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = React.useState(false)
  const [messages, setMessages] = React.useState<ChatMsg[]>([])
  const [hydrated, setHydrated] = React.useState(false)

  // Hydrate the most recent conversation after mount (deferred so the
  // effect body stays side-effect free per react-hooks rules).
  React.useEffect(() => {
    const id = requestAnimationFrame(() => {
      setHydrated(true)
      // Restore the most recent conversation inside the same deferred tick
      // so the store snapshot is already populated.
      if (conversations.length > 0) {
        const latest = conversations.reduce((a, b) => (a.updatedAt > b.updatedAt ? a : b))
        setActiveId(latest.id)
        setMessages(latest.messages)
      }
    })
    return () => cancelAnimationFrame(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const persistNow = React.useCallback(
    (id: string | null, msgs: ChatMsg[], mode: ChatMode) => {
      if (!id) return
      const now = Date.now()
      upsert({
        id,
        title: autoTitle(msgs),
        messages: msgs.slice(-80),
        mode,
        pinned: conversations.find((c) => c.id === id)?.pinned ?? false,
        createdAt: conversations.find((c) => c.id === id)?.createdAt ?? now,
        updatedAt: now,
      })
    },
    [conversations, upsert]
  )

  // ── Stream ─────────────────────────────────────────────────────────────────
  const { send, cancel, dismissError, state, errorMsg, demoMode: rawDemoMode } = useAppChatStream()
  // Demo responses come through flagged message metadata too.
  const demoMode =
    rawDemoMode || messages.some((m) => m.demo === true)
  const busy = state === 'connecting' || state === 'streaming'
  const [input, setInput] = React.useState('')
  const [mode, setMode] = React.useState<ChatMode>('fast')
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const bottomRef = React.useRef<HTMLDivElement>(null)
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)
  const [atBottom, setAtBottom] = React.useState(true)

  // Appends a partial patch onto the trailing assistant message.
  function appendToLast(
    prev: ChatMsg[],
    patch:
      | { content: string; demo?: boolean }
      | { reasoning: string; demo?: boolean }
      | { stages: string; demo?: boolean }
      | { sources: NonNullable<ChatMsg['sources']>; demo?: boolean }
  ) {
    const next = prev.slice()
    let last = next[next.length - 1]

    if (!last || last.role !== 'assistant') {
      last = { role: 'assistant', content: '' }
      next.push(last)
    }

    if ('content' in patch) last.content += patch.content
    else if ('reasoning' in patch)
      last.reasoning = (last.reasoning ?? '') + patch.reasoning
    else if ('stages' in patch)
      last.stages = [...(last.stages ?? []), patch.stages]
    else if ('sources' in patch) last.sources = patch.sources

    if (patch.demo) last.demo = true

    return next
  }

  // Track scroll position for the jump-to-latest pill
  React.useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onScroll = () => {
      setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  const scrollToBottom = React.useCallback((smooth = true) => {
    bottomRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'end' })
  }, [])

  // Autoscroll while streaming, but never fight the user scrolling up
  React.useEffect(() => {
    if (atBottom) scrollToBottom()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages])

  // ── Voice input ────────────────────────────────────────────────────────────
  const voice = useVoiceInput((text, isFinal) => {
    if (isFinal) setInput((prev) => (prev ? `${prev} ${text}`.trim() : text))
  })

  // ── Sending ────────────────────────────────────────────────────────────────
  const runStream = React.useCallback(
    async (history: ChatMsg[], activeMode: ChatMode) => {
      await send(history, activeMode, {
        onContent: (delta, demo) => setMessages((prev) => appendToLast(prev, { content: delta, demo })),
        onReasoning: (delta, demo) => setMessages((prev) => appendToLast(prev, { reasoning: delta, demo })),
        onStage: (stage, demo) => setMessages((prev) => appendToLast(prev, { stages: stage, demo })),
        onSources: (sources, demo) => setMessages((prev) => appendToLast(prev, { sources, demo })),
        onMeta: (final, demo) =>
          setMessages((prev) => {
            const next = prev.slice()
            const last = next[next.length - 1]
            if (last?.role === 'assistant') {
              next[next.length - 1] = {
                ...last,
                content: final.content || last.content,
                reasoning: final.reasoning ?? last.reasoning,
                sources: final.sources ?? last.sources,
                demo: demo || last.demo,
              }
            }
            return next
          }),
      })
    },
    [send]
  )

  async function handleSend(override?: { text: string; mode: ChatMode; history: ChatMsg[] }) {
    const text = override ? override.text : input.trim()
    if (!text || busy) return
    haptic('light')

    let history: ChatMsg[]
    if (override) {
      history = override.history
      setMessages(history)
    } else {
      const userMsg: ChatMsg = { role: 'user', content: text, ts: Date.now() }
      history = [...messages, userMsg]
      setMessages(history)
      setInput('')
      if (textareaRef.current) textareaRef.current.style.height = 'auto'
    }

    let id = activeId
    if (!id) {
      const conv = newConversation(override ? override.mode : mode)
      id = conv.id
      setActiveId(id)
      upsert({ ...conv, messages: history, title: autoTitle(history) })
    } else {
      persistNow(id, history, override ? override.mode : mode)
    }

    setAtBottom(true)
    await runStream(history, override ? override.mode : mode)
    persistNow(id, history, override ? override.mode : mode)
  }

  // The stream reads messages from the caller's state; persist the final
  // assistant message after the run completes.
  React.useEffect(() => {
    if (state === 'idle' && activeId && messages.length > 0 && !busy) {
      const t = setTimeout(() => persistNow(activeId, messages, mode), 150)
      return () => clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  // ── Message actions ────────────────────────────────────────────────────────
  const regenerate = React.useCallback(() => {
    if (busy) return
    const lastUserIdx = messages.map((m) => m.role).lastIndexOf('user')
    if (lastUserIdx === -1) return
    const history = messages.slice(0, lastUserIdx + 1)
    setMessages(history)
    haptic('light')
    void (async () => {
      await runStream(history, mode)
      if (activeId) persistNow(activeId, history, mode)
    })()
  }, [busy, messages, mode, runStream, activeId, persistNow])

  const editAndResend = React.useCallback(
    (idx: number, newText: string) => {
      if (busy) return
      const history: ChatMsg[] = [
        ...messages.slice(0, idx),
        { role: 'user' as const, content: newText, ts: Date.now() },
      ]
      setMessages(history)
      haptic('light')
      void (async () => {
        await runStream(history, mode)
        if (activeId) persistNow(activeId, history, mode)
      })()
    },
    [busy, messages, mode, runStream, activeId, persistNow]
  )

  // ── Drawer actions ─────────────────────────────────────────────────────────
  const handleNew = React.useCallback(() => {
    setDrawerOpen(false)
    setMessages([])
    setActiveId(null)
    setInput('')
    haptic('light')
  }, [])

  const handleSelect = React.useCallback(
    (id: string) => {
      const conv = conversations.find((c) => c.id === id)
      if (!conv) return
      setActiveId(id)
      setMessages(conv.messages)
      setMode(conv.mode ?? 'fast')
      setDrawerOpen(false)
      setAtBottom(true)
      requestAnimationFrame(() => scrollToBottom(false))
    },
    [conversations, scrollToBottom]
  )

  const handleDelete = React.useCallback(
    (id: string) => {
      remove(id)
      if (id === activeId) {
        setActiveId(null)
        setMessages([])
      }
      haptic('medium')
    },
    [remove, activeId]
  )

  const handleTogglePin = React.useCallback(
    (id: string) => {
      togglePin(id)
      haptic('light')
    },
    [togglePin]
  )

  const handleRename = React.useCallback(
    (id: string, title: string) => {
      rename(id, title)
    },
    [rename]
  )

  // ── Keyboard shortcuts (desktop) ───────────────────────────────────────────
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        handleNew()
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '/') {
        e.preventDefault()
        setDrawerOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleNew])

  const lastMsg = messages[messages.length - 1]
  const liveAssistant = busy && lastMsg?.role === 'assistant'
  const liveReasoning = liveAssistant ? (lastMsg.reasoning ?? '') : ''
  const liveStages = liveAssistant ? (lastMsg.stages ?? []) : []

  return (
    <div className="flex h-[100dvh] w-full flex-col overflow-hidden">
      <div className="mx-auto flex h-full w-full max-w-4xl flex-1 overflow-hidden lg:flex">
        {/* Conversations drawer */}
        <ConversationsDrawer
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          conversations={conversations}
          activeId={activeId}
          onSelect={handleSelect}
          onNew={handleNew}
          onDelete={handleDelete}
          onTogglePin={handleTogglePin}
          onRename={handleRename}
        />

        {/* Main column */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Top bar — mobile hamburger + conversation title */}
          <header className="flex h-12 items-center gap-2 border-b border-border/60 px-3 pt-safe backdrop-blur-md">
            <button
              onClick={() => setDrawerOpen(true)}
              className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted lg:hidden"
              aria-label="Open conversations"
            >
              <Menu className="h-4.5 w-4.5" />
            </button>
            <span
              dir="auto"
              className="min-w-0 flex-1 truncate text-sm font-medium text-muted-foreground"
            >
              {activeId
                ? conversations.find((c) => c.id === activeId)?.title ?? 'Azura'
                : 'Azura'}
            </span>
            {demoMode ? (
              <span className="shrink-0 rounded-full bg-warning/15 px-2.5 py-1 text-[10px] font-medium text-warning">
                Demo mode
              </span>
            ) : null}
            {!authed ? (
              <a
                href="/auth/login"
                className="rounded-full bg-brand px-3 py-1.5 text-xs font-medium text-white shadow-sm"
              >
                Sign in
              </a>
            ) : null}
          </header>

          {/* Messages */}
          <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-3xl px-4 pb-6 pt-4">
              {messages.length === 0 ? (
                <EmptyState mode={mode} authed={authed} onSuggestion={(s) => setInput(s)} />
              ) : null}

              <AnimatePresence initial={false}>
                {messages.map((m, i) => (
                  <div key={`${i}-${m.ts ?? i}`} className="mb-5">
                    <AppChatMessage
                      message={m}
                      isStreaming={i === messages.length - 1 && busy}
                      onRegenerate={
                        i === messages.length - 1 && m.role === 'assistant' && !busy
                          ? regenerate
                          : undefined
                      }
                      onEditUser={
                        m.role === 'user' && !busy
                          ? (text) => {
                              // next assistant message (if any) is dropped on edit-resend
                              editAndResend(i, text)
                            }
                          : undefined
                      }
                    />
                  </div>
                ))}
              </AnimatePresence>

              {liveAssistant && mode === 'research' ? (
                <div className="mb-5 flex justify-center">
                  <StageRail stages={liveStages} />
                </div>
              ) : null}

              {liveAssistant && mode === 'thinking' && liveReasoning ? (
                <div className="mb-5">
                  <ThinkingPanel reasoning={liveReasoning} active={state === 'streaming'} />
                </div>
              ) : null}

              <div ref={bottomRef} className="h-px" />
            </div>

            {/* Jump to latest */}
            <AnimatePresence>
              {!atBottom ? (
                <motion.button
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  onClick={() => scrollToBottom()}
                  className="absolute bottom-4 left-1/2 flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full border border-border bg-card shadow-lg"
                  aria-label="Scroll to latest"
                >
                  <ArrowDown className="h-4 w-4" />
                </motion.button>
              ) : null}
            </AnimatePresence>
          </div>

          {/* Error banner */}
          <AnimatePresence>
            {errorMsg ? (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="mx-4 mb-2 flex items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-sm text-destructive"
              >
                <span className="min-w-0 flex-1 truncate">{errorMsg}</span>
                <button
                  onClick={() => {
                    regenerate()
                    dismissError()
                  }}
                  className="shrink-0 font-semibold underline underline-offset-2"
                >
                  <RotateCcw className="mr-1 inline h-3.5 w-3.5" />
                  Retry
                </button>
                <button onClick={dismissError} aria-label="Dismiss error">
                  <X className="h-4 w-4" />
                </button>
              </motion.div>
            ) : null}
          </AnimatePresence>

          {/* Composer */}
          <motion.div
            layout
            transition={spring}
            className="sticky bottom-0 border-t border-border/60 bg-background/85 px-3 pb-safe pt-2 backdrop-blur-xl"
            style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 0.5rem)' }}
          >
            <div className="mx-auto w-full max-w-3xl">
              {/* Mode selector */}
              <div className="flex items-center gap-1.5 pb-2">
                {MODES.map((m) => {
                  const activeMode = mode === m.key
                  const Icon = m.icon
                  return (
                    <button
                      key={m.key}
                      onClick={() => {
                        setMode(m.key)
                        haptic('light')
                      }}
                      title={m.hint}
                      className="relative flex-1 rounded-xl px-2 py-1.5 text-xs font-medium"
                    >
                      {activeMode ? (
                        <motion.span
                          layoutId="mode-pill"
                          transition={spring}
                          className="absolute inset-0 rounded-xl bg-brand-soft ring-1 ring-brand/40"
                        />
                      ) : null}
                      <span
                        className={`relative z-10 flex items-center justify-center gap-1.5 ${
                          activeMode ? 'text-brand-strong' : 'text-muted-foreground'
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {m.label}
                      </span>
                    </button>
                  )
                })}
              </div>

              <div className="flex items-end gap-2">
                <motion.div
                  layout
                  className={`flex flex-1 items-end rounded-2xl border bg-card px-3 py-2 transition-colors ${
                    voice.listening ? 'border-brand-strong' : 'border-border focus-within:border-border-strong'
                  }`}
                >
                  <textarea
                    ref={textareaRef}
                    value={input}
                    dir="auto"
                    onChange={(e) => {
                      setInput(e.target.value)
                      e.target.style.height = 'auto'
                      e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        handleSend()
                      }
                    }}
                    rows={1}
                    placeholder={
                      voice.listening
                        ? 'Listening…'
                        : mode === 'research'
                          ? 'Ask anything — I will search the web…'
                          : 'Message Azura…'
                    }
                    className="max-h-[140px] w-full resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                  />
                  {voice.supported ? (
                    <button
                      onClick={() => {
                        if (voice.listening) {
                          voice.stop()
                          haptic('medium')
                        } else {
                          voice.start()
                          haptic('light')
                        }
                      }}
                      className={`ml-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-colors ${
                        voice.listening
                          ? 'bg-brand text-white'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                      }`}
                      aria-label={voice.listening ? 'Stop dictation' : 'Start dictation'}
                    >
                      {voice.listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                    </button>
                  ) : null}
                </motion.div>

                {busy ? (
                  <motion.button
                    layout
                    onClick={() => {
                      cancel()
                      haptic('heavy')
                    }}
                    whileTap={{ scale: 0.92 }}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-destructive text-destructive-foreground shadow-lg"
                    aria-label="Stop generating"
                  >
                    <Square className="h-4 w-4" />
                  </motion.button>
                ) : (
                  <motion.button
                    layout
                    onClick={() => handleSend()}
                    disabled={!input.trim()}
                    whileTap={{ scale: 0.92 }}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand text-white shadow-lg disabled:opacity-40"
                    aria-label="Send message"
                  >
                    <motion.span animate={input.trim() ? { scale: 1 } : { scale: 0.9 }} className="flex">
                      <Send className="h-4 w-4" />
                    </motion.span>
                  </motion.button>
                )}
              </div>

              <p className="pt-1.5 text-center text-[10px] text-muted-foreground">
                Azura can make mistakes — verify important info.
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  )
}

// ─── Empty state ─────────────────────────────────────────────────────────────

function EmptyState({
  mode,
  authed,
  onSuggestion,
}: {
  mode: ChatMode
  authed: boolean
  onSuggestion: (text: string) => void
}) {
  const suggestions: Record<ChatMode, string[]> = {
    fast: [
      'Explain quantum computing like I am five',
      'به فارسی یک شعر کوتاه درباره باران بگو',
      'Write a regex for email validation',
    ],
    thinking: [
      'A bat and ball cost $1.10… solve it step by step',
      'Plan a 3-day Tehran itinerary on a budget',
      'Compare REST vs GraphQL for my startup',
    ],
    research: [
      'Latest news about AI regulation in 2026',
      'Best free AI APIs right now',
      'قیمت لپتاپ مناسب برای برنامه‌نویسی',
    ],
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring}
      className="flex flex-col items-center justify-center gap-5 py-14 text-center"
    >
      <motion.div
        animate={{ y: [0, -8, 0] }}
        transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
        className="brand-orb flex h-16 w-16 items-center justify-center rounded-3xl text-white shadow-xl"
      >
        <svg
          width="30"
          height="30"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 3l1.9 5.8L20 12l-6.1 3.2L12 21l-1.9-5.8L4 12l6.1-3.2L12 3z" />
        </svg>
      </motion.div>
      <div>
        <h2 className="text-lg font-semibold">Hey, I am Azura</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {mode === 'fast'
            ? 'Quick answers, powered by free models.'
            : mode === 'thinking'
              ? 'I will show my reasoning as I think.'
              : 'I will plan, search the web, and cite sources.'}
        </p>
        {!authed ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Preview mode —{' '}
            <a href="/auth/login" className="text-brand-strong underline underline-offset-2">
              log in
            </a>{' '}
            for the real thing.
          </p>
        ) : null}
      </div>
      <div className="w-full max-w-md space-y-2 px-4">
        {suggestions[mode].map((s, i) => (
          <motion.button
            key={s}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 * i, ...spring }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onSuggestion(s)}
            className="w-full rounded-xl border border-border bg-card/60 px-4 py-2.5 text-left text-sm backdrop-blur transition-colors hover:border-border-strong"
          >
            {s}
          </motion.button>
        ))}
      </div>
    </motion.div>
  )
}
