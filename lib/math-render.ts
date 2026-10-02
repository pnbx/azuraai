/**
 * LaTeX → HTML via KaTeX, wrapped so the markdown renderer never has to deal
 * with KaTeX throwing.
 *
 * A model will happily emit `\frac{` or a stray `$` from a price ("costs $5"),
 * so the fallback matters more than the happy path: when KaTeX cannot parse
 * the input we return null and the caller falls back to showing the source.
 *
 * Kept separate from markdown.tsx so the parsing rules can be unit tested
 * without rendering React.
 */

import katex from 'katex'

export interface MathRenderOptions {
  /** True for display (block) maths, false for inline. */
  displayMode?: boolean
}

/**
 * Render LaTeX to KaTeX HTML.
 *
 * Returns null when the input cannot be typeset — the caller should then show
 * the raw source rather than an error page, because a partially readable
 * formula is more useful to a student than a red KaTeX parse error.
 */
export function renderMath(latex: string, options: MathRenderOptions = {}): string | null {
  // Defensive: a null/undefined reaching here means the streaming path handed
  // us an incomplete chunk, and that must not crash the whole message.
  if (typeof latex !== 'string') return null
  const source = latex.trim()
  // An empty or whitespace-only "formula" is not maths; treating it as maths
  // would swallow the literal `$` characters a user typed.
  if (!source) return null
  try {
    return katex.renderToString(source, {
      displayMode: options.displayMode === true,
      // Never throw: a malformed formula must degrade, not crash the message.
      throwOnError: false,
      // Models emit slightly-invalid LaTeX constantly. Rendering it in red
      // with the source visible is strictly better than dropping it.
      strict: false,
      output: 'html',
      trust: false,
      macros: {
        // Persian answers frequently use these; without definitions KaTeX
        // renders them as three letters rather than the intended operator.
        '\\R': '\\mathbb{R}',
        '\\N': '\\mathbb{N}',
        '\\Z': '\\mathbb{Z}',
        '\\Q': '\\mathbb{Q}',
        '\\C': '\\mathbb{C}',
        '\\d': '\\mathrm{d}',
      },
    })
  } catch {
    // Defence in depth: KaTeX with throwOnError:false should not reach here,
    // but a renderer must never take down a chat message.
    return null
  }
}

/**
 * Heuristic: does this look like LaTeX rather than prose or a currency amount?
 *
 * The inline `$...$` syntax collides with real prices ("costs $5 and $10"),
 * so requiring at least one LaTeX signal avoids turning money into typeset
 * maths.
 */
export function looksLikeMath(inner: string): boolean {
  const s = inner.trim()
  if (!s) return false
  // Currency-only content: dollars, no operators.
  if (/^\$[\d.,]+\s*(?:and|&|،)\s*\$?[\d.,]+$/.test(s)) return false
  const signals: RegExp[] = [
    /\\[a-zA-Z]+/, // \frac, \sum, \alpha
    /[\\^_{}]/, // sub/superscripts and braces
    /[=<>≤≥≠±×÷≈∞∑∫√π]/, // operators and symbols
    /\^\d/, // x^2
    /_[a-zA-Z0-9]/, // x_i
  ]
  return signals.some((re) => re.test(s))
}