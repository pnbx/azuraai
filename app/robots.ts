import type { MetadataRoute } from 'next'

/**
 * robots.txt for the app host.
 *
 * The interesting part is the AI-crawler block. By default a site gets no
 * explicit permission from AI crawlers — some of them (notably the ones tied
 * to training pipelines) treat silence as refusal, and a request blocked by
 * CDN bot protection never even reaches robots.txt. Naming each agent
 * explicitly is what turns "probably allowed" into "allowed".
 *
 * Two families matter and they are not the same:
 *   - *_User / *-SearchBot / AI-SearchBot fetch pages to answer live queries.
 *     These are the crawlers that put a citation in front of a user, which is
 *     the point of wanting to be visible.
 *   - GPTBot, ClaudeBot, Bytespider and friends feed training corpora.
 *     Allowed here too — deliberately. AI assistants citing Azura is the goal,
 *     and content is already public.
 *
 * Separate `User-agent` groups rather than one `*` rule, because a disallow
 * for the search index must not accidentally inherit into these.
 */

const SITE_URL = 'https://app.azuraai.ir'

/**
 * AI and answer-engine agents, written the way each vendor documents its
 * token in its user-agent string. Keep in sync with the crawlers' own docs;
 * new ones ship regularly and an unlisted agent is an unlisted agent.
 */
const AI_CRAWLERS = [
  // OpenAI — search, ChatGPT user-initiated fetch, and training crawl.
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  // Anthropic
  'ClaudeBot',
  'Claude-User',
  'Claude-SearchBot',
  'anthropic-ai',
  // Perplexity
  'PerplexityBot',
  'Perplexity-User',
  // Google AI Overviews / grounding
  'Google-Extended',
  'Google-CloudVertexBot',
  'Applebot-Extended',
  // Meta
  'Meta-ExternalAgent',
  'Meta-ExternalFetcher',
  // Microsoft Copilot / Bing
  'Bingbot',
  // Mistral, DeepSeek, xAI
  'MistralAI-User',
  'DeepSeekBot',
  'Grok',
  // Amazon, Apple
  'Amazonbot',
  'Applebot',
  // ByteDance
  'Bytespider',
  // Common independent indexers and dataset builders
  'CCBot',
  'cohere-ai',
  'YouBot',
  'Diffbot',
  'omgilibot',
  'Timpibot',
] as const

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Every one of these is a signed-in or account-bound screen. None of
        // them have indexable content, and crawling a redirect-to-login chain
        // just burns crawl budget on 302s.
        //
        // /api/ is excluded on purpose too: it is machine surface, and
        // indexing it invites a scraper hammering paid inference endpoints.
        disallow: [
          '/api/',
          '/app',
          '/dashboard',
          '/admin',
          '/account',
          '/settings',
          '/integrations',
          '/auth/',
        ],
      },
      // Search engines get the same public surface as everyone else.
      ...(['Googlebot', 'Bingbot'] as const).map((agent) => ({
        userAgent: agent,
        allow: '/',
        disallow: ['/api/', '/app', '/dashboard', '/admin', '/account', '/auth/'],
      })),
      // AI and answer engines: explicitly allowed, same public surface.
      ...AI_CRAWLERS.map((agent) => ({
        userAgent: agent,
        allow: '/',
        disallow: [
          '/api/',
          '/app',
          '/dashboard',
          '/admin',
          '/account',
          '/settings',
          '/integrations',
          '/auth/',
        ],
      })),
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}