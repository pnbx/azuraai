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
import { SourceRail } from './sources-sheet'
import { ResponseBadge } from './response-timer'
import { MessageImages } from './attachments'
import { AzuraMark, AzuraLogoAnimated } from '@/components/brand/logo'
import { copyText, downloadTextFile, exportFilename } from './text-utils'
import { haptic } from './haptics'
import { useI18n } from './i18n-provider'
import { translate, type Locale } from '@/lib/i18n'

const spring = { type: 'spring' as const, stiffness: 380, damping: 30 }

/** Compact relative timestamp for message rows. */
function msgTime(ts?: number, locale: Locale = 'en'): string {
  if (!ts) return ''
  const diff = Date.now() - ts
  if (diff < 60_000) return translate(locale, 'msg.timeNow')
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// ─── Brand avatar ────────────────────────────────────────────────────────────

export function AzuraAvatar({ size = 28 }: { size?: number }) {
  return (
    <span
      className="brand-orb inline-flex shrink-0 items-center justify-center rounded-xl"
      style={{ width: size * 1.5, height: size }}
      aria-hidden
    >
      <AzuraMark size={size * 0.78} light />
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
  const { t } = useI18n()

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
          label={speaking ? t('msg.stopSpeak') : t('msg.speak')}
          active={speaking}
        >
          {speaking ? <Square className="h-3 w-3" /> : <Volume2 className="h-3.5 w-3.5" />}
        </ActionButton>
      ) : null}
      {onShare ? (
        <ActionButton onClick={onShare} label={t('msg.share')}>
          <Share2 className="h-3.5 w-3.5" />
        </ActionButton>
      ) : null}
      <ActionButton onClick={copy} label={copied ? t('msg.copied') : t('msg.copyResponse')}>
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </ActionButton>
      {onRegenerate ? (
        <ActionButton onClick={onRegenerate} label={t('msg.regenerate')}>
          <RefreshCcw className="h-3.5 w-3.5" />
        </ActionButton>
      ) : null}
      <ActionButton
        onClick={() => setVote((v) => (v === 'up' ? null : 'up'))}
        label={t('msg.good')}
        active={vote === 'up'}
      >
        <ThumbsUp className="h-3.5 w-3.5" />
      </ActionButton>
      <ActionButton
        onClick={() => setVote((v) => (v === 'down' ? null : 'down'))}
        label={t('msg.bad')}
        active={vote === 'down'}
      >
        <ThumbsDown className="h-3.5 w-3.5" />
      </ActionButton>
    </div>
  )
}

// ─── Reasoning block (collapsed inside finished messages) ────────────────────

function ReasoningBlock({ reasoning, live }: { reasoning: string; live?: boolean }) {
  const [open, setOpen] = React.useState(false)
  const { tf } = useI18n()
  return (
    <div className="mb-3">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <Brain className="h-3.5 w-3.5 text-brand-strong" />
        <span>{tf('msg.reasoning', { n: reasoning.length.toLocaleString() })}</span>
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
  const { t, locale } = useI18n()

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
                {t('msg.cancel')}
              </button>
              <button
                onClick={() => {
                  setEditing(false)
                  if (draft.trim() && draft !== message.content) onEditUser?.(draft.trim())
                }}
                className="rounded-lg bg-primary px-3 py-1.5 text-primary-foreground"
              >
                {t('msg.sendEdit')}
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
            {msgTime(message.ts, locale) ? (
              <span className="mr-1 text-[10px] tabular-nums text-muted-foreground" title={message.ts ? new Date(message.ts).toLocaleString() : undefined}>
                {msgTime(message.ts, locale)}
              </span>
            ) : null}
            <ActionButton
              onClick={async () => {
                if (await copyText(message.content)) {
                  setCopied(true)
                  setTimeout(() => setCopied(false), 1800)
                }
              }}
              label={copied ? t('msg.copied') : t('msg.copyMessage')}
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </ActionButton>
            {onEditUser ? (
              <ActionButton onClick={() => setEditing(true)} label={t('msg.edit')}>
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
            <p className="text-sm">{t('msg.failed')}</p>
          ) : null}

          {message.sources && message.sources.length > 0 ? (
            <div className="mt-3 border-t border-border pt-3">
              <SourceRail sources={message.sources} />
            </div>
          ) : null}
        </div>

        {!isStreaming && message.content && !message.failed ? (
          <div className="flex items-center gap-1">
            {msgTime(message.ts, locale) ? (
              <span className="text-[10px] tabular-nums text-muted-foreground" title={message.ts ? new Date(message.ts).toLocaleString() : undefined}>
                {msgTime(message.ts, locale)}
              </span>
            ) : null}
            {/* Frozen server-measured reply timing. Absent on messages
                restored from an older conversation, and on failed replies,
                which is correct — there was no reply to time. */}
            {message.role === 'assistant' && message.timings ? (
              <ResponseBadge timings={message.timings} />
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
  const { t } = useI18n()
  return (
    <div className="flex items-center gap-2 py-3">
      <AzuraLogoAnimated size={18} />
      <span className="text-sm text-muted-foreground">{t('chat.thinking')}</span>
    </div>
  )
}
