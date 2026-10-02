'use client'

/**
 * AppSettingsPanel — Grok-style settings sheet for the app experience.
 *
 * Theme (Light / Dark / Auto), integrations entry point, and local data
 * management (export or clear conversation history). Purely client-side;
 * no server round-trips needed.
 */

import * as React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Palette,
  Plug,
  Download,
  Trash2,
  ChevronRight,
  Check,
  MessageSquare,
  ShieldCheck,
  Brain,
  X,
} from 'lucide-react'
import { useTheme } from '@/components/theme'
import { AzuraLogo } from '@/components/brand/logo'
import { useConversations } from './use-conversations'
import { useMemory } from './use-memory'
import { useI18n } from './i18n-provider'
import { haptic } from './haptics'

const spring = { type: 'spring' as const, stiffness: 340, damping: 28 }

function Row({
  icon,
  title,
  subtitle,
  onClick,
  trailing,
  danger,
}: {
  icon: React.ReactNode
  title: string
  subtitle?: string
  onClick?: () => void
  trailing?: React.ReactNode
  danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted/60 ${
        danger ? 'text-destructive' : ''
      }`}
    >
      <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${danger ? 'bg-destructive/10' : 'bg-muted'}`}>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{title}</span>
        {subtitle ? <span className="block text-xs text-muted-foreground">{subtitle}</span> : null}
      </span>
      {trailing ?? <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
    </button>
  )
}

