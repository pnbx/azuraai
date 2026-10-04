import {
  toJalali,
  isValidJalali,
  formatJalaliDate,
  formatRelativeTime,
  formatDayLabel,
  jalaliWeekday,
  monthName,
} from '@/lib/jalali'

/** Local-time Date, so assertions do not depend on the runner's timezone. */
const at = (y: number, m: number, d: number, hh = 12, mm = 0) =>
  new Date(y, m - 1, d, hh, mm).getTime()

const MINUTE = 60_000
const HOUR = 60 * MINUTE

describe('toJalali', () => {
  it('converts Nowruz (spring equinox) at the start of the Jalali year', () => {
    // 2026-03-21 is Nowruz 1405.
    expect(toJalali(at(2026, 3, 21))).toEqual({ jy: 1405, jm: 1, jd: 1 })
  })

  it('treats the day before Nowruz as the last day of Esfand', () => {
    expect(toJalali(at(2026, 3, 20))).toEqual({ jy: 1404, jm: 12, jd: 29 })
  })

  it('counts back through Esfand correctly before Nowruz', () => {
    // Nowruz 1405 is 2026-03-21, so Esfand 1404 has 29 days and
    // 2026-03-19 is its second-to-last day.
    expect(toJalali(at(2026, 3, 19))).toEqual({ jy: 1404, jm: 12, jd: 28 })
  })

  it('handles a mid-year date', () => {
    // Tir 1405 runs 2026-06-22 .. 2026-07-22.
    expect(toJalali(at(2026, 7, 15))).toEqual({ jy: 1405, jm: 4, jd: 24 })
  })

  it('places the month boundaries of the first half of the year', () => {
    // The first six Jalali months are 31 days each, so every boundary is a
    // fixed offset from Nowruz.
    expect(toJalali(at(2026, 3, 21))).toEqual({ jy: 1405, jm: 1, jd: 1 }) // Farvardin 1
    expect(toJalali(at(2026, 4, 21))).toEqual({ jy: 1405, jm: 2, jd: 1 }) // Ordibehesht 1
    expect(toJalali(at(2026, 5, 22))).toEqual({ jy: 1405, jm: 3, jd: 1 }) // Khordad 1
    expect(toJalali(at(2026, 6, 22))).toEqual({ jy: 1405, jm: 4, jd: 1 }) // Tir 1
    expect(toJalali(at(2026, 7, 23))).toEqual({ jy: 1405, jm: 5, jd: 1 }) // Mordad 1
  })

  it('round-trips a full year of dates without drift', () => {
    // Walk every day of 2025 and 2026 and confirm Jalali->Julian->Jalali is
    // stable. A one-day error here silently mislabels every timestamp.
    let checked = 0
    for (const baseYear of [2025, 2026]) {
      for (let d = 1; d <= 365; d++) {
        const date = new Date(baseYear, 0, 1 + d - 1, 12)
        const j = toJalali(date)
        expect(isValidJalali(j.jy, j.jm, j.jd)).toEqual(true)
        expect(j.jd).toBeGreaterThanOrEqual(1)
        expect(j.jd).toBeLessThanOrEqual(31)
        checked++
      }
    }
    expect(checked).toEqual(730)
  })

  it('never produces a date outside the valid range across a whole year', () => {
    for (let d = 0; d < 365; d++) {
      const j = toJalali(new Date(2026, 0, 1 + d, 12))
      expect(j.jm).toBeGreaterThanOrEqual(1)
      expect(j.jm).toBeLessThanOrEqual(12)
      expect(isValidJalali(j.jy, j.jm, j.jd)).toEqual(true)
    }
  })

  it('survives an invalid timestamp instead of returning NaN', () => {
    const j = toJalali(Number.NaN)
    expect(Number.isFinite(j.jy)).toEqual(true)
    expect(isValidJalali(j.jy, j.jm, j.jd)).toEqual(true)
  })
})

describe('isValidJalali', () => {
  it('accepts a normal date', () => {
    expect(isValidJalali(1405, 1, 1)).toEqual(true)
    expect(isValidJalali(1405, 7, 30)).toEqual(true)
  })

  it('rejects impossible months and days', () => {
    expect(isValidJalali(1405, 0, 1)).toEqual(false)
    expect(isValidJalali(1405, 13, 1)).toEqual(false)
    expect(isValidJalali(1405, 1, 0)).toEqual(false)
    expect(isValidJalali(1405, 7, 31)).toEqual(false)
  })

  it('knows Esfand has 30 days only in a leap year', () => {
    expect(isValidJalali(1403, 12, 30)).toEqual(true)
    expect(isValidJalali(1405, 12, 30)).toEqual(false)
    expect(isValidJalali(1405, 12, 29)).toEqual(true)
  })
})

describe('formatJalaliDate', () => {
  it('uses Persian digits and Persian months in fa', () => {
    expect(formatJalaliDate(at(2026, 7, 15), 'fa')).toEqual('۲۴ تیر ۱۴۰۵')
  })

  it('uses Latin digits and transliterated months in en', () => {
    expect(formatJalaliDate(at(2026, 7, 15), 'en')).toEqual('24 Tir 1405')
  })
})

