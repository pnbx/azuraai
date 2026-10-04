/**
 * Jalali (Shamsi) calendar and Persian relative time — pure logic, no React.
 *
 * Why this exists: the app is Persian-first, but every timestamp it rendered
 * came from `toLocaleDateString`, and the relative form was a bare "2m" / "3h"
 * in Latin digits with an English abbreviation — even when the whole rest of
 * the UI was Persian. An Iranian user reading their own conversation history
 * sees March and "3h". Both are wrong for this audience.
 *
 * Implementation is the Khayyam–Borkiyar break-point algorithm, the same one
 * behind the official Jalali calendar rules: it tracks the 33-year cycle and
 * only needs a table of Gregorian year offsets where the cycle breaks. No
 * lookup table of 3,000 entries, and no per-year hardcoding to maintain.
 *
 * JSX-free so it is unit tested directly (tests/jalali.test.ts).
 */

import { toPersianDigitsIn } from './persian-text'

export type JalaliLocale = 'fa' | 'en'

export interface JalaliDate {
  jy: number
  /** 1–12 */
  jm: number
  /** 1–31 */
  jd: number
}

/** Persian month names, indexed 1–12. */
const MONTHS_FA = [
  'فروردین',
  'اردیبهشت',
  'خرداد',
  'تیر',
  'مرداد',
  'شهریور',
  'مهر',
  'آبان',
  'آذر',
  'دی',
  'بهمن',
  'اسفند',
] as const

/** Transliterations, so the English locale stays readable rather than cryptic. */
const MONTHS_EN = [
  'Farvardin',
  'Ordibehesht',
  'Khordad',
  'Tir',
  'Mordad',
  'Shahrivar',
  'Mehr',
  'Aban',
  'Azar',
  'Dey',
  'Bahman',
  'Esfand',
] as const

/** Persian weekday names, indexed by JS `getDay()` (0 = Sunday). */
const WEEKDAYS_FA = [
  'یک‌شنبه',
  'دوشنبه',
  'سه‌شنبه',
  'چهارشنبه',
  'پنج‌شنبه',
  'جمعه',
  'شنبه',
] as const

const div = (a: number, b: number): number => Math.trunc(a / b)
const mod = (a: number, b: number): number => a - Math.trunc(a / b) * b

/** Jalali years at which the 33-year cycle's leap pattern shifts. */
const BREAKS = [
  -61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192,
  2262, 2324, 2394, 2456, 3178,
]

/** Leap-year offset and the Gregorian March day that Jalali year starts on. */
function jalCal(jy: number): { leap: number; gy: number; march: number } {
  const gy = jy + 621
  let leapJ = -14
  let jp = BREAKS[0]
  let jump = 0

  if (jy < jp || jy >= BREAKS[BREAKS.length - 1]) {
    // Out of the table's range. Falling back to the nearest supported year
    // keeps formatting usable (a clock skew, a bogus stored ts) instead of
    // throwing inside a render.
    return jalCal(jy < jp ? BREAKS[0] : BREAKS[BREAKS.length - 1] - 1)
  }

  for (let i = 1; i < BREAKS.length; i++) {
    const jm = BREAKS[i]
    jump = jm - jp
    if (jy < jm) break
    leapJ += div(jump, 33) * 8 + div(mod(jump, 33), 4)
    jp = jm
  }

  let n = jy - jp
  leapJ += div(n, 33) * 8 + div(mod(n, 33) + 3, 4)
  // The final year of a cycle behaves like a leap year when the cycle itself
  // is leap and the year is not.
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1

  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150
  const march = 20 + leapJ - leapG

  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33
  let leap = mod(mod(n + 1, 33) - 1, 4)
  if (leap === -1) leap = 4

  return { leap, gy, march }
}

/** Gregorian → Julian Day Number. */
function g2d(gy: number, gm: number, gd: number): number {
  let d =
    div((gy + div(gm - 8, 6) + 100100) * 1461, 4) +
    div(153 * mod(gm + 9, 12) + 2, 5) +
    gd -
    34840408
  d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752
  return d
}

/** Julian Day Number → Gregorian. */
function d2g(jdn: number): { gy: number; gm: number; gd: number } {
  let j = 4 * jdn + 139361631
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908
  const i = div(mod(j, 1461), 4) * 5 + 308
  const gd = div(mod(i, 153), 5) + 1
  const gm = mod(div(i, 153), 12) + 1
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6)
  return { gy, gm, gd }
}

/** Julian Day Number → Jalali. */
function d2j(jdn: number): JalaliDate {
  const gy = d2g(jdn).gy
  let jy = gy - 621
  const r = jalCal(jy)
  const jdn1f = g2d(gy, 3, r.march)
  let k = jdn - jdn1f

  if (k >= 0) {
    if (k <= 185) {
      // First six months are 31 days each.
      return { jy, jm: 1 + div(k, 31), jd: mod(k, 31) + 1 }
    }
    k -= 186
  } else {
    // Before Nowruz: still the previous Jalali year, in its last six months.
    jy -= 1
    k += 179
    if (r.leap === 1) k += 1
  }
  return { jy, jm: 7 + div(k, 30), jd: mod(k, 30) + 1 }
}

/** True when a Jalali y/m/d is a real calendar date (Esfand 30 only in leap). */
export function isValidJalali(jy: number, jm: number, jd: number): boolean {
  if (!Number.isFinite(jy) || !Number.isFinite(jm) || !Number.isFinite(jd)) return false
  if (jm < 1 || jm > 12) return false
  if (jy < 1 || jy > 3177) return false
  if (jd < 1) return false
  // Months 1–6 have 31 days, 7–11 have 30, Esfand (12) has 29 or 30.
  const leap = jalCal(jy).leap === 0
  const max = jm <= 6 ? 31 : jm <= 11 ? 30 : leap ? 30 : 29
  return jd <= max
}

