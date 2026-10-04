'use client'

/**
 * Lightweight client-side markdown renderer for chat messages.
 *
 * Zero dependencies — supports the subset LLMs actually emit:
 *   headings, bold/italic, inline code, fenced code blocks (with language
 *   label + lightweight token highlighting + copy button), links, block
 *   quotes, ordered/unordered lists, tables, hr, [n] citation chips,
 *   ==highlight==, and inline/block LaTeX.
 *
 * Bidirectional text is first-class: Persian answers get dir="rtl" so
 * punctuation and table columns land on the correct side.
 *
 * Streams gracefully: an unterminated fence renders as a live code block.
 */

import * as React from 'react'
import { Check, Copy } from 'lucide-react'
import { openExternal } from './external-link'
import {
  isRtl,
  splitSegments,
  parseList,
  toAsciiDigits,
  isAllDigits,
  type ListNode,
} from './markdown-parsers'
import { useI18n } from './i18n-provider'
import type { I18nKey } from '@/lib/i18n'
import { renderMath, looksLikeMath } from '@/lib/math-render'

// ─── Citation taps ──────────────────────────────────────────────────────────

interface CitationApi {
  /** Tap handler: receives a zero-based source index. */
  onCitation: (index: number) => void
  /** How many sources exist, so an out-of-range chip stays inert. */
  count: number
}

/**
 * Everything the block/inline renderers need beyond the text itself.
 *
 * Passed as an argument rather than read from React context because these
 * helpers run inside `.map()` loops during a render, where a hook call would
 * break the rules of hooks.
 */
interface RenderCtx {
  citation: CitationApi | null
  t: (key: I18nKey) => string
}

// ─── Inline formatting ───────────────────────────────────────────────────────

