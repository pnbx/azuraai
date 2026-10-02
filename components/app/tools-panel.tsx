'use client'

/**
 * Composer tools.
 *
 * Two pieces, deliberately separate:
 *  - `ToolSheet`: prompt actions that rewrite the question and send it. These
 *    cost a model call, so they are opt-in taps behind a button rather than
 *    something the composer does on its own.
 *  - `CalcChip`: the result of arithmetic typed into the composer. It runs on
 *    the device with no network and no model call, so it can appear
 *    automatically — a user checking 12×1500 should not spend a rate-limited
 *    free request on it.
 */

import * as React from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlignLeft,
  BookOpen,
  Braces,
  Equal,
  Sigma,
  Languages,
  Table2,
  Wand2,
  X,
} from 'lucide-react'
import { TOOLS, type ToolDefinition, type ToolId } from '@/lib/chat-tools'
import { useI18n } from './i18n-provider'
import { haptic } from './haptics'

const ICONS: Record<ToolDefinition['icon'], typeof AlignLeft> = {
  summarize: AlignLeft,
  explain: BookOpen,
  translate: Languages,
  improve: Wand2,
  code: Braces,
  table: Table2,
  formula: Sigma,
}

const spring = { type: 'spring' as const, stiffness: 380, damping: 30 }

/** Prompt actions, presented as a dismissible sheet above the composer. */
export function ToolSheet({
  open,
  onClose,
  onPick,
}: {
  open: boolean
  onClose: () => void
  onPick: (tool: ToolDefinition) => void
}) {
  const { t } = useI18n()

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-background/60 backdrop-blur-sm"
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={spring}
            dir="rtl"
            className="fixed inset-x-0 bottom-0 z-50 rounded-t-3xl border-t border-border bg-card p-4 pb-8 shadow-2xl"
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-muted-foreground/30" />
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-foreground">
                  {t('tools.title')}
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t('tools.subtitle')}
                </p>
              </div>
              <button
                onClick={onClose}
                aria-label={t('tools.close')}
                className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {TOOLS.map((tool) => {
                const Icon = ICONS[tool.icon]
                return (
                  <motion.button
                    key={tool.id}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => {
                      haptic('light')
                      onPick(tool)
                    }}
                    className="flex flex-col items-start gap-1.5 rounded-2xl border border-border bg-background/60 p-3 text-start transition-colors hover:border-brand/40 hover:bg-muted/50"
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-soft text-brand-strong">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="text-sm font-medium text-foreground">
                      {t(tool.labelKey)}
                    </span>
                    <span className="text-[11px] leading-snug text-muted-foreground">
                      {t(tool.hintKey)}
                    </span>
                  </motion.button>
                )
              })}
            </div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  )
}

/**
 * The result of an arithmetic expression, shown inline above the send button.
 *
 * Tapping it inserts the answer so the user can build on it; that is more
 * useful than a read-only display, because calculators chain.
 */
export function CalcChip({
  expression,
  result,
  onUse,
}: {
  expression: string
  result: string
  onUse: (value: string) => void
}) {
  return (
    <motion.button
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 6 }}
      onClick={() => {
        haptic('light')
        onUse(result)
      }}
      dir="ltr"
      className="mb-1 flex items-center gap-2 rounded-xl border border-border bg-muted/60 px-2.5 py-1 text-xs transition-colors hover:bg-muted"
    >
      <span className="text-muted-foreground">{expression}</span>
      <Equal className="h-3 w-3 text-muted-foreground" />
      <span className="font-semibold tabular-nums text-foreground">{result}</span>
    </motion.button>
  )
}

/** The composer button that opens the tool sheet. */
export function ToolButton({ onClick, badge }: { onClick: () => void; badge?: ToolId }) {
  const { t } = useI18n()
  return (
    <motion.button
      layout
      whileTap={{ scale: 0.9 }}
      onClick={() => {
        haptic('light')
        onClick()
      }}
      aria-label={t('tools.open')}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <Sigma className="h-4 w-4" />
      {badge ? (
        <span className="absolute -end-0.5 -top-0.5 h-2 w-2 rounded-full bg-brand" />
      ) : null}
    </motion.button>
  )
}