"use strict";

/**
 * OpenRouter Streaming Client
 *
 * Thin client for OpenRouter's OpenAI-compatible /chat/completions endpoint
 * with SSE streaming and reasoning-token extraction.
 *
 * Free reasoning models (DeepSeek R1 class) stream their chain-of-thought
 * either as `delta.reasoning` or inline `<think>...</think>` blocks — both
 * are normalized into discrete events so the UI can animate them.
 *
 * Security:
 * - Never logs API keys or message contents.
 * - Callers supply the API key per request (from the key pool).
 */

export type ChatRole = 'system' | 'user' | 'assistant'

export interface ChatMessage {
  role: ChatRole
  content: string
}

export interface StreamEvents {
  /** Plain assistant content token. */
  onContent: (delta: string) => void
  /** Chain-of-thought token (reasoning model). */
  onReasoning: (delta: string) => void
}

export interface StreamResult {
  content: string
  reasoning: string
  model: string
  finishReason?: string
}

export interface StreamOptions {
  apiKey: string
  model: string
  messages: ChatMessage[]
  temperature?: number
  maxTokens?: number
  signal?: AbortSignal
  baseUrl?: string
}

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'

/** Models whose deltas carry a separate `reasoning` field. */
const REASONING_FIELD_MODELS = /deepseek-r1|qwq|thinking|reasoner/i

// ─── Error surface ───────────────────────────────────────────────────────────

export class OpenRouterError extends Error {
  readonly status: number
  readonly type:
    | 'rate_limit_exceeded'
    | 'authentication_error'
    | 'provider_unavailable'
    | 'invalid_request'
    | 'provider_error'

  constructor(status: number, message: string) {
    super(message)
    this.status = status
    this.type = mapType(status)
  }
}

function mapType(status: number): OpenRouterError['type'] {
  if (status === 429) return 'rate_limit_exceeded'
  if (status === 401 || status === 403) return 'authentication_error'
  if (status >= 500) return 'provider_unavailable'
  if (status >= 400) return 'invalid_request'
  return 'provider_error'
}

// ─── SSE line iterator ───────────────────────────────────────────────────────

async function* sseLines(res: Response): AsyncGenerator<string> {
  const reader = res.body?.getReader()
  if (!reader) throw new OpenRouterError(502, 'empty_response_body')

  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let idx: number
    while ((idx = buffer.indexOf('\n')) !== -1) {
      yield buffer.slice(0, idx).replace(/\r$/, '')
      buffer = buffer.slice(idx + 1)
    }
  }
  if (buffer) yield buffer
}

// ─── Reasoning extraction ────────────────────────────────────────────────────

/**
 * Splits inline `<think>...</think>` blocks out of content deltas.
 * Returns the plain content part and whether reasoning is open/closed
 * at the end of this delta (state carried across deltas by the caller).
 */
export function extractInlineThinking(
  delta: string,
  thinkOpen: boolean,
): { content: string; reasoning: string; thinkOpen: boolean } {
  let content = ''
  let reasoning = ''
  let open = thinkOpen

  let rest = delta
  while (rest.length > 0) {
    if (open) {
      const close = rest.indexOf('</think>')
      if (close === -1) {
        reasoning += rest
        rest = ''
      } else {
        reasoning += rest.slice(0, close)
        rest = rest.slice(close + '</think>'.length)
        open = false
      }
    } else {
      const openIdx = rest.indexOf('<think>')
      if (openIdx === -1) {
        content += rest
        rest = ''
      } else {
        content += rest.slice(0, openIdx)
        rest = rest.slice(openIdx + '<think>'.length)
        open = true
      }
    }
  }

  return { content, reasoning, thinkOpen: open }
}

// ─── Think-splitter factory (tag-safe across deltas) ────────────────────────

const TAG_PREFIXES = ['<think>', '</think>']

/**
 * Creates a stateful splitter that consumes content deltas and emits
 * separated content/reasoning. Holds back a trailing fragment that could
 * be the start of a `<think>` / `</think>` tag until more text arrives,
 * so tags split across deltas are handled correctly.
 */
