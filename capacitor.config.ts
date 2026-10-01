import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Capacitor configuration — Azura Android app.
 *
 * The APK is a native shell that loads the live site (server-authoritative:
 * payments, auth, and model logic stay on Vercel; fixes ship without an
 * APK update). `server.url` pins the webview to the dedicated app
 * subdomain (www stays the marketing/API-platform site — two separate
 * products, two separate hosts); `androidScheme` keeps
 * cookies/localStorage in a stable origin.
 */
const config: CapacitorConfig = {
  appId: 'ir.azuraai.app',
  appName: 'Azura',
  webDir: 'public',
  server: {
    url: 'https://app.azuraai.ir/app',
    androidScheme: 'https',
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    // Android 15 forces edge-to-edge: without inset handling the app
    // renders under the status bar (battery/clock cover the hamburger).
    EdgeToEdge: {
      backgroundColor: '#09090b',
    },
  },
}

export default config
