'use client'

/**
 * External-link opener — inside the Capacitor APK, `target="_blank"` and
 * window.open are swallowed by the WebView (nothing happens), so links are
 * handed to the Capacitor Browser plugin, which presents an in-app Chrome
 * Custom Tab with a done button. On the web this is a plain new-tab open.
 */
export async function openExternal(url: string): Promise<void> {
  try {
    const [{ Browser }, { Capacitor }] = await Promise.all([
      import('@capacitor/browser'),
      import('@capacitor/core'),
    ])
    if (Capacitor.isNativePlatform()) {
      await Browser.open({ url })
      return
    }
  } catch {
    // Plugin missing or non-native context — fall through to web behavior.
  }
  window.open(url, '_blank', 'noopener,noreferrer')
}
