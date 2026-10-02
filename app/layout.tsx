import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono, Vazirmatn } from 'next/font/google'
import { ThemeProvider } from '@/components/theme'
import { localeInitScript } from '@/lib/i18n'
import './globals.css'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

// Vazirmatn — the definitive open Persian/Arabic UI typeface (OFL).
// Self-hosted by next/font: zero layout shift, works offline in the APK.
const vazirmatn = Vazirmatn({
  variable: '--font-vazirmatn',
  subsets: ['arabic'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: 'Azura - AI API Platform',
    template: '%s · Azura',
  },
  description:
    'Production-grade AI API platform with AvalAI upstream provider, plus a mobile-first AI assistant app.',
  applicationName: 'Azura',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Azura',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: [
      { url: '/favicon.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-48.png', sizes: '48x48', type: 'image/png' },
      { url: '/brand/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [{ url: '/brand/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
  openGraph: {
    title: 'Azura - AI API Platform',
    description: 'Production-grade AI API platform with AvalAI upstream provider.',
    siteName: 'Azura',
    type: 'website',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0b0a10' },
    { media: '(prefers-color-scheme: light)', color: '#f7f7fb' },
  ],
}

/**
 * Applied before first paint so the dark (default) theme never flashes.
 * Mirrors components/theme.tsx — keep the storage key in sync.
 */
const themeInit = `(function(){try{var t=localStorage.getItem('azura-theme')||'dark';var m=window.matchMedia('(prefers-color-scheme: light)').matches;var d=t==='dark'||(t==='system'&&!m);var r=document.documentElement;r.classList.toggle('dark',d);r.classList.toggle('light',!d);r.style.colorScheme=d?'dark':'light';}catch(e){document.documentElement.classList.add('dark');}})();`

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${vazirmatn.variable} dark h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
        {/* Locale must be resolved before first paint, otherwise a Persian
            phone renders one English frame before flipping to RTL. Scripts
            rendered inside a component never execute, so it lives in <head>
            next to themeInit. It no-ops outside the app shell. */}
        <script dangerouslySetInnerHTML={{ __html: localeInitScript }} />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}
