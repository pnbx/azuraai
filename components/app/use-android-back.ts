'use client'

/**
 * Android hardware back-button handling — ChatGPT-style.
 *
 * Priority order:
 *   1. drawer open            → close it
 *   2. streaming in progress  → stop generation
 *   3. settings/integrations  → back to chat
 *   4. else                   → default (backgrounds the app)
 *
 * The Capacitor App plugin's backButton listener suppresses the default
 * exit behavior whenever a listener is registered, so we re-register on
 * every state change and remove the listener to hand control back to the
 * system (background the app) when there is nothing in-app to do.
 */

import * as React from 'react'

type BackHandlers = {
  drawerOpen: boolean
  closeDrawer: () => void
  busy: boolean
  stopGeneration: () => void
}

export function useAndroidBackButton(handlers: BackHandlers) {
  const ref = React.useRef(handlers)
  // Keep the latest handlers without re-registering the listener;
  // assignment happens in an effect, never during render.
  React.useEffect(() => {
    ref.current = handlers
  })

  React.useEffect(() => {
    let cleanup: (() => void) | undefined
    let cancelled = false

    void (async () => {
      try {
        const { App } = await import('@capacitor/app')
        const handle = await App.addListener('backButton', () => {
          const h = ref.current
          if (h.drawerOpen) {
            h.closeDrawer()
          } else if (h.busy) {
            h.stopGeneration()
          } else if (typeof window !== 'undefined' && window.location.pathname !== '/app') {
            window.location.href = '/app'
          } else {
            // Nothing in-app to navigate: match system behavior (minimize).
            void App.exitApp()
          }
        })
        if (cancelled) {
          void handle.remove()
          return
        }
        cleanup = () => {
          void handle.remove()
        }
      } catch {
        // Web or plugin unavailable — browser back button stays native.
      }
    })()

    return () => {
      cancelled = true
      cleanup?.()
    }
  }, [])
}
