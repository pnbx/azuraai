/**
 * Detects replies that are technically successful but unusable, so the caller
 * can re-request instead of showing the user garbage.
 *
 * Motivation: free models frequently return a reply that is mostly fine but
 * degenerates partway through — Latin words spliced into Persian ("خیار
 * finely chopped", "salad Olivier"), or a reply truncated because the model
 * burned its whole budget on reasoning and never emitted an answer. Neither
 * raises an error, so without this the user just sees a bad reply and blames
 * the app.
 *
 * Pure and synchronous so it can be unit tested without a network call.
 */

/** Arabic/Persian/Urdu letters — used to decide the reply's language. */
const RTL_RE = /[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/

/** A run of Latin letters long enough to be a word, not a unit symbol. */
const LATIN_WORD_RE = /[A-Za-z]{3,}/g

/**
 * A Latin word glued to a Persian one, e.g. "کاربردهایtypical".
 *
 * Also matches a Latin word directly after a list bullet ("- salad Olivier"),
 * which is how the degeneration actually reached the user: the bullet is
 * punctuation but the word is clearly Persian text gone wrong. A single
 * space is treated as glue, since an Iranian writing about an English term
 * separates it with the Persian particle ی, not with a bare space.
 *
 * Allowed exceptions are the words Iranians genuinely keep in Latin script,
 * and a term quoted in full (inside parentheses or after a colon).
 */
const SPLICED_RE =
  /[\u0590-\u08FF][A-Za-z]{2,}|[A-Za-z]{2,}[\u0590-\u08FF]|[\u0590-\u08FF][ \t]+[A-Za-z]{3,}\b|(?:^|\n)\s*[-*+]\s+[A-Za-z]{2,}/gm

/** Latin words that may legitimately follow a bullet in a Persian list. */
const LIST_ALLOWED = new Set([
  'api', 'url', 'http', 'https', 'json', 'html', 'css', 'sql', 'gpu', 'cpu',
  'ram', 'ssd', 'usb', 'pdf', 'wifi', 'sim', 'gps', 'app', 'android', 'ios',
  'web', 'ai', 'ok', 'id', 'ip', 'pc', 'sms', 'faq', 'email', 'internet',
])

/**
 * Latin words that Iranians genuinely use in Persian technical writing.
 * Splicing one of these in is fine, so they are not counted as degeneration.
 */
const ALLOWED_LATIN = new Set([
  'api', 'apis', 'app', 'apps', 'android', 'ios', 'web', 'ai', 'url', 'urls',
  'http', 'https', 'json', 'html', 'css', 'sql', 'gpu', 'cpu', 'ram', 'ssd',
  'usb', 'pdf', 'wifi', 'sim', 'gps', 'faq', 'id', 'ip', 'pc', 'usb', 'ok',
  'email', 'internet', 'software', 'hardware', 'server', 'client', 'code',
  'python', 'javascript', 'java', 'rust', 'golang', 'linux', 'windows',
  'androidstudio', 'github', 'google', 'apple', 'ios', 'sms', 'mms', 'usb',
  'scanf', 'printf', 'string', 'array', 'list', 'map', 'set', 'loop',
])

export interface QualityIssue {
  kind:
    | 'empty'
    | 'truncated'
    | 'reasoning_only'
    | 'spliced'
    | 'wrong_language'
  detail: string
}

export interface QualityReport {
  ok: boolean
  issues: QualityIssue[]
  /** True when a retry has a realistic chance of producing something better. */
  worthRetrying: boolean
}

export interface QualityInput {
  content: string
  reasoning?: string
  finishReason?: string
  /** The user's question, to decide which language the reply should be in. */
  question?: string
}

/** True when the text is predominantly Persian/Arabic script. */
export function isPersian(text: string): boolean {
  const rtl = (text.match(new RegExp(RTL_RE.source, 'g')) ?? []).length
  const latin = (text.match(/[A-Za-z]/g) ?? []).length
  return rtl > latin
}

/**
 * Latin words fused to a Persian letter, ignoring ones Iranians actually say.
 */
export function findSplicedWords(text: string): string[] {
  return (text.match(SPLICED_RE) ?? []).filter((w) => {
    const latin = w.match(/[A-Za-z]+/)?.[0]?.toLowerCase() ?? ''
    if (latin.length < 2) return false
    if (ALLOWED_LATIN.has(latin)) return false
    // A bullet followed by a known term ("- API: ...") is fine.
    if (/^\s*[-*+]/.test(w) && LIST_ALLOWED.has(latin)) return false
    return true
  })
}

/**
 * Decide whether a completed reply is good enough to show.
 *
 * Deliberately conservative: a false positive costs a retry and some latency,
 * while a false negative ships a visibly broken reply. So only clear
 * degeneration counts — not style, length or opinion.
 */
export function assessReply(input: QualityInput): QualityReport {
  const content = input.content?.trim() ?? ''
  const reasoning = input.reasoning?.trim() ?? ''
  const issues: QualityIssue[] = []

  if (content.length === 0) {
    // The model spent everything on reasoning and produced no answer at all.
    // This is the single most common free-model failure.
    if (reasoning.length > 200) {
      issues.push({ kind: 'reasoning_only', detail: `${reasoning.length} chars of reasoning, no answer` })
    } else {
      issues.push({ kind: 'empty', detail: 'empty reply' })
    }
    return { ok: false, issues, worthRetrying: true }
  }

  if (input.finishReason === 'length') {
    issues.push({ kind: 'truncated', detail: `stopped at ${content.length} chars` })
  }

  const spliced = findSplicedWords(content)
  if (spliced.length > 0) {
    issues.push({ kind: 'spliced', detail: [...new Set(spliced)].slice(0, 5).join(', ') })
  }

  // A Persian question deserves a Persian answer. The threshold keeps short
  // technical replies ("Use async/await.") from being caught by accident —
  // an English reply has to be substantial enough to be a clear miss.
  if (
    input.question &&
    isPersian(input.question) &&
    !isPersian(content) &&
    content.length > 60
  ) {
    issues.push({ kind: 'wrong_language', detail: 'Persian question, non-Persian reply' })
  }

  // Worth retrying when the reply is visibly broken, or when it is short
  // enough that a second attempt is cheap. Style differences are not retried.
  const hardBroken =
    issues.some((i) => i.kind === 'spliced' || i.kind === 'reasoning_only' || i.kind === 'empty') ||
    issues.some((i) => i.kind === 'truncated') ||
    issues.some((i) => i.kind === 'wrong_language')

  return { ok: issues.length === 0, issues, worthRetrying: hardBroken }
}