'use client'

/**
 * AppSettingsPanel — Grok-style settings sheet for the app experience.
 *
 * Theme (Light / Dark / Auto), integrations entry point, and local data
 * management (export or clear conversation history). Purely client-side;
 * no server round-trips needed.
 */

import * as React from 'react'
import { motion } from 'framer-motion'
import {
  Palette,
  Plug,
  Download,
  Trash2,
  ChevronRight,
  Check,
  MessageSquare,
  ShieldCheck,
} from 'lucide-react'
import { useTheme } from '@/components/theme'
import { AzuraLogo } from '@/components/brand/logo'
import { useConversations } from './use-conversations'
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
  const { theme } = useTheme()
  const { conversations, remove } = useConversations()
  const [confirmClear, setConfirmClear] = React.useState(false)
  const [cleared, setCleared] = React.useState(false)
  const [exported, setExported] = React.useState(false)

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
            <h2 className="text-sm font-semibold">Appearance</h2>
          </div>
          <div className="flex items-center justify-between px-4 py-3.5">
            <div>
              <p className="text-sm font-medium">Theme</p>
              <p className="text-xs text-muted-foreground">
                {theme === 'dark' ? 'Dark (default)' : theme === 'light' ? 'Light' : 'Follow system'}
              </p>
            </div>
            <ThemeSelector current={theme} />
          </div>
        </section>

        {/* Integrations */}
        <section className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <Plug className="h-4 w-4 text-brand-strong" />
            <h2 className="text-sm font-semibold">Integrations</h2>
          </div>
          <Row
            icon={<Plug className="h-4 w-4" />}
            title="Google account"
            subtitle="Gmail & Calendar daily brief"
            onClick={authed ? () => (window.location.href = '/app/integrations') : undefined}
            trailing={
              authed ? (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              ) : (
                <span className="text-xs text-muted-foreground">Sign in required</span>
              )
            }
          />
        </section>

        {/* Data */}
        <section className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <ShieldCheck className="h-4 w-4 text-brand-strong" />
            <h2 className="text-sm font-semibold">Your data</h2>
          </div>
          <Row
            icon={<Download className="h-4 w-4" />}
            title="Export chat history"
            subtitle="Download as JSON"
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
                Delete all {conversations.length} chats? This cannot be undone.
              </span>
              <button
                onClick={clearAll}
                className="rounded-lg bg-destructive px-3 py-1.5 text-xs font-semibold text-destructive-foreground"
              >
                Delete all
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
              title="Clear all chats"
              subtitle={cleared ? 'Done ✓' : 'Remove every conversation from this device'}
              onClick={() => setConfirmClear(true)}
              danger
            />
          )}
        </section>

        {/* Chats list shortcut */}
        <section className="overflow-hidden rounded-2xl border border-border bg-card">
          <Row
            icon={<MessageSquare className="h-4 w-4" />}
            title="Back to chat"
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

function ThemeSelector({ current }: { current: string }) {
  const { setTheme } = useTheme()
  const options: Array<{ key: 'light' | 'dark' | 'system'; label: string }> = [
    { key: 'light', label: 'Light' },
    { key: 'dark', label: 'Dark' },
    { key: 'system', label: 'Auto' },
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
