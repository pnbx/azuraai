'use client'

/**
 * AppIntegrationsPanel
 *
 * Google connect / disconnect + the one-click "daily brief"
 * (Gmail unread summary + today's calendar events).
 */

import * as React from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Mail, CalendarDays, Link2, Unlink, RefreshCw, Loader2 } from 'lucide-react'

const spring = { type: 'spring' as const, stiffness: 340, damping: 28 }

interface Status {
  connected: boolean
  googleEmail: string | null
  serverConfigured: boolean
}

interface Summary {
  gmail: { unreadCount: number; messages: Array<{ from: string; subject: string; date: string }> } | null
  gmailError: string | null
  calendar: { events: Array<{ summary: string; start: string; end: string }> } | null
  calendarError: string | null
}

function fmtTime(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  return isNaN(d.getTime()) ? iso : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function AppIntegrationsPanel() {
  const [status, setStatus] = React.useState<Status | null>(null)
  const [summary, setSummary] = React.useState<Summary | null>(null)
  const [loadingSummary, setLoadingSummary] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const loadStatus = React.useCallback(async () => {
    const res = await fetch('/api/app/google/status')
    const data = await res.json()
    if (data.success) setStatus(data)
  }, [])

  React.useEffect(() => {
    // Surface OAuth result flags from the callback redirect (deferred so the
    // effect body never calls setState synchronously).
    const flag = new URLSearchParams(window.location.search).get('google')
    const t = setTimeout(() => {
      if (flag && flag !== 'connected') setError(`google_${flag}`)
      loadStatus()
    }, 0)
    return () => clearTimeout(t)
  }, [loadStatus])

  async function loadBrief() {
    setLoadingSummary(true)
    setError(null)
    try {
      const res = await fetch('/api/app/google/summary')
      const data = await res.json()
      if (!data.success) {
        setError(data.error ?? 'brief_failed')
      } else {
        setSummary(data)
      }
    } finally {
      setLoadingSummary(false)
    }
  }

  if (!status) {
    return (
      <div className="mx-auto max-w-md p-6">
        <div className="h-24 animate-pulse rounded-2xl bg-muted" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-md space-y-4 p-4 pb-10">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={spring}
      >
        <h1 className="text-xl font-semibold">Integrations</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect Google to unlock Gmail and Calendar superpowers.
        </p>
      </motion.div>

      {/* Connection card */}
      <motion.div
        layout
        transition={spring}
        className="rounded-2xl border border-border bg-card p-4"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 via-red-500 to-yellow-500 text-white shadow">
            <Link2 className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Google account</p>
            <p className="truncate text-xs text-muted-foreground">
              {status.connected
                ? (status.googleEmail ?? 'Connected')
                : status.serverConfigured
                  ? 'Not connected'
                  : 'Not configured on server yet'}
            </p>
          </div>
        </div>

        <div className="mt-3 flex gap-2">
          {status.connected ? (
            <>
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={loadBrief}
                disabled={loadingSummary}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                {loadingSummary ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Daily brief
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={async () => {
                  await fetch('/api/app/google/disconnect', { method: 'POST' })
                  setStatus({ ...status, connected: false, googleEmail: null })
                  setSummary(null)
                }}
                className="flex items-center justify-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:text-destructive"
              >
                <Unlink className="h-4 w-4" />
              </motion.button>
            </>
          ) : (
            <motion.a
              whileTap={{ scale: 0.97 }}
              href="/api/app/google/start"
              className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium ${
                status.serverConfigured
                  ? 'bg-primary text-primary-foreground'
                  : 'pointer-events-none bg-muted text-muted-foreground'
              }`}
            >
              <Link2 className="h-4 w-4" />
              Connect Google
            </motion.a>
          )}
        </div>

        {!status.serverConfigured ? (
          <p className="mt-3 rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning-foreground/90 text-warning">
            Server needs GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET env vars — ask the operator.
          </p>
        ) : null}
      </motion.div>

      {error ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {/* Brief results */}
      <AnimatePresence>
        {summary ? (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={spring}
            className="space-y-3"
          >
            {/* Gmail */}
            <div className="rounded-2xl border border-border bg-card p-4">
              <div className="mb-3 flex items-center gap-2">
                <Mail className="h-4 w-4 text-info" />
                <h2 className="text-sm font-semibold">
                  Gmail {summary.gmail ? `· ${summary.gmail.unreadCount} unread` : ''}
                </h2>
              </div>
              {summary.gmailError ? (
                <p className="text-xs text-destructive">{summary.gmailError}</p>
              ) : summary.gmail && summary.gmail.messages.length > 0 ? (
                <div className="space-y-2">
                  {summary.gmail.messages.map((m, i) => (
                    <div key={i} className="rounded-lg border border-border/60 px-3 py-2">
                      <p className="truncate text-xs font-medium">{m.subject}</p>
                      <p className="truncate text-xs text-muted-foreground">{m.from}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Inbox zero. 🎉</p>
              )}
            </div>

            {/* Calendar */}
            <div className="rounded-2xl border border-border bg-card p-4">
              <div className="mb-3 flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-success" />
                <h2 className="text-sm font-semibold">Today</h2>
              </div>
              {summary.calendarError ? (
                <p className="text-xs text-destructive">{summary.calendarError}</p>
              ) : summary.calendar && summary.calendar.events.length > 0 ? (
                <div className="space-y-2">
                  {summary.calendar.events.map((e, i) => (
                    <div key={i} className="flex items-center gap-3 rounded-lg border border-border/60 px-3 py-2">
                      <span className="font-mono text-xs text-muted-foreground">{fmtTime(e.start)}</span>
                      <span className="truncate text-xs font-medium">{e.summary}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No events today.</p>
              )}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
