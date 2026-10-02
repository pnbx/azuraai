/**
 * Tests for the chat tools.
 *
 * The calculator is hand-written parsing code fed arbitrary user input on
 * every keystroke, so it gets the most attention here: correctness,
 * precedence, and — most importantly — that malformed input returns a result
 * rather than throwing or evaluating something unexpected.
 */

import { describe, it, expect } from '@jest/globals'
import {
  calculate,
  looksLikeCalculation,
  formatNumber,
  toPersianDigits,
  toLatinDigits,
  normalizePersian,
  findTool,
  TOOLS,
  type ToolId,
} from '@/lib/chat-tools'

describe('calculate', () => {
  it('does basic arithmetic', () => {
    expect(calculate('2+2').value).toBe(4)
    expect(calculate('10-3').value).toBe(7)
    expect(calculate('6*7').value).toBe(42)
    expect(calculate('9/3').value).toBe(3)
  })

  it('respects operator precedence', () => {
    expect(calculate('2+3*4').value).toBe(14)
    expect(calculate('2*3+4').value).toBe(10)
    expect(calculate('2+3*4-1').value).toBe(13)
  })

  it('handles parentheses', () => {
    expect(calculate('(2+3)*4').value).toBe(20)
    expect(calculate('((1+2)*(3+4))').value).toBe(21)
  })

  it('handles unary minus', () => {
    expect(calculate('-5').value).toBe(-5)
    expect(calculate('3*-2').value).toBe(-6)
    expect(calculate('-(3+4)').value).toBe(-7)
  })

  it('handles exponents right-associatively', () => {
    expect(calculate('2^3').value).toBe(8)
    expect(calculate('2^3^2').value).toBe(512)
  })

  it('handles percentages', () => {
    expect(calculate('50%').value).toBe(0.5)
    expect(calculate('200*10%').value).toBe(20)
  })

  it('reads Persian and Arabic-Indic digits', () => {
    // The UI is Persian; users type both digit sets.
    expect(calculate('۲+۳').value).toBe(5)
    expect(calculate('٢+٣').value).toBe(5)
    expect(calculate('۱۰/۲').value).toBe(5)
  })

  it('accepts decimals and thousands separators', () => {
    expect(calculate('1.5*2').value).toBe(3)
    expect(calculate('1٬۰۰۰+۱').value).toBe(1001)
  })

  it('knows pi and e', () => {
    expect(calculate('2*pi').value).toBeCloseTo(2 * Math.PI, 10)
    expect(calculate('e').value).toBeCloseTo(Math.E, 10)
  })

  it('refuses to divide by zero instead of returning Infinity', () => {
    const r = calculate('5/0')
    expect(r.ok).toBe(false)
    expect(r.display).toBe('')
  })

  it('returns a failure rather than throwing on malformed input', () => {
    const bad = ['', '   ', '2+', '*3', '(1+2', '1+2)', 'abc', '2++*3', '((((', '1/0']
    for (const input of bad) {
      expect(() => calculate(input)).not.toThrow()
      expect([input, calculate(input).ok]).toEqual([input, false])
    }
  })

  it('does not execute code hidden in the expression', () => {
    // Hand-written parsing means there is no eval path to abuse.
    for (const evil of ['process.exit(1)', 'require("fs")', 'globalThis.x=1', '1;alert(1)']) {
      expect(() => calculate(evil)).not.toThrow()
      expect(calculate(evil).ok).toBe(false)
    }
  })

  it('displays results with Persian digits and thousands separators', () => {
    expect(calculate('1000000+500000').display).toBe('۱٬۵۰۰٬۰۰۰')
    expect(calculate('2+2').display).toBe('۴')
  })

  it('avoids floating point noise in the display', () => {
    expect(calculate('0.1+0.2').display).toBe('۰٫۳')
  })
})

