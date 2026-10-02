/**
 * Chat tools: things the composer can do without asking the model.
 *
 * Three families, deliberately separated by how they work:
 *  - Prompt actions rewrite the user's question into a better one and send it.
 *    These still cost a model call, so they are opt-in taps, not defaults.
 *  - The calculator and the text utilities run entirely on the device. They
 *    are instant, free, and work with no network — which matters because the
 *    gateway is free-tier and rate-limited.
 *
 * Kept free of React and browser APIs so every rule here is unit testable.
 */

// ─── Prompt actions ──────────────────────────────────────────────────────────

// Type-only import: keeps this module free of runtime dependencies on the
// dictionary while still tying the keys to it.
import type { I18nKey } from './i18n'

export type ToolId =
  | 'summarize'
  | 'explain'
  | 'translate'
  | 'improve'
  | 'code'
  | 'table'
  | 'formula'

export interface ToolDefinition {
  id: ToolId
  /** i18n key for the button label. Typed as I18nKey so a missing or renamed
   *  translation is a compile error rather than a label that renders as
   *  "tool.summarize" in the UI. */
  labelKey: I18nKey
  /** i18n key for the one-line explanation shown in the sheet. */
  hintKey: I18nKey
  /** Icon name resolved by the UI. */
  icon: 'summarize' | 'explain' | 'translate' | 'improve' | 'code' | 'table' | 'formula'
  /**
   * Wrap the user's own text. Returning the text unchanged for empty input
   * lets the caller decide whether to prompt the user to type first.
   */
  build: (text: string) => string
}

/**
 * Each action is a full instruction rather than a bare prefix, because a small
 * model follows an explicit request far more reliably than a keyword.
 */
export const TOOLS: ToolDefinition[] = [
  {
    id: 'summarize',
    labelKey: 'tool.summarize',
    hintKey: 'tool.summarizeHint',
    icon: 'summarize',
    build: (t) =>
      `متن زیر را در حداکثر ۵ جمله خلاصه کن. نکته‌های کلیدی را نگه دار و مقدمه و تکرار را حذف کن.\n\n${t}`,
  },
  {
    id: 'explain',
    labelKey: 'tool.explain',
    hintKey: 'tool.explainHint',
    icon: 'explain',
    build: (t) =>
      `این را طوری توضیح بده که انگار مخاطب هیچ دانش قبلی ندارد. از مثال ساده استفاده کن.\n\n${t}`,
  },
  {
    id: 'translate',
    labelKey: 'tool.translate',
    hintKey: 'tool.translateHint',
    icon: 'translate',
    build: (t) =>
      `متن زیر را به انگلیسی روان ترجمه کن. لحن طبیعی باشد، نه ترجمه تحت‌اللفظی.\n\n${t}`,
  },
  {
    id: 'improve',
    labelKey: 'tool.improve',
    hintKey: 'tool.improveHint',
    icon: 'improve',
    build: (t) =>
      `متن فارسی زیر را ویرایش کن: غلط املایی، نیم‌فاصله و نشانه‌گذاری را اصلاح کن. نسخه ویرایش‌شده را بده و تغییرات را کوتاه توضیح بده.\n\n${t}`,
  },
  {
    id: 'code',
    labelKey: 'tool.code',
    hintKey: 'tool.codeHint',
    icon: 'code',
    build: (t) =>
      `کد لازم را بنویس. توضیح کوتاه بده و مثال استفاده بیاور. زبان مناسب را خودت انتخاب کن.\n\n${t}`,
  },
  {
    id: 'table',
    labelKey: 'tool.table',
    hintKey: 'tool.tableHint',
    icon: 'table',
    build: (t) =>
      `پاسخ را به شکل یک جدول مارک‌داون بده با سطر عنوان. اول یک جمله مستقیم بنویس، بعد جدول.\n\n${t}`,
  },
  {
    id: 'formula',
    labelKey: 'tool.formula',
    hintKey: 'tool.formulaHint',
    icon: 'formula',
    build: (t) =>
      `فرمول‌های لازم را با LaTeX بنویس. برای فرمول بلند از $$...$$ و برای فرمول داخل جمله از $...$ استفاده کن.\n\n${t}`,
  },
]

export function findTool(id: ToolId): ToolDefinition | undefined {
  return TOOLS.find((t) => t.id === id)
}

// ─── Calculator ──────────────────────────────────────────────────────────────