function renderInline(
  text: string,
  keyPrefix: string,
  ctx: RenderCtx
): React.ReactNode[] {
  const { citation, t } = ctx
  const nodes: React.ReactNode[] = []
  // Citation markers must accept Persian and Arabic-Indic digits, because the
  // server's typography pass rewrites "[1]" to "[۱]" on the final frame.
  // Matching ASCII digits only is what made every citation in a Persian answer
  // render as inert text.
  const pattern =
    /(\*\*\*[^*]+\*\*\*)|(\*\*[^*]+\*\*)|(\*[^*\n]+\*)|(`[^`]+`)|(\[[^\]]+\]\((https?:\/\/[^)\s]+)\))|(\[[0-9\u0660-\u0669\u06F0-\u06F9]+\])|(~~[^~]+~~)|(==[^=]+==)|(\$\$[^$]+\$\$)|(\$[^$\n]+\$)/g
  let last = 0
  let m: RegExpExecArray | null
  let i = 0

  while ((m = pattern.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index))
    const token = m[0]
    const key = `${keyPrefix}-${i++}`

    if (token.startsWith('***')) {
      nodes.push(
        <strong key={key} className="font-semibold italic">
          {token.slice(3, -3)}
        </strong>
      )
    } else if (token.startsWith('**')) {
      nodes.push(
        <strong key={key} className="font-semibold">
          {token.slice(2, -2)}
        </strong>
      )
    } else if (token.startsWith('~~')) {
      nodes.push(
        <s key={key} className="opacity-70">
          {token.slice(2, -2)}
        </s>
      )
    } else if (token.startsWith('`')) {
      nodes.push(
        <code key={key} className="md-inline-code">
          {token.slice(1, -1)}
        </code>
      )
    } else if (token.startsWith('[') && token.includes('](http')) {
      const label = token.slice(1, token.indexOf(']'))
      const href = token.slice(token.indexOf('](http') + 2, -1)
      nodes.push(
        <a
          key={key}
          href={href}
          onClick={(e) => {
            e.preventDefault()
            void openExternal(href)
          }}
          className="text-brand-strong underline underline-offset-2"
        >
          {label}
        </a>
      )
    } else if (/^\[[0-9\u0660-\u0669\u06F0-\u06F9]+\]$/.test(token)) {
      const inner = token.slice(1, -1)
      // The chip shows the marker exactly as the model wrote it (so a Persian
      // answer reads [۱], not a jarring [1]) while the tap target is resolved
      // from the ASCII form.
      const n = isAllDigits(inner) ? Number(toAsciiDigits(inner)) : 0
      // Only a citation that actually points somewhere becomes tappable. A
      // model routinely cites [11] when it returned eight sources, and a live
      // button that opens an empty slot is worse than a static chip.
      const tappable = citation && n >= 1 && n <= citation.count
      nodes.push(
        tappable ? (
          <sup key={key} className="ml-0.5 align-super">
            <button
              type="button"
              onClick={() => citation.onCitation(n - 1)}
              className="rounded bg-brand-soft px-1 text-[0.7em] font-semibold text-brand-strong underline-offset-2 transition-colors hover:bg-brand-strong hover:text-brand-soft"
              aria-label={`${t('sources.openCitation')} ${n}`}
            >
              {inner}
            </button>
          </sup>
        ) : (
          <sup
            key={key}
            className="ml-0.5 rounded bg-brand-soft px-1 text-[0.7em] font-semibold text-brand-strong"
          >
            {inner}
          </sup>
        )
      )
    } else if (token.startsWith('*')) {
      nodes.push(
        <em key={key} className="italic">
          {token.slice(1, -1)}
        </em>
      )
    } else if (token.startsWith('==')) {
      nodes.push(
        <mark key={key} className="md-highlight">
          {token.slice(2, -2)}
        </mark>
      )
    } else if (token.startsWith('$$')) {
      const latex = token.slice(2, -2)
      const html = renderMath(latex, { displayMode: true })
      // Fall back to the raw source when KaTeX cannot typeset it — a readable
      // formula beats a red parse error, and beats losing the content.
      nodes.push(
        html ? (
          <span key={key} className="md-math-block" dir="ltr" dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <span key={key} className="md-math md-math-fallback" dir="ltr">
            {latex}
          </span>
        )
      )
    } else if (token.startsWith('$')) {
      const latex = token.slice(1, -1)
      // Only typeset when it actually looks like maths: "$5 and $10" is a
      // price, and the model writes prices constantly in Persian answers.
      const html = looksLikeMath(latex) ? renderMath(latex) : null
      nodes.push(
        html ? (
          <span key={key} className="md-math" dir="ltr" dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <span key={key}>{latex}</span>
        )
      )
    }
    last = m.index + token.length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

// ─── Code blocks ─────────────────────────────────────────────────────────────

const KEYWORDS = new Set(
  (
    'const let var function return if else for while class extends new this typeof instanceof ' +
    'async await import from export default try catch finally throw switch case break continue ' +
    'do in of void null undefined true false interface type enum implements public private ' +
    'protected static readonly struct impl fn pub use mut match loop where select go defer ' +
    'package func var nil elif lambda def with as pass yield not and or is None True False ' +
    'SELECT FROM WHERE JOIN LEFT RIGHT INNER OUTER GROUP BY ORDER HAVING LIMIT INSERT INTO ' +
    'VALUES UPDATE SET DELETE CREATE TABLE ALTER DROP INDEX BEGIN COMMIT ROLLBACK'
  ).split(' ')
)

