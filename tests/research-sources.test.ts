import { mergeSources } from '@/lib/gateway/researchAgent'

/**
 * Research source assembly.
 *
 * `mergeSources` decides what the synthesiser actually gets to read, so it is
 * worth pinning down: a duplicate-heavy merge quietly narrows the evidence
 * base, and an off-by-one cap silently drops the authoritative source that
 * happened to land last.
 */

const src = (url: string, title = url) => ({ title, url, snippet: '' })

describe('mergeSources', () => {
  it('flattens batches in order', () => {
    const got = mergeSources([[src('a')], [src('b')], [src('c')]])
    expect(got.map((s) => s.url)).toEqual(['a', 'b', 'c'])
  })

  it('dedupes the same URL found by several queries', () => {
    const got = mergeSources([
      [src('a', 'from query 1'), src('b', 'from query 1')],
      [src('b', 'from query 2'), src('c', 'from query 2')],
    ])
    // First sighting wins, so a source keeps the title from the query that
    // found it first rather than being overwritten by a later, vaguer one.
    expect(got.map((s) => s.title)).toEqual(['from query 1', 'from query 1', 'from query 2'])
  })

  it('drops entries with no URL rather than citing a dead link', () => {
    const got = mergeSources([[src('a'), src('')], [{ ...src('b'), url: undefined as never }]])
    expect(got.map((s) => s.url)).toEqual(['a'])
  })

  it('caps at 12 by default so the answer cites a spread, not a wall', () => {
    const many = Array.from({ length: 40 }, (_, i) => src(`u${i}`))
    const got = mergeSources([many])
    expect(got.length).toEqual(12)
    expect(got[0].url).toEqual('u0')
    expect(got[11].url).toEqual('u11')
  })

  it('honours an explicit limit', () => {
    const many = Array.from({ length: 10 }, (_, i) => src(`u${i}`))
    expect(mergeSources([many], 3).map((s) => s.url)).toEqual(['u0', 'u1', 'u2'])
  })

  it('survives an empty or all-duplicate result set', () => {
    expect(mergeSources([])).toEqual([])
    expect(mergeSources([[], []])).toEqual([])
    expect(mergeSources([[src('a'), src('a'), src('a')]]).length).toEqual(1)
  })
})