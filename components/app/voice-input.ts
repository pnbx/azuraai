'use client'

/**
 * useVoiceInput — speech-to-text for the composer via the Web Speech API.
 *
 * Chrome/Android WebView expose `webkitSpeechRecognition`; where unsupported
 * the hook reports `supported: false` and the mic button simply doesn't
 * render. Auto-stops after a pause; appends (not replaces) to the composer.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

type SpeechRecognitionLike = {
  lang: string
  continuous: boolean
  interimResults: boolean
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

export function useVoiceInput(onText: (text: string, isFinal: boolean) => void) {
  const [listening, setListening] = useState(false)
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

  // Keep the callback ref current without touching it during render.
  useEffect(() => {
    onTextRef.current = onText
  }, [onText])

  useEffect(() => {
    const w = window as unknown as Record<string, unknown>
    const Ctor = (w.SpeechRecognition ?? w.webkitSpeechRecognition) as
      | (new () => SpeechRecognitionLike)
      | undefined
    if (!Ctor) return

    const rec = new Ctor()
    rec.lang = navigator.language || 'en-US'
    rec.continuous = true
    rec.interimResults = true

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
    rec.onerror = () => setListening(false)

    recognitionRef.current = rec
    return () => {
      try {
        rec.stop()
      } catch {
        // already stopped
      }
    }
  }, [])

  const start = useCallback(() => {
    const rec = recognitionRef.current
    if (!rec || listening) return
    try {
      rec.start()
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

  return { listening, supported, start, stop }
}
