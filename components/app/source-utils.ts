/**
 * Pure helpers for research sources.
 *
 * Split out of `sources-sheet.tsx` for the same reason `markdown-parsers.ts`
 * exists: the Jest setup here cannot load a TSX module, so anything worth
 * testing has to live in a plain module.
 */

/**
 * Hostname without the `www.`, for display only.
 *
 * Parsed with the URL constructor rather than a regex because the search
 * providers hand back every shape imaginable — bare hosts, paths, ports — and a
 * regular expression is exactly the kind of thing that quietly returns the
 * whole URL when it meets one it did not anticipate.
 *
 * Returns an empty string only when the input carries no host at all. Callers
 * render a title in that case, so this is not faked into a placeholder.
 */
export function sourceDomain(url: string): string {
  try {
    const host = new URL(url).hostname
    return host.replace(/^www\./i, '')
  } catch {
    // Not an absolute URL (a model can emit a relative one, and some
    // providers return a bare host). Fall back to a short, readable prefix
    // rather than showing the whole thing.
    return url.trim().replace(/^https?:\/\//i, '').split('/')[0]?.slice(0, 40) ?? ''
  }
}