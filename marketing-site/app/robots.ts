import type { MetadataRoute } from 'next'

/**
 * robots.txt for the marketing host (azuraai.ir).
 *
 * This is the host that should actually rank — it carries the long-form
 * product pages, the model catalogue and pricing. The app host is a separate
 * deployment and has its own robots file.
 *
 * The AI-crawler group is the point of this file. Answer engines do not behave
 * like search engines: several treat an unlisted agent as unwelcome, and some
 * sit behind CDN bot protection that never reaches robots.txt at all. Naming
 * each agent explicitly is what converts "probably allowed" into "allowed".
 */

const SITE_URL = 'https://azuraai.ir'

/**
 * AI and answer-engine agents, written the way each vendor documents its
 * token in its own user-agent string. New ones ship regularly — an unlisted
 * agent is an unlisted agent.
 */
const AI_CRAWLERS = [
  // OpenAI — search, user-initiated fetch, and training crawl.
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
  // Independent indexers and dataset builders
  'CCBot',
  'cohere-ai',
  'YouBot',
  'Diffbot',
  'omgilibot',
  'Timpibot',
] as const

/** Suffix-anchored so /api-keys and /apidocs are not caught by "/api". */
const PRIVATE_PATHS = [
  '/api/',
  '/account/',
  '/admin/',
  '/auth/',
  '/chat',
] as const

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [...PRIVATE_PATHS],
      },
      // Named explicitly rather than relying on the `*` group above. Robots
      // matching uses the most specific matching group, so listing the two
      // major search engines documents the intent and makes the file readable
      // without having to reason about the wildcard. Functionally identical
      // to the wildcard today — same paths — and safe if the wildcard ever
      // tightens.
      ...(['Googlebot', 'Bingbot'] as const).map((agent) => ({
        userAgent: agent,
        allow: '/',
        disallow: [...PRIVATE_PATHS],
      })),
      ...AI_CRAWLERS.map((agent) => ({
        userAgent: agent,
        allow: '/',
        // Same public surface as everyone else. Nothing here is gated, so an
        // answer engine can read the whole product story.
        disallow: [...PRIVATE_PATHS],
      })),
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}