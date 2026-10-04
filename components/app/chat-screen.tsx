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
  RotateCcw,
  Menu,
  ArrowDown,
  ArrowUp,
  Mic,
  MicOff,
  Download,
  X,
} from 'lucide-react'
import { useAppChatStream } from './use-chat-stream'
import type { ChatMode } from './use-chat-stream'
import {
  type ChatMsg,
  type Conversation,
  newConversation,
  autoTitle,
  compactForStorage,
} from './conversations'
import { useConversations } from './use-conversations'
import { AppChatMessage, AzuraAvatar } from './chat-message'
import { AzuraLogoAnimated } from '@/components/brand/logo'
import { ThinkingPanel, StageRail } from './thinking-panel'
import { ElapsedTicker, StageTimings } from './response-timer'
import { ConversationsDrawer } from './drawer'
import { useVoiceInput } from './voice-input'
import { useMemory } from './use-memory'
import { haptic } from './haptics'
import { ToolSheet, ToolButton, CalcChip } from './tools-panel'
import { calculate, looksLikeCalculation, type ToolDefinition } from '@/lib/chat-tools'
import { useAndroidBackButton } from './use-android-back'
import {
  AttachmentBar,
  buildAttachment,
  MAX_ATTACHMENTS,
  type Attachment,
} from './attachments'
import { useSpeech } from './use-speech'
import {
  conversationToMarkdown,
  downloadTextFile,
  exportFilename,
} from './text-utils'
import { useI18n } from './i18n-provider'

const spring = { type: 'spring' as const, stiffness: 380, damping: 30 }

/** Composer draft survives navigation, tab switches, and app restarts. */
const DRAFT_KEY = 'azura-composer-draft-v1'

function loadDraft(): string {
  if (typeof window === 'undefined') return ''
  try {
    return localStorage.getItem(DRAFT_KEY) ?? ''
  } catch {
    return ''
  }
}

function saveDraft(value: string) {
  try {
    if (value) localStorage.setItem(DRAFT_KEY, value)
    else localStorage.removeItem(DRAFT_KEY)
  } catch {
    // private mode / quota — drafts are best-effort
  }
}

const MODES: Array<{
  key: ChatMode
  labelKey: 'chat.mode.fast' | 'chat.mode.thinking' | 'chat.mode.research'
  icon: typeof Zap
  hint: string
}> = [
  { key: 'fast', labelKey: 'chat.mode.fast', icon: Zap, hint: 'Quick answers' },
  { key: 'thinking', labelKey: 'chat.mode.thinking', icon: Brain, hint: 'R1-class reasoning' },
  { key: 'research', labelKey: 'chat.mode.research', icon: Globe, hint: 'Web-grounded answers' },
]

