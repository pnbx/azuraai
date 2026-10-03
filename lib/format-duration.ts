/**
 * Response-timer formatting — pure logic, no React, no DOM.
 *
 * Kept JSX-free so it is unit-testable under Jest (see
 * tests/format-duration.test.ts). The components that render these strings
 * live in components/app/.
 *
 * Three shapes, because the timer shows up in three places:
 *
 *   formatStopwatch()  — live "0:07" while the model is still working. Must
 *                        not jitter, so the seconds field is zero-padded.
 *   formatDuration()   — the frozen "۱۲ ثانیه" badge on a finished reply,
 *                        phrased in words so it reads as a sentence.
 *   stageDurations()   — per-stage research timings, derived from the
 *                        stage-at timestamps the server streams.
 *
 * Persian digits come from lib/persian-text so a duration rendered in the
 * Persian UI uses Persian numerals rather than sitting next to Persian prose
 * in Latin digits, which is what the rest of the app already guarantees.
 */

import { toPersianDigitsIn } from './persian-text'

export type DurationLocale = 'fa' | 'en'

/** Response-length bands, used to flag a stall instead of just printing a big number. */
export type SpeedBand = 'fast' | 'normal' | 'slow' | 'stalled'

const SECOND = 1_000
const MINUTE = 60_000
const HOUR = 3_600_000

/**
 * Anything non-finite, negative or NaN (a clock skew, an aborted request that
 * never reported a duration) collapses to 0 rather than rendering a
 * nonsensical negative duration.
 */
function clamp(ms: number): number {
  return Number.isFinite(ms) && ms > 0 ? ms : 0
}

/** Localise the digits in an already-formatted numeric string. */
function localize(value: string, locale: DurationLocale): string {
  return locale === 'fa' ? toPersianDigitsIn(value) : value
}

/**
 * Live stopwatch: `m:ss`, widening to `h:mm:ss` past an hour.
 *
 * Zero-padded seconds field so the ticking row does not shift horizontally
 * once a second.
 */
export function formatStopwatch(ms: number, locale: DurationLocale = 'en'): string {
  const totalSeconds = Math.floor(clamp(ms) / SECOND)
  const seconds = totalSeconds % 60
  const minutes = Math.floor(totalSeconds / 60) % 60
  const hours = Math.floor(totalSeconds / 3600)
  const pad = (n: number) => String(n).padStart(2, '0')
  const clock =
    hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`
  return localize(clock, locale)
}

/**
 * Human phrasing for a finished reply.
 *
 * Floors rather than rounds at every boundary: 59.9s must read "59 seconds",
 * never "60 seconds", and 1m59.9s must read "1 minute", never "2 minutes".
 * Rounding would also make the badge disagree with the live stopwatch that
 * was counting it down a moment earlier.
 */
export function formatDuration(ms: number, locale: DurationLocale = 'en'): string {
  const total = clamp(ms)

  if (total < SECOND) return locale === 'fa' ? 'زیر یک ثانیه' : 'under a second'

  if (total < MINUTE) {
    const seconds = Math.floor(total / SECOND)
    return locale === 'fa'
      ? `${localize(String(seconds), locale)} ثانیه`
      : `${seconds}s`
  }

  if (total < HOUR) {
    const minutes = Math.floor(total / MINUTE)
    const seconds = Math.floor((total % MINUTE) / SECOND)
    if (locale === 'en') return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`
    if (seconds === 0) return `${localize(String(minutes), locale)} دقیقه`
    return (
      `${localize(String(minutes), locale)} دقیقه و ` +
      `${localize(String(seconds), locale)} ثانیه`
    )
  }

  const hours = Math.floor(total / HOUR)
  const minutes = Math.floor((total % HOUR) / MINUTE)
  if (locale === 'en') return `${hours}h ${minutes}m`
  if (minutes === 0) return `${localize(String(hours), locale)} ساعت`
  return (
    `${localize(String(hours), locale)} ساعت و ` +
    `${localize(String(minutes), locale)} دقیقه`
  )
}

/**
 * Bucket a response length so the UI can flag a stall rather than just
 * printing a big number. Thresholds are tuned to the pinned free model: a
 * fast-mode reply normally lands well under 5s, and research past 40s is the
 * point where the user starts wondering whether it has hung.
 */
export function speedBand(ms: number): SpeedBand {
  const total = clamp(ms)
  if (total < 5_000) return 'fast'
  if (total < 15_000) return 'normal'
  if (total < 40_000) return 'slow'
  return 'stalled'
}

/**
 * Derive per-stage durations from the stage-at timestamps the research route
 * streams.
 *
 * `marks` maps a stage key to the millisecond offset at which that stage
 * *began*, in the order the server reported them. Stage N therefore owns the
 * gap between its own mark and the next one; the last stage runs until
 * `totalMs` when the server reported a total, and reports 0 when it did not
 * (an aborted stream has no meaningful end).
 *
 * A stage whose successor arrived earlier than itself — a pool failover can
 * replay "plan", restarting the clock — is clamped to 0 rather than rendering
 * a negative duration.
 */
export function stageDurations(
  marks: Record<string, number> | undefined,
  totalMs?: number
): Array<{ stage: string; ms: number }> {
  if (!marks) return []
  const entries = Object.entries(marks)
  if (entries.length === 0) return []

  const out: Array<{ stage: string; ms: number }> = []
  for (let i = 0; i < entries.length; i++) {
    const [stage, startAt] = entries[i]
    const next = entries[i + 1]
    const end =
      next !== undefined
        ? next[1]
        : totalMs !== undefined
          ? Math.max(totalMs, startAt)
          : startAt
    out.push({ stage, ms: Math.max(0, end - startAt) })
  }
  return out
}

/**
 * Total time the stages actually consumed, ignoring the gap before the first
 * one. Lets the UI separate "real work" from the wall-clock total — the
 * difference is auth, the daily-cap RPC and queueing, none of which the user
 * should read as model latency.
 */
export function totalStageMs(stages: Array<{ ms: number }>): number {
  return stages.reduce((sum, s) => sum + (Number.isFinite(s.ms) ? s.ms : 0), 0)
}