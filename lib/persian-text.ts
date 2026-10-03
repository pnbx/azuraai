/**
 * Persian typography normalisation for text the model produced.
 *
 * Free models write Persian that a Persian reader notices immediately: Arabic
 * yeh/kaf instead of Persian, a space where a half-space belongs ("می رود"), no
 * tanween ("لطفا"), Latin digits in a Persian sentence. None of it changes the
 * meaning, but it makes an otherwise good answer look machine-made.
 *
 * Two rules govern everything here:
 *
 *  1. Never touch machine-readable spans. Fenced code, inline code, `$…$` /
 *     `$$…$$` maths, LaTeX commands, URLs, markdown link targets and HTML tags
 *     are copied through byte-for-byte. Renaming a variable inside a code
 *     fence would break the code.
 *  2. Only convert digits where the surrounding sentence is actually Persian.
 *     A fully English answer must come back byte-identical.
 *
 * Kept free of React and browser APIs so every rule is unit testable.
 */

/** U+200C ZERO WIDTH NON-JOINER — the Persian half-space. */
const ZWNJ = '\u200c'

// ─── Segment protection ─────────────────────────────────────────────────────

/**
 * Spans that must survive untouched.
 *
 * This is a hand-written scanner rather than one big alternation in a
 * `split()` regex, for two reasons that both cost real debugging time:
 *
 *  - `split()` with a *non*-capturing pattern silently **drops** every match.
 *    With one capturing group the two have to be interleaved correctly by
 *    index parity, which is easy to get subtly wrong.
 *  - Order matters (`$$…$$` before `$…$`, a fence before inline code) and a
 *    scanner states that order as code you can step through.
 *
 * `protectedEnd` returns the index just past a protected span, or -1 when the
 * span does not open here.
 */

/** A $…$ span only counts as maths, not as a price. */
function looksInlineMath(content: string): boolean {
  if (!content || content.length > 120) return false
  // Leading/trailing whitespace means the author was not delimiting a token:
  // this is what separates "$5 and $10" (a price range) from "$x_1 + 2$".
  if (/\s/.test(content[0]) || /\s/.test(content[content.length - 1])) return false
  // Must contain actual maths punctuation, otherwise "it cost $5" is maths.
  if (!/[_^{}()]|\\[a-zA-Z]+|[+\-*/^=<>]/.test(content)) return false
  // A bare number is a price, never maths.
  if (/^[\d.,]+$/.test(content)) return false
  return true
}

/**
 * Characters that can possibly open a protected span. Checked before the
 * expensive `s.slice()`, which would otherwise be allocated once per character
 * of the answer and make the scan quadratic.
 */
const OPENERS = '`$\\]<h'

