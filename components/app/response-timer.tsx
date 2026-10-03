'use client'

/**
 * Response timer.
 *
 * Three pieces, all fed by the server-measured `timings` block on the `meta`
 * frame (see components/app/use-chat-stream.ts). The live counter is the one
 * exception: it has to tick before any server number exists, so it runs off a
 * client clock and is replaced by the authoritative figure the moment the
 * reply lands.
 *
 *   ElapsedTicker — "0:07" while the model works. One interval for the whole
 *                   screen, not one per message, so a long conversation with
 *                   thirty finished badges costs one timer, not thirty.
 *   ResponseBadge — the frozen total on a finished reply, plus time-to-first-
 *                   token and any wasted upstream attempts.
 *   StageTimings  — the research breakdown, so "searching was slow" is
 *                   answerable instead of guesswork.
 *
 * All formatting lives in lib/format-duration.ts so it is unit tested; this
 * file only decides what is on screen.
 */

import * as React from 'react'
import { motion } from 'framer-motion'
import { Clock, Gauge, Timer } from 'lucide-react'
import { useI18n } from './i18n-provider'
import type { StreamTimings } from './conversations'
import {
  formatDuration,
  formatStopwatch,
  speedBand,
  stageDurations,
  type SpeedBand,
} from '@/lib/format-duration'
import type { I18nKey } from '@/lib/i18n'

/** How often the live counter advances. 1Hz: faster reads as a spinner. */
const TICK_MS = 200

/**
 * A single shared clock for the whole screen.
 *
 * Each caller subscribing to its own `setInterval` would mean N timers for N
 * live surfaces, all firing on the same boundary — the exact pattern that
 * makes a cheap screen stutter. One interval, many subscribers.
 */
interface ElapsedClockApi {
  /** Add a listener; returns its unsubscribe. */
  subscribe: (notify: () => void) => () => void
  /** Start or stop the shared interval. */
  register: (active: boolean) => void
}

const ElapsedClock = React.createContext<ElapsedClockApi | null>(null)

export function ElapsedClockProvider({ children }: { children: React.ReactNode }) {
  const subscribers = React.useRef(new Set<() => void>())
  const intervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null)

  const stop = React.useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  const subscribe = React.useCallback((notify: () => void) => {
    subscribers.current.add(notify)
    return () => {
      subscribers.current.delete(notify)
    }
  }, [])

  React.useEffect(() => stop, [stop])

  const register = React.useCallback(
    (active: boolean) => {
      if (active && intervalRef.current === null) {
        intervalRef.current = setInterval(() => {
          // Copy first: a listener may unsubscribe while being notified.
          for (const notify of [...subscribers.current]) notify()
        }, TICK_MS)
      } else if (!active) {
        stop()
      }
    },
    [stop]
  )

  const value = React.useMemo<ElapsedClockApi>(
    () => ({ subscribe, register }),
    [subscribe, register]
  )
  return <ElapsedClock.Provider value={value}>{children}</ElapsedClock.Provider>
}

/**
 * Live elapsed time since `startedAt`, or 0 when the request has not started.
 *
 * Returns 0 rather than a live 0 while `startedAt` is null so a rendered
 * timer never sits at "0:00" pretending to run when nothing is in flight.
 *
 * The interval is the provider's, and it only runs while at least one ticker
 * is mounted — an unmounted one stops it, so a finished conversation costs no
 * wakeups.
 */
export function useElapsedMs(startedAt: number | null): number {
  const clock = React.useContext(ElapsedClock)
  const [now, setNow] = React.useState(() => Date.now())

  React.useEffect(() => {
    if (startedAt === null || !clock) return
    const unsubscribe = clock.subscribe(() => setNow(Date.now()))
    clock.register(true)
    // Snap to the true elapsed time immediately rather than showing whatever
    // `now` was captured at mount — otherwise a ticker mounted mid-request
    // would open on a stale number. Deferred through a timer so the effect
    // body itself never calls setState synchronously.
    const kick = setTimeout(() => setNow(Date.now()), 0)
    return () => {
      clearTimeout(kick)
      unsubscribe()
      clock.register(false)
    }
  }, [clock, startedAt])

  if (startedAt === null) return 0
  return Math.max(0, now - startedAt)
}

/** Tone for a finished reply: green when quick, amber when slow. */
const BAND_TONE: Record<SpeedBand, string> = {
  fast: 'text-emerald-400/90 border-emerald-400/25 bg-emerald-400/10',
  normal: 'text-muted-foreground border-border bg-muted/40',
  slow: 'text-amber-400/90 border-amber-400/25 bg-amber-400/10',
  stalled: 'text-orange-400/90 border-orange-400/30 bg-orange-400/10',
}

