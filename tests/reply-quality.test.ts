/**
 * Tests for the garbled-reply detector.
 *
 * Each case is a reply that actually came back from a free model in
 * production, so these guard the specific shapes users saw rather than
 * abstract examples.
 */

import { describe, it, expect } from '@jest/globals'
import { assessReply, findSplicedWords, isPersian } from '@/lib/gateway/replyQuality'

describe('isPersian', () => {
  it('detects Persian prose', () => {
    expect(isPersian('این یک پاراگراف فارسی است و به زبان فارسی نوشته شده.')).toBe(true)
  })

  it('detects English prose', () => {
    expect(isPersian('This is an English paragraph written in plain English.')).toBe(false)
  })

  it('does not treat one quoted Persian word as a Persian reply', () => {
    expect(isPersian('The Persian word for water is آب and that is all.')).toBe(false)
  })
})

describe('findSplicedWords', () => {
  it('catches the exact regressions seen in production', () => {
    // These strings came back from the live app.
    expect(findSplicedWords('کاربردهایtypical برای هر زبان').length).toBeGreaterThan(0)
    expect(findSplicedWords('ماهی fried — ۲۳۰,۰۰۰ تومان').length).toBeGreaterThan(0)
    // The menu that showed "salad Olivier" and "acompañamientos" in Persian.
    expect(findSplicedWords('- salad Olivier — ۱۵۰,۰۰۰ تومان').length).toBeGreaterThan(0)
    expect(findSplicedWords('#### وصل‌ها').length).toBe(0)
  })

  it('allows a bullet that starts with a known Persian-side term', () => {
    // "- API: نقطه پایانی" is correct Persian technical writing.
    expect(findSplicedWords('- API: نقطه پایانی')).toEqual([])
  })

  it('allows technical terms Iranians genuinely say in Persian', () => {
    expect(findSplicedWords('از API و سرور استفاده کن')).toEqual([])
    expect(findSplicedWords('این کد در Python نوشته شده')).toEqual([])
  })

  it('allows a standalone Latin term separated by whitespace', () => {
    // Not spliced — there is a space, so it reads as a quoted term.
    expect(findSplicedWords('یک وب‌سایت با HTML بنویس')).toEqual([])
  })

  it('finds nothing in clean Persian', () => {
    expect(findSplicedWords('قورمه‌سبزی را با لوبیا سبز درست کنید.')).toEqual([])
  })
})

describe('assessReply', () => {
  it('passes a clean Persian reply', () => {
    const report = assessReply({
      content: '| ویژگی | پایتون |\n| --- | --- |\n| سرعت | کندتر |\n\nپایتون برای شروع راحت‌تر است.',
      finishReason: 'stop',
      question: 'در یک جدول تفاوت پایتون و راست را بنویس.',
    })
    expect([report.ok, report.issues.map((i) => i.kind)]).toEqual([true, []])
  })

  it('flags a reply that is only reasoning with no answer', () => {
    // Observed: free models burn the entire budget thinking and emit nothing.
    const report = assessReply({
      content: '',
      reasoning: 'The user wants a table. Let me consider Python vs Rust in detail and '.repeat(6),
      finishReason: 'length',
    })
    expect(report.ok).toBe(false)
    expect(report.issues[0].kind).toBe('reasoning_only')
    expect(report.worthRetrying).toBe(true)
  })

  it('flags a completely empty reply', () => {
    const report = assessReply({ content: '', finishReason: 'stop' })
    expect([report.ok, report.worthRetrying]).toEqual([false, true])
  })

  it('flags a truncated reply', () => {
    const report = assessReply({
      content: 'پایتون برای یادگیری عالی است و راست برای سیستم‌های بزرگ‌تر',
      finishReason: 'length',
    })
    expect(report.issues.some((i) => i.kind === 'truncated')).toBe(true)
  })

  it('flags spliced English found mid-reply', () => {
    const report = assessReply({
      content: 'سالادها\n- salad Olivier — ۱۵۰,۰۰۰ تومان\n- سالاد شیرازی',
      finishReason: 'stop',
      question: 'منو بنویس',
    })
    expect(report.issues.some((i) => i.kind === 'spliced')).toBe(true)
    expect(report.worthRetrying).toBe(true)
  })

  it('flags a long English answer to a Persian question', () => {
    const report = assessReply({
      content: 'Python is dynamically typed while Rust is statically typed and much faster at runtime overall.',
      finishReason: 'stop',
      question: 'تفاوت پایتون و راست چیه؟',
    })
    expect(report.issues.some((i) => i.kind === 'wrong_language')).toBe(true)
  })

  it('does not flag a short English answer to a Persian question', () => {
    // Too short to be confident, and a retry would be a waste.
    const report = assessReply({
      content: 'Use async/await.',
      finishReason: 'stop',
      question: 'تفاوت بین await و then چیه؟',
    })
    expect(report.issues.some((i) => i.kind === 'wrong_language')).toBe(false)
  })

  it('flags the salad-Olivier menu as a retryable splice', () => {
    const report = assessReply({
      content: 'سالادها\n- salad Olivier — ۱۵۰,۰۰۰ تومان\n- سالاد شیرازی — ۱۴۰,۰۰۰ تومان',
      finishReason: 'stop',
      question: 'منو بنویس',
    })
    expect(report.issues.map((i) => i.kind)).toContain('spliced')
    expect(report.worthRetrying).toBe(true)
  })

  it('does not flag a reply for style reasons alone', () => {
    const report = assessReply({
      content: 'این یک پاسخ کوتاه اما کاملاً درست فارسی است که هیچ مشکلی ندارد.',
      finishReason: 'stop',
    })
    expect([report.ok, report.worthRetrying]).toEqual([true, false])
  })

  it('treats whitespace-only content as empty', () => {
    expect(assessReply({ content: '   \n  ', finishReason: 'stop' }).issues[0].kind).toBe('empty')
  })
})