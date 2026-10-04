import type { MetadataRoute } from 'next'

/**
 * Sitemap for the app host.
 *
 * Deliberately short. Almost every route on this host is a session-gated
 * screen — /app, /dashboard/*, /admin/*, /app/settings — and listing them
 * would hand crawlers nothing but redirect-to-login chains, which reads as a
 * thin site and wastes crawl budget. /about is the one page with real,
 * server-rendered content for a visitor without an account.
 *
 * The long-form content that should rank for Persian AI-chat queries lives on
 * the marketing host (azuraai.ir) and is sitemapped there.
 */

const SITE_URL = 'https://app.azuraai.ir'

/**
 * A hand-set constant, not `new Date()`. Search engines discount a
 * lastModified that changes on every deploy, so it only moves when the copy
 * that should rank actually changes.
 */
const LAST_MODIFIED = new Date('2026-10-04T00:00:00.000Z')

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${SITE_URL}/about`,
      lastModified: LAST_MODIFIED,
      changeFrequency: 'weekly',
      priority: 1,
    },
  ]
}