/**
 * A small recursive-descent arithmetic evaluator.
 *
 * Written by hand rather than using `eval`/`Function`, because the input is
 * whatever the user typed and this runs on every keystroke. Supports + - * /,
 * %, parentheses, unary minus, exponents, and a few named constants.
 */
const CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  π: Math.PI,
  e: Math.E,
}

class CalcError extends Error {}

/**
 * Grouping separators, which are cosmetic and must not split a number.
 * U+066C ARABIC THOUSANDS SEPARATOR, U+066C/U+060C/U+FF0C/U+002C comma forms.
 */
function isGroupSeparator(ch: string): boolean {
  return ch === '٬' || ch === '،' || ch === '，' || ch === ','
}

type Token = { kind: 'num'; value: number } | { kind: 'op'; value: string } | { kind: 'lparen' } | { kind: 'rparen' }

function tokenize(input: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  // Persian and Arabic-Indic digits, because the UI is Persian and users type
  // both forms interchangeably.
  const digitValue = (ch: string): number | null => {
    const c = ch.codePointAt(0)!
    if (c >= 0x30 && c <= 0x39) return c - 0x30 // 0-9
    if (c >= 0x06f0 && c <= 0x06f9) return c - 0x06f0 // Persian ۰-۹
    if (c >= 0x0660 && c <= 0x0669) return c - 0x0660 // Arabic-Indic ٠-٩
    return null
  }
  while (i < input.length) {
    const ch = input[i]
    // Skip whitespace and thousands separators between numbers.
    if (/\s/.test(ch) || isGroupSeparator(ch)) {
      i++
      continue
    }
    const d = digitValue(ch)
    if (d !== null) {
      let s = String(d)
      i++
      // Fractional part, if a decimal point follows. Users type the Persian
      // decimal separator (U+066B) as often as the ASCII dot.
      if (i < input.length && (input[i] === '.' || input[i] === '٫')) {
        s += '.'
        i++
        while (i < input.length) {
          const nd = digitValue(input[i])
          if (nd === null) break
          s += String(nd)
          i++
        }
      } else {
        while (i < input.length) {
          // Grouping separators belong *inside* a number. Without this,
          // "1,000" tokenized as two numbers (1 then 000) and the parser
          // rejected the expression as trailing input.
          if (isGroupSeparator(input[i])) {
            i++
            continue
          }
          const nd = digitValue(input[i])
          if (nd === null) break
          s += String(nd)
          i++
        }
      }
      tokens.push({ kind: 'num', value: Number(s) })
      continue
    }
    if (ch === '(') {
      tokens.push({ kind: 'lparen' })
      i++
      continue
    }
    if (ch === ')') {
      tokens.push({ kind: 'rparen' })
      i++
      continue
    }
    if ('+-*/%^'.includes(ch)) {
      tokens.push({ kind: 'op', value: ch })
      i++
      continue
    }
    // Named constants, longest first so `pi` is not read as `p`.
    const lower = input.slice(i).toLowerCase()
    const name = ['pi', 'π', 'e'].find((n) => lower.startsWith(n))
    if (name) {
      tokens.push({ kind: 'num', value: CONSTANTS[name] })
      i += name.length
      continue
    }
    throw new CalcError(`unexpected character: ${ch}`)
  }
  return tokens
}

function evaluateTokens(tokens: Token[]): number {
  let pos = 0
  const peek = () => tokens[pos]

  function parsePrimary(): number {
    const t = peek()
    if (!t) throw new CalcError('unexpected end of expression')
    if (t.kind === 'num') {
      pos++
      return t.value
    }
    if (t.kind === 'op' && (t.value === '-' || t.value === '+')) {
      pos++
      const v = parsePrimary()
      return t.value === '-' ? -v : v
    }
    if (t.kind === 'lparen') {
      pos++
      const v = parseAdditive()
      if (peek()?.kind !== 'rparen') throw new CalcError('missing closing parenthesis')
      pos++
      return v
    }
    throw new CalcError('expected a number')
  }

  function parsePower(): number {
    const base = parsePrimary()
    const t = peek()
    if (t !== undefined && t.kind === 'op' && t.value === '^') {
      pos++
      // Right-associative: 2^3^2 is 2^(3^2).
      return Math.pow(base, parsePower())
    }
    return base
  }

  function parseUnaryPercent(): number {
    const v = parsePower()
    const t = peek()
    if (t !== undefined && t.kind === 'op' && t.value === '%') {
      pos++
      return v / 100
    }
    return v
  }

  function parseMultiplicative(): number {
    let v = parseUnaryPercent()
    for (;;) {
      // Read the operator into a local so TypeScript keeps the narrowing;
      // reaching through peek() twice loses it.
      const t = peek()
      if (t === undefined || t.kind !== 'op' || (t.value !== '*' && t.value !== '/')) {
        return v
      }
      pos++
      const rhs = parseUnaryPercent()
      if (t.value === '/' && rhs === 0) throw new CalcError('division by zero')
      v = t.value === '*' ? v * rhs : v / rhs
    }
  }

  function parseAdditive(): number {
    let v = parseMultiplicative()
    for (;;) {
      const t = peek()
      if (t === undefined || t.kind !== 'op' || (t.value !== '+' && t.value !== '-')) {
        return v
      }
      pos++
      const rhs = parseMultiplicative()
      v = t.value === '+' ? v + rhs : v - rhs
    }
  }

  const result = parseAdditive()
  if (pos !== tokens.length) throw new CalcError('trailing input')
  return result
}

