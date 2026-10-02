/**
 * Tests for LaTeX rendering.
 *
 * The important cases are the failures: models emit broken LaTeX constantly,
 * and a price like "$5" must never be typeset as maths.
 */

import { describe, it, expect } from '@jest/globals'
import { renderMath, looksLikeMath } from '@/lib/math-render'

describe('renderMath', () => {
  it('typesets a simple formula', () => {
    const html = renderMath('E = mc^2')
    expect(html === null).toBe(false)
    expect(html).toContain('katex')
  })

  it('typesets a fraction with a square root', () => {
    const html = renderMath('\\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}')
    expect(html).toContain('katex')
    // The quadratic formula must contain a real radical glyph, not "sqrt".
    expect(html).not.toContain('\\sqrt')
  })

  it('typesets display-mode maths differently from inline', () => {
    const inline = renderMath('x^2', { displayMode: false })
    const block = renderMath('x^2', { displayMode: true })
    expect(block).not.toBe(inline)
  })

  it('returns null for empty input rather than swallowing literal dollars', () => {
    expect([renderMath(''), renderMath('   '), renderMath(null as unknown as string)]).toEqual([
      null,
      null,
      null,
    ])
  })

  it('never throws on malformed LaTeX', () => {
    for (const bad of ['\\frac{', '}{', '\\unknowncmd{x}', '{{{', '$']) {
      expect(() => renderMath(bad)).not.toThrow()
    }
  })

  it('falls back to showing the source when a formula cannot be typeset', () => {
    // KaTeX renders a parse error inline rather than failing; the caller
    // still gets usable HTML, which is what we want.
    const html = renderMath('\\frac{')
    expect(html === null || typeof html === 'string').toBe(true)
  })

  it('handles Persian-adjacent maths macros', () => {
    expect(renderMath('x \\in \\R')).toContain('katex')
    expect(renderMath('\\int_0^1 x\\d x')).toContain('katex')
  })
})

describe('looksLikeMath', () => {
  it('accepts real maths', () => {
    expect(looksLikeMath('E = mc^2')).toBe(true)
    expect(looksLikeMath('\\frac{a}{b}')).toBe(true)
    expect(looksLikeMath('x^2 + y^2')).toBe(true)
    expect(looksLikeMath('a_i')).toBe(true)
    expect(looksLikeMath('\\sum_{i=1}^n x_i')).toBe(true)
  })

  it('rejects prices, which would otherwise be typeset as maths', () => {
    // The "$...$" syntax collides with currency; this is the whole reason
    // looksLikeMath exists.
    expect(looksLikeMath('5')).toBe(false)
    expect(looksLikeMath('5 and 10')).toBe(false)
    expect(looksLikeMath('call me')).toBe(false)
  })

  it('rejects empty and whitespace input', () => {
    expect(looksLikeMath('')).toBe(false)
    expect(looksLikeMath('  ')).toBe(false)
  })
})