/**
 * Convert a Date (or epoch ms) to its Jalali calendar date, in the local
 * timezone of the host — which is what a user reading their own history means
 * by "today".
 */
export function toJalali(input: Date | number): JalaliDate {
  const d = typeof input === 'number' ? new Date(input) : input
  if (Number.isNaN(d.getTime())) {
    // An invalid timestamp should render something sane rather than NaN.
    return toJalali(new Date())
  }
  return d2j(g2d(d.getFullYear(), d.getMonth() + 1, d.getDate()))
}

/** Persian weekday name for a date, e.g. "یک‌شنبه". */
export function jalaliWeekday(input: Date | number, locale: JalaliLocale = 'fa'): string {
  const d = typeof input === 'number' ? new Date(input) : input
  if (locale === 'fa') return WEEKDAYS_FA[d.getDay()]
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][
    d.getDay()
  ]
}

function localize(value: string, locale: JalaliLocale): string {
  return locale === 'fa' ? toPersianDigitsIn(value) : value
}

/**
 * Full Jalali date, e.g. "۱۴ مهر ۱۴۰۵" / "14 Mehr 1405".
 *
 * Used for the tooltip behind a timestamp, where there is room to be exact.
 */
export function formatJalaliDate(
  input: Date | number,
  locale: JalaliLocale = 'fa'
): string {
  const { jy, jm, jd } = toJalali(input)
  const month = locale === 'fa' ? MONTHS_FA[jm - 1] : MONTHS_EN[jm - 1]
  return localize(`${jd} ${month} ${jy}`, locale)
}

/** Gregorian full date, for the English locale where it is the expected one. */
export function formatGregorianDate(
  input: Date | number,
  locale: JalaliLocale = 'fa'
): string {
  const d = typeof input === 'number' ? new Date(input) : input
  if (locale === 'fa') return formatJalaliDate(d, 'fa')
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

/** Locale-appropriate month name only, e.g. "مهر" / "Mehr". */
export function monthName(jm: number, locale: JalaliLocale = 'fa'): string {
  const idx = Math.min(11, Math.max(0, jm - 1))
  return locale === 'fa' ? MONTHS_FA[idx] : MONTHS_EN[idx]
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/**
 * Human relative time, in the reader's own calendar and script.
 *
 * Replaces the old "2m" / "3h" form, which was Latin-numeral and abbreviated
 * in English even inside a fully Persian UI. The cut points are chosen so the
 * label always reads naturally: anything a day old stops counting hours, and
 * anything from yesterday stops saying "N hours ago".
 *
 * `now` is a parameter rather than a `Date.now()` call so the output is
 * deterministic under test.
 */
export function formatRelativeTime(
  ts: number,
  now: number,
  locale: JalaliLocale = 'fa'
): string {
  if (!Number.isFinite(ts) || ts <= 0) return ''

  const diff = now - ts
  // Clock skew (device clock behind the server, an NTP correction) can make a
  // message look like it arrived in the future. "just now" beats "-3m".
  if (diff < MINUTE) {
    return locale === 'fa' ? 'همین حالا' : 'just now'
  }

  const n = (v: number) => localize(String(v), locale)

  if (diff < HOUR) {
    const mins = Math.floor(diff / MINUTE)
    return locale === 'fa'
      ? `${n(mins)} دقیقه پیش`
      : `${mins}m ago`
  }

  if (diff < DAY) {
    const hours = Math.floor(diff / HOUR)
    return locale === 'fa'
      ? `${n(hours)} ساعت پیش`
      : `${hours}h ago`
  }

  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)
  const dayStart = startOfToday.getTime()

  if (ts >= dayStart - DAY) {
    return locale === 'fa' ? 'دیروز' : 'yesterday'
  }

  const j = toJalali(ts)
  const sameYear = j.jy === toJalali(now).jy

  // Inside the current Jalali year the year is noise; past it, it disambiguates.
  if (sameYear) {
    return locale === 'fa'
      ? `${n(j.jd)} ${monthName(j.jm, 'fa')}`
      : `${j.jd} ${monthName(j.jm, 'en')}`
  }
  return formatJalaliDate(ts, locale)
}

/**
 * Day-header label for grouping a conversation list, e.g. "امروز" or a date.
 * Today/yesterday are named rather than dated, which is what people actually
 * say out loud.
 */
export function formatDayLabel(
  ts: number,
  now: number,
  locale: JalaliLocale = 'fa'
): string {
  if (!Number.isFinite(ts) || ts <= 0) return ''

  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const dayStart = start.getTime()

  if (ts >= dayStart) return locale === 'fa' ? 'امروز' : 'Today'
  if (ts >= dayStart - DAY) return locale === 'fa' ? 'دیروز' : 'Yesterday'

  // Count whole days back rather than subtracting timestamps: a 23-hour-old
  // message across a DST boundary must still land on "yesterday".
  const daysAgo = Math.round((dayStart - ts) / DAY)
  const { jy, jm, jd } = toJalali(ts)
  const month = monthName(jm, locale)
  // Drop the year while it is still obvious from context, keep it once the
  // list spans far enough back that "14 Mehr" is ambiguous.
  const withYear = daysAgo > 300
  return localize(
    withYear ? `${jd} ${month} ${jy}` : `${jd} ${month}`,
    locale
  )
}

export { MONTHS_FA, MONTHS_EN, WEEKDAYS_FA }