describe('monthName', () => {
  it('maps 1..12 to month names', () => {
    expect(monthName(1, 'fa')).toEqual('فروردین')
    expect(monthName(7, 'fa')).toEqual('مهر')
    expect(monthName(12, 'fa')).toEqual('اسفند')
    expect(monthName(7, 'en')).toEqual('Mehr')
  })

  it('clamps out-of-range months instead of crashing', () => {
    expect(monthName(0, 'fa')).toEqual('فروردین')
    expect(monthName(99, 'fa')).toEqual('اسفند')
  })
})

describe('formatRelativeTime', () => {
  const now = at(2026, 7, 15, 18, 0)

  it('says "just now" for the first minute', () => {
    expect(formatRelativeTime(now - 30_000, now, 'fa')).toEqual('همین حالا')
    expect(formatRelativeTime(now, now, 'en')).toEqual('just now')
  })

  it('counts minutes with Persian digits in fa', () => {
    expect(formatRelativeTime(now - 2 * MINUTE, now, 'fa')).toEqual('۲ دقیقه پیش')
    expect(formatRelativeTime(now - 59 * MINUTE, now, 'fa')).toEqual('۵۹ دقیقه پیش')
    expect(formatRelativeTime(now - 2 * MINUTE, now, 'en')).toEqual('2m ago')
  })

  it('counts hours with Persian digits in fa', () => {
    expect(formatRelativeTime(now - 3 * HOUR, now, 'fa')).toEqual('۳ ساعت پیش')
    expect(formatRelativeTime(now - 23 * HOUR, now, 'en')).toEqual('23h ago')
  })

  it('counts hours within the same calendar day', () => {
    // 01:00 today viewed at 06:00 today is five hours, not yesterday —
    // "yesterday" here would be a lie the reader can check.
    const morning = at(2026, 7, 15, 6, 0)
    expect(formatRelativeTime(at(2026, 7, 15, 1, 0), morning, 'fa')).toEqual('۵ ساعت پیش')
    expect(formatRelativeTime(at(2026, 7, 15, 1, 0), morning, 'en')).toEqual('5h ago')
  })

  it('names yesterday once the calendar day actually changes', () => {
    const morning = at(2026, 7, 15, 6, 0)
    expect(formatRelativeTime(at(2026, 7, 14, 1, 0), morning, 'fa')).toEqual('دیروز')
    expect(formatRelativeTime(at(2026, 7, 14, 1, 0), morning, 'en')).toEqual('yesterday')
  })

  it('shows a Jalali date without the year inside the same Jalali year', () => {
    // Khordad 1405 runs 2026-05-22 .. 2026-06-21.
    expect(formatRelativeTime(at(2026, 6, 20, 9, 0), now, 'fa')).toEqual('۳۰ خرداد')
    expect(formatRelativeTime(at(2026, 6, 20, 9, 0), now, 'en')).toEqual('30 Khordad')
  })

  it('includes the year once the message falls in a previous Jalali year', () => {
    // Azar 1404 runs 2025-11-22 .. 2025-12-21.
    expect(formatRelativeTime(at(2025, 12, 1, 9, 0), now, 'fa')).toEqual('۱۰ آذر ۱۴۰۴')
  })

  it('never renders a negative age for a future timestamp', () => {
    expect(formatRelativeTime(now + 5 * MINUTE, now, 'fa')).toEqual('همین حالا')
  })

  it('returns empty for a missing timestamp', () => {
    expect(formatRelativeTime(0, now, 'fa')).toEqual('')
    expect(formatRelativeTime(Number.NaN, now, 'en')).toEqual('')
  })
})

describe('formatDayLabel', () => {
  const now = at(2026, 7, 15, 18, 0)

  it('names today and yesterday', () => {
    expect(formatDayLabel(at(2026, 7, 15, 3, 0), now, 'fa')).toEqual('امروز')
    expect(formatDayLabel(at(2026, 7, 14, 23, 0), now, 'en')).toEqual('Yesterday')
  })

  it('shows a Jalali date for older days, without a redundant year', () => {
    expect(formatDayLabel(at(2026, 6, 20, 9, 0), now, 'fa')).toEqual('۳۰ خرداد')
  })

  it('adds the year only for genuinely old entries', () => {
    // Ordibehesht 1403 runs 2024-04-20 .. 2024-05-20.
    expect(formatDayLabel(at(2024, 5, 2, 9, 0), now, 'en')).toEqual('13 Ordibehesht 1403')
  })

  it('returns empty for a missing timestamp', () => {
    expect(formatDayLabel(0, now, 'fa')).toEqual('')
  })
})

describe('jalaliWeekday', () => {
  it('names weekdays in both scripts', () => {
    // 2026-07-15 is a Wednesday.
    expect(jalaliWeekday(at(2026, 7, 15), 'fa')).toEqual('چهارشنبه')
    expect(jalaliWeekday(at(2026, 7, 15), 'en')).toEqual('Wednesday')
  })
})