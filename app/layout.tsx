import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono, Vazirmatn } from 'next/font/google'
import { ThemeProvider } from '@/components/theme'
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
    default: 'Azura — AI Assistant',
    template: '%s · Azura',
  },
  description:
    'Azura is your AI assistant: fast answers, deep thinking, and web-grounded research — with an API platform for builders.',
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
    title: 'Azura — AI Assistant',
    description: 'Fast answers, deep thinking, and web-grounded research.',
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
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}
