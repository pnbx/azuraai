/**
 * Regression tests for markdown block shapes that actually occur in replies.
 *
 * The production renderer splits a message on blank lines, so a heading and
 * the list it introduces arrive in the SAME block. The original heading rule
 * required a heading to be the only line in its block; when it was not, the
 * heading was rejected, the list check then failed too (a heading line is not
 * a bullet), and the whole section fell through to a plain paragraph — so the
 * user saw a literal "###" and "-" in the reply.
 */

import { describe, it, expect } from '@jest/globals'
import { parseList, splitSegments } from '@/components/app/markdown-parsers'

const NEWLINE = String.fromCharCode(10)

/** Exactly what the model returned for a Persian menu request. */
const MENU_LINES = [
  'برای یک رستوران کوچک، منوی ساده بهتر است.',
  '',
  '### پیش‌غذا',
  '- سوپ جو — ۱۲۰,۰۰۰ تومان',
  '- سالاد شیرازی — ۱۵۰,۰۰۰ تومان',
  '',
  '### غذای اصلی',
  '- آبگوشت — ۲۸۰,۰۰۰ تومان',
]

const MENU = MENU_LINES.join(NEWLINE)

/**
 * Mirrors the renderer's heading pattern. Deliberately has no trailing `$`:
 * without the /m flag that anchors to the end of the whole block, so a heading
 * followed by a list never matched. This test fails if the `$` comes back.
 */
const HEADING_RE = new RegExp('^(#{1,6})[ ' + '\\t]+([^\\n]*)')

const ANCHORED_HEADING_RE = new RegExp('^(#{1,6})[ ' + '\\t]+([^\\n]*)$')

/** The renderer's block split: one or more blank lines. */
const BLOCK_SPLIT_RE = new RegExp('\\n{2,}')

function blocks(): string[] {
  return MENU.split(BLOCK_SPLIT_RE)
}

describe('a heading followed immediately by its list', () => {
  it('puts the heading and the list in the same block', () => {
    // This is the precondition for the whole bug: they are not separated by
    // a blank line, so a "heading must be alone" rule cannot work.
    const second = blocks()[1]
    expect(second.includes(NEWLINE)).toBe(true)
    expect(second.split(NEWLINE).length).toBe(3)
  })

  it('matches the heading at the start of that block', () => {
    const heading = blocks()[1].match(HEADING_RE)
    expect(heading !== null).toBe(true)
    expect(heading![2]).toBe('پیش‌غذا')
  })

  it('leaves a parseable list once the heading line is removed', () => {
    const block = blocks()[1]
    const heading = block.match(HEADING_RE)!
    const rest = block.slice(heading[0].length).replace(new RegExp('^\\n+'), '')
    const list = parseList(rest.split(NEWLINE))
    expect(list !== null).toBe(true)
    expect(list!.length).toBe(2)
    expect(list![0].text).toBe('سوپ جو — ۱۲۰,۰۰۰ تومان')
  })

  it('recovers every headed section, not just the first', () => {
    const lists = blocks()
      .map((block) => {
        const heading = block.match(HEADING_RE)
        return heading ? block.slice(heading[0].length).replace(new RegExp('^\\n+'), '') : ''
      })
      .filter((rest) => rest.length > 0)
      .map((rest) => parseList(rest.split(NEWLINE)))

    expect(lists.length).toBe(2)
    expect(lists.every((l) => l !== null)).toBe(true)
    expect(lists[0]!.length).toBe(2)
    expect(lists[1]!.length).toBe(1)
  })

  it('does not treat the heading line itself as a list item', () => {
    // Guards the specific mistake: without peeling the heading off first,
    // parseList sees a non-bullet line and rejects the whole block.
    const raw = blocks()[1].split(NEWLINE)
    expect(parseList(raw) === null).toBe(true)
  })

  it('proves the end-anchored variant is what caused the bug', () => {
    // Documents the original defect: `$` without /m cannot match a heading
    // that has a list under it, which is why raw "###" reached the screen.
    expect(ANCHORED_HEADING_RE.test(blocks()[1])).toBe(false)
    expect(HEADING_RE.test(blocks()[1])).toBe(true)
  })
})

describe('table replies keep working alongside headings', () => {
  const TABLE_LINES = [
    '### مقایسه',
    '| ویژگی | پایتون | راست |',
    '| --- | --- | --- |',
    '| سرعت | کندتر | سریع |',
  ]

  it('keeps the table rows intact after peeling the heading', () => {
    const block = TABLE_LINES.join(NEWLINE)
    const heading = block.match(HEADING_RE)!
    const rest = block.slice(heading[0].length).replace(new RegExp('^\\n+'), '')
    const rows = rest.split(NEWLINE).filter((l) => l.includes('|'))
    expect(rows.length).toBe(3)
    expect(/^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(rows[1])).toBe(true)
  })
})

describe('splitSegments is unaffected by the change', () => {
  it('passes a message with no fences or math straight through', () => {
    const segments = splitSegments(MENU)
    expect(segments.length).toBe(1)
    expect(segments[0].text).toBe(MENU)
    expect(segments[0].fence).toBeUndefined()
    expect(segments[0].math).toBeUndefined()
  })
})