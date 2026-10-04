/**
 * Pure markdown parsing for chat messages — no React, no browser APIs.
 *
 * Kept separate from markdown.tsx so these rules can be unit tested directly:
 * segment splitting (code fences, display math) and list parsing (nesting,
 * GFM task lists). The renderer in markdown.tsx owns presentation only.
 */

/** Arabic/Persian/Urdu codepoint ranges, used for RTL detection. */
const RTL_RE =
  /[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/

/**
 * Same range, global, for counting. A non-global regex makes String.match
 * return a single-element array, which would silently cap the RTL count at 1
 * and make almost every message look Latin.
 */
const RTL_COUNT_RE = new RegExp(RTL_RE.source, 'g')

/**
 * True when the text has more RTL than Latin letters. Counting (rather than
 * just testing presence) means an English sentence quoting one Persian word
 * stays LTR, and vice versa.
 */
export function isRtl(text: string): boolean {
  const rtl = (text.match(RTL_COUNT_RE) ?? []).length
  const latin = (text.match(/[A-Za-z]/g) ?? []).length
  return rtl > latin
}

/**
 * Arabic-Indic (Persian/Urdu) and Extended Arabic-Indic digit ranges.
 */
const DIGIT_RANGES = /[\u0660-\u0669\u06F0-\u06F9]/g

/**
 * Normalise Persian/Arabic-Indic digits back to ASCII.
 *
 * Necessary because the server applies a typography pass to the authoritative
 * final frame that rewrites every numeral in the answer — including the digits
 * inside citation markers. A research reply citing "[1]" arrives as "[۱]",
 * so anything matching citations on ASCII digits alone silently matches
 * nothing, and every citation in every Persian answer renders as dead text
 * instead of a chip. Stripping the digits back out makes the marker legible to
 * the parser while leaving the surrounding prose untouched.
 */
export function toAsciiDigits(text: string): string {
  return text.replace(DIGIT_RANGES, (ch) => {
    const code = ch.codePointAt(0)!
    const base = code >= 0x06f0 ? 0x06f0 : 0x0660
    return String(code - base)
  })
}

/** True when every character in `text` is a digit in any of the ranges above. */
export function isAllDigits(text: string): boolean {
  return text.length > 0 && /^[0-9\u0660-\u0669\u06F0-\u06F9]+$/.test(text)
}

export interface Segment {
  text: string
  fence?: { lang: string; code: string; live: boolean }
  /** A $$...$$ block. Kept out of the inline pass so it never breaks on a stray $. */
  math?: string
}

/**
 * Split a message into prose / fenced-code / display-math segments.
 *
 * Fenced code is matched first so a ``` inside a block of prose is never
 * mistaken for math, and an unterminated fence is reported as "live" because
 * that is what a token stream looks like mid-answer.
 */
export function splitSegments(text: string): Segment[] {
  const segments: Segment[] = []
  const re = /```(\w*)\n?([\s\S]*?)(?:```|$)|\$\$([\s\S]+?)\$\$/g
  let last = 0
  let m: RegExpExecArray | null

  while ((m = re.exec(text)) !== null) {
    if (m.index > last) segments.push({ text: text.slice(last, m.index) })
    if (m[1] !== undefined || m[2] !== undefined) {
      const closed = m[0].endsWith('```')
      segments.push({
        text: '',
        fence: {
          lang: m[1] || '',
          code: (m[2] ?? '').replace(/\n$/, ''),
          live: !closed,
        },
      })
    } else {
      segments.push({ text: '', math: (m[3] ?? '').trim() })
    }
    last = m.index + m[0].length
  }
  if (last < text.length) segments.push({ text: text.slice(last) })
  return segments
}

export interface ListNode {
  /** Leading-space depth, used to build the nesting tree. */
  indent: number
  ordered: boolean
  text: string
  /** true/false for a GFM task item, undefined for a normal one. */
  checked?: boolean
  children?: ListNode[]
}

/**
 * Parse a list block, nesting by indentation. Returns null when the lines are
 * not all list items, which is how the caller tells prose from a list.
 */
export function parseList(lines: string[]): ListNode[] | null {
  const bullets = lines.map((l) => l.match(/^(\s*)(?:[-*+]|\d+[.)])\s+(.*)$/))
  if (!bullets.every((b) => b)) return null

  const roots: ListNode[] = []
  const stack: { indent: number; children: ListNode[] }[] = [
    { indent: -1, children: roots },
  ]

  bullets.forEach((b, i) => {
    const [, spaces, rest] = b!
    const indent = spaces.replace(/\t/g, '  ').length
    const ordered = /^\s*\d+[.)]\s/.test(lines[i])
    // GFM task list: "- [x] done" / "- [ ] todo"
    const task = rest.match(/^\[([ xX])\]\s+(.*)$/)
    const node: ListNode = {
      indent,
      ordered,
      text: task ? task[2] : rest,
      checked: task ? task[1].toLowerCase() === 'x' : undefined,
      children: [],
    }

    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop()
    stack[stack.length - 1].children.push(node)
    stack.push({ indent, children: node.children! })
  })

  return roots
}