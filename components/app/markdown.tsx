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
  type ListNode,
} from './markdown-parsers'
import { useI18n } from './i18n-provider'

// ─── Inline formatting ───────────────────────────────────────────────────────

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  const pattern =
    /(\*\*\*[^*]+\*\*\*)|(\*\*[^*]+\*\*)|(\*[^*\n]+\*)|(`[^`]+`)|(\[[^\]]+\]\((https?:\/\/[^)\s]+)\))|(\[\d+\])|(~~[^~]+~~)|(==[^=]+==)|(\$\$[^$]+\$\$)|(\$[^$\n]+\$)/g
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
    } else if (/^\[\d+\]$/.test(token)) {
      nodes.push(
        <sup
          key={key}
          className="ml-0.5 rounded bg-brand-soft px-1 text-[0.7em] font-semibold text-brand-strong"
        >
          {token.slice(1, -1)}
        </sup>
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
      nodes.push(
        <span key={key} className="md-math md-math-block" dir="ltr">
          {token.slice(2, -2)}
        </span>
      )
    } else if (token.startsWith('$')) {
      nodes.push(
        <span key={key} className="md-math" dir="ltr">
          {token.slice(1, -1)}
        </span>
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

function renderList(nodes: ListNode[], keyPrefix: string): React.ReactNode {
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
          <span className="md-li-body">{renderInline(n.text, `${keyPrefix}-${i}`)}</span>
          {n.children && n.children.length > 0 && renderList(n.children, `${keyPrefix}-${i}-c`)}
        </li>
      ))}
    </Tag>
  )
}

function TextBlocks({ text, keyPrefix }: { text: string; keyPrefix: string }) {
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
              <Tag dir={dir}>{renderInline(heading[2].trim(), key)}</Tag>
              {rest.trim() ? <TextBlocks text={rest} keyPrefix={`${key}-r`} /> : null}
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
                  <p key={li}>{renderInline(l, `${key}-${li}`)}</p>
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
                        <th key={hi}>{renderInline(h, `${key}-h-${hi}`)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, ri) => (
                      <tr key={ri}>
                        {norm(row).map((cell, ci) => (
                          <td key={ci}>{renderInline(cell, `${key}-${ri}-${ci}`)}</td>
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
        if (list) return renderList(list, key)

        // Paragraph
        return (
          <p key={key} dir={dir} className="whitespace-pre-wrap">
            {lines.map((line, li) => (
              <span key={li}>
                {renderInline(line, `${key}-${li}`)}
                {li < lines.length - 1 && <br />}
              </span>
            ))}
          </p>
        )
      })}
    </>
  )
}

export function Markdown({ text, className = '' }: { text: string; className?: string }) {
  const segments = React.useMemo(() => splitSegments(text), [text])

  return (
    <div className={`md-body ${className}`}>
      {segments.map((seg, si) =>
        seg.fence ? (
          <CodeBlock key={si} code={seg.fence.code} lang={seg.fence.lang} live={seg.fence.live} />
        ) : seg.math !== undefined ? (
          <pre key={si} className="md-math-block" dir="ltr">
            {seg.math}
          </pre>
        ) : (
          <TextBlocks key={si} text={seg.text} keyPrefix={`s${si}`} />
        )
      )}
    </div>
  )
}
