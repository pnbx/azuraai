'use client'

/**
 * Research sources sheet.
 *
 * Research answers cite [1] [2] … in the body, but until now the only way to see
 * what a citation pointed at was a chip with a truncated title. That made it
 * impossible to judge whether the answer was actually grounded, which is the
 * whole point of asking for a researched answer rather than a chat one.
 *
 * The sheet shows, per source: its number (matching the inline chip), the
 * title, the registrable domain, and the snippet the search returned.
 */

import * as React from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Globe, X } from 'lucide-react'
import { openExternal } from './external-link'
import { sourceDomain } from './source-utils'
import { useI18n } from './i18n-provider'

const spring = { type: 'spring' as const, stiffness: 340, damping: 32 }

export interface Source {
  title: string
  url: string
  snippet: string
}

// ─── Trigger rail ────────────────────────────────────────────────────────────

export function SourceRail({ sources }: { sources: Source[] }) {
  const { tf } = useI18n()
  const [open, setOpen] = React.useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/80 px-3 py-1.5 text-xs font-medium backdrop-blur transition-colors hover:border-border-strong"
      >
        <Globe className="h-3.5 w-3.5 text-muted-foreground" />
        {tf('sources.count', { n: sources.length })}
      </button>
      <SourcesSheet sources={sources} open={open} onClose={() => setOpen(false)} />
    </>
  )
}

// ─── Sheet ───────────────────────────────────────────────────────────────────

function SourcesSheet({
  sources,
  open,
  onClose,
}: {
  sources: Source[]
  open: boolean
  onClose: () => void
}) {
  const { t } = useI18n()
  const panelRef = React.useRef<HTMLDivElement | null>(null)

  // Escape closes, and the body behind the sheet stops scrolling. Both are
  // restored on unmount too, so a message removed mid-scroll cannot leave the
  // page permanently locked.
  React.useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panelRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
    }
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={t('sources.title')}
            tabIndex={-1}
            initial={{ y: '100%', opacity: 0.6 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={spring}
            className="relative flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-border bg-card shadow-2xl outline-none sm:rounded-3xl"
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold">{t('sources.title')}</h2>
              <button
                onClick={onClose}
                aria-label={t('sources.close')}
                title={t('sources.close')}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2">
              {sources.map((s, i) => (
                <a
                  key={`${s.url}-${i}`}
                  href={s.url}
                  onClick={(e) => {
                    e.preventDefault()
                    void openExternal(s.url)
                  }}
                  className="flex gap-3 rounded-xl p-3 transition-colors hover:bg-muted"
                >
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-brand-soft text-[0.7rem] font-semibold text-brand-strong">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium" dir="auto">
                      {s.title || sourceDomain(s.url) || s.url}
                    </span>
                    {sourceDomain(s.url) ? (
                      <span className="mt-0.5 block truncate text-[0.7rem] text-muted-foreground">
                        {sourceDomain(s.url)}
                      </span>
                    ) : null}
                    {s.snippet ? (
                      <span className="mt-1.5 block text-xs leading-relaxed text-muted-foreground" dir="auto">
                        {s.snippet}
                      </span>
                    ) : null}
                  </span>
                </a>
              ))}
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  )
}