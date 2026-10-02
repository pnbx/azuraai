import { describe, expect, it } from '@jest/globals'

import {
  toWireMessages,
  hasImages,
  extractInlineThinking,
  createThinkSplitter,
  type ChatMessage,
} from '@/lib/gateway/openrouterClient'
import { chunkForSpeech } from '@/components/app/use-speech'
import {
  stripMarkdown,
  conversationToMarkdown,
  exportFilename,
  estimateSpeechSeconds,
} from '@/components/app/text-utils'
import { compactForStorage, MAX_IMAGES_PER_MESSAGE } from '@/components/app/conversations'

const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

// ─── Vision wire format ─────────────────────────────────────────────────────

describe('toWireMessages', () => {
  it('leaves plain text messages untouched', () => {
    const msgs: ChatMessage[] = [
      { role: 'system', content: 'be helpful' },
      { role: 'user', content: 'hi' },
    ]
    expect(toWireMessages(msgs)).toEqual([
      { role: 'system', content: 'be helpful' },
      { role: 'user', content: 'hi' },
    ])
  })

  it('expands a user message with images into multimodal parts', () => {
    const out = toWireMessages([{ role: 'user', content: 'what is this?', images: [PNG] }])
    expect(out[0].content).toEqual([
      { type: 'text', text: 'what is this?' },
      { type: 'image_url', image_url: { url: PNG } },
    ])
  })

  it('keeps system messages as strings even when images are present', () => {
    const out = toWireMessages([
      { role: 'system', content: 'sys', images: [PNG] },
      { role: 'user', content: 'look', images: [PNG] },
    ])
    expect(typeof out[0].content).toBe('string')
    expect(Array.isArray(out[1].content)).toBe(true)
  })

  it('allows an image-only user message (no text part)', () => {
    const out = toWireMessages([{ role: 'user', content: '', images: [PNG] }])
    expect(out[0].content).toEqual([{ type: 'image_url', image_url: { url: PNG } }])
  })

  it('drops non-data-URL images so remote URLs cannot be smuggled upstream', () => {
    const out = toWireMessages([
      { role: 'user', content: 'hi', images: ['https://evil.example/x.png', PNG] },
    ])
    const parts = out[0].content as Array<{ type: string; image_url?: { url: string } }>
    expect(parts.filter((p) => p.type === 'image_url')).toHaveLength(1)
    expect(parts.some((p) => p.image_url?.url.includes('evil.example'))).toBe(false)
  })

  it('falls back to plain text when every image is invalid', () => {
    const out = toWireMessages([
      { role: 'user', content: 'hi', images: ['javascript:alert(1)', 'ftp://x/y.png'] },
    ])
    expect(out[0].content).toBe('hi')
  })

  it('rejects non-image data URLs', () => {
    const out = toWireMessages([
      { role: 'user', content: 'hi', images: ['data:text/html;base64,PHNjcmlwdD4='] },
    ])
    expect(out[0].content).toBe('hi')
  })
})

describe('hasImages', () => {
  it('detects a usable image on a user message', () => {
    expect(hasImages([{ role: 'user', content: 'x', images: [PNG] }])).toBe(true)
  })

  it('ignores assistant messages and invalid images', () => {
    expect(hasImages([{ role: 'assistant', content: 'x', images: [PNG] }])).toBe(false)
    expect(hasImages([{ role: 'user', content: 'x', images: ['nope'] }])).toBe(false)
    expect(hasImages([{ role: 'user', content: 'x' }])).toBe(false)
  })
})

// ─── Reasoning splitter (regression guard) ──────────────────────────────────

describe('think splitter still works', () => {
  it('splits inline think blocks', () => {
    const r = extractInlineThinking('<think>hmm</think>answer', false)
    expect(r.reasoning).toBe('hmm')
    expect(r.content).toBe('answer')
  })

  it('holds back a partial tag across deltas', () => {
    const out: string[] = []
    const s = createThinkSplitter({
      onContent: (d) => out.push(`c:${d}`),
      onReasoning: (d) => out.push(`r:${d}`),
    })
    s.push('a<thi')
    s.push('nk>secret</thi')
    s.push('nk>b')
    s.flush()
    expect(out).toEqual(['c:a', 'r:secret', 'c:b'])
  })
})

// ─── Speech chunking ────────────────────────────────────────────────────────

describe('chunkForSpeech', () => {
  it('returns a single chunk for short text', () => {
    expect(chunkForSpeech('hello world')).toEqual(['hello world'])
  })

  it('splits long text on sentence boundaries', () => {
    const sentence = 'This is a sentence about something. '
    const text = sentence.repeat(60)
    const chunks = chunkForSpeech(text, 200)
    expect(chunks.length).toBeGreaterThan(1)
    // No sentence text is lost across the split.
    expect(chunks.join('')).toBe(text)
  })

  it('falls back to whitespace when there are no sentence marks', () => {
    const text = 'word '.repeat(400)
    const chunks = chunkForSpeech(text, 200)
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.join('').replace(/\s+$/, '')).toBe(text.trim())
  })

  it('never returns an empty array for non-empty input', () => {
    expect(chunkForSpeech('x').length).toBe(1)
  })
})

