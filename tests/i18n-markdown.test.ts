/**
 * Tests for the app shell's localisation and markdown improvements.
 *
 * These cover the pure logic that is easy to break silently: which locale a
 * device resolves to, whether text is Persian, and whether the markdown block
 * parser handles tables, task lists and nesting the way the renderer assumes.
 */

import { describe, it, expect } from '@jest/globals'
import {
  localeFromLanguageTag,
  looksPersian,
  hasRtlMajority,
  I18N_KEYS,
  STRINGS,
  translate,
  translateWith,
} from '@/lib/i18n'
import {
  splitSegments,
  parseList,
} from '@/components/app/markdown-parsers'
import { SYSTEM_PROMPT } from '@/lib/app-system-prompt'

describe('locale detection', () => {
  it('maps Persian and Persian-script tags to fa', () => {
    for (const tag of ['fa', 'fa-IR', 'fa-ir', 'FA', 'fa_AF', 'ps', 'prs']) {
      expect([tag, localeFromLanguageTag(tag)]).toEqual([tag, 'fa'])
    }
  })

  it('maps everything else to en', () => {
    for (const tag of ['en', 'en-US', 'de', 'tr', 'ar', 'fr-CA', undefined, null, '']) {
      expect([String(tag), localeFromLanguageTag(tag)]).toEqual([String(tag), 'en'])
    }
  })
})

describe('Persian script detection', () => {
  it('detects Persian text', () => {
    expect(looksPersian('سلام، چطور می‌توانم کمک کنم؟')).toBe(true)
    expect(looksPersian('قیمت لپ‌تاپ برای برنامه‌نویسی')).toBe(true)
  })

  it('does not flag Latin or digit-only text', () => {
    expect(looksPersian('Write a regex for email validation')).toBe(false)
    expect(looksPersian('2026')).toBe(false)
    expect(looksPersian('')).toBe(false)
  })

  it('weighs script counts rather than just presence', () => {
    // A mostly-Latin sentence that quotes one Persian word stays LTR.
    expect(hasRtlMajority('The Persian word is سلام and that is all.')).toBe(false)
    // A mostly-Persian sentence with one English word stays RTL.
    expect(hasRtlMajority('این یک جمله فارسی با کلمه API است.')).toBe(true)
  })
})

describe('i18n dictionary', () => {
  it('has a non-empty translation for every key in both languages', () => {
    expect(I18N_KEYS.length).toBeGreaterThan(50)
    for (const key of I18N_KEYS) {
      const entry = STRINGS[key]
      expect(typeof entry.fa).toBe('string')
      expect(typeof entry.en).toBe('string')
      // Guards against a key added with only one language.
      expect(entry.fa.length).toBeGreaterThan(0)
      expect(entry.en.length).toBeGreaterThan(0)
    }
  })

  it('never returns the key itself for a real lookup', () => {
    for (const key of I18N_KEYS) {
      expect(translate('fa', key)).not.toBe(key)
      expect(translate('en', key)).not.toBe(key)
    }
  })
})

describe('markdown segment splitting', () => {
  it('separates fenced code from prose', () => {
    const segs = splitSegments('before\n\n```ts\nconst a = 1\n```\n\nafter')
    expect(segs.filter((s) => s.fence)).toHaveLength(1)
    expect(segs.find((s) => s.fence)!.fence!.lang).toBe('ts')
    expect(segs.find((s) => s.fence)!.fence!.code).toBe('const a = 1')
  })

  it('marks an unterminated fence as live while streaming', () => {
    const segs = splitSegments('```python\nprint(1')
    const fence = segs.find((s) => s.fence)!.fence!
    expect(fence.live).toBe(true)
    expect(fence.code).toBe('print(1')
  })

  it('keeps display math out of the inline pass', () => {
    const segs = splitSegments('text\n\n$$E = mc^2$$\n\nmore')
    const math = segs.find((s) => s.math !== undefined)!
    expect(math.math).toBe('E = mc^2')
  })

  it('leaves prose with no fences as a single segment', () => {
    const segs = splitSegments('just a normal answer with no code')
    expect(segs).toHaveLength(1)
    expect(segs[0].text).toBe('just a normal answer with no code')
    expect(segs[0].fence).toBeUndefined()
  })
})