describe('looksLikeCalculation', () => {
  it('recognises arithmetic', () => {
    expect(looksLikeCalculation('2+2')).toBe(true)
    expect(looksLikeCalculation('12*12')).toBe(true)
    expect(looksLikeCalculation('۵۰*۱۲')).toBe(true)
  })

  it('does not treat a normal Persian message as arithmetic', () => {
    expect(looksLikeCalculation('سلام، حالت چطوره؟')).toBe(false)
    expect(looksLikeCalculation('write a regex for email')).toBe(false)
    expect(looksLikeCalculation('قیمت این گوشی ۱۰ میلیون است')).toBe(false)
  })

  it('ignores empty and over-long input', () => {
    expect(looksLikeCalculation('')).toBe(false)
    expect(looksLikeCalculation('1+'.repeat(200))).toBe(false)
  })

  it('allows the constants it knows', () => {
    expect(looksLikeCalculation('2*pi')).toBe(true)
  })
})

describe('digit conversion', () => {
  it('converts ASCII to Persian', () => {
    expect(toPersianDigits('0123456789')).toBe('۰۱۲۳۴۵۶۷۸۹')
  })

  it('converts Arabic-Indic to Persian', () => {
    expect(toPersianDigits('٠١٢٣٤٥٦٧٨٩')).toBe('۰۱۲۳۴۵۶۷۸۹')
  })

  it('round-trips back to Latin', () => {
    expect(toLatinDigits('۱۲۳')).toBe('123')
    expect(toLatinDigits(toPersianDigits('4567'))).toBe('4567')
  })

  it('leaves non-digits untouched', () => {
    expect(toPersianDigits('قیمت ۱۰۰ تومان')).toBe('قیمت ۱۰۰ تومان')
  })
})

describe('formatNumber', () => {
  it('groups thousands with the Persian separator', () => {
    expect(formatNumber(1000)).toBe('۱٬۰۰۰')
    expect(formatNumber(1234567)).toBe('۱٬۲۳۴٬۵۶۷')
  })

  it('handles zero, negatives and decimals', () => {
    expect(formatNumber(0)).toBe('۰')
    expect(formatNumber(-1500)).toBe('-۱٬۵۰۰')
    expect(formatNumber(2.5)).toBe('۲٫۵')
  })

  it('switches to exponent notation for extreme values', () => {
    expect(formatNumber(1e20)).toContain('e')
  })
})

describe('normalizePersian', () => {
  it('unifies Arabic yeh and kaf to Persian', () => {
    expect(normalizePersian('كتاب يادداشت')).toBe('کتاب یادداشت')
  })

  it('removes decorative kashida', () => {
    expect(normalizePersian('سلامـــ')).toBe('سلام')
  })

  it('collapses repeated spaces and trims', () => {
    expect(normalizePersian('  دو    فاصله  ')).toBe('دو فاصله')
  })

  it('leaves already-correct Persian alone', () => {
    expect(normalizePersian('این یک متن درست است')).toBe('این یک متن درست است')
  })
})

describe('prompt tools', () => {
  it('exposes every tool with a label, hint and builder', () => {
    expect(TOOLS.length).toBeGreaterThan(0)
    for (const tool of TOOLS) {
      expect([tool.id, tool.labelKey, tool.hintKey].every((v) => v.length > 0)).toBe(true)
    }
  })

  it('wraps the user text rather than discarding it', () => {
    for (const tool of TOOLS) {
      const built = tool.build('متن کاربر')
      expect(built).toContain('متن کاربر')
      expect(built.length).toBeGreaterThan('متن کاربر'.length)
    }
  })

  it('finds a tool by id', () => {
    expect(findTool('summarize')?.id).toBe('summarize')
    expect(findTool('nope' as ToolId)).toBeUndefined()
  })

  it('has unique ids, so selecting one tool cannot collide with another', () => {
    const ids = TOOLS.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('asks for LaTeX in the formula tool', () => {
    // Maths is only typeset when the model emits the delimiters.
    expect(findTool('formula')!.build('انتگرال')).toContain('$$')
  })
})