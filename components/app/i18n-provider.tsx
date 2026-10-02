'use client'

/**
 * React binding for the app locale.
 *
 * The pure detection/lookup logic lives in lib/i18n.ts (JSX-free, unit
 * tested); this file supplies the context and hook.
 *
 * Why plain state instead of useSyncExternalStore: the locale comes from
 * localStorage + navigator, neither of which exists on the server. An external
 * store would need a server snapshot, and since the real answer differs
 * (`fa` on a Persian phone) React reports a hydration error and re-renders the
 * whole shell. Resolving after mount is the standard i18n approach; the
 * pre-paint script in app/layout.tsx has already set <html lang/dir>, so
 * there is no visible English frame despite this.
 */

import * as React from 'react'
import {
  resolveLocale,
  translate,
  writeStoredLocale,
  type I18nKey,
  type Locale,
} from '@/lib/i18n'

export type { I18nKey, Locale }
export { I18N_KEYS, STRINGS, localeInitScript } from '@/lib/i18n'

/** Keep <html lang/dir> in sync so CSS logical properties and the browser agree. */
function applyDocumentLocale(locale: Locale): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.lang = locale
  root.dir = locale === 'fa' ? 'rtl' : 'ltr'
}

export interface I18nValue {
  locale: Locale
  dir: 'rtl' | 'ltr'
  t: (key: I18nKey) => string
  setLocale: (next: Locale) => void
}

const I18nContext = React.createContext<I18nValue | null>(null)

export function I18nProvider({
  children,
  initial = 'en',
}: {
  children: React.ReactNode
  initial?: Locale
}) {
  const [locale, setLocaleState] = React.useState<Locale>(initial)

  React.useEffect(() => {
    const next = resolveLocale()
    // No-op when the device already agrees, so a Latin phone does not re-render.
    if (next === locale) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot hydration of a browser-only value
    setLocaleState(next)
    applyDocumentLocale(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot on mount
  }, [])

  const setLocale = React.useCallback((next: Locale) => {
    setLocaleState(next)
    applyDocumentLocale(next)
    writeStoredLocale(next)
  }, [])

  const t = React.useCallback((key: I18nKey) => translate(locale, key), [locale])

  const value = React.useMemo<I18nValue>(
    () => ({ locale, dir: locale === 'fa' ? 'rtl' : 'ltr', t, setLocale }),
    [locale, t, setLocale]
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

/**
 * Access the active locale and translator. Falls back to English outside a
 * provider so a component can be rendered standalone in tests.
 */
export function useI18n(): I18nValue {
  const ctx = React.useContext(I18nContext)
  if (ctx) return ctx
  return {
    locale: 'en',
    dir: 'ltr',
    t: (key) => translate('en', key),
    setLocale: () => {},
  }
}