'use client'

/**
 * Lightweight client-side markdown renderer for chat messages.
 *
 * Zero dependencies — supports the subset LLMs actually emit:
 *   headings, bold/italic, inline code, fenced code blocks (with language
 *   label + lightweight token highlighting + copy button), links, block
 *   quotes, ordered/unordered lists, tables, hr, and [n] citation chips.
 *
 * Streams gracefully: an unterminated fence renders as a live code block.
 */

import * as React from 'react'
import { Check, Copy } from 'lucide-react'
import { openExternal } from './external-link'

// ─── Inline formatting ───────────────────────────────────────────────────────

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  const pattern =
    /(\*\*\*[^*]+\*\*\*)|(\*\*[^*]+\*\*)|(\*[^*\n]+\*)|(`[^`]+`)|(\[[^\]]+\]\((https?:\/\/[^)\s]+)\))|(\[\d+\])|(~~[^~]+~~)/g
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
          aria-label="Copy code"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre>
        <code dir="auto">{highlightCode(code)}</code>
      </pre>
    </div>
  )
}

// ─── Block parsing ───────────────────────────────────────────────────────────

interface Segments {
  text: string
  fence?: { lang: string; code: string; live: boolean }
}

function splitSegments(text: string): Segments[] {
  const segments: Segments[] = []
  const re = /```(\w*)\n?([\s\S]*?)(?:```|$)/g
  let last = 0
  let m: RegExpExecArray | null

  while ((m = re.exec(text)) !== null) {
    if (m.index > last) segments.push({ text: text.slice(last, m.index) })
    // A fence is "live" (still streaming) when no closing ``` follows it.
    const closed = m[0].endsWith('```')
    segments.push({
      text: '',
      fence: {
        lang: m[1] || '',
        code: m[2].replace(/\n$/, ''),
        live: !closed,
      },
    })
    last = m.index + m[0].length
  }
  if (last < text.length) segments.push({ text: text.slice(last) })
  return segments
}

function TextBlocks({ text, keyPrefix }: { text: string; keyPrefix: string }) {
  const blocks = text.split(/\n{2,}/)
  return (
    <>
      {blocks.map((block, bi) => {
        const trimmed = block.trim()
        if (!trimmed) return null
        const key = `${keyPrefix}-${bi}`

        // Headings
        const heading = trimmed.match(/^(#{1,3})\s+(.*)$/)
        if (heading && !trimmed.includes('\n')) {
          const Tag = (['h1', 'h2', 'h3'] as const)[heading[1].length - 1]
          return <Tag key={key}>{renderInline(heading[2], key)}</Tag>
        }

        // Horizontal rule
        if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) return <hr key={key} />

        // Blockquote
        if (trimmed.startsWith('>')) {
          return (
            <blockquote key={key}>
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
            return (
              <table key={key}>
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
                      {row.map((cell, ci) => (
                        <td key={ci}>{renderInline(cell, `${key}-${ri}-${ci}`)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          }
        }

        // Lists — supports 2-level nesting with continuation lines
        const lines = trimmed.split('\n')
        const isUl = lines.every((l) => /^\s*[-*+]\s+/.test(l))
        const isOl = lines.every((l) => /^\s*\d+[.)]\s+/.test(l))
        if (isUl || isOl) {
          const items = lines.map((l) => l.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, ''))
          const Tag = isUl ? 'ul' : 'ol'
          return (
            <Tag key={key} dir="auto">
              {items.map((item, ii) => (
                <li key={ii}>{renderInline(item, `${key}-${ii}`)}</li>
              ))}
            </Tag>
          )
        }

        // Paragraph
        return (
          <p key={key} className="whitespace-pre-wrap">
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
        ) : (
          <TextBlocks key={si} text={seg.text} keyPrefix={`s${si}`} />
        )
      )}
    </div>
  )
}