describe('markdown list parsing', () => {
  it('returns null for prose', () => {
    expect(parseList(['this is a paragraph', 'with two lines'])).toBeNull()
  })

  it('parses a flat bullet list', () => {
    const nodes = parseList(['- one', '- two', '- three'])!
    expect(nodes).toHaveLength(3)
    expect(nodes.map((n) => n.text)).toEqual(['one', 'two', 'three'])
    expect(nodes.every((n) => !n.ordered)).toBe(true)
  })

  it('parses an ordered list', () => {
    const nodes = parseList(['1. first', '2. second'])!
    expect(nodes.every((n) => n.ordered)).toBe(true)
    expect(nodes[1].text).toBe('second')
  })

  it('nests by indentation', () => {
    const nodes = parseList(['- top', '  - nested', '  - nested two', '- next'])!
    expect(nodes).toHaveLength(2)
    expect(nodes[0].children).toHaveLength(2)
    expect(nodes[0].children![0].text).toBe('nested')
    expect(nodes[1].children).toHaveLength(0)
  })

  it('parses GFM task list checkboxes', () => {
    const nodes = parseList(['- [x] done', '- [ ] todo'])!
    expect(nodes[0].checked).toBe(true)
    expect(nodes[0].text).toBe('done')
    expect(nodes[1].checked).toBe(false)
    expect(nodes[1].text).toBe('todo')
  })

  it('leaves text undefined for non-task items', () => {
    const nodes = parseList(['- plain'])!
    expect(nodes[0].checked).toBeUndefined()
  })
})

describe('translateWith', () => {
  it('fills numeric placeholders in both locales', () => {
    expect(translateWith('fa', 'composer.attachmentsCount', { n: 2, max: 4 })).toBe('2/4 عکس')
    expect(translateWith('en', 'composer.attachmentsCount', { n: 2, max: 4 })).toBe('2/4 images')
  })

  it('keeps the sentence translatable instead of concatenating at the call site', () => {
    // Persian puts the number first, English puts it in a trailing noun phrase.
    expect(translateWith('fa', 'composer.attachmentsFull', { n: 4 })).toBe('حداکثر 4 عکس در هر پیام')
    expect(translateWith('en', 'composer.attachmentsFull', { n: 4 })).toBe('Up to 4 images per message')
  })

  it('leaves unknown placeholders intact rather than printing undefined', () => {
    expect(translateWith('en', 'composer.attachmentsCount', { n: 1 })).toContain('{max}')
  })

  it('works with no values at all', () => {
    expect(translateWith('en', 'composer.send')).toBe('Send message')
  })

  it('has no duplicate keys, which would silently shadow a translation', () => {
    // `as const` on an object literal turns a repeat key into a compile
    // error, but only if the duplicate is still in the literal — asserting
    // the invariant here documents the failure mode.
    expect(new Set(I18N_KEYS).size).toBe(I18N_KEYS.length)
  })

  it('keeps the Persian side of every control label free of English', () => {
    // These are icon-only buttons: the accessible name is the label, so an
    // untranslated entry means a Persian user hears English.
    const iconOnly = [
      'composer.attach',
      'composer.camera',
      'composer.send',
      'composer.stop',
      'chat.openConversations',
      'chat.exportCurrent',
      'chat.scrollToLatest',
      'chat.dismissError',
      'drawer.rename',
      'drawer.deleteConversation',
      'drawer.close',
      'drawer.clearSearch',
      'drawer.collapse',
      'markdown.copyCode',
      'settings.toggleMemory',
      'settings.forgetFact',
    ] as const
    for (const key of iconOnly) {
      expect([key, /[A-Za-z]{3,}/.test(STRINGS[key].fa)]).toEqual([key, false])
    }
  })
})
describe('chat system prompt', () => {
  it('forbids splicing English words into Persian phrases', () => {
    // Observed in production: "کاربردهایtypical", "خیار finely chopped".
    // The rule alone did not stop it, so the few-shot examples must stay.
    expect(SYSTEM_PROMPT).toMatch(/splice/i)
    expect(SYSTEM_PROMPT).toMatch(/کاربردهایtypical/)
  })

  it('demonstrates the Persian table style rather than only describing it', () => {
    expect(SYSTEM_PROMPT).toContain('| ویژگی | پایتون | راست |')
    expect(SYSTEM_PROMPT).toMatch(/۱۵۰,۰۰۰/)
  })

  it('asks for markdown tables and RTL-safe formatting', () => {
    expect(SYSTEM_PROMPT).toMatch(/markdown tables/i)
    expect(SYSTEM_PROMPT).toMatch(/Never repeat the question back/)
  })

  it('bans the filler and emoji that made answers look unprofessional', () => {
    expect(SYSTEM_PROMPT).toMatch(/Great question/)
    expect(SYSTEM_PROMPT).toMatch(/emoji/i)
  })
})
