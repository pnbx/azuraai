"use strict";

/**
 * App Free Chat — Streaming SSE Route
 *
 * POST /api/app/chat
 *
 * Streaming chat for the Azura mobile app, powered by the OpenRouter free
 * model pool. Auth: Supabase session (app users are logged-in site users).
 *
 * Enforcement:
 * - Daily message cap: by account when signed in (30/day), by hashed device
 *   id for guests (10/day). Shared with /api/app/research via
 *   lib/gateway/free-tier.ts.
 * - Pool-wide failover: on 429/5xx the request transparently retries with
 *   the next healthy OpenRouter key (cooldowns handled by the pool)
 *
 * SSE event types:
 *   { type: "reasoning", delta }   — chain-of-thought tokens
 *   { type: "content",   delta }   — assistant answer tokens
 *   { type: "status",    message } — key failover notices
 *   { type: "meta", model, content, reasoning } — final frame
 *   { type: "error",  code, message }           — terminal error frame
 *
 * Security:
 * - OpenRouter keys stay server-side, selected via the atomic pool RPC
 * - Message contents are never logged
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerUser } from '@/lib/auth/server'
import { supabaseAdmin } from '@/supabase/admin'
import { withPoolFailover, defaultIsRetryable, type PooledKey } from '@/lib/gateway/keyPool'
import { consumeDailyQuota } from '@/lib/gateway/free-tier'
import { assessReply } from '@/lib/gateway/replyQuality'
import { normalizePersianMarkdown } from '@/lib/persian-text'
import {
  streamChatCompletion,
  OpenRouterError,
  type ChatMessage,
} from '@/lib/gateway/openrouterClient'
import {
  extractMemories,
  dedupeMemories,
  renderMemoryBlock,
  type UserMemory,
} from '@/lib/gateway/memory'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * Text models.
 *
 * We used to send everything to `openrouter/free`, which picks a *random*
 * available free model per request. That made answer quality swing wildly:
 * the same Persian question came back clean one minute and full of spliced
 * English ("salad Olivier", "acompañamientos") the next, purely because a
 * different model answered.
 *
 * Benchmarking every model OpenRouter currently lists at zero cost against
 * real Persian prompts, `poolside/laguna-s-2.1:free` was the only one that
 * produced no English-in-Persian splicing across every sample, at ~13s and
 * with 262k context. It is pinned below.
 *
 * The free tier removes models without warning, so pinning one model is a
 * single point of failure: if it 404s the whole app stops answering. Each
 * chain therefore ends in `openrouter/free`, which is the old behaviour and
 * always has something to serve.
 */
const TEXT_CHAIN: string[] = [
  ...(process.env.OPENROUTER_MODEL_FAST
    ? [process.env.OPENROUTER_MODEL_FAST]
    : ['poolside/laguna-s-2.1:free']),
  'poolside/laguna-xs-2.1:free',
  'openrouter/free',
]

/** Kept for the vision text-only fallback and the research path. */
const MODEL_FAST = TEXT_CHAIN[0]
const MODEL_THINKING = TEXT_CHAIN[0]
/**
 * Vision models, tried in order.
 *
 * OpenRouter's free tier churns constantly — a model that accepted images
 * last week can 404 today. Rather than pinning one guess, we keep a short
 * candidate chain and walk it until one accepts the payload, then fall back
 * to a text-only answer. `OPENROUTER_MODEL_VISION` overrides the whole chain.
 */
const VISION_MODELS: string[] = (
  process.env.OPENROUTER_MODEL_VISION
    ? [process.env.OPENROUTER_MODEL_VISION]
    : [
        'google/gemini-2.0-flash-exp:free',
        'meta-llama/llama-3.2-11b-vision-instruct:free',
        'google/gemma-3-4b-it:free',
      ]
).filter(Boolean)
const MAX_POOL_ATTEMPTS = 4

/** Attachment limits — client downscales before upload, this is the hard cap. */
const MAX_IMAGES_PER_MESSAGE = 4
/** ~1.6 MB of base64 ≈ 1.2 MB of decoded image data. */
const MAX_IMAGE_BYTES = 1_200_000
const MAX_IMAGE_CHARS = 1_600_000
const ALLOWED_IMAGE_MIME = /^(image\/(png|jpeg|jpg|webp|gif))$/i
const DATA_IMAGE_RE = /^data:(image\/(?:png|jpe?g|webp|gif));base64,/i

// The prompt lives in its own module so tests can read it without booting
// the route's Supabase dependency.
export { SYSTEM_PROMPT } from '@/lib/app-system-prompt'
import { SYSTEM_PROMPT } from '@/lib/app-system-prompt'

interface ChatRequestBody {
  messages?: Array<{
    role: 'user' | 'assistant'
    content: string
    /** Image attachments as data URLs (validated below). */
    images?: string[]
  }>
  mode?: 'fast' | 'thinking'
  /** Client toggle: allow reading + auto-extracting long-term memories. */
  remember?: boolean
}

