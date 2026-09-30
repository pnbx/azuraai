"use strict";

/**
 * Demo Chat Stream (preview only)
 *
 * Simulated SSE stream that mirrors /api/app/chat's wire protocol exactly,
 * so the app UI can be previewed while the backend or auth is unavailable.
 * The client hook falls back here automatically on 401.
 *
 * No auth, no real model calls, canned content. Every frame is marked
 * `demo: true` so the UI can badge it. Harmless in production: it exposes
 * no secrets and only responds to unauthenticated visitors.
 */

import { NextRequest } from 'next/server'

export const runtime = 'nodejs'

function sseFrame(obj: Record<string, unknown>): string {
  return `data: ${JSON.stringify({ demo: true, ...obj })}\n\n`
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const DEMO_ANSWER =
  "Salam! I'm **Azura**, running in *demo mode* right now — the real backend is still waking up. Here's what you get once it's live:\n\n" +
  "- `Fast` answers on free models\n" +
  "- **Deep thinking** with my reasoning streamed live (watch the orb)\n" +
  "- **Research** mode that searches the web and cites sources\n\n" +
  "The letters, Persian support, wallet, and ZarinPal payments are all wired to the real thing. `const azura = 'cool'` — plug in your Supabase session and this exact UI goes live."

const DEMO_REASONING =
  "The user is previewing the app. I should greet them warmly, explain demo mode briefly, and keep it short. " +
  "Persian users often mix English tech terms — mirror that register. Keep the formatting light: a short list, one code joke."

export async function POST(req: NextRequest) {
  const url = new URL(req.url)
  const mode = url.searchParams.get('mode') === 'research' ? 'research' : 'chat'
  const encoder = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false
      const send = (frame: string) => {
        if (!closed) controller.enqueue(encoder.encode(frame))
      }

      try {
        if (mode === 'research') {
          for (const stage of ['plan', 'search', 'read']) {
            await sleep(700)
            send(sseFrame({ type: 'stage', stage }))
          }
          await sleep(400)
          send(
            sseFrame({
              type: 'sources',
              sources: [
                { title: 'OpenRouter — free models list', url: 'https://openrouter.ai/models?q=free', snippet: 'Free models on OpenRouter are rate limited per key: 20 req/min, 50 req/day.' },
                { title: 'AzuraAI — product page', url: 'https://www.azuraai.ir', snippet: 'Azura AI: chat with AI models and buy API keys with Rial payment.' },
                { title: 'Tavily — search API', url: 'https://tavily.com', snippet: 'Search API built for LLM agents with a generous free tier.' },
              ],
            })
          )
          await sleep(300)
          send(sseFrame({ type: 'stage', stage: 'synthesize' }))
          const chunks = [
            'Short answer: ',
            'the pool gives ~',
            '**550 messages/day** ',
            'with your 11 keys',
            ' (50/day per key). ',
            'Once any key account has topped up $10, ',
            'that key jumps to 1000/day — ',
            'so realistic capacity is somewhere in between',
            ' [1][2].',
          ]
          for (const c of chunks) {
            await sleep(90)
            send(sseFrame({ type: 'content', delta: c }))
          }
          send(
            sseFrame({
              type: 'meta',
              content: chunks.join(''),
              sources: [
                { title: 'OpenRouter — free models list', url: 'https://openrouter.ai/models?q=free', snippet: '' },
                { title: 'AzuraAI — product page', url: 'https://www.azuraai.ir', snippet: '' },
              ],
            })
          )
        } else {
          // chat: stream a bit of reasoning first, then the answer
          const reasoningWords = DEMO_REASONING.split(' ')
          for (let i = 0; i < reasoningWords.length; i++) {
            await sleep(55)
            send(sseFrame({ type: 'reasoning', delta: (i === 0 ? '' : ' ') + reasoningWords[i] }))
          }
          const chunks = DEMO_ANSWER.split(/(\s+)/)
          for (const c of chunks) {
            await sleep(28)
            send(sseFrame({ type: 'content', delta: c }))
          }
          send(sseFrame({ type: 'meta', content: DEMO_ANSWER }))
        }
      } finally {
        closed = true
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
