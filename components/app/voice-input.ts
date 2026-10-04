'use client'

/**
 * useVoiceInput — speech-to-text for the composer via the Web Speech API.
 *
 * Chrome/Android WebView expose `webkitSpeechRecognition`; where unsupported
 * the hook reports `supported: false` and the mic button simply doesn't
 * render. Auto-stops after a pause; appends (not replaces) to the composer.
 *
 * Language note: the recogniser defaults to `navigator.language`, which on an
 * English-locale device transcribes Persian speech with English phonetics and
 * produces garbage. `lang` is therefore overridable so the caller can pin
 * `fa-IR`; that is what makes Persian dictation actually work.
 *
 * Two failures dominate in practice and are handled explicitly below:
 * `not-allowed` (permission refused or blocked by Permissions-Policy, which
 * is indistinguishable from the browser's own denial) and `network`
 * (Chrome's recogniser is a cloud service and fails offline).
 */

import { useCallback, useEffect, useRef, useState } from 'react'

type SpeechRecognitionLike = {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  onresult: ((e: SpeechEventLike) => void) | null
  onend: (() => void) | null
  onerror: ((e: { error?: string }) => void) | null
  start: () => void
  stop: () => void
}

interface SpeechEventLike {
  resultIndex: number
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>
}

/** Why dictation stopped, when it wasn't a clean stop. */
export type VoiceError = 'not-allowed' | 'network' | 'no-speech' | 'aborted' | 'unknown'

export interface VoiceInputApi {
  listening: boolean
  supported: boolean
  /** Set when the last attempt failed; cleared on the next successful start. */
  error: VoiceError | null
  start: () => void
  stop: () => void
}

/** Maps a Web Speech error string onto something we can act on. */
export function normaliseVoiceError(code?: string): VoiceError {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'not-allowed'
    case 'network':
      return 'network'
    case 'no-speech':
      return 'no-speech'
    case 'aborted':
      return 'aborted'
    default:
      return 'unknown'
  }
}

export function useVoiceInput(
  onText: (text: string, isFinal: boolean) => void,
  /** BCP-47 tag for the recogniser, e.g. `fa-IR`. Defaults to the device locale. */
  lang?: string,
  /**
   * Called once per failed attempt, at the moment it fails. Reporting from
   * here rather than watching `error` from an effect keeps callers from
   * setState-ing synchronously inside an effect on every failure.
   */
  onError?: (error: VoiceError) => void
): VoiceInputApi {
  const [listening, setListening] = useState(false)
  const [error, setError] = useState<VoiceError | null>(null)
  // Feature detection must start as false on BOTH sides of hydration: a
  // useState(() => window…) initializer returns true on the client and false
  // on the server, which made React throw a hydration mismatch and regenerate
  // the whole composer on every cold load. Resolve it after mount instead.
  const [supported, setSupported] = useState(false)
  useEffect(() => {
    const w = window as unknown as Record<string, unknown>
    // eslint-disable-next-line react-hooks/set-state-in-effect -- deliberate: the only safe way to feature-detect a browser API without breaking hydration (see note above)
    setSupported(Boolean(w.SpeechRecognition ?? w.webkitSpeechRecognition))
  }, [])
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const onTextRef = useRef(onText)
  const onErrorRef = useRef(onError)

  // Keep the callback refs current without touching them during render.
  useEffect(() => {
    onTextRef.current = onText
    onErrorRef.current = onError
  }, [onText, onError])

  useEffect(() => {
    const w = window as unknown as Record<string, unknown>
    const Ctor = (w.SpeechRecognition ?? w.webkitSpeechRecognition) as
      | (new () => SpeechRecognitionLike)
      | undefined
    if (!Ctor) return

    const rec = new Ctor()
    rec.lang = lang || navigator.language || 'en-US'
    rec.continuous = true
    rec.interimResults = true
    rec.maxAlternatives = 1

    rec.onresult = (e) => {
      let interim = ''
      let final = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        if (r.isFinal) final += r[0].transcript
        else interim += r[0].transcript
      }
      if (final) onTextRef.current(final, true)
      else if (interim) onTextRef.current(interim, false)
    }
    rec.onend = () => setListening(false)
    rec.onerror = (e) => {
      setListening(false)
      // `aborted` is what a deliberate stop() looks like, so it is not a
      // failure worth surfacing to the user.
      const code = normaliseVoiceError(e?.error)
      if (code === 'aborted') return
      setError(code)
      onErrorRef.current?.(code)
    }

    recognitionRef.current = rec
    return () => {
      try {
        rec.stop()
      } catch {
        // already stopped
      }
    }
  }, [lang])

  const start = useCallback(() => {
    const rec = recognitionRef.current
    if (!rec || listening) return
    try {
      rec.start()
      setError(null)
      setListening(true)
    } catch {
      // start() throws if already started — ignore
    }
  }, [listening])

  const stop = useCallback(() => {
    try {
      recognitionRef.current?.stop()
    } catch {
      // already stopped
    }
    setListening(false)
  }, [])

  return { listening, supported, error, start, stop }
}
