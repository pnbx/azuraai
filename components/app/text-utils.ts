'use client'

/**
 * Text utilities shared by read-aloud and conversation export.
 *
 * Both features need the same thing: take a chat message that is full of
 * markdown (headings, fences, citations, links) and turn it into something a
 * human would actually want to hear or read outside the app.
 */

/**
 * Flattens markdown into speakable prose.
 *
 * - drops fenced code blocks and inline code (nobody wants code read aloud)
 * - unwraps links to their label, and drops bare URLs
 * - removes emphasis markers, headings, quotes and list bullets
 * - collapses the citation chips the renderer draws as [1]
 *
 * Never returns an empty string for input that had any alphanumeric content.
 */
export function stripMarkdown(md: string): string {
  if (!md) return ''

  let out = md

  // Fenced code blocks, including an unterminated one mid-stream.
  out = out.replace(/```[\s\S]*?(?:```|$)/g, ' ')

  // Images before links, so `![alt](url)` doesn't leave the URL behind.
  out = out.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
  // Inline code.
  out = out.replace(/`[^`]*`/g, ' ')

  // Links → label only.
  out = out.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')

  // Bare URLs (http/https, optional trailing punctuation).
  out = out.replace(/https?:\/\/\S+/g, ' ')

  // Citation chips like [1] or [12].
  out = out.replace(/\[\d+\]/g, ' ')

  // Headings, blockquotes, list markers, horizontal rules, tables.
  out = out.replace(/^\s{0,3}#{1,6}\s+/gm, '')
  out = out.replace(/^\s{0,3}>\s?/gm, '')
  out = out.replace(/^\s*[-*+]\s+/gm, '')
  out = out.replace(/^\s*\d+[.)]\s+/gm, '')
  out = out.replace(/^\s*\|.*\|\s*$/gm, ' ')
  out = out.replace(/^\s*([-*_]\s*){3,}$/gm, ' ')

  // Emphasis / strikethrough markers.
  out = out.replace(/\*\*\*([^*]+)\*\*\*/g, '$1')
  out = out.replace(/\*\*([^*]+)\*\*/g, '$1')
  out = out.replace(/~~([^~]+)~~/g, '$1')
  out = out.replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1$2')

  // Whitespace tidy-up.
  out = out.replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n').trim()

  return out
}

/** Rough spoken duration in seconds, for the "listen" progress hint. */
export function estimateSpeechSeconds(text: string): number {
  const words = stripMarkdown(text).split(/\s+/).filter(Boolean).length
  // ~150 words/min is a comfortable narration pace.
  return Math.max(1, Math.round((words / 150) * 60))
}

export interface ExportableMessage {
  role: 'user' | 'assistant'
  content: string
  ts?: number
}

/**
 * Renders a conversation as a standalone Markdown document, suitable for
 * saving, sharing, or pasting anywhere else.
 */
export function conversationToMarkdown(opts: {
  title: string
  messages: ExportableMessage[]
  exportedAt?: number
}): string {
  const { title, messages, exportedAt = Date.now() } = opts
  const stamp = new Date(exportedAt).toLocaleString()

  const lines: string[] = [`# ${title}`, '', `*Exported from Azura on ${stamp}*`, '']

  for (const m of messages) {
    lines.push(m.role === 'user' ? '## You' : '## Azura', '')
    // Trim, but keep the author's markdown intact — code fences survive.
    lines.push(m.content.trim(), '')
  }

  lines.push('---', '', 'Exported from **Azura** — azuraai.ir', '')
  return lines.join('\n')
}

/**
 * Best-effort filename for an exported conversation: filesystem-safe,
 * short, and recognizable in a downloads folder.
 */
export function exportFilename(title: string, when = Date.now()): string {
  const d = new Date(when)
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`

  const slug = title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)

  return `azura-${slug || 'chat'}-${stamp}.md`
}

/**
 * Copies text to the clipboard with a fallback for WebViews where the async
 * Clipboard API is blocked (insecure origin / older WebView).
 * Resolves to true on success.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // fall through to the legacy path
  }

  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

/** Triggers a file download for the given text blob. */
export function downloadTextFile(filename: string, text: string, mime = 'text/markdown'): void {
  try {
    const blob = new Blob([text], { type: `${mime};charset=utf-8` })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    // Revoke on the next tick — Safari needs the URL to still be live
    // during the synchronous click handler.
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch {
    // download unsupported — caller falls back to copy
  }
}