export function AppChatScreen({ authed = true }: { authed?: boolean }) {
  const { t, dir } = useI18n()
  // ── Conversations ──────────────────────────────────────────────────────────
  const { conversations, upsert, remove, togglePin, rename } = useConversations()
  const [activeId, setActiveId] = React.useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = React.useState(false)
  const [messages, setMessages] = React.useState<ChatMsg[]>([])
  const [hydrated, setHydrated] = React.useState(false)
  /** Last deleted conversation, kept for the undo toast. */
  const [undo, setUndo] = React.useState<{
    conv: Conversation
    timer: ReturnType<typeof setTimeout>
  } | null>(null)
  const undoTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

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
      // compactForStorage drops image bytes from all but the newest couple of
      // turns — long chats stay well inside the localStorage quota.
      upsert({
        id,
        title: autoTitle(msgs),
        messages: compactForStorage(msgs.slice(-80)),
        mode,
        pinned: conversations.find((c) => c.id === id)?.pinned ?? false,
        createdAt: conversations.find((c) => c.id === id)?.createdAt ?? now,
        updatedAt: now,
      })
    },
    [conversations, upsert]
  )

  // ── Stream ─────────────────────────────────────────────────────────────────
  const { send, cancel, dismissError, state, errorMsg, demoMode: rawDemoMode, startedAt } =
    useAppChatStream()
  // ── Memory ─────────────────────────────────────────────────────────────────
  // Opt-in via settings toggle: when enabled, every send lets the server
  // read durable facts into the prompt and quietly learn new ones.
  const { refresh: refreshMemories, optedOut: memoryOff } = useMemory()
  const remember = authed && !memoryOff
  // Demo badge tracks the latest assistant reply only — old flagged
  // messages from earlier sessions must not keep the badge alive.
  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant')
  const demoMode = rawDemoMode || lastAssistant?.demo === true
  const busy = state === 'connecting' || state === 'streaming'
  // Composer is UNCONTROLLED: React never writes `value` back to the
  // textarea, which silently corrupts IME composition (Persian/Arabic
  // letters vanish mid-word, e.g. سلام → سلا). We keep a boolean mirror
  // for the send button and read the text from the DOM at send time.
  const [hasText, setHasText] = React.useState(false)
  // Tools: the prompt-action sheet, and the live arithmetic result for
  // whatever is currently typed. Both are local — no model call — so they
  // never touch the rate-limited free gateway.
  const [toolsOpen, setToolsOpen] = React.useState(false)
  const [calc, setCalc] = React.useState<{ expr: string; result: string } | null>(null)
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

  // ── Voice input ────────────────────────────────────────────────────────
  const setComposerText = React.useCallback((text: string) => {
    const ta = textareaRef.current
    if (!ta) return
    ta.value = text
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 140)}px`
    setHasText(text.trim().length > 0)
    saveDraft(text)
  }, [])

  // ── On-device arithmetic ────────────────────────────────────────────────
  // Shown as the user types, so checking 12 × 1500 costs nothing instead of a
  // model call on a free tier that is already rate-limited.
  const syncCalc = React.useCallback((text: string) => {
    if (!looksLikeCalculation(text)) {
      setCalc(null)
      return
    }
    const r = calculate(text)
    setCalc(r.ok ? { expr: text.trim(), result: r.display } : null)
  }, [])

  /** Apply a prompt action: rewrite the draft and send it straight away. */
  const applyTool = React.useCallback(
    (tool: ToolDefinition) => {
      setToolsOpen(false)
      const current = textareaRef.current?.value ?? ''
      if (!current.trim()) {
        // Nothing to work with. Open the draft field for the user rather than
        // sending a bare instruction the model cannot act on.
        textareaRef.current?.focus()
        return
      }
      const next = tool.build(current.trim())
      setComposerText(next)
      void handleSend({ text: next, mode, history: messages })
    },
    [setComposerText, handleSend, mode, messages]
  )

  // ── Read aloud ────────────────────────────────────────────────────────
  const speech = useSpeech()

  // ── Export current conversation ───────────────────────────────────────
  const [exportNote, setExportNote] = React.useState<string | null>(null)
  const flash = React.useCallback((text: string) => {
    setExportNote(text)
    setTimeout(() => setExportNote(null), 2200)
  }, [])

  const handleExport = React.useCallback(async () => {
    const conv = activeId ? conversations.find((c) => c.id === activeId) : null
    const msgs = conv?.messages ?? messages
    if (msgs.length === 0) {
      flash('Nothing to export yet')
      return
    }
    const title = conv?.title ?? 'Azura chat'
    const md = conversationToMarkdown({ title, messages: msgs })
    haptic('light')

    // Offer the OS share sheet first; otherwise save a .md file.
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title, text: md })
        return
      } catch {
        // dismissed or unsupported payload — fall through to the file
      }
    }
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(md)
        flash('Copied to clipboard')
        return
      } catch {
        // fall through to download
      }
    }
    downloadTextFile(exportFilename(title), md)
    flash('Saved as Markdown')
  }, [activeId, conversations, messages, flash])

  const voice = useVoiceInput(
    (text, isFinal) => {
      if (!isFinal) return
      const prev = textareaRef.current?.value ?? ''
      setComposerText(prev ? `${prev} ${text}`.trim() : text)
    },
    // Pin the recogniser to Persian: on an English-locale device the default
    // transcribes Persian speech with English phonetics and returns nonsense.
    'fa-IR'
  )

  // ── Draft restore ───────────────────────────────────────────────────────
  // Runs after the first paint so the textarea element exists. Deferred into
  // a frame to match the conversation-hydration effect above.
  React.useEffect(() => {
    const id = requestAnimationFrame(() => {
      const draft = loadDraft()
      if (draft) setComposerText(draft)
    })
    return () => cancelAnimationFrame(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Sending ────────────────────────────────────────────────────────────────
  const runStream = React.useCallback(
    async (history: ChatMsg[], activeMode: ChatMode) => {
      await send(
        history,
        activeMode,
        {
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
                // Server-measured reply timings. Kept even on a demo retry so
                // the badge stays populated rather than vanishing mid-message.
                ...(final.timings ? { timings: final.timings } : {}),
                demo: demo || last.demo,
              }
            }
            return next
          }),
        },
        { remember }
      )
      // Extraction happens server-side post-meta; pull any new memories
      // into the local mirror shortly after the exchange completes.
      if (remember) setTimeout(() => void refreshMemories(), 2500)
    },
    [send, remember, refreshMemories]
  )

  // ─── Attachments ─────────────────────────────────────────────────────────
  const [attachments, setAttachments] = React.useState<Attachment[]>([])
  const [attachError, setAttachError] = React.useState<string | null>(null)
  const [importing, setImporting] = React.useState(false)

  const handleAddFiles = React.useCallback(
    async (files: File[]) => {
      setAttachError(null)
      const room = MAX_ATTACHMENTS - attachments.length
      if (room <= 0) {
        setAttachError(`Up to ${MAX_ATTACHMENTS} images per message`)
        return
      }
      const images = files.filter((f) => f.type.startsWith('image/'))
      if (images.length === 0) {
        setAttachError('Only images are supported right now')
        return
      }
      setImporting(true)
      try {
        const built: Attachment[] = []
        for (const file of images.slice(0, room)) {
          try {
            built.push(await buildAttachment(file))
          } catch {
            // Unsupported codec (HEIC is common on some phones) — skip it
            // rather than failing the whole batch.
          }
        }
        if (built.length === 0) {
          setAttachError('Could not read that image')
        } else {
          setAttachments((prev) => [...prev, ...built].slice(0, MAX_ATTACHMENTS))
          if (images.length > room) {
            setAttachError(`Only ${MAX_ATTACHMENTS} images per message`)
          }
          haptic('light')
        }
      } finally {
        setImporting(false)
      }
    },
    [attachments.length]
  )

  const removeAttachment = React.useCallback((index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index))
    setAttachError(null)
  }, [])

  const composerBusy = busy || importing

  async function handleSend(override?: { text: string; mode: ChatMode; history: ChatMsg[] }) {
    // Images alone are a valid message — Azura can look at a photo with no
    // text at all, so don't require a non-empty prompt when attachments exist.
    const pendingImages = override ? [] : attachments.map((a) => a.dataUrl)
    const text = override ? override.text : (textareaRef.current?.value ?? '').trim()
    if ((!text && pendingImages.length === 0) || busy) return
    haptic('light')

    let history: ChatMsg[]
    const userMsg: ChatMsg = {
      role: 'user',
      content: text,
      ts: Date.now(),
      ...(pendingImages.length > 0 ? { images: pendingImages } : {}),
    }
    if (override) {
      // The prompt tools rewrite the question before sending, so the rewritten
      // text becomes the user message. Previously this branch used the passed
      // history verbatim and never appended the user turn, so tapping a tool
      // appeared to do nothing.
      history = [...override.history, userMsg]
      setMessages(history)
    } else {
      history = [...messages, userMsg]
      setMessages(history)
      setComposerText('')
      setAttachments([])
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
    setComposerText('')
    setAttachments([])
    setAttachError(null)
    haptic('light')
  }, [])

  // Android hardware back button: close drawer → stop stream → leave
  // settings/integrations → otherwise let the system background the app.
  useAndroidBackButton({
    drawerOpen,
    closeDrawer: () => setDrawerOpen(false),
    busy,
    stopGeneration: () => {
      cancel()
      haptic('heavy')
    },
  })

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
      const conv = conversations.find((c) => c.id === id)
      if (!conv) return
      remove(id)
      if (id === activeId) {
        setActiveId(null)
        setMessages([])
      }
      haptic('medium')

      // Deletion is undoable — losing a long conversation to a mis-tap is
      // the worst thing this screen could do.
      setUndo({ conv, timer: setTimeout(() => setUndo(null), 6000) })
    },
    [remove, activeId, conversations]
  )

  // Discard the pending undo when a new one starts or the screen unmounts.
  React.useEffect(
    () => () => {
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
    },
    [undo]
  )

  const handleUndoDelete = React.useCallback(() => {
    setUndo((u) => {
      if (!u) return null
      if (u.timer) clearTimeout(u.timer)
      upsert(u.conv)
      haptic('light')
      return null
    })
  }, [upsert])

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
    <div className="flex h-[100dvh] w-full flex-col overflow-hidden" dir={dir}>
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
              aria-label={t('chat.openConversations')}
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
            <button
              onClick={handleExport}
              disabled={messages.length === 0}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
              aria-label={t('chat.exportCurrent')}
              title={t('chat.exportCurrent')}
            >
              <Download className="h-4 w-4" />
            </button>
          </header>

          {/* Undo delete toast */}
          <AnimatePresence>
            {undo ? (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="mx-3 mt-2 flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-2.5 text-sm shadow-lg"
              >
                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                  {t('chat.deleted')} “{undo.conv.title}”
                </span>
                <button
                  onClick={handleUndoDelete}
                  className="shrink-0 text-xs font-semibold text-brand-strong underline underline-offset-2"
                >
                  {t('chat.undo')}
                </button>
              </motion.div>
            ) : null}
          </AnimatePresence>

          {/* Export result flash */}
          <AnimatePresence>
            {exportNote ? (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="mx-3 mt-2 rounded-xl border border-border bg-card px-4 py-2 text-center text-xs text-muted-foreground shadow-lg"
              >
                {exportNote}
              </motion.div>
            ) : null}
          </AnimatePresence>

          {/* Messages */}
          <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-3xl px-4 pb-6 pt-4">
              {messages.length === 0 ? (
                <EmptyState mode={mode} onSuggestion={(s) => setComposerText(s)} />
              ) : null}

              <AnimatePresence initial={false}>
                {messages.map((m, i) => (
                  <div key={`${i}-${m.ts ?? i}`} className="mb-5">
                    <AppChatMessage
                      message={m}
                      messageId={`${activeId ?? 'draft'}-${i}`}
                      isStreaming={i === messages.length - 1 && busy}
                      speechSupported={speech.supported}
                      speaking={speech.speakingId === `${activeId ?? 'draft'}-${i}`}
                      onSpeak={
                        m.role === 'assistant'
                          ? () => speech.toggle(`${activeId ?? 'draft'}-${i}`, m.content)
                          : undefined
                      }
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
                    {/* Research only, and only once finished: the live rail
                        above already covers "still working". */}
                    {m.role === 'assistant' && !busy && mode === 'research' ? (
                      <div className="mt-2 flex justify-end">
                        <StageTimings timings={m.timings} />
                      </div>
                    ) : null}
                  </div>
                ))}
              </AnimatePresence>

              {liveAssistant && mode === 'research' ? (
                <div className="mb-5 flex items-center justify-center gap-3">
                  <StageRail stages={liveStages} />
                  <ElapsedTicker startedAt={startedAt} />
                </div>
              ) : null}

              {liveAssistant && mode === 'thinking' && liveReasoning ? (
                <div className="mb-5 space-y-2">
                  <ThinkingPanel reasoning={liveReasoning} active={state === 'streaming'} />
                  <div className="flex justify-center">
                    <ElapsedTicker startedAt={startedAt} />
                  </div>
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
                  aria-label={t('chat.scrollToLatest')}
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
                  {t('chat.retry')}
                </button>
                <button onClick={dismissError} aria-label={t('chat.dismissError')}>
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
              {/* Attachments — Azura can see images, so the picker sits
                  directly above the mode row where the thumb is. */}
              {attachments.length > 0 || !busy ? (
                <AttachmentBar
                  attachments={attachments}
                  onAdd={handleAddFiles}
                  onRemove={removeAttachment}
                  busy={composerBusy}
                  error={attachError}
                />
              ) : null}

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
                        {t(m.labelKey)}
                      </span>
                    </button>
                  )
                })}
                {/* Prompt tools — a sheet of one-tap rewrites. */}
                <div className="ms-1 shrink-0">
                  <ToolButton onClick={() => setToolsOpen(true)} />
                </div>
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
                    // Uncontrolled: defaultValue only, never `value` —
                    // keeps IME composition (Persian/Arabic) intact.
                    defaultValue=""
                    dir="auto"
                    onChange={(e) => {
                      setHasText(e.target.value.trim().length > 0)
                      e.target.style.height = 'auto'
                      e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`
                      saveDraft(e.target.value)
                      syncCalc(e.target.value)
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
                        ? t('chat.listening')
                        : attachments.length > 0
                          ? t('chat.placeholderImage')
                          : mode === 'research'
                            ? t('chat.placeholderResearch')
                            : t('chat.placeholder')
                    }
                    className="max-h-[140px] w-full resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                  />
                  {mode === 'research' && !hasText ? (
                    <span className="ml-2 mb-1.5 hidden shrink-0 items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-[10px] font-medium text-brand-strong sm:flex">
                      <Globe className="h-3 w-3" />
                      web
                    </span>
                  ) : null}
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
                      aria-label={voice.listening ? t('chat.stopDictation') : t('chat.startDictation')}
                    >
                      {voice.listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                    </button>
                  ) : null}
                </motion.div>

                {/* Arithmetic typed into the composer, resolved on-device. */}
                <AnimatePresence>
                  {calc ? (
                    <CalcChip
                      expression={calc.expr}
                      result={calc.result}
                      onUse={(value) => {
                        setComposerText(value)
                        syncCalc(value)
                      }}
                    />
                  ) : null}
                </AnimatePresence>

                {/* ChatGPT-style morphing button: muted circle → brand
                    gradient arrow when there's text → red stop while
                    streaming. One element, spring-morphed between states. */}
                <motion.button
                  layout
                  onClick={() => {
                    if (busy) {
                      cancel()
                      haptic('heavy')
                    } else {
                      handleSend()
                    }
                  }}
                  disabled={!busy && !hasText && attachments.length === 0}
                  whileTap={{ scale: 0.86 }}
                  transition={spring}
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white transition-[background-color,box-shadow] duration-200 ${
                    busy
                      ? 'bg-destructive shadow-lg shadow-destructive/30'
                      : hasText || attachments.length > 0
                        ? 'bg-gradient-to-br from-brand-strong to-brand-deep shadow-lg shadow-brand/30'
                        : 'bg-muted-foreground/25 shadow-none'
                  }`}
                  aria-label={busy ? t('composer.stop') : t('composer.send')}
                >
                  <AnimatePresence mode="wait" initial={false}>
                    {busy ? (
                      <motion.span
                        key="stop"
                        initial={{ scale: 0.4, opacity: 0, rotate: -90 }}
                        animate={{ scale: 1, opacity: 1, rotate: 0 }}
                        exit={{ scale: 0.4, opacity: 0, rotate: 90 }}
                        transition={{ duration: 0.16, ease: 'easeOut' }}
                        className="flex"
                      >
                        <span className="block h-3 w-3 rounded-[3px] bg-current" />
                      </motion.span>
                    ) : (
                      <motion.span
                        key="send"
                        initial={{ scale: 0.5, opacity: 0, y: 5 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.5, opacity: 0, y: -5 }}
                        transition={{ duration: 0.16, ease: 'easeOut' }}
                        className="flex"
                      >
                        <ArrowUp className="h-5 w-5" strokeWidth={2.5} />
                      </motion.span>
                    )}
                  </AnimatePresence>
                </motion.button>
              </div>

              <p className="pt-1.5 text-center text-[10px] text-muted-foreground">
                {t('chat.disclaimer')}
              </p>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Prompt tools live outside the message column so the sheet can cover
          the whole screen while the composer stays mounted behind it. */}
      <ToolSheet open={toolsOpen} onClose={() => setToolsOpen(false)} onPick={applyTool} />
    </div>
  )
}

// ─── Empty state ─────────────────────────────────────────────────────────────

function EmptyState({
  mode,
  onSuggestion,
}: {
  mode: ChatMode
  onSuggestion: (text: string) => void
}) {
  const { t } = useI18n()
  const suggestions: Record<ChatMode, string[]> = {
    fast: [t('sug.fast.0'), t('sug.fast.1'), t('sug.fast.2')],
    thinking: [t('sug.thinking.0'), t('sug.thinking.1'), t('sug.thinking.2')],
    research: [t('sug.research.0'), t('sug.research.1'), t('sug.research.2')],
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring}
      className="flex flex-col items-center justify-center gap-5 py-14 text-center"
    >
      <motion.div
        animate={{ y: [0, -6, 0] }}
        transition={{ repeat: Infinity, duration: 3.4, ease: 'easeInOut' }}
        className="brand-orb flex h-20 w-20 items-center justify-center rounded-3xl shadow-xl"
      >
        <AzuraLogoAnimated size={38} />
      </motion.div>
      <div>
        <h2 className="text-lg font-semibold">{t('chat.emptyTitle')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {mode === 'fast'
            ? t('chat.emptyFast')
            : mode === 'thinking'
              ? t('chat.emptyThinking')
              : t('chat.emptyResearch')}
        </p>
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
            className="w-full rounded-xl border border-border bg-card/60 px-4 py-2.5 text-start text-sm backdrop-blur transition-colors hover:border-border-strong"
          >
            {s}
          </motion.button>
        ))}
      </div>
    </motion.div>
  )
}