function highlightCode(code: string): React.ReactNode[] {
  const out: React.ReactNode[] = []
  // token pass: comments, strings, numbers, keywords, function calls
  const re =
    /(\/\/[^\n]*|#[^\n]*|--[^\n]*|\/\*[\s\S]*?\*\/)|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)(?=\s*\()|(\b[A-Za-z_$][\w$]*\b)|([+\-*/=<>!&|?:.,;]+)/g
  let last = 0
  let m: RegExpExecArray | null
  let k = 0

  while ((m = re.exec(code)) !== null) {
    if (m.index > last) out.push(code.slice(last, m.index))
    const t = m[0]
    if (m[1]) out.push(<span key={k++} className="tok-com">{t}</span>)
    else if (m[2]) out.push(<span key={k++} className="tok-str">{t}</span>)
    else if (m[3]) out.push(<span key={k++} className="tok-num">{t}</span>)
    else if (m[4]) out.push(<span key={k++} className="tok-fn">{t}</span>)
    else if (m[5]) {
      if (KEYWORDS.has(t)) out.push(<span key={k++} className="tok-kw">{t}</span>)
      else out.push(t)
    } else if (m[6]) out.push(<span key={k++} className="tok-op">{t}</span>)
    last = m.index + t.length
  }
  if (last < code.length) out.push(code.slice(last))
  return out
}

function CodeBlock({ code, lang, live }: { code: string; lang?: string; live?: boolean }) {
  const [copied, setCopied] = React.useState(false)
  const { t } = useI18n()

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // clipboard unavailable
    }
  }

  return (
    <div className="code-block">
      <div className="code-block-bar">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {lang || 'code'}
          {live ? ' · writing…' : ''}
        </span>
        <button
          onClick={copy}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label={t('markdown.copyCode')}
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? t('markdown.copied') : t('markdown.copyCode')}
        </button>
      </div>
      <pre>
        <code dir="auto">{highlightCode(code)}</code>
      </pre>
    </div>
  )
}

// ─── Block parsing ───────────────────────────────────────────────────────────

function renderList(nodes: ListNode[], keyPrefix: string, ctx: RenderCtx): React.ReactNode {
  const Tag = nodes.some((n) => n.ordered) ? 'ol' : 'ul'
  return (
    <Tag key={keyPrefix} dir="auto" className={Tag === 'ol' ? 'md-ol' : 'md-ul'}>
      {nodes.map((n, i) => (
        <li key={i} className={n.checked === undefined ? undefined : 'md-task'}>
          {n.checked !== undefined && (
            <span
              className={`md-checkbox ${n.checked ? 'md-checkbox--on' : ''}`}
              aria-hidden
            >
              {n.checked ? '✓' : ''}
            </span>
          )}
          <span className="md-li-body">{renderInline(n.text, `${keyPrefix}-${i}`, ctx)}</span>
          {n.children && n.children.length > 0 && renderList(n.children, `${keyPrefix}-${i}-c`, ctx)}
        </li>
      ))}
    </Tag>
  )
}

