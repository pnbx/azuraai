'use client'

/**
 * Theme system — dark by default (Grok-style), light available.
 *
 * Persisted in localStorage as `azura-theme` ∈ { 'dark', 'light', 'system' }.
 * Applied pre-paint by the inline script in app/layout.tsx so there is no
 * flash of the wrong theme. `setTheme` also pokes the Android status bar
 * when running inside the Capacitor shell.
 */

import * as React from 'react'

export type Theme = 'dark' | 'light' | 'system'

export const THEME_STORAGE_KEY = 'azura-theme'

export function applyTheme(theme: Theme) {
  const prefersLight =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-color-scheme: light)').matches
  const dark = theme === 'dark' || (theme === 'system' && !prefersLight)

  document.documentElement.classList.toggle('dark', dark)
  document.documentElement.classList.toggle('light', !dark)
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'

  // Keep the Android status bar / nav bar in sync inside the APK shell.
  // Uses the runtime Capacitor global bridge (no build-time dep) when present.
  try {
    const w = window as unknown as {
      Capacitor?: {
        isNativePlatform?: () => boolean
        Plugins?: Record<string, { setStyle?: (o: { style: string }) => void }>
      }
    }
    if (w.Capacitor?.isNativePlatform?.()) {
      w.Capacitor.Plugins?.StatusBar?.setStyle?.({ style: dark ? 'DARK' : 'LIGHT' })
    }
  } catch {
    // not in a native shell
  }
}

const ThemeCtx = React.createContext<{
  theme: Theme
  setTheme: (t: Theme) => void
}>({ theme: 'dark', setTheme: () => {} })

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Read the persisted theme lazily so the first render already matches the
  // pre-paint inline script — no setState-in-effect, no flash.
  const [theme, setThemeState] = React.useState<Theme>(() => {
    if (typeof window === 'undefined') return 'dark'
    return (localStorage.getItem(THEME_STORAGE_KEY) as Theme | null) ?? 'dark'
  })

  React.useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: light)')
    const onChange = () => {
      if ((localStorage.getItem(THEME_STORAGE_KEY) as Theme | null) === 'system') {
        applyTheme('system')
      }
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const setTheme = React.useCallback((t: Theme) => {
    localStorage.setItem(THEME_STORAGE_KEY, t)
    setThemeState(t)
    applyTheme(t)
  }, [])

  return <ThemeCtx.Provider value={{ theme, setTheme }}>{children}</ThemeCtx.Provider>
}

export function useTheme() {
  return React.useContext(ThemeCtx)
}

/** Pill selector used on settings screens — mirrors Grok's theme settings UI. */
export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { theme, setTheme } = useTheme()
  const options: Array<{ key: Theme; label: string }> = [
    { key: 'light', label: 'Light' },
    { key: 'dark', label: 'Dark' },
    { key: 'system', label: 'Auto' },
  ]
  return (
    <div
      className={`inline-flex items-center rounded-full border border-border bg-muted p-0.5 ${
        compact ? 'text-[11px]' : 'text-xs'
      }`}
      role="radiogroup"
      aria-label="Theme"
    >
      {options.map((o) => (
        <button
          key={o.key}
          role="radio"
          aria-checked={theme === o.key}
          onClick={() => setTheme(o.key)}
          className={`rounded-full px-3 py-1 font-medium transition-colors ${
            theme === o.key
              ? 'bg-card text-card-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