function sseFrame(obj: unknown): string {
  return `data: ${JSON.stringify(obj)}\n\n`
}

function errorFrame(code: string, message: string): string {
  return sseFrame({ type: 'error', code, message })
}

export async function POST(req: NextRequest) {
  // ─── Auth (optional) ──────────────────────────────────────────────────────
  // The app has no sign-in: anyone who opens it can chat. A session is used
  // only as a bonus — it unlocks long-term memory for people who happen to be
  // logged in on the web — so every user-scoped feature below is guarded by
  // `user` rather than assumed.
  const user = await getServerUser().catch(() => null)

  // App-client marker (informational)
  const client = req.headers.get('x-azura-client')
  if (client && client !== 'app' && client !== 'web') {
    return NextResponse.json(
      { success: false, error: 'invalid_client' },
      { status: 400 }
    )
  }

  // ─── Body validation ─────────────────────────────────────────────────────
  let body: ChatRequestBody
  try {
    body = (await req.json()) as ChatRequestBody
  } catch {
    return NextResponse.json(
      { success: false, error: 'invalid_json' },
      { status: 400 }
    )
  }

  const rawMessages = Array.isArray(body.messages) ? body.messages : []
  if (rawMessages.length === 0 || rawMessages.length > 40) {
    return NextResponse.json(
      { success: false, error: 'messages_required_1_to_40' },
      { status: 400 }
    )
  }
  for (const m of rawMessages) {
    if (
      !m ||
      typeof m.content !== 'string' ||
      m.content.length === 0 ||
      m.content.length > 16_000
    ) {
      return NextResponse.json(
        { success: false, error: 'invalid_message' },
        { status: 400 }
      )
    }
  }

  const mode = body.mode === 'thinking' ? 'thinking' : 'fast'
  // Memory is opt-in from the client AND requires a session — there is no user
// row to attach memories to for a guest.
const remember = body.remember === true && user !== null

  // ─── Attachments ───────────────────────────────────────────────────────────
  // Images are validated and normalized here, BEFORE the cap check, so a
  // malformed payload can't burn a daily message.
  const imagesByIndex = new Map<number, string[]>()
  rawMessages.forEach((m, i) => {
    if (!Array.isArray(m.images) || m.images.length === 0) return
    const accepted: string[] = []
    for (const raw of m.images.slice(0, MAX_IMAGES_PER_MESSAGE)) {
      if (typeof raw !== 'string' || raw.length > MAX_IMAGE_CHARS) continue
      if (!DATA_IMAGE_RE.test(raw)) continue
      const mime = /^data:([^;]+);base64,/i.exec(raw)?.[1] ?? ''
      if (!ALLOWED_IMAGE_MIME.test(mime)) continue
      // base64 inflates by 4/3 — approximate the decoded size cheaply.
      if (Math.floor((raw.length - raw.indexOf(',') - 1) * 0.75) > MAX_IMAGE_BYTES) continue
      accepted.push(raw)
    }
    if (accepted.length > 0) imagesByIndex.set(i, accepted)
  })

  const visionRequested = imagesByIndex.size > 0
  // Vision needs a multimodal model, so it overrides the mode model. If every
  // candidate turns out to be dead we fall back to text-only below rather
  // than failing the user's message outright.
  const model = visionRequested
    ? VISION_MODELS[0]
    : mode === 'thinking'
      ? MODEL_THINKING
      : MODEL_FAST

  // ─── Memory: load durable facts for the system prompt ──────────────────
  let memoryBlock = ''
  let memoriesForExtraction: UserMemory[] = []
  let canExtractMemory = false
  if (remember) {
    try {
      const { data, error } = await supabaseAdmin
        .from('user_memory')
        .select('id, content, source, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
      if (error) throw error
      memoriesForExtraction = (data ?? []) as UserMemory[]
      memoryBlock = renderMemoryBlock(memoriesForExtraction)
      canExtractMemory = memoriesForExtraction.length < 100
    } catch (err) {
      // Memory is best-effort — never block chat on it.
      console.error('[AppChat] memory load failed (continuing without):', err)
    }
  }

  const visionHint =
    ' The user attached images. Look at them carefully and describe or answer ' +
    'based on what you actually see in them. If an image is unreadable, say so.'

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content:
        (memoryBlock ? `${SYSTEM_PROMPT}\n\n${memoryBlock}` : SYSTEM_PROMPT) +
        (visionRequested ? visionHint : ''),
    },
    ...rawMessages.map((m, i) => ({
      role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
      content: m.content,
      images: imagesByIndex.get(i),
    })),
  ]

  // ─── Daily free-tier cap (signed-in by account, everyone else by device) ──
  // Guests used to be explicitly unmetered because the app has no accounts.
  // That made the whole mobile app unmetered: every real user is a guest, so
  // the cap protected nothing and any script could drain the key pool. Guests
  // are now charged against a hashed device id at a lower daily allowance,
  // which also makes signing in worth something.
  const quota = await consumeDailyQuota(req, user, 'AppChat')
  if (!quota.allowed) {
    return NextResponse.json(
      {
        success: false,
        error: 'daily_cap_reached',
        used: quota.used,
        cap: quota.cap,
      },
      { status: 429 }
    )
  }

  // ─── Stream via pool with failover ───────────────────────────────────────
  const encoder = new TextEncoder()
  const requestId = crypto.randomUUID()

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false
      // Started inside `start`, i.e. after the response head is written, so
      // it measures the work the user actually waits on and not body parsing,
      // the daily-cap RPC or auth.
      const startedAt = Date.now()
      let firstTokenMs: number | null = null
      /** How many upstream calls this request cost — one per model attempt. */
      let attempts = 0
      const send = (frame: string) => {
        if (!closed) controller.enqueue(encoder.encode(frame))
      }
      /** Latch the first byte of real answer text, exactly once. */
      const markFirstToken = () => {
        if (firstTokenMs === null) firstTokenMs = Date.now() - startedAt
      }

      try {
        const runModel = (
          key: PooledKey,
          m: ChatMessage[],
          mdl: string,
          systemNote?: string
        ) =>
          streamChatCompletion(
            {
              apiKey: key.apiKey,
              model: mdl,
              messages: m,
              temperature: mode === 'thinking' ? 0.6 : 0.8,
              maxTokens: mode === 'thinking' ? 4096 : 2048,
              signal: req.signal,
              ...(systemNote ? { systemNote } : {}),
            },
            {
              onContent: (delta) => {
                if (delta) markFirstToken()
                send(sseFrame({ type: 'content', delta }))
              },
              onReasoning: (delta) => {
                if (delta) markFirstToken()
                send(sseFrame({ type: 'reasoning', delta }))
              },
            }
          )

        let outcome = await withPoolFailover(
          (key) => {
            attempts++
            return runModel(key, messages, model)
          },
          (err) => {
            const retryable = defaultIsRetryable(err)
            if (retryable) {
              send(
                sseFrame({
                  type: 'status',
                  message: 'switching_model_key',
                })
              )
            }
            return retryable
          },
          MAX_POOL_ATTEMPTS
        )

        // ─── Vision fallback ────────────────────────────────────────────────
        // Walk the remaining vision candidates, then give up on images
        // entirely and answer from text so the user still gets a reply.
        if (!('result' in outcome) && visionRequested) {
          const modelDead = (err: unknown) =>
            err instanceof OpenRouterError &&
            (err.type === 'invalid_request' ||
              err.type === 'authentication_error' ||
              err.type === 'provider_unavailable')

          for (const candidate of VISION_MODELS.slice(1)) {
            if ('result' in outcome) break
            if (!modelDead(outcome.error)) break
            outcome = await withPoolFailover(
              (key) => runModel(key, messages, candidate),
              (err) => defaultIsRetryable(err),
              MAX_POOL_ATTEMPTS
            )
          }

          if (!('result' in outcome) && modelDead(outcome.error)) {
            send(sseFrame({ type: 'status', message: 'vision_fallback' }))
            const textOnly = messages.map((m) => ({ ...m, images: undefined }))
            const fallbackModel =
              mode === 'thinking' ? MODEL_THINKING : MODEL_FAST
            outcome = await withPoolFailover(
              (key) =>
                runModel(
                  key,
                  textOnly,
                  fallbackModel,
                  ' (The images attached to this message could not be processed, so answer from the text alone and do not claim to have seen them.)'
                ),
              (err) => {
                const retryable = defaultIsRetryable(err)
                if (retryable) {
                  send(
                    sseFrame({ type: 'status', message: 'switching_model_key' })
                  )
                }
                return retryable
              },
              MAX_POOL_ATTEMPTS
            )
          }
        }

        // ─── Text model fallback ──────────────────────────────────────────
        // The pinned free model can be pulled from OpenRouter's free tier at
        // any time, and free models also rate-limit hard (20 req/min). When
        // the pinned entry is gone or throttled, walk the rest of the chain
        // rather than showing the user an error for a model problem.
        if (!('result' in outcome) && !visionRequested) {
          const modelDead = (err: unknown) =>
            err instanceof OpenRouterError &&
            (err.type === 'invalid_request' ||
              err.type === 'authentication_error' ||
              err.type === 'provider_unavailable' ||
              err.type === 'rate_limit_exceeded')

          for (const candidate of TEXT_CHAIN.slice(1)) {
            if ('result' in outcome) break
            if (!modelDead(outcome.error)) break
            send(sseFrame({ type: 'status', message: 'switching_model' }))
            outcome = await withPoolFailover(
              (key) => {
                attempts++
                return runModel(key, messages, candidate)
              },
              (err) => defaultIsRetryable(err),
              MAX_POOL_ATTEMPTS
            )
          }
        }

        // ─── Quality guard ───────────────────────────────────────────────
        // A free model can return a 200 with a reply that is unusable:
        // Latin words fused into Persian, or nothing at all because it spent
        // the budget on reasoning. The client keeps whatever streamed, but the
        // `meta` frame it receives at the end is authoritative — it overwrites
        // the message — so re-running here silently replaces the bad text
        // instead of showing it. One attempt only: if the retry is also bad,
        // the user is better served by *something* than by more waiting.
        if ('result' in outcome && !visionRequested && mode !== 'thinking') {
          const question = rawMessages.filter((m) => m.role === 'user').at(-1)?.content ?? ''
          const report = assessReply({
            content: outcome.result.content,
            reasoning: outcome.result.reasoning,
            finishReason: outcome.result.finishReason,
            question,
          })
          if (!report.ok && report.worthRetrying) {
            console.warn(
              '[AppChat] retrying low-quality reply:',
              report.issues.map((i) => i.kind).join(', '),
              'model=',
              outcome.result.model
            )
            send(sseFrame({ type: 'status', message: 'refining' }))
            const retry = await withPoolFailover(
              (key) => {
                attempts++
                return runModel(key, messages, model)
              },
              (err) => defaultIsRetryable(err),
              MAX_POOL_ATTEMPTS
            )
            if ('result' in retry) outcome = retry
          }
        }

        if ('result' in outcome) {
          // Typography is fixed *here*, on the authoritative frame, rather than
          // during streaming: a half-space or a yeh would otherwise pop in
          // mid-sentence as tokens arrive, and the client would have to re-render
          // the whole message. Code blocks, maths and URLs are preserved
          // verbatim by the normaliser, so this is safe to run unconditionally.
          const content = normalizePersianMarkdown(outcome.result.content)
          send(
            sseFrame({
              type: 'meta',
              model: outcome.result.model,
              content,
              reasoning: outcome.result.reasoning,
              vision: visionRequested && outcome.result.vision === true,
              // Server-measured so the number survives a sleeping tab, a
              // dropped LTE frame, or a phone that failed to paint. `attempts`
              // is what turns "16 seconds" into "16 seconds, two of them
              // wasted on a dead key" when a user reports slowness.
              timings: {
                totalMs: Date.now() - startedAt,
                firstTokenMs,
                attempts,
              },
            })
          )
          // ─── Memory extraction (fire-and-forget, never blocks) ─────────
          if (remember && canExtractMemory && user) {
            void extractAndStoreMemories({
              userId: user.id,
              apiKey: outcome.key.apiKey,
              existing: memoriesForExtraction,
              recentMessages: rawMessages.slice(-12),
            }).catch((err) =>
              console.error('[AppChat] memory extraction failed:', err)
            )
          }
        } else {
          const detail =
            outcome.error instanceof OpenRouterError
              ? outcome.error.message
              : 'pool_exhausted'
          send(errorFrame('pool_exhausted', detail))
        }
      } catch (err) {
        // Non-retryable provider error (e.g. invalid_request) or network abort
        if (err instanceof OpenRouterError) {
          send(errorFrame(err.type, err.message))
        } else if (err instanceof Error && err.name === 'AbortError') {
          // Client disconnected — nothing to send
        } else {
          console.error('[AppChat] stream failed:', err)
          send(errorFrame('internal_error', 'stream_failed'))
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
      'X-Request-Id': requestId,
    },
  })
}

// ─── Memory: background extraction + storage ────────────────────────────────

/**
 * Fire-and-forget memory pipeline. Runs AFTER the user's answer finished
 * streaming: extracts durable facts from the last exchange, dedupes against
 * what's already stored, and inserts the new ones. Failures are logged and
 * swallowed — memory must never break chat.
 */
async function extractAndStoreMemories(opts: {
  userId: string
  apiKey: string
  existing: UserMemory[]
  recentMessages: Array<{ role: 'user' | 'assistant'; content: string }>
}): Promise<void> {
  const extracted = await extractMemories({
    apiKey: opts.apiKey,
    model: MODEL_FAST,
    recentMessages: opts.recentMessages,
  })
  if (extracted.length === 0) return

  const fresh = dedupeMemories(opts.existing, extracted)
  if (fresh.length === 0) return

  const rows = fresh.map((content) => ({
    user_id: opts.userId,
    content,
    source: 'auto',
  }))

  const { error } = await supabaseAdmin.from('user_memory').insert(rows)
  if (error) throw new Error(error.message)
}
