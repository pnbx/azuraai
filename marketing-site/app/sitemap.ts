import type { MetadataRoute } from 'next'

/**
 * Sitemap for the marketing host.
 *
 * Only the three genuinely public, server-rendered pages. /chat is an
 * application screen, /account and /admin are session-gated, and /auth is a
 * form — listing any of them hands crawlers a list of login redirects, which
 * reads as a thin site.
 */

const SITE_URL = 'https://azuraai.ir'

/**
 * A hand-set constant rather than `new Date()`. Search engines discount a
 * lastModified that moves on every deploy, so it should only change when the
 * copy that should rank actually changes.
 */
const LAST_MODIFIED = new Date('2026-10-04T00:00:00.000Z')

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${SITE_URL}/`,
      lastModified: LAST_MODIFIED,
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${SITE_URL}/models`,
      lastModified: LAST_MODIFIED,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/download`,
      lastModified: LAST_MODIFIED,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
  ]
}