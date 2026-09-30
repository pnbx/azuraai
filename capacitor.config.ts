import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Capacitor configuration — Azura Android app.
 *
 * The APK is a native shell that loads the live site (server-authoritative:
 * payments, auth, and model logic stay on Vercel; fixes ship without an
 * APK update). `server.url` pins the webview to the mobile chat
 * experience (the site root redirects to the desktop dashboard);
 * `androidScheme` keeps cookies/localStorage in a stable origin.
 */
const config: CapacitorConfig = {
  appId: 'ir.azuraai.app',
  appName: 'Azura',
  webDir: 'public',
  server: {
    url: 'https://www.azuraai.ir/app',
    androidScheme: 'https',
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
}

export default config
