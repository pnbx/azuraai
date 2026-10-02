'use client'

/**
 * useSpeech — read-aloud for assistant answers.
 *
 * Wraps the Web Speech synthesis API with the details that actually matter on
 * a phone:
 *
 * - **Persian voices.** Android ships no reliable `fa-IR` voice, and picking
 *   the default voice makes Persian text read with English phonetics. We
 *   prefer a Persian voice when the device has one and otherwise leave the
 *   default (the OS does its own fallback better than we can).
 * - **Chunking.** Chrome silently stops speaking past ~15 KB of text, and
 *   long answers blow straight through that. We split on sentence boundaries
 *   and queue the pieces so nothing gets truncated mid-answer.
 * - **One speaker at a time.** Starting a new message cancels the previous
 *   one instead of talking over it.
 *
 * Voice data arrives asynchronously in most browsers, so the voice list is
 * resolved lazily and re-read on `voiceschanged`.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { stripMarkdown } from './text-utils'

/** SpeechSynthesis hard-stops somewhere past this; stay well under it. */
const CHUNK_LIMIT = 1800

export interface SpeechApi {
  supported: boolean
  /** Id of the message currently being spoken, or null. */
  speakingId: string | null
  speak: (id: string, markdown: string) => void
  stop: () => void
  toggle: (id: string, markdown: string) => void
}

/**
 * Splits prose into utterance-sized chunks on sentence boundaries, falling
 * back to whitespace so a pathological single sentence still gets chunked.
 */
export function chunkForSpeech(text: string, limit = CHUNK_LIMIT): string[] {
  if (text.length <= limit) return text ? [text] : []

  const chunks: string[] = []
  let rest = text

  while (rest.length > limit) {
    // Prefer the last sentence end inside the window.
    const window_ = rest.slice(0, limit)
    const sentenceEnd = Math.max(
      window_.lastIndexOf('. '),
      window_.lastIndexOf('؟ '), // Arabic question mark
      window_.lastIndexOf('! '),
      window_.lastIndexOf('.\n'),
      window_.lastIndexOf('\n')
    )
    const cut = sentenceEnd > limit * 0.4 ? sentenceEnd + 1 : window_.lastIndexOf(' ') + 1
    const at = cut > 0 ? cut : limit
    chunks.push(rest.slice(0, at))
    rest = rest.slice(at)
  }
  if (rest) chunks.push(rest)
  return chunks
}

export function useSpeech(): SpeechApi {
  const supported =
    typeof window !== 'undefined' &&
    typeof window.speechSynthesis !== 'undefined' &&
    typeof window.SpeechSynthesisUtterance !== 'undefined'

  const [speakingId, setSpeakingId] = useState<string | null>(null)
  const queueRef = useRef<string[]>([])
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null)

  const stop = useCallback(() => {
    queueRef.current = []
    if (supported) {
      try {
        window.speechSynthesis.cancel()
      } catch {
        // some WebViews throw if nothing is speaking
      }
    }
    setSpeakingId(null)
  }, [supported])

  /**
   * Picks the best voice for the text: an exact/normalised Persian match
   * first, then any language starting with `fa`, then leave it to the OS.
   */
  const pickVoice = useCallback((text: string): SpeechSynthesisVoice | null => {
    if (!supported) return null
    const voices = window.speechSynthesis.getVoices()
    if (voices.length === 0) return null

    const isPersianText = /[\u0600-\u06FF]/.test(text)

    if (isPersianText) {
      const fa = voices.filter((v) => v.lang.toLowerCase().startsWith('fa'))
      if (fa.length > 0) {
        const exact = fa.find((v) => v.lang.toLowerCase() === 'fa-ir')
        return exact ?? fa[0]
      }
      // No Persian voice installed: better to stay silent-by-default voice
      // than to force an English one, so fall through to the default.
      return null
    }

    const en = voices.find((v) => v.lang.toLowerCase().startsWith('en'))
    return en ?? null
  }, [supported])

  const speak = useCallback(
    (id: string, markdown: string) => {
      if (!supported) return
      const text = stripMarkdown(markdown)
      if (!text.trim()) return

      // Take over the speaker: cancel anything already queued.
      try {
        window.speechSynthesis.cancel()
      } catch {
        // ignore
      }
      queueRef.current = chunkForSpeech(text)
      setSpeakingId(id)

      if (voiceRef.current === null) voiceRef.current = pickVoice(text)

      const speakNext = () => {
        const chunk = queueRef.current.shift()
        if (!chunk) {
          setSpeakingId(null)
          return
        }
        const u = new SpeechSynthesisUtterance(chunk)
        if (voiceRef.current) {
          u.voice = voiceRef.current
          u.lang = voiceRef.current.lang
        }
        u.rate = 1.0
        u.pitch = 1.0
        u.onend = speakNext
        u.onerror = () => {
          // A cancelled/aborted utterance fires onerror too — keep the queue
          // consistent and only continue if we still have content.
          if (queueRef.current.length > 0) speakNext()
          else setSpeakingId(null)
        }
        try {
          window.speechSynthesis.speak(u)
        } catch {
          setSpeakingId(null)
        }
      }

      speakNext()
    },
    [supported, pickVoice]
  )

  const toggle = useCallback(
    (id: string, markdown: string) => {
      if (speakingId === id) stop()
      else speak(id, markdown)
    },
    [speakingId, speak, stop]
  )

  // Never leave the phone talking after the screen goes away.
  useEffect(() => {
    const onLeave = () => stop()
    window.addEventListener('pagehide', onLeave)
    return () => {
      window.removeEventListener('pagehide', onLeave)
      stop()
    }
  }, [stop])

  // Voice lists populate late; refresh once they arrive.
  useEffect(() => {
    if (!supported) return
    const refresh = () => {
      if (voiceRef.current === null) voiceRef.current = pickVoice('')
    }
    window.speechSynthesis.addEventListener?.('voiceschanged', refresh)
    refresh()
    return () => {
      window.speechSynthesis.removeEventListener?.('voiceschanged', refresh)
    }
  }, [supported, pickVoice])

  return { supported, speakingId, speak, stop, toggle }
}