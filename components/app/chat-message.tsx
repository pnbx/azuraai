'use client'

/**
 * AppChatMessage — ChatGPT/Grok-style message row.
 *
 * - Assistant: brand avatar, markdown body, source cards, message actions
 *   (copy / regenerate / like / dislike) revealed on hover or after stream.
 * - User: right-aligned bubble with copy + edit actions.
 * - Streaming: blinking brand caret at the tail of the text.
 */

import * as React from 'react'
import { motion } from 'framer-motion'
import {
  Check,
  Copy,
  RefreshCcw,
  ThumbsUp,
  ThumbsDown,
  Globe,
  Pencil,
  Brain,
  ChevronDown,
  Volume2,
  Square,
  Share2,
} from 'lucide-react'
import type { ChatMsg } from './conversations'
import { Markdown } from './markdown'
import { ReasoningText } from './thinking-panel'
import { openExternal } from './external-link'
import { MessageImages } from './attachments'
import { copyText, downloadTextFile, exportFilename } from './text-utils'
import { haptic } from './haptics'

const spring = { type: 'spring' as const, stiffness: 380, damping: 30 }

/** Compact relative timestamp for message rows. */
function msgTime(ts?: number): string {
  if (!ts) return ''
  const diff = Date.now() - ts
  if (diff < 60_000) return 'now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// ─── Brand avatar ────────────────────────────────────────────────────────────

export function AzuraAvatar({ size = 28 }: { size?: number }) {
  return (
    <span
      className="brand-orb inline-flex shrink-0 items-center justify-center rounded-full"
      style={{ width: size, height: size }}
      aria-hidden
    >
      {/* The four-point spark from the logo mark */}
      <svg
        width={size * 0.55}
        height={size * 0.55}
        viewBox="0 0 24 24"
        fill="none"
        stroke="white"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 3l1.9 5.8L20 12l-6.1 3.2L12 21l-1.9-5.8L4 12l6.1-3.2L12 3z" />
      </svg>
    </span>
  )
}

// ─── Message actions ─────────────────────────────────────────────────────────

function ActionButton({
  onClick,
  label,
  children,
  active,
}: {
  onClick?: () => void
  label: string
  children: React.ReactNode
  active?: boolean
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
        active
          ? 'bg-brand-soft text-brand-strong'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      }`}
    >
      {children}
    </button>
  )
}

function AssistantActions({
  content,
  onRegenerate,
  onSpeak,
  speaking,
  speechSupported,
  onShare,
}: {
  content: string
  onRegenerate?: () => void
  onSpeak?: () => void
  speaking?: boolean
  speechSupported?: boolean
  onShare?: () => void
}) {
  const [copied, setCopied] = React.useState(false)
  const [vote, setVote] = React.useState<'up' | 'down' | null>(null)

  const copy = async () => {
    if (await copyText(content)) {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    }
  }

  return (
    <div className="mt-2 flex items-center gap-0.5 opacity-100 transition-opacity md:opacity-0 md:group-hover/msg:opacity-100">
      {speechSupported ? (
        <ActionButton
          onClick={() => {
            onSpeak?.()
            haptic(speaking ? 'medium' : 'light')
          }}
          label={speaking ? 'Stop reading aloud' : 'Read aloud'}
          active={speaking}
        >
          {speaking ? <Square className="h-3 w-3" /> : <Volume2 className="h-3.5 w-3.5" />}
        </ActionButton>
      ) : null}
      {onShare ? (
        <ActionButton onClick={onShare} label="Share response">
          <Share2 className="h-3.5 w-3.5" />
        </ActionButton>
      ) : null}
      <ActionButton onClick={copy} label={copied ? 'Copied' : 'Copy response'}>
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </ActionButton>
      {onRegenerate ? (
        <ActionButton onClick={onRegenerate} label="Regenerate response">
          <RefreshCcw className="h-3.5 w-3.5" />
        </ActionButton>
      ) : null}
      <ActionButton
        onClick={() => setVote((v) => (v === 'up' ? null : 'up'))}
        label="Good response"
        active={vote === 'up'}
      >
        <ThumbsUp className="h-3.5 w-3.5" />
      </ActionButton>
      <ActionButton
        onClick={() => setVote((v) => (v === 'down' ? null : 'down'))}
        label="Bad response"
        active={vote === 'down'}
      >
        <ThumbsDown className="h-3.5 w-3.5" />
      </ActionButton>
    </div>
  )
}

// ─── Source cards ────────────────────────────────────────────────────────────

function SourceCards({ sources }: { sources: NonNullable<ChatMsg['sources']> }) {
  return (
    <div className="flex flex-wrap gap-2">
      {sources.map((s, i) => (
        <motion.a
          key={s.url}
          href={s.url}
          onClick={(e) => {
            e.preventDefault()
            void openExternal(s.url)
          }}
          initial={{ opacity: 0, y: 8, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: 0.05 * i, type: 'spring', stiffness: 300, damping: 24 }}
          whileTap={{ scale: 0.97 }}
          className="flex max-w-[240px] items-center gap-2 rounded-xl border border-border bg-card/80 px-3 py-2 backdrop-blur transition-colors hover:border-border-strong"
        >
          <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate text-xs font-medium">{s.title}</span>
          <sup className="text-[0.65em] font-semibold text-brand-strong">{i + 1}</sup>
        </motion.a>
      ))}
    </div>
  )
}

// ─── Reasoning block (collapsed inside finished messages) ────────────────────

function ReasoningBlock({ reasoning, live }: { reasoning: string; live?: boolean }) {
  const [open, setOpen] = React.useState(false)
  return (
    <div className="mb-3">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <Brain className="h-3.5 w-3.5 text-brand-strong" />
        <span>Thought for a moment · {reasoning.length.toLocaleString()} chars</span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={spring}>
          <ChevronDown className="h-3.5 w-3.5" />
        </motion.span>
      </button>
      {open ? (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          transition={spring}
          className="overflow-hidden"
        >
          <div className="mt-2 max-h-56 overflow-y-auto rounded-xl border border-border bg-muted/50 p-3">
            <ReasoningText text={reasoning} live={live} />
          </div>
        </motion.div>
      ) : null}
    </div>
  )
}

// ─── The message ─────────────────────────────────────────────────────────────

export function AppChatMessage({
  message,
  messageId,
  isStreaming,
  onRegenerate,
  onEditUser,
  onSpeak,
  speaking,
  speechSupported,
}: {
  message: ChatMsg
  messageId: string
  isStreaming?: boolean
  onRegenerate?: () => void
  onEditUser?: (text: string) => void
  onSpeak?: () => void
  speaking?: boolean
  speechSupported?: boolean
}) {
  const [editing, setEditing] = React.useState(false)
  const [draft, setDraft] = React.useState(message.content)
  const [copied, setCopied] = React.useState(false)

  const share = async () => {
    const md = message.content
    // Prefer the OS share sheet so the user can send it anywhere; fall back
    // to a Markdown file download when Web Share isn't available.
    const nav = typeof navigator !== 'undefined' ? navigator : undefined
    if (nav?.share) {
      try {
        await nav.share({ text: md })
        return
      } catch {
        // user dismissed the sheet, or it failed — fall through
      }
    }
    downloadTextFile(exportFilename('azura-response'), md)
  }

  if (message.role === 'user') {
    return (
      <motion.div
        layout
        initial={{ opacity: 0, y: 14, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={spring}
        className="group/msg flex flex-col items-end"
      >
        {editing ? (
          <div className="w-full max-w-[85%] rounded-2xl border border-border-strong bg-card p-3">
            <textarea
              autoFocus
              defaultValue={message.content}
              onInput={(e) => setDraft((e.target as HTMLTextAreaElement).value)}
              rows={Math.min(8, draft.split('\n').length + 1)}
              className="w-full resize-none bg-transparent text-sm outline-none"
            />
            <div className="mt-2 flex justify-end gap-2 text-xs font-medium">
              <button
                onClick={() => {
                  setDraft(message.content)
                  setEditing(false)
                }}
                className="rounded-lg px-3 py-1.5 text-muted-foreground hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setEditing(false)
                  if (draft.trim() && draft !== message.content) onEditUser?.(draft.trim())
                }}
                className="rounded-lg bg-primary px-3 py-1.5 text-primary-foreground"
              >
                Send
              </button>
            </div>
          </div>
        ) : (
          <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-primary-foreground shadow-sm">
            {message.images && message.images.length > 0 ? (
              <MessageImages images={message.images} />
            ) : null}
            {message.content ? (
              <p dir="auto" className="whitespace-pre-wrap text-sm leading-relaxed">
                {message.content}
              </p>
            ) : null}
          </div>
        )}
        {!editing && (
          <div className="mt-1 mr-1 flex items-center gap-0.5 opacity-100 transition-opacity md:opacity-0 md:group-hover/msg:opacity-100">
            {msgTime(message.ts) ? (
              <span className="mr-1 text-[10px] tabular-nums text-muted-foreground" title={message.ts ? new Date(message.ts).toLocaleString() : undefined}>
                {msgTime(message.ts)}
              </span>
            ) : null}
            <ActionButton
              onClick={async () => {
                if (await copyText(message.content)) {
                  setCopied(true)
                  setTimeout(() => setCopied(false), 1800)
                }
              }}
              label={copied ? 'Copied' : 'Copy message'}
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </ActionButton>
            {onEditUser ? (
              <ActionButton onClick={() => setEditing(true)} label="Edit message">
                <Pencil className="h-3.5 w-3.5" />
              </ActionButton>
            ) : null}
          </div>
        )}
      </motion.div>
    )
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring}
      className="group/msg flex gap-3"
    >
      <div className="pt-0.5">
        <AzuraAvatar />
      </div>
      <div className="min-w-0 flex-1">
        <div
          dir="auto"
          className={`rounded-2xl rounded-bl-md px-1 py-1 ${
            message.failed ? 'text-destructive' : ''
          }`}
        >
          {message.reasoning ? (
            <ReasoningBlock reasoning={message.reasoning} live={isStreaming} />
          ) : null}

          {message.content ? (
            <>
              <Markdown text={message.content} />
              {isStreaming ? <span className="stream-caret" /> : null}
            </>
          ) : isStreaming ? (
            <ThinkingDots />
          ) : message.failed ? (
            <p className="text-sm">Something went wrong — try again.</p>
          ) : null}

          {message.sources && message.sources.length > 0 ? (
            <div className="mt-3 border-t border-border pt-3">
              <SourceCards sources={message.sources} />
            </div>
          ) : null}
        </div>

        {!isStreaming && message.content && !message.failed ? (
          <div className="flex items-center gap-1">
            {msgTime(message.ts) ? (
              <span className="text-[10px] tabular-nums text-muted-foreground" title={message.ts ? new Date(message.ts).toLocaleString() : undefined}>
                {msgTime(message.ts)}
              </span>
            ) : null}
            <AssistantActions
              content={message.content}
              onRegenerate={onRegenerate}
              onSpeak={onSpeak}
              speaking={speaking}
              speechSupported={speechSupported}
              onShare={share}
            />
          </div>
        ) : null}
      </div>
    </motion.div>
  )
}

function ThinkingDots() {
  return (
    <div className="flex items-center gap-1.5 py-2">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="h-2 w-2 rounded-full bg-brand-strong/60"
          animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }}
          transition={{ repeat: Infinity, duration: 1.1, delay: i * 0.18 }}
        />
      ))}
    </div>
  )
}
