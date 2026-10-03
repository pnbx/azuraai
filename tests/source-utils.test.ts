import { describe, it, expect } from '@jest/globals'
import { sourceDomain } from '@/components/app/source-utils'

describe('sourceDomain', () => {
  it('returns the hostname without www', () => {
    expect(sourceDomain('https://www.example.com/a/b?c=1')).toBe('example.com')
    expect(sourceDomain('http://example.com')).toBe('example.com')
  })

  it('keeps subdomains, which are often the meaningful part', () => {
    expect(sourceDomain('https://en.wikipedia.org/wiki/Tehran')).toBe('en.wikipedia.org')
  })

  it('does not include the port or path', () => {
    expect(sourceDomain('https://example.com:8443/x')).toBe('example.com')
  })

  it('handles a bare host with no scheme', () => {
    // The URL constructor rejects these, so the fallback path is the one that
    // matters here — search providers return both shapes.
    expect(sourceDomain('example.com/page')).toBe('example.com')
  })

  it('returns a readable fallback for a non-URL string', () => {
    expect(sourceDomain('not a url at all')).toBe('not a url at all')
  })

  it('returns empty only when there is genuinely no host', () => {
    // Documented contract rather than a faked placeholder: the sheet renders
    // the source title in this case.
    expect(sourceDomain('')).toBe('')
    expect(sourceDomain('   ')).toBe('')
  })

  it('strips the scheme even in the fallback path', () => {
    expect(sourceDomain('https://news.example.co.uk/story')).toBe('news.example.co.uk')
  })
})