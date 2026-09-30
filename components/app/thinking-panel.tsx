'use client'

/**
 * Thinking Panel — the "AI is working" showpiece.
 *
 * - ReasoningText: shimmering chain-of-thought text
 * - ThinkingPanel: glassy live card with a breathing gradient orb whose
 *   pulse quickens while reasoning tokens are flowing
 * - StageRail: animated research progress (plan → search → read → synthesize)
 */

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Brain, ChevronDown, ListTodo, Search, BookOpen, Sparkles, Check } from 'lucide-react'

const spring = { type: 'spring' as const, stiffness: 320, damping: 28 }

// ─── Shimmering reasoning text ───────────────────────────────────────────────

export function ReasoningText({ text, live }: { text: string; live?: boolean }) {
  const lastLine = text.trimEnd().split('\n').slice(-1)[0] ?? ''
  const lines = text.trimEnd().split('\n')

  return (
    <div className={`text-xs leading-relaxed ${live ? 'shimmer-text' : 'text-muted-foreground'}`}>
      {lines.slice(0, -1).map((line, i) => (
        <p key={i} className="opacity-60">
          {line}
        </p>
      ))}
      <p className="font-medium">{lastLine}</p>
    </div>
  )
}

// ─── Breathing orb ───────────────────────────────────────────────────────────

function ThinkingOrb({ active }: { active: boolean }) {
  const [intensity, setIntensity] = useState(0.5)
  const decayRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Activity spikes when `active` flips true, then decays slowly.
  // Intensity changes happen on the interval timer (an external system),
  // not synchronously in the effect body.
  useEffect(() => {
    if (!active) return
    if (decayRef.current) clearInterval(decayRef.current)
    decayRef.current = setInterval(() => {
      setIntensity((v) => (v >= 1 ? 1 : Math.max(0.45, v - 0.05)))
    }, 400)
    // First tick immediately: schedule via timeout so the effect body itself
    // never calls setState synchronously.
    const kick = setTimeout(() => setIntensity(1), 0)
    return () => {
      if (decayRef.current) clearInterval(decayRef.current)
      clearTimeout(kick)
    }
  }, [active])

  // Pulse speed scales with intensity: 2.4s (calm) → 0.9s (active)
  const pulseDuration = 2.4 - 1.5 * intensity

  return (
    <div className="relative h-14 w-14 shrink-0">
      {/* Aura */}
      <motion.div
        className="absolute inset-[-10px] rounded-full blur-xl"
        style={{
          background:
            'conic-gradient(from 0deg, #6366f1, #a855f7, #ec4899, #6366f1)',
          opacity: 0.25 + 0.3 * intensity,
        }}
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 8, ease: 'linear' }}
      />
      {/* Core */}
      <motion.div
        className="absolute inset-0 rounded-full"
        style={{
          background:
            'radial-gradient(circle at 30% 30%, #c4b5fd, #8b5cf6 45%, #4c1d95 100%)',
          boxShadow: `0 0 ${8 + 24 * intensity}px rgba(139, 92, 246, ${0.35 + 0.4 * intensity})`,
        }}
        animate={{
          scale: [1, 1 + 0.14 * intensity, 1],
        }}
        transition={{ repeat: Infinity, duration: pulseDuration, ease: 'easeInOut' }}
      >
        {/* Inner highlight */}
        <motion.div
          className="absolute left-[22%] top-[18%] h-[26%] w-[34%] rounded-full bg-white/60 blur-[2px]"
          animate={{ opacity: [0.5, 0.85, 0.5] }}
          transition={{ repeat: Infinity, duration: pulseDuration * 1.2 }}
        />
      </motion.div>
      {/* Orbiting satellite */}
      <motion.div
        className="absolute inset-0"
        animate={{ rotate: -360 }}
        transition={{ repeat: Infinity, duration: 3.2, ease: 'linear' }}
      >
        <div className="absolute left-1/2 top-0 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-fuchsia-300 shadow-[0_0_6px_rgba(232,121,249,0.9)]" />
      </motion.div>
    </div>
  )
}

// ─── The panel ───────────────────────────────────────────────────────────────

export function ThinkingPanel({
  reasoning,
  active,
  label = 'Deep thinking',
}: {
  reasoning: string
  active: boolean
  label?: string
}) {
  const [expanded, setExpanded] = useState(true)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const charCount = reasoning.length

  // Autoscroll while expanded and streaming
  useEffect(() => {
    if (expanded && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [reasoning, expanded])

  return (
    <motion.div
      layout
      transition={spring}
      className="relative overflow-hidden rounded-2xl border border-border bg-card/70 backdrop-blur-xl"
    >
      {/* Top gradient edge */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-violet-400/60 to-transparent" />

      <button
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center gap-3 p-3 text-left"
      >
        <ThinkingOrb active={active} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Brain className="h-3.5 w-3.5 text-violet-400" />
            <span className="shimmer-text text-sm font-semibold">{label}</span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {charCount.toLocaleString()} reasoning chars
            {active ? ' · streaming…' : ''}
          </p>
        </div>
        <motion.span animate={{ rotate: expanded ? 180 : 0 }} transition={spring}>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {expanded && reasoning ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={spring}
            className="overflow-hidden"
          >
            <div
              ref={scrollRef}
              className="max-h-48 overflow-y-auto border-t border-border/60 px-4 py-3"
            >
              <ReasoningText text={reasoning} live={active} />
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.div>
  )
}

// ─── Research stage rail ─────────────────────────────────────────────────────

const STAGES = [
  { key: 'plan', label: 'Planning search', icon: ListTodo },
  { key: 'search', label: 'Searching the web', icon: Search },
  { key: 'read', label: 'Reading sources', icon: BookOpen },
  { key: 'synthesize', label: 'Synthesizing', icon: Sparkles },
] as const

export function StageRail({ stages }: { stages: string[] }) {
  const currentIndex = (() => {
    let idx = -1
    for (const s of STAGES) if (stages.includes(s.key)) idx = STAGES.indexOf(s)
    return idx
  })()

  return (
    <div className="flex items-center gap-1">
      {STAGES.map((stage, i) => {
        const done = i < currentIndex
        const active = i === currentIndex
        const Icon = stage.icon
        return (
          <div key={stage.key} className="flex items-center gap-1">
            <motion.div
              initial={false}
              animate={{
                scale: active ? 1.08 : 1,
                opacity: done || active ? 1 : 0.35,
              }}
              transition={spring}
              className={`relative flex h-8 w-8 items-center justify-center rounded-full border ${
                active
                  ? 'border-violet-400/60 bg-violet-400/10 text-violet-300'
                  : done
                    ? 'border-success/40 bg-success/10 text-success'
                    : 'border-border bg-muted text-muted-foreground'
              }`}
            >
              {done ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
              {active ? (
                <motion.span
                  className="absolute inset-0 rounded-full border border-violet-400/50"
                  animate={{ scale: [1, 1.35], opacity: [0.7, 0] }}
                  transition={{ repeat: Infinity, duration: 1.4 }}
                />
              ) : null}
            </motion.div>
            {i < STAGES.length - 1 ? (
              <div className="h-px w-4 overflow-hidden bg-border sm:w-6">
                <motion.div
                  className="h-full bg-violet-400"
                  initial={{ width: '0%' }}
                  animate={{ width: done ? '100%' : '0%' }}
                  transition={{ duration: 0.4 }}
                />
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
