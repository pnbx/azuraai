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
 * - Per-user daily message cap (atomic RPC, default 30/day)
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

/** Free models: fast chat vs heavy reasoning. */
const MODEL_FAST = process.env.OPENROUTER_MODEL_FAST || 'openrouter/free'
const MODEL_THINKING =
  process.env.OPENROUTER_MODEL_THINKING || 'openrouter/free'
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
const DAILY_CAP = Number(process.env.APP_CHAT_DAILY_CAP || 30)
const MAX_POOL_ATTEMPTS = 4

/** Attachment limits — client downscales before upload, this is the hard cap. */
const MAX_IMAGES_PER_MESSAGE = 4
/** ~1.6 MB of base64 ≈ 1.2 MB of decoded image data. */
const MAX_IMAGE_BYTES = 1_200_000
const MAX_IMAGE_CHARS = 1_600_000
const ALLOWED_IMAGE_MIME = /^(image\/(png|jpeg|jpg|webp|gif))$/i
const DATA_IMAGE_RE = /^data:(image\/(?:png|jpe?g|webp|gif));base64,/i

/**
 * The system prompt is what makes the output readable, so it is worth
 * spending real effort here. Four things it has to do:
 *  1. Answer in the user's language, and in genuinely idiomatic Persian —
 *     natural sentence order and Persian digits, not translated English.
 *  2. Structure the answer so a phone screen stays readable: short paragraphs,
 *     tables for comparisons, lists for steps.
 *  3. Format richly (bold, headers, math) — but only where it helps.
 *  4. Be honest instead of padding with invented detail.
 */
const SYSTEM_PROMPT =
  'You are Azura, the assistant inside the AzuraAI mobile app, used mostly by Iranian users.\n\n' +
  '## Language\n' +
  'Always answer in the language of the user\'s message — Persian (Farsi) or English.\n' +
  'For Persian, write natural, fluent Persian as a native speaker would:\n' +
  '- Use everyday Persian, not translated English word order.\n' +
  '- Use Persian punctuation (، ؛ «») and Persian digits (۰۱۲۳۴۵۶۷۸۹) for numbers, dates and units.\n' +
  '- Write in informal-conversational Persian (نه شما/شما mix is fine; prefer conversational).\n' +
  '- Keep English technical terms when that is what Iranians actually say (ایمیل، سرور، API).\n' +
  '- Never splice an English word into the middle of a Persian phrase. A word like\n' +
  '  "typical", "imperative" or "hybrid" must become Persian ("معمولی"، "دستوری"، "ترکیبی")\n' +
  '  or move into a parenthetical gloss — never "کاربردهایtypical" or "به‌cause interpreter".\n' +
  '  If a term has no natural Persian form, keep the whole term in Latin script and set it\n' +
  '  off as its own unit rather than gluing it onto a Persian word.\n' +
  '- For English, reply in clean international English.\n\n' +
  '## Formatting (this app renders markdown)\n' +
  'Structure answers so they read well on a narrow phone screen:\n' +
  '- Use short paragraphs. Never a wall of text.\n' +
  '- Use markdown tables for any comparison, list of fields, prices, specs, or step-by-step data with more than two columns. Always give the table a header row.\n' +
  '- Use bulleted lists for unordered points and numbered lists for procedures.\n' +
  '- Use ## and ### headings when an answer has genuinely distinct sections. Do not use headings for a short reply.\n' +
  '- Use **bold** for the key term or the direct answer, not for emphasis on everything.\n' +
  '- Put code in fenced blocks with a language tag, and formulas in $...$ (inline) or $$...$$ (block) LaTeX.\n' +
  '- Never repeat the question back before answering it.\n\n' +
  '## Honesty\n' +
  '- If you are not sure, say so plainly. Never invent facts, studies, links or quotations.\n' +
  '- No filler openings like "Great question!" or "Certainly!". Answer immediately.\n' +
  '- Do not repeat your reasoning back; give the result.'

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

  // ─── Per-user daily cap (atomic, signed-in users only) ────────────────────
  // Guests are unmetered by design (the app has no accounts). Signed-in users
  // still get the cap so one account can't drain the key pool.
  if (user) {
    const { data: capData, error: capError } = await supabaseAdmin.rpc(
      'increment_app_chat_usage',
      { p_user_id: user.id, p_daily_cap: DAILY_CAP }
    )
    const capRow = Array.isArray(capData) ? capData[0] : capData
    if (capError) {
      // Degrade gracefully: if usage tracking is unavailable (e.g. migration
      // not applied yet), allow the request and log loudly instead of 500-ing.
      console.error('[AppChat] usage RPC failed (allowing request):', capError.message)
    } else if (!capRow?.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: 'daily_cap_reached',
          used: capRow?.used ?? DAILY_CAP,
          cap: capRow?.cap ?? DAILY_CAP,
        },
        { status: 429 }
      )
    }
  }

  // ─── Stream via pool with failover ───────────────────────────────────────
  const encoder = new TextEncoder()
  const requestId = crypto.randomUUID()

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false
      const send = (frame: string) => {
        if (!closed) controller.enqueue(encoder.encode(frame))
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
              onContent: (delta) => send(sseFrame({ type: 'content', delta })),
              onReasoning: (delta) => send(sseFrame({ type: 'reasoning', delta })),
            }
          )

        let outcome = await withPoolFailover(
          (key) => runModel(key, messages, model),
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

        if ('result' in outcome) {
          send(
            sseFrame({
              type: 'meta',
              model: outcome.result.model,
              content: outcome.result.content,
              reasoning: outcome.result.reasoning,
              vision: visionRequested && outcome.result.vision === true,
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