export function createThinkSplitter(events: {
  onContent: (delta: string) => void
  onReasoning: (delta: string) => void
}) {
  let thinkOpen = false
  let tagTail = ''

  const emit = (processable: string) => {
    if (!processable) return
    const split = extractInlineThinking(processable, thinkOpen)
    thinkOpen = split.thinkOpen
    if (split.reasoning) events.onReasoning(split.reasoning)
    if (split.content) events.onContent(split.content)
  }

  return {
    push(raw: string): void {
      const buf = tagTail + raw
      let hold = 0
      for (let l = Math.min(8, buf.length); l > 0; l--) {
        const suffix = buf.slice(-l)
        if (TAG_PREFIXES.some((t) => t.startsWith(suffix))) {
          hold = l
          break
        }
      }
      tagTail = buf.slice(buf.length - hold)
      emit(buf.slice(0, buf.length - hold))
    },

    /** Flush any held-back tail (call at end of stream). */
    flush(): void {
      if (tagTail) {
        const tail = tagTail
        tagTail = ''
        emit(tail)
      }
    },
  }
}

// ─── Streaming call ──────────────────────────────────────────────────────────

/**
 * Stream a chat completion from OpenRouter. Throws OpenRouterError on
 * non-2xx responses (callers use `.status`/`.type` for pool failover).
 */
export async function streamChatCompletion(
  opts: StreamOptions,
  events: StreamEvents,
): Promise<StreamResult> {
  const baseUrl = (opts.baseUrl || OPENROUTER_BASE_URL).replace(/\/+$/, '')

  let res: Response
  try {
    res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${opts.apiKey}`,
        'HTTP-Referer': 'https://www.azuraai.ir',
        'X-Title': 'AzuraAI',
      },
      body: JSON.stringify({
        model: opts.model,
        messages: opts.messages,
        stream: true,
        ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
        ...(opts.maxTokens !== undefined ? { max_tokens: opts.maxTokens } : {}),
      }),
      signal: opts.signal,
    })
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') throw err
    throw new OpenRouterError(503, 'network_error')
  }

  if (!res.ok) {
    let detail = `HTTP ${res.status}`
    try {
      const body = (await res.json()) as { error?: { message?: string } }
      if (body?.error?.message) detail = body.error.message
    } catch {
      // keep default detail
    }
    throw new OpenRouterError(res.status, detail)
  }

  let content = ''
  let reasoning = ''
  let model = opts.model
  let finishReason: string | undefined

  const splitter = createThinkSplitter({
    onContent: (d) => {
      content += d
      events.onContent(d)
    },
    onReasoning: (d) => {
      reasoning += d
      events.onReasoning(d)
    },
  })

  for await (const line of sseLines(res)) {
    if (!line.startsWith('data:')) continue
    const payload = line.slice(5).trim()
    if (payload === '[DONE]') break

    let evt: {
      model?: string
      choices?: Array<{
        delta?: {
          content?: string | null
          reasoning?: string | null
          reasoning_content?: string | null
        }
        finish_reason?: string | null
      }>
    }
    try {
      evt = JSON.parse(payload)
    } catch {
      continue // keep-alive comments or partial frames
    }

    const choice = evt.choices?.[0]
    if (!choice) continue
    if (evt.model) model = evt.model

    // Reasoning models: dedicated delta field (reasoning / reasoning_content)
    const reasoningDelta =
      choice.delta?.reasoning ?? choice.delta?.reasoning_content ?? null
    if (reasoningDelta) {
      reasoning += reasoningDelta
      events.onReasoning(reasoningDelta)
    }

    // Content (may contain inline <think> blocks on some free models)
    const contentDelta = choice.delta?.content
    if (contentDelta) {
      const wantsInlineSplit = REASONING_FIELD_MODELS.test(model) || contentDelta.includes('<think>')
      if (wantsInlineSplit) {
        splitter.push(contentDelta)
      } else {
        content += contentDelta
        events.onContent(contentDelta)
      }
    }

    if (choice.finish_reason) finishReason = choice.finish_reason
  }

  splitter.flush()

  return { content, reasoning, model, finishReason }
}