const BAND_LABEL_KEY: Record<SpeedBand, I18nKey> = {
  fast: 'timer.band.fast',
  normal: 'timer.band.normal',
  slow: 'timer.band.slow',
  stalled: 'timer.band.stalled',
}

/**
 * Live counter. Rendered next to the stage rail while a research run is in
 * flight, and inside the thinking panel while a deep-thinking reply streams.
 */
export function ElapsedTicker({
  startedAt,
  className = '',
}: {
  startedAt: number | null
  className?: string
}) {
  const { locale, tf } = useI18n()
  const elapsedMs = useElapsedMs(startedAt)

  if (startedAt === null) return null

  const clock = formatStopwatch(elapsedMs, locale)
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs tabular-nums ${className}`}
      aria-label={tf('timer.elapsedAria', { n: clock })}
      role="timer"
    >
      <Timer className="h-3.5 w-3.5 shrink-0 text-violet-400" aria-hidden />
      <span className="font-medium text-foreground/80">{clock}</span>
    </span>
  )
}

/**
 * Frozen timings on a finished reply.
 *
 * Deliberately a plain (non-interactive) chip rather than a tap target: the
 * numbers are diagnostics, and adding an expandable region here would put a
 * second disclosure in the same corner as the source sheet and the action row.
 */
export function ResponseBadge({ timings }: { timings: StreamTimings | undefined }) {
  const { locale, t, tf } = useI18n()
  if (!timings) return null

  const band = speedBand(timings.totalMs)
  const total = formatDuration(timings.totalMs, locale)
  const ttfb =
    timings.firstTokenMs !== null ? formatDuration(timings.firstTokenMs, locale) : null
  // Only worth showing when the pool actually wasted work: a single happy-path
  // attempt is not news, and showing "1 attempt" every reply is noise.
  const attempts = timings.attempts !== undefined && timings.attempts > 1 ? timings.attempts : null

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] ${BAND_TONE[band]}`}
      title={`${t('timer.elapsed')}: ${total} · ${t(BAND_LABEL_KEY[band])}`}
    >
      <Clock className="h-3 w-3 shrink-0" aria-hidden />
      <span className="tabular-nums font-medium">{total}</span>
      {ttfb ? (
        <>
          <span className="opacity-40" aria-hidden>
            ·
          </span>
          <span className="tabular-nums opacity-80">
            {t('timer.firstToken')} {ttfb}
          </span>
        </>
      ) : null}
      {attempts ? (
        <>
          <span className="opacity-40" aria-hidden>
            ·
          </span>
          <span className="tabular-nums opacity-80">
            {tf('timer.attempts', { n: attempts })}
          </span>
        </>
      ) : null}
    </span>
  )
}

/** Research stage order, matching the rail in thinking-panel.tsx. */
const STAGE_LABEL: Record<string, I18nKey> = {
  plan: 'stage.plan',
  search: 'stage.search',
  read: 'stage.read',
  synthesize: 'stage.synthesize',
}

/**
 * Per-stage breakdown under a finished research reply.
 *
 * The bars are proportional to the slowest stage so the eye lands on the
 * expensive step immediately. Stages that never ran are simply absent — a
 * cancelled research run should not invent a "reading sources: 0s" row.
 */
export function StageTimings({ timings }: { timings: StreamTimings | undefined }) {
  const { locale, t } = useI18n()
  const stages = React.useMemo(
    () => stageDurations(timings?.stages, timings?.totalMs),
    [timings?.stages, timings?.totalMs]
  )

  if (stages.length === 0) return null

  const slowest = stages.reduce((max, s) => Math.max(max, s.ms), 0)

  return (
    <div className="mt-2 rounded-xl border border-border/60 bg-muted/20 p-2.5">
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
        <Gauge className="h-3 w-3 shrink-0" aria-hidden />
        {t('timer.stages')}
      </div>
      <ul className="space-y-1">
        {stages.map((s) => {
          const labelKey = STAGE_LABEL[s.stage]
          if (!labelKey) return null
          const share = slowest > 0 ? s.ms / slowest : 0
          return (
            <li key={s.stage} className="flex items-center gap-2 text-[11px]">
              <span className="w-24 shrink-0 truncate text-muted-foreground">
                {t(labelKey)}
              </span>
              <span className="h-1 flex-1 overflow-hidden rounded-full bg-border/60">
                <motion.span
                  className="block h-full rounded-full bg-violet-400/70"
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.round(share * 100)}%` }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                />
              </span>
              <span className="w-16 shrink-0 text-end tabular-nums text-foreground/70">
                {formatDuration(s.ms, locale)}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}