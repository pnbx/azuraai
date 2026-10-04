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
  // Required for any relative OG/Twitter URL (the manifest link above, and
  // any future og image) to resolve to an absolute one. Without it the social
  // card silently renders with no image.
  metadataBase: new URL('https://app.azuraai.ir'),
  title: {
    default: 'Azura — Persian AI assistant',
    template: '%s · Azura',
  },
  description:
    'Azura is a Persian-first AI assistant: fast chat, deep reasoning, and web-grounded research with real citations. Free to use on the web and Android.',
  applicationName: 'Azura',
  manifest: '/manifest.webmanifest',
  // Pages that must stay out of the index opt out individually (see /app and
  // /auth). Everything else on this host is public and wants to be found.
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
  },
  keywords: [
    'AI assistant',
    'Persian AI',
    'دستیار هوش مصنوعی',
    'چت هوش مصنوعی',
    'هوش مصنوعی فارسی',
    'Azura',
  ],
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
    type: 'website',
    url: 'https://app.azuraai.ir/about',
    title: 'Azura — Persian AI assistant',
    description:
      'Fast answers, deep thinking, and web-grounded research with citations. Built for Persian.',
    siteName: 'Azura',
    locale: 'en_US',
    alternateLocale: ['fa_IR'],
    images: [
      {
        url: '/brand/logo-mark.png',
        width: 512,
        height: 512,
        alt: 'Azura',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Azura — Persian AI assistant',
    description:
      'Fast answers, deep thinking, and web-grounded research with citations.',
    images: ['/brand/logo-mark.png'],
  },
}

/**
 * Organization-level structured data.
 *
 * The per-page JSON-LD in /about carries the richer SoftwareApplication
 * graph. This one runs on every route so that a link shared from any screen
 * still resolves to a known publisher rather than an anonymous URL. Static
 * and author-controlled — no user input reaches this string.
 */
const organizationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Azura',
  alternateName: 'آزورا',
  url: 'https://app.azuraai.ir',
  logo: 'https://app.azuraai.ir/brand/logo-mark.png',
  description:
    'Azura builds a Persian-first AI assistant and an AI API platform.',
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
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}