function TextBlocks({
  text,
  keyPrefix,
  ctx,
}: {
  text: string
  keyPrefix: string
  ctx: RenderCtx
}) {
  const blocks = text.split(/\n{2,}/)
  return (
    <>
      {blocks.map((block, bi) => {
        const trimmed = block.trim()
        if (!trimmed) return null
        const key = `${keyPrefix}-${bi}`
        // Persian answers need an explicit direction so punctuation, quotes and
        // table columns stop mirroring incorrectly.
        const dir = isRtl(trimmed) ? 'rtl' : 'ltr'

        // Headings. A heading is frequently followed immediately by a list or
        // table on the next line (only one \n, so they share a block), so peel
        // the heading off and parse the remainder as its own block.
        //
        // No trailing `$` here: without the /m flag it anchors to the end of
        // the whole block, so a heading followed by a list never matched and
        // the raw "###" leaked into the reply. Stopping at the newline is the
        // behaviour we want.
        const heading = trimmed.match(/^(#{1,6})[ \t]+([^\n]*)/)
        if (heading) {
          const level = Math.min(heading[1].length, 6)
          const Tag = (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const)[level - 1]
          const rest = trimmed.slice(heading[0].length).replace(/^\n+/, '')
          return (
            <React.Fragment key={key}>
              <Tag dir={dir}>{renderInline(heading[2].trim(), key, ctx)}</Tag>
              {rest.trim() ? (
                <TextBlocks text={rest} keyPrefix={`${key}-r`} ctx={ctx} />
              ) : null}
            </React.Fragment>
          )
        }

        // Horizontal rule
        if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) return <hr key={key} />

        // Blockquote
        if (trimmed.startsWith('>')) {
          return (
            <blockquote key={key} dir={dir}>
              {trimmed
                .split('\n')
                .map((l) => l.replace(/^>\s?/, ''))
                .map((l, li) => (
                  <p key={li}>{renderInline(l, `${key}-${li}`, ctx)}</p>
                ))}
            </blockquote>
          )
        }

        // Table
        if (trimmed.includes('|') && trimmed.includes('\n')) {
          const lines = trimmed.split('\n').filter((l) => l.includes('|'))
          const isHeaderSep = (l: string) => /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(l)
          if (lines.length >= 2 && isHeaderSep(lines[1])) {
            const parseRow = (l: string) =>
              l.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim())
            const headers = parseRow(lines[0])
            const rows = lines.slice(2).map(parseRow)
            // Pad short rows so columns stay square.
            const cols = headers.length
            const norm = (r: string[]) =>
              r.length === cols ? r : [...r, ...Array(cols - r.length).fill('')]
            return (
              // Tables scroll horizontally rather than squeezing on a phone.
              <div key={key} className="md-table-scroll" dir={dir}>
                <table>
                  <thead>
                    <tr>
                      {headers.map((h, hi) => (
                        <th key={hi}>{renderInline(h, `${key}-h-${hi}`, ctx)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, ri) => (
                      <tr key={ri}>
                        {norm(row).map((cell, ci) => (
                          <td key={ci}>{renderInline(cell, `${key}-${ri}-${ci}`, ctx)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          }
        }

        // Lists — supports nesting by indentation, plus GFM task lists
        const lines = trimmed.split('\n')
        const list = parseList(lines)
        if (list) return renderList(list, key, ctx)

        // Paragraph
        return (
          <p key={key} dir={dir} className="whitespace-pre-wrap">
            {lines.map((line, li) => (
              <span key={li}>
                {renderInline(line, `${key}-${li}`, ctx)}
                {li < lines.length - 1 && <br />}
              </span>
            ))}
          </p>
        )
      })}
    </>
  )
}

/**
 * Display maths. Typeset with KaTeX so fractions, radicals, sums and integrals
 * render as real mathematics with proper spacing and glyphs, scrolling
 * horizontally on a phone when the formula is wider than the screen.
 */
function MathBlock({ latex }: { latex: string }) {
  const html = React.useMemo(() => renderMath(latex, { displayMode: true }), [latex])
  if (!html) {
    // Untypesettable: show the source in a readable block rather than dropping it.
    return (
      <pre className="md-math-block md-math-fallback" dir="ltr">
        {latex}
      </pre>
    )
  }
  return (
    <div
      className="md-math-block"
      dir="ltr"
      // KaTeX output is generated locally from the model's own LaTeX with
      // `trust: false`, so no raw HTML from the network can reach here.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

export function Markdown({
  text,
  className = '',
  sourceCount = 0,
  onCitation,
}: {
  text: string
  className?: string
  /** Number of attached sources; gates whether a [n] chip is tappable. */
  sourceCount?: number
  /** Called with a zero-based index when a citation chip is tapped. */
  onCitation?: (index: number) => void
}) {
  const segments = React.useMemo(() => splitSegments(text), [text])
  const { t } = useI18n()

  const citation = React.useMemo<CitationApi | null>(
    () => (onCitation && sourceCount > 0 ? { onCitation, count: sourceCount } : null),
    [onCitation, sourceCount]
  )
  const ctx = React.useMemo<RenderCtx>(() => ({ citation, t }), [citation, t])

  return (
    <div className={`md-body ${className}`}>
      {segments.map((seg, si) =>
        seg.fence ? (
          <CodeBlock key={si} code={seg.fence.code} lang={seg.fence.lang} live={seg.fence.live} />
        ) : seg.math !== undefined ? (
          <MathBlock key={si} latex={seg.math} />
        ) : (
          <TextBlocks key={si} text={seg.text} keyPrefix={`s${si}`} ctx={ctx} />
        )
      )}
    </div>
  )
}