// ─── stripMarkdown ──────────────────────────────────────────────────────────

describe('stripMarkdown', () => {
  it('drops fenced code blocks entirely', () => {
    expect(stripMarkdown('before\n```js\nconst a = 1\n```\nafter')).not.toContain('const a')
  })

  it('unwraps links to their label', () => {
    expect(stripMarkdown('see [the docs](https://x.com) now')).toContain('the docs')
    expect(stripMarkdown('see [the docs](https://x.com) now')).not.toContain('https://')
  })

  it('strips emphasis and headings', () => {
    const out = stripMarkdown('# Title\n\n**bold** and *italic* and ~~gone~~')
    expect(out).not.toContain('#')
    expect(out).not.toContain('**')
    expect(out).not.toContain('~~')
    expect(out).toContain('bold')
    expect(out).toContain('italic')
  })

  it('removes list bullets and citation chips', () => {
    const out = stripMarkdown('- one [1]\n- two')
    expect(out).not.toContain('- one')
    expect(out).not.toContain('[1]')
  })

  it('returns empty string for empty input', () => {
    expect(stripMarkdown('')).toBe('')
  })

  it('produces speakable prose from a realistic answer', () => {
    const answer =
      '## Summary\n\nThe answer is **42**. See [docs](https://example.com).\n\n```py\nprint(1)\n```\n'
    const spoken = stripMarkdown(answer)
    expect(spoken).toContain('The answer is 42')
    expect(spoken).not.toContain('print(1)')
    expect(spoken).not.toContain('https://')
  })
})

describe('estimateSpeechSeconds', () => {
  it('scales with word count and never returns zero', () => {
    expect(estimateSpeechSeconds('one word')).toBeGreaterThanOrEqual(1)
    const long = estimateSpeechSeconds('word '.repeat(300))
    const short = estimateSpeechSeconds('word '.repeat(30))
    expect(long).toBeGreaterThan(short)
  })
})

// ─── Export ─────────────────────────────────────────────────────────────────

describe('conversationToMarkdown', () => {
  it('renders title, roles and bodies', () => {
    const md = conversationToMarkdown({
      title: 'My chat',
      messages: [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'hi there' },
      ],
      exportedAt: new Date('2026-01-02T03:04:05Z').getTime(),
    })
    expect(md).toContain('# My chat')
    expect(md).toContain('## You')
    expect(md).toContain('## Azura')
    expect(md).toContain('hello')
    expect(md).toContain('hi there')
  })

  it('preserves code fences so exports stay useful', () => {
    const md = conversationToMarkdown({
      title: 'Code',
      messages: [{ role: 'assistant', content: '```ts\nconst a = 1\n```' }],
    })
    expect(md).toContain('```ts')
  })

  it('produces a non-empty document for an empty conversation', () => {
    const md = conversationToMarkdown({ title: 'Empty', messages: [] })
    expect(md).toContain('# Empty')
  })
})

describe('exportFilename', () => {
  const when = new Date('2026-03-04T00:00:00Z').getTime()

  it('builds a dated, slugged filename', () => {
    const name = exportFilename('How to bake bread!', when)
    expect(name).toMatch(/^azura-how-to-bake-bread-\d{4}-\d{2}-\d{2}\.md$/)
  })

  it('falls back to a default slug for titles with no usable characters', () => {
    expect(exportFilename('!!!', when)).toMatch(/^azura-chat-\d{4}-\d{2}-\d{2}\.md$/)
  })

  it('keeps non-latin letters rather than stripping them', () => {
    expect(exportFilename('سلام دنیا', when)).toContain('azura-')
  })

  it('never emits path separators', () => {
    expect(exportFilename('../../etc/passwd', when)).not.toContain('/')
    expect(exportFilename('../../etc/passwd', when)).not.toContain('\\')
  })
})

// ─── Attachment storage bounds ──────────────────────────────────────────────

describe('compactForStorage', () => {
  const img = (n: number) => ({
    role: 'user' as const,
    content: `m${n}`,
    images: [`data:image/png;base64,AAA${n}`],
  })

  it('keeps images only on the most recent exchanges', () => {
    const msgs = [img(1), img(2), img(3)]
    const out = compactForStorage(msgs)
    expect(out[0].images).toBeUndefined()
    expect(out[1].images).toBeDefined()
    expect(out[2].images).toBeDefined()
  })

  it('preserves text content when stripping images', () => {
    const out = compactForStorage([img(1), img(2), img(3)])
    expect(out[0].content).toBe('m1')
    expect('images' in out[0]).toBe(false)
  })

  it('does not mutate the input', () => {
    const msgs = [img(1), img(2), img(3)]
    compactForStorage(msgs)
    expect(msgs[0].images).toBeDefined()
  })

  it('leaves image-free messages untouched', () => {
    const msgs = [{ role: 'assistant' as const, content: 'no images' }]
    expect(compactForStorage(msgs)[0]).toBe(msgs[0])
  })

  it('exposes a sane per-message attachment cap', () => {
    expect(MAX_IMAGES_PER_MESSAGE).toBeGreaterThan(0)
    expect(MAX_IMAGES_PER_MESSAGE).toBeLessThanOrEqual(6)
  })
})