function protectedEnd(s: string, start: number): number {
  if (!OPENERS.includes(s[start])) return -1
  const rest = s.slice(start)

  // ── Fenced code ───────────────────────────────────────────────────────────
  // An *unclosed* fence protects everything to the end of the string. The
  // renderer will show it as code, so normalising it would corrupt code the
  // user can still see and copy.
  const fence = rest.startsWith('```')
    ? '```'
    : rest.startsWith('~~~')
      ? '~~~'
      : null
  if (fence) {
    let i = start + 3
    while (i < s.length) {
      if (s.startsWith(fence, i) && (i === 0 || s[i - 1] === '\n')) return i + 3
      i++
    }
    return s.length
  }

  // ── Inline code ───────────────────────────────────────────────────────────
  // A run of N backticks is closed by a run of exactly N, so `` `a`b` `` behaves
  // the way a CommonMark renderer treats it.
  if (s[start] === '`') {
    let n = 1
    while (s[start + n] === '`') n++
    const tick = '`'.repeat(n)
    const close = s.indexOf(tick, start + n)
    return close === -1 ? -1 : close + n
  }

  // ── Display maths, before inline so $$…$$ is not split at its inner dollar ─
  if (rest.startsWith('$$')) {
    const close = s.indexOf('$$', start + 2)
    return close === -1 ? -1 : close + 2
  }

  // ── Inline maths ──────────────────────────────────────────────────────────
  if (s[start] === '$') {
    let end = start + 1
    while (end < s.length && s[end] !== '$' && s[end] !== '\n') end++
    if (s[end] !== '$') return -1
    const content = s.slice(start + 1, end)
    if (!looksInlineMath(content)) return -1
    // A digit straight after the closing `$` means we probably swallowed a
    // price range like "$5 and $10".
    if (/[0-9]/.test(s[end + 1] ?? '')) return -1
    return end + 1
  }

  // ── Bare LaTeX delimiters ────────────────────────────────────────────────
  if (rest.startsWith('\\(') || rest.startsWith('\\[')) {
    const closer = rest.startsWith('\\(') ? '\\)' : '\\]'
    const close = s.indexOf(closer, start + 2)
    return close === -1 ? -1 : close + 2
  }
  const env = /^\\begin\{([a-zA-Z*]+)\}/.exec(rest)
  if (env) {
    const closer = `\\end{${env[1]}}`
    const close = s.indexOf(closer, start)
    return close === -1 ? -1 : close + closer.length
  }

  // ── Markdown / image link target ─────────────────────────────────────────
  // Only the `(url)` is protected, so the link *text* still gets normalised.
  if (rest.startsWith('](')) {
    const close = s.indexOf(')', start)
    return close === -1 ? -1 : close + 1
  }

  // ── Bare URL ──────────────────────────────────────────────────────────────
  if (rest.startsWith('http://') || rest.startsWith('https://')) {
    let i = start
    while (i < s.length && !/[\s)"'<>]/.test(s[i])) i++
    return i
  }

  // ── HTML / autolink ──────────────────────────────────────────────────────
  // Gated on a letter or a slash after `<` so that a maths comparison like
  // "x <y> z" is not swallowed as a tag.
  if (s[start] === '<' && /[A-Za-z/]/.test(s[start + 1] ?? '')) {
    const close = s.indexOf('>', start)
    return close === -1 ? -1 : close + 1
  }

  return -1
}

// ─── Character-level fixes ──────────────────────────────────────────────────

/**
 * Words that are written without their tanween far more often than with it.
 * Adding it back is one of the highest-visibility fixes in the whole file:
 * every reader notices "لطفا" and forgives a model far less readily than they
 * forgive "لطفاً".
 */
const TANWEEN_WORDS = [
  'حتماً',
  'لطفاً',
  'واقعاً',
  'معمولاً',
  'مطمئناً',
  'احتمالاً',
  'دقیقاً',
  'خصوصاً',
  'مخصوصاً',
  'طبیعتاً',
  'ظاهراً',
  'تقریباً',
  'قبلاً',
  'فعلاً',
  'اصلاً',
  'اضافاً',
  'ضمناً',
]

/**
 * Longest first so "مخصوصاً" is not matched as the "خصوصاً" inside it.
 *
 * Only words that take a tanween belong here. "حتی" deliberately does not: its
 * bare form equals its correct form, and listing it would be noise.
 */
const TANWEEN_SORTED = [...TANWEEN_WORDS].sort((a, b) => b.length - a.length)

/** Arabic script block, used to decide whether a span is "Persian" at all. */
const ARABIC_LETTER = /[\u0620-\u064a\u066e-\u06d3]/

/**
 * Does this text read as Persian? Used to gate digit conversion, which is
 * correct in a Persian sentence and wrong in an English one.
 */
export function isPersianText(text: string): boolean {
  const persian = (text.match(/[\u0600-\u06ff]/g) ?? []).length
  const latin = (text.match(/[A-Za-z]/g) ?? []).length
  return persian > latin
}

/**
 * Replace Arabic yeh/alef maqsura/kaf and the decorative tatweel with their
 * Persian equivalents. This is the fix with the highest payoff per line of code:
 * Arabic ي and Persian ی are different glyphs and the difference is visible in
 * an otherwise clean paragraph.
 */
export function normalizePersianChars(input: string): string {
  return input
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    // ؤ is deliberately left alone. It looks decorative but it is
    // load-bearing — folding it to و turns "تئوری" (theory) into "توری".
    // Strip tatweel/kashida — a purely decorative elongation that only ever
    // appears in low-quality output and breaks search/copy.
    .replace(/\u0640/g, '')
    // Collapse repeated ZWNJ produced by a model double-joining.
    .replace(new RegExp(`${ZWNJ}{2,}`, 'g'), ZWNJ)
}

/** Apply the tanween list to whole words only, never to a fragment of one. */
export function applyTanween(input: string): string {
  let out = input
  for (const word of TANWEEN_SORTED) {
    const bare = word.replace(/\u064b/g, '')
    // (?<![\u0600-\u06FF]) guards the left edge so "خواصاً" is not touched by
    // "اصاً", and the right edge so "خصوصاً" is not re-matched as "خصاً".
    const re = new RegExp(`(?<![\\u0600-\\u06ff])${escapeRe(bare)}(?![\\u0600-\\u06ff])`, 'g')
    out = out.replace(re, word)
  }
  return out
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Latin and Arabic-Indic digits to Persian digits. */
export function toPersianDigitsIn(text: string): string {
  const persian = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹']
  return text.replace(/[0-9٠-٩]/g, (ch) => {
    const code = ch.codePointAt(0)!
    if (code >= 0x30 && code <= 0x39) return persian[code - 0x30]
    return persian[code - 0x0660]
  })
}

/**
 * Convert the *separators inside a number* to their Persian forms.
 *
 * Persian digits with an ASCII comma look broken: "44,500,000" becomes
 * "۴۴,۵۰۰,۰۰۰", mixing two scripts inside one number. Persian writes U+066C
 * ARABIC THOUSANDS SEPARATOR and U+066B ARABIC DECIMAL SEPARATOR.
 *
 * Both replacements are anchored to digits on *both* sides, so an ordinary
 * comma in a Persian sentence ("تهران، اصفهان") is never touched.
 *
 * A dot followed by exactly three digits is genuinely ambiguous — "1.000" is
 * one thousand in the European convention and one point zero in the English
 * one — so it is left exactly as the model wrote it rather than guessed at.
 */
export function toPersianNumberSeparators(text: string): string {
  return text
    .replace(/(?<=\d),(?=\d{3}(?!\d))/g, '٬')
    .replace(/(?<=\d)\.(?!\d{3}(?!\d))/g, '٫')
}

// ─── Half-space (نیم‌فاصله) ──────────────────────────────────────────────────

/**
 * The two half-space rules that cover essentially every real case.
 *
 * Written as a small ordered list rather than one clever regex: the affix sets
 * overlap ("می" is both a prefix and a word, "های" contains "ها"), and each
 * rule needs a different guard on what may sit on its left. Ordering makes that
 * explicit and keeps the behaviour reviewable.
 */
/**
 * Persian letters, as a regex fragment.
 *
 * Note what this is *for*: JS's `\b` and `\w` are ASCII-only, so `\b` never
 * matches next to a Persian letter and is useless for Persian text. Every guard
 * below is an explicit character-class test instead.
 */
const FA = '\\u0620-\\u06ff'
/** Assert the match is not glued to another Persian letter on either side. */
const LEFT = `(?<![${FA}])`
const RIGHT = `(?![${FA}])`

/**
 * Note the signature: `String.replace` hands the replacer the match *string*
 * first and the capture groups after it. Indexing the first argument like an
 * `exec` array silently reads `m[1]` as "the second character of the match",
 * which quietly corrupts every word the rule touches.
 */
type Replacer = (match: string, left: string, affix: string) => string

const ZWNJ_RULES: Array<{ re: RegExp; to: Replacer }> = [
  // Verbal prefix: "می رود" → "می‌رود", "نمی دانم" → "نمی‌دانم".
  // `ن?می` in one alternation so "نمی" wins over "می" at the same position.
  {
    re: new RegExp(`${LEFT}(ن?می)[ \\t]+([${FA}]{2,})`, 'g'),
    to: (_m, prefix, verb) => `${prefix}${ZWNJ}${verb}`,
  },
  // Plural / possessive suffixes: "کتاب ها" → "کتاب‌ها", "این هایی" →
  // "این‌هایی". A two-letter left side is allowed here because "آن ها" is
  // correct Persian and must not be left as two words.
  {
    re: new RegExp(`([${FA}]{2,})[ \\t]+(هایی|های|ها)${RIGHT}`, 'g'),
    to: (_m, word, suffix) => `${word}${ZWNJ}${suffix}`,
  },
  // Comparative suffixes: "بزرگ تر" → "بزرگ‌تر". A four-letter left side is
  // required because a shorter one is nearly always a separate word: "دو تر"
  // is not "دوتر", and "کم تر" is already the single word "کمتر".
  {
    re: new RegExp(`([${FA}]{4,})[ \\t]+(ترین|تر)${RIGHT}`, 'g'),
    to: (_m, word, suffix) => `${word}${ZWNJ}${suffix}`,
  },
  // Clitic suffixes after a verb: "کرده اید" → "کرده‌اید", "گفت اش" →
  // "گفت‌اش", "نوشته اند" → "نوشته‌اند". Three letters is the floor here
  // because "شده اند" is a real, common pair that a four-letter rule would
  // leave as two words.
  {
    re: new RegExp(`([${FA}]{3,})[ \\t]+(اند|ان|اید|ایم|اش|ام|ات)${RIGHT}`, 'g'),
    to: (_m, word, suffix) => `${word}${ZWNJ}${suffix}`,
  },
]

/** Insert the half-space where Persian grammar wants it. */
export function applyZwnj(input: string): string {
  let out = input
  for (const rule of ZWNJ_RULES) {
    // LastIndex is reset per pass because these global regexes are module-level
    // singletons reused across calls; a stale cursor would skip matches.
    rule.re.lastIndex = 0
    out = out.replace(rule.re, rule.to)
  }
  return out
}

// ─── Whole-text pass ────────────────────────────────────────────────────────

/** Normalise one unprotected prose span. */
function normalizeSpan(text: string): string {
  if (!ARABIC_LETTER.test(text)) return text
  let out = normalizePersianChars(text)
  out = applyZwnj(out)
  out = applyTanween(out)
  // Digits are Persian-ised only when this span reads as Persian, so an English
  // answer passes through untouched.
  if (isPersianText(out)) {
    // Separators first: the guard above them requires ASCII digits, which the
    // digit pass is about to destroy.
    out = toPersianNumberSeparators(out)
    out = toPersianDigitsIn(out)
  }
  // Deliberately NOT collapsing runs of spaces or trimming trailing ones here:
  // two trailing spaces are a Markdown hard line break, and normalising them
  // would silently reflow the model's answer. `normalizePersian` in
  // `lib/chat-tools` does collapse them, because a textarea is not markdown.
  return out
}

/**
 * Normalise a full model reply, preserving code, maths, URLs and link targets.
 *
 * This is the entry point the chat route calls on the final `meta` frame.
 */
export function normalizePersianMarkdown(input: string): string {
  if (!input) return input
  let out = ''
  let prose = ''
  let i = 0
  while (i < input.length) {
    const end = protectedEnd(input, i)
    if (end === -1) {
      prose += input[i]
      i++
      continue
    }
    // Flush the prose run, then copy the protected span through untouched.
    out += normalizeSpan(prose)
    prose = ''
    out += input.slice(i, end)
    i = end
  }
  out += normalizeSpan(prose)
  return out
}

export const __testing = { protectedEnd, looksInlineMath, ZWNJ, TANWEEN_SORTED }