export interface CalcResult {
  ok: boolean
  value: number
  /** Display string, Persian digits, grouped by thousands. */
  display: string
  error?: string
}

/** Evaluate an arithmetic expression, never throwing. */
export function calculate(input: string): CalcResult {
  const raw = input.trim()
  if (!raw) return { ok: false, value: NaN, display: '', error: 'empty' }
  try {
    const value = evaluateTokens(tokenize(raw))
    if (!Number.isFinite(value)) {
      return { ok: false, value, display: '', error: 'not_finite' }
    }
    return { ok: true, value, display: formatNumber(value) }
  } catch {
    // Any malformed input is simply "not a calculation" — the caller decides
    // whether to fall through to sending the message as normal text.
    return { ok: false, value: NaN, display: '', error: 'invalid' }
  }
}

/** Does this look like the user wants arithmetic rather than a message? */
export function looksLikeCalculation(input: string): boolean {
  const s = input.trim()
  if (!s || s.length > 120) return false
  if (!/[0-9۰-۹٠-٩]/.test(s)) return false
  // Must not be a normal sentence: no letters other than constants, and at
  // least one operator or a single number.
  const withoutConstants = s.replace(/pi|π|\be\b/gi, '')
  if (/[a-zA-Z]/.test(withoutConstants)) return false
  return /[+\-*/%^()]/.test(s) || /^[0-9۰-۹٠-٩.,\s]+$/.test(s)
}

// ─── Persian text utilities ──────────────────────────────────────────────────

const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹']
const ARABIC_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩']

/** Convert ASCII and Arabic-Indic digits to Persian digits. */
export function toPersianDigits(input: string): string {
  return input.replace(/[0-9٠-٩]/g, (ch) => {
    const code = ch.codePointAt(0)!
    if (code >= 0x30 && code <= 0x39) return PERSIAN_DIGITS[code - 0x30]
    return PERSIAN_DIGITS[code - 0x0660]
  })
}

/** Convert Persian and Arabic-Indic digits back to ASCII. */
export function toLatinDigits(input: string): string {
  return input
    .replace(/[۰-۹]/g, (ch) => String(ch.codePointAt(0)! - 0x06f0))
    .replace(/[٠-٩]/g, (ch) => String(ch.codePointAt(0)! - 0x0660))
}

/** Format a number for display: grouped, trimmed, Persian digits. */
export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return ''
  // Avoid float noise like 0.30000000000000004.
  const rounded = Math.round(n * 1e10) / 1e10
  const abs = Math.abs(rounded)
  if (abs >= 1e15 || (abs > 0 && abs < 1e-6)) {
    return toPersianDigits(rounded.toExponential(6))
  }
  const [intPart, fracPart] = String(rounded).split('.')
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '٬')
  // Persian readers expect U+066B as the decimal separator, not an ASCII dot.
  return toPersianDigits(fracPart ? `${grouped}٫${fracPart}` : grouped)
}

/**
 * Normalise Arabic yeh/kaf to Persian and tidy the ZWNJ.
 *
 * Persian keyboards and OCR produce ی/ي and ک/ك interchangeably, and the
 * difference is visible in an otherwise clean message.
 */
export function normalizePersian(input: string): string {
  return input
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    // Strip tatweel/kashida, a purely decorative elongation.
    .replace(/ـ/g, '')
    // Collapse runs of Arabic punctuation spacing without touching the
    // punctuation itself.
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}