export function AppSettingsPanel({ authed }: { authed: boolean }) {
  const { t, locale } = useI18n()
  const { theme } = useTheme()
  const { conversations, remove } = useConversations()
  const memory = useMemory()
  const [confirmClear, setConfirmClear] = React.useState(false)
  const [cleared, setCleared] = React.useState(false)
  const [exported, setExported] = React.useState(false)
  const [newMemory, setNewMemory] = React.useState('')
  const [memoryAdded, setMemoryAdded] = React.useState(false)

  const messageCount = conversations.reduce((n, c) => n + c.messages.length, 0)

  const exportData = () => {
    const blob = new Blob([JSON.stringify(conversations, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `azura-chats-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    setExported(true)
    haptic('light')
    setTimeout(() => setExported(false), 2000)
  }

  const clearAll = () => {
    conversations.map((c) => remove(c.id))
    setConfirmClear(false)
    setCleared(true)
    haptic('heavy')
    setTimeout(() => setCleared(false), 2000)
  }

  return (
    <div className="mx-auto min-h-dvh w-full max-w-lg px-4 pb-16 pt-safe">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
        {/* Header */}
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <AzuraLogo size={56} rounded="rounded-2xl" />
          <div>
            <h1 className="text-lg font-semibold">Settings</h1>
            <p className="text-xs text-muted-foreground">
              {conversations.length} chats · {messageCount} messages on this device
            </p>
          </div>
        </div>
      </motion.div>

      <div className="space-y-4">
        {/* Appearance */}
        <section className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <Palette className="h-4 w-4 text-brand-strong" />
            <h2 className="text-sm font-semibold">{t('settings.appearance')}</h2>
          </div>
          <div className="flex items-center justify-between px-4 py-3.5">
            <div>
              <p className="text-sm font-medium">{t('settings.theme')}</p>
              <p className="text-xs text-muted-foreground">
                {theme === 'dark' ? t('settings.themeDark') : theme === 'light' ? t('settings.themeLight') : t('settings.themeSystem')}
              </p>
            </div>
            <ThemeSelector current={theme} />
          </div>
          {/* Manual override of the auto-detected device language. */}
          <div className="flex items-center justify-between border-t border-border px-4 py-3.5">
            <div>
              <p className="text-sm font-medium">{t('settings.language')}</p>
              <p className="text-xs text-muted-foreground">
                {locale === 'fa' ? t('settings.langFa') : t('settings.langEn')}
              </p>
            </div>
            <LocaleSelector />
          </div>
        </section>

        {/* Memory */}
        <MemorySection
          authed={authed}
          memory={memory}
          newMemory={newMemory}
          setNewMemory={setNewMemory}
          memoryAdded={memoryAdded}
          setMemoryAdded={setMemoryAdded}
        />

        {/* Integrations */}
        <section className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <Plug className="h-4 w-4 text-brand-strong" />
            <h2 className="text-sm font-semibold">{t('settings.integrations')}</h2>
          </div>
          <Row
            icon={<Plug className="h-4 w-4" />}
            title={t('settings.google')}
            subtitle={t('settings.googleSub')}
            onClick={authed ? () => (window.location.href = '/app/integrations') : undefined}
            trailing={
              authed ? (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              ) : (
                <span className="text-xs text-muted-foreground">{t('settings.notAvailable')}</span>
              )
            }
          />
        </section>

        {/* Data */}
        <section className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <ShieldCheck className="h-4 w-4 text-brand-strong" />
            <h2 className="text-sm font-semibold">{t('settings.data')}</h2>
          </div>
          <Row
            icon={<Download className="h-4 w-4" />}
            title={t('settings.exportChats')}
            subtitle={t('settings.exportChatsSub')}
            onClick={exportData}
            trailing={
              exported ? (
                <Check className="h-4 w-4 text-success" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )
            }
          />
          {confirmClear ? (
            <div className="flex items-center gap-2 border-t border-border px-4 py-3">
              <span className="flex-1 text-xs text-muted-foreground">
                {t('settings.clearConfirm')} ({conversations.length})
              </span>
              <button
                onClick={clearAll}
                className="rounded-lg bg-destructive px-3 py-1.5 text-xs font-semibold text-destructive-foreground"
              >
                {t('settings.clearChats')}
              </button>
              <button
                onClick={() => setConfirmClear(false)}
                className="rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted"
              >
                Cancel
              </button>
            </div>
          ) : (
            <Row
              icon={<Trash2 className="h-4 w-4" />}
              title={t('settings.clearChats')}
              subtitle={cleared ? t('settings.cleared') : t('settings.clearChatsSub')}
              onClick={() => setConfirmClear(true)}
              danger
            />
          )}
        </section>

        {/* Chats list shortcut */}
        <section className="overflow-hidden rounded-2xl border border-border bg-card">
          <Row
            icon={<MessageSquare className="h-4 w-4" />}
            title={t('settings.back')}
            onClick={() => (window.location.href = '/app')}
          />
        </section>

        {/* About */}
        <section className="rounded-2xl border border-border bg-card p-4 text-center">
          <AzuraLogo size={40} rounded="rounded-xl" className="mx-auto" />
          <p className="mt-2 text-sm font-semibold">Azura</p>
          <p className="text-[11px] text-muted-foreground">
            Version 1.0.0 · Android & Web
          </p>
          <p className="mx-auto mt-2 max-w-xs text-[11px] leading-relaxed text-muted-foreground">
            Fast answers, deep thinking, and web-grounded research. Your chats
            are stored only on this device — nothing is shared without your
            action.
          </p>
        </section>
      </div>
    </div>
  )
}

/** Two-way switch for the app language, overriding device auto-detection. */
function LocaleSelector() {
  const { locale, setLocale, t } = useI18n()
  const options: Array<{ key: 'fa' | 'en'; label: string }> = [
    { key: 'fa', label: 'فارسی' },
    { key: 'en', label: 'English' },
  ]
  return (
    <div className="inline-flex items-center rounded-full border border-border bg-muted p-0.5 text-xs">
      {options.map((o) => (
        <button
          key={o.key}
          onClick={() => {
            setLocale(o.key)
            haptic('light')
          }}
          aria-label={o.key === 'fa' ? t('settings.langFa') : t('settings.langEn')}
          className={`rounded-full px-3 py-1 font-medium transition-colors ${
            locale === o.key
              ? 'bg-card text-card-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function ThemeSelector({ current }: { current: string }) {
  const { setTheme } = useTheme()
  const { t } = useI18n()
  const options: Array<{ key: 'light' | 'dark' | 'system'; label: string }> = [
    { key: 'light', label: t('settings.themeLight') },
    { key: 'dark', label: t('settings.themeDark') },
    { key: 'system', label: t('settings.themeSystem') },
  ]
  return (
    <div className="inline-flex items-center rounded-full border border-border bg-muted p-0.5 text-xs">
      {options.map((o) => (
        <button
          key={o.key}
          onClick={() => {
            setTheme(o.key)
            haptic('light')
          }}
          className={`rounded-full px-3 py-1 font-medium transition-colors ${
            current === o.key
              ? 'bg-card text-card-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

// ─── Memory section ──────────────────────────────────────────────────────────

type MemoryApi = ReturnType<typeof useMemory>

const memorySpring = { type: 'spring' as const, stiffness: 340, damping: 28 }

function MemorySection({
  authed,
  memory,
  newMemory,
  setNewMemory,
  memoryAdded,
  setMemoryAdded,
}: {
  authed: boolean
  memory: MemoryApi
  newMemory: string
  setNewMemory: (v: string) => void
  memoryAdded: boolean
  setMemoryAdded: (v: boolean) => void
}) {
  const { t } = useI18n()
  const [confirmForgetAll, setConfirmForgetAll] = React.useState(false)

  // Sync the mirror once on mount (and whenever the user re-opens settings).
  React.useEffect(() => {
    if (authed) void memory.refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const submitManual = async () => {
    const t = newMemory.trim()
    if (t.length < 3) return
    const ok = await memory.add(t)
    if (ok) {
      setNewMemory('')
      setMemoryAdded(true)
      haptic('light')
      setTimeout(() => setMemoryAdded(false), 1800)
    }
  }

  if (!authed) {
    return (
      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Brain className="h-4 w-4 text-brand-strong" />
          <h2 className="text-sm font-semibold">{t('settings.memory')}</h2>
        </div>
        <p className="px-4 py-3.5 text-xs text-muted-foreground">
          {t('settings.memoryUnavailable')}
        </p>
      </section>
    )
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-brand-strong" />
          <h2 className="text-sm font-semibold">Memory</h2>
        </div>
        <span className="text-[11px] text-muted-foreground">
          {memory.memories.length} saved
        </span>
      </div>

      {/* Opt-out toggle */}
      <div className="flex items-center justify-between px-4 py-3.5">
        <div>
          <p className="text-sm font-medium">Memory enabled</p>
          <p className="text-xs text-muted-foreground">
            {memory.optedOut
              ? 'Azura will not read or learn memories.'
              : 'Azura learns durable facts from your chats and uses them later.'}
          </p>
        </div>
        <button
          onClick={() => {
            memory.setOptOut(!memory.optedOut)
            haptic('light')
          }}
          role="switch"
          aria-checked={!memory.optedOut}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
            memory.optedOut ? 'bg-muted-foreground/40' : 'bg-brand'
          }`}
          aria-label="Toggle memory"
        >
          <motion.span
            layout
            transition={memorySpring}
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow ${
              memory.optedOut ? 'left-0.5' : 'left-[1.375rem]'
            }`}
          />
        </button>
      </div>

      {memory.optedOut ? null : (
        <>
          {/* Manual add */}
          <div className="flex items-center gap-2 border-t border-border px-4 py-3">
            {/* Uncontrolled-safe pattern: value+onChange is fine here — this is
                a plain Latin/persian text field with no composition-critical
                per-keystroke logic; IME stays intact because we never rewrite
                user text back into the field. */}
            <input
              value={newMemory}
              onChange={(e) => setNewMemory(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void submitManual()
                }
              }}
              placeholder="Teach Azura something to remember…"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            <button
              onClick={() => void submitManual()}
              disabled={newMemory.trim().length < 3}
              className="shrink-0 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
            >
              {memoryAdded ? <Check className="h-3.5 w-3.5" /> : 'Save'}
            </button>
          </div>

          {/* Memory list */}
          {memory.memories.length > 0 ? (
            <div className="max-h-64 overflow-y-auto border-t border-border">
              <AnimatePresence initial={false}>
                {memory.memories.map((m) => (
                  <motion.div
                    key={m.id}
                    layout
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -12 }}
                    transition={memorySpring}
                    className="group/mem flex items-center gap-2 px-4 py-2.5"
                  >
                    <span className="min-w-0 flex-1">
                      <span dir="auto" className="block truncate text-xs text-foreground/90">
                        {m.content}
                      </span>
                      {m.source === 'manual' ? (
                        <span className="text-[10px] text-muted-foreground">added by you</span>
                      ) : null}
                    </span>
                    <button
                      onClick={() => {
                        void memory.forget(m.id)
                        haptic('medium')
                      }}
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      aria-label="Forget this memory"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          ) : (
            <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
              Nothing learned yet — just chat, or teach Azura something above.
            </p>
          )}

          {/* Forget all */}
          {memory.memories.length > 0 ? (
            <div className="border-t border-border px-4 py-3">
              {confirmForgetAll ? (
                <div className="flex items-center gap-2 text-xs">
                  <span className="flex-1 text-muted-foreground">
                    Forget all {memory.memories.length} memories?
                  </span>
                  <button
                    onClick={() => {
                      void memory.forgetAll()
                      setConfirmForgetAll(false)
                      haptic('heavy')
                    }}
                    className="rounded-lg bg-destructive px-3 py-1.5 font-semibold text-destructive-foreground"
                  >
                    Forget all
                  </button>
                  <button
                    onClick={() => setConfirmForgetAll(false)}
                    className="rounded-lg px-3 py-1.5 text-muted-foreground hover:bg-muted"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmForgetAll(true)}
                  className="text-xs font-medium text-destructive hover:underline"
                >
                  Forget all memories
                </button>
              )}
            </div>
          ) : null}
        </>
      )}
    </section>
  )
}
