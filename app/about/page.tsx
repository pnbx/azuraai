import type { Metadata } from 'next'
import Link from 'next/link'

/**
 * The one page on this host a visitor without an account can actually read.
 *
 * Every other route is a session-gated screen: `/` 302s to `/dashboard`,
 * which 302s to `/auth/login` for anyone without a cookie. A crawler following
 * that chain lands on a login form and concludes the site has no content. This
 * page is real server-rendered HTML with the product described in prose, which
 * is what both the search index and an AI answer engine need in order to say
 * anything true about Azura.
 *
 * Bilingual on purpose. The app's primary audience searches in Persian, and the
 * Persian text is what should match those queries; the English half is what
 * answer engines and English-language queries tend to quote. Both live in the
 * DOM, each tagged with its own `lang`/`dir` so screen readers and
 * translation tools do not mix them up.
 */

const SITE_URL = 'https://app.azuraai.ir'

export const metadata: Metadata = {
  title: 'Azura — Persian AI assistant, chat and research',
  description:
    'Azura is a Persian-first AI assistant: fast chat and deep-thinking answers, web-grounded research with real citations, image understanding, Persian voice dictation and Jalali dates. Free to start on Android and the web.',
  alternates: { canonical: `${SITE_URL}/about` },
  keywords: [
    'AI assistant',
    'Persian AI',
    'دستیار هوش مصنوعی',
    'چت هوش مصنوعی',
    'هوش مصنوعی فارسی',
    'Azura',
    'azuraai',
    'AI research',
    'AI chat Iran',
    'چت با هوش مصنوعی',
  ],
  openGraph: {
    type: 'website',
    url: `${SITE_URL}/about`,
    title: 'Azura — Persian AI assistant',
    description:
      'Fast answers, deep thinking, and web-grounded research with citations. Built for Persian.',
    siteName: 'Azura',
    locale: 'en_US',
    alternateLocale: ['fa_IR'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Azura — Persian AI assistant',
    description:
      'Fast answers, deep thinking, and web-grounded research with citations.',
  },
}

/** Structured data. Same payload the page renders, in machine-readable form. */
const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${SITE_URL}/#organization`,
      name: 'Azura',
      alternateName: 'آزورا',
      url: SITE_URL,
      logo: `${SITE_URL}/brand/logo-mark.png`,
      description:
        'Azura builds a Persian-first AI assistant and an AI API platform.',
    },
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      url: SITE_URL,
      name: 'Azura',
      inLanguage: ['fa-IR', 'en'],
      publisher: { '@id': `${SITE_URL}/#organization` },
    },
    {
      '@type': 'SoftwareApplication',
      '@id': `${SITE_URL}/#app`,
      name: 'Azura',
      alternateName: 'دستیار هوشمند آزورا',
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'Android, Web',
      url: `${SITE_URL}/app`,
      description:
        'A Persian-first AI assistant with fast and deep-thinking chat modes, web-grounded research that cites its sources, image understanding, Persian voice dictation and Jalali calendar dates.',
      inLanguage: ['fa-IR', 'en'],
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'IRR',
        description: 'Free daily allowance; paid API keys available.',
      },
      featureList: [
        'Fast chat mode',
        'Deep-thinking (reasoning) mode',
        'Web-grounded research with inline citations',
        'Image understanding',
        'Persian voice dictation',
        'Jalali (Persian) calendar dates',
        'Conversation memory for signed-in users',
      ],
      publisher: { '@id': `${SITE_URL}/#organization` },
    },
  ],
}

const FEATURES = [
  {
    fa: {
      title: 'چت سریع و حالت تفکر عمیق',
      body: 'دو حالت چت: پاسخ سریع برای سؤال‌های روزمره، و حالت تفکر عمیق برای مسائل پیچیده‌تر که قدم‌به‌قدم استدلال می‌کند.',
    },
    en: {
      title: 'Fast chat and deep thinking',
      body: 'Two modes: a quick answer for everyday questions, and a reasoning mode that works through harder problems step by step.',
    },
  },
  {
    fa: {
      title: 'پژوهش با منبع واقعی',
      body: 'حالت پژوهش در وب جست‌وجو می‌کند و هر ادعا را با پیوند به منبع اصلی نشان می‌دهد — پس می‌توانید خودتان بررسی کنید.',
    },
    en: {
      title: 'Research with real sources',
      body: 'Research mode searches the web and backs each claim with a link to the original source, so you can check the answer yourself.',
    },
  },
  {
    fa: {
      title: 'تایپ صوتی فارسی',
      body: 'با دکمه میکروفون حرف بزنید و متن فارسی آن را بنویسد. مخصوصاً برای گفت‌وگوهای طولانی راحت‌تر است.',
    },
    en: {
      title: 'Persian voice dictation',
      body: 'Tap the microphone and talk; it writes the Persian transcript. Useful when a long question is easier to say than to type.',
    },
  },
  {
    fa: {
      title: 'تاریخ شمسی',
      body: 'همه تاریخ‌ها به تقویم هجری شمسی نمایش داده می‌شوند، با ماه‌های فارسی و اعداد درست.',
    },
    en: {
      title: 'Jalali calendar dates',
      body: 'Every date is shown in the Solar Hijri (Jalali) calendar with correct Persian month names and digits.',
    },
  },
  {
    fa: {
      title: 'درک تصویر',
      body: 'عکس را پیوست کنید و درباره‌اش بپرسید — از یک نمودار تا یک صفحه از کتاب.',
    },
    en: {
      title: 'Image understanding',
      body: 'Attach an image and ask about it, from a chart to a page out of a textbook.',
    },
  },
  {
    fa: {
      title: 'حافظه مکالمه',
      body: 'اگر وارد حساب کاربری شوید، آزورا نکات مهم را به خاطر می‌سپارد و در گفت‌وگوهای بعدی به کار می‌برد.',
    },
    en: {
      title: 'Conversation memory',
      body: 'Sign in and Azura keeps the durable details you share and carries them into later conversations.',
    },
  },
]

export default function AboutPage() {
  return (
    <>
      <script
        type="application/ld+json"
        // Static, author-controlled object — no user input reaches this string.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <main className="mx-auto w-full max-w-3xl px-5 py-16 sm:py-24">
        <header className="mb-14">
          <p className="mb-3 text-sm font-medium tracking-wide text-muted-foreground">
            Azura · آزورا
          </p>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            دستیار هوشمند فارسی
          </h1>
          <p className="mt-4 text-xl leading-relaxed text-muted-foreground sm:text-2xl">
            Azura is a Persian-first AI assistant — fast answers, deep reasoning,
            and web research that shows its sources.
          </p>
          <p
            lang="fa"
            dir="rtl"
            className="mt-4 text-lg leading-8 text-muted-foreground"
          >
            آزورا یک دستیار هوشمند با تمرکز بر زبان فارسی است: پاسخ سریع،
            استدلال عمیق، و پژوهش در وب همراه با نمایش منبع.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/app"
              className="inline-flex items-center rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              شروع چت · Start chatting
            </Link>
            <Link
              href="/auth/login"
              className="inline-flex items-center rounded-lg border border-border px-5 py-2.5 text-sm font-semibold transition-colors hover:bg-muted"
            >
              ورود · Sign in
            </Link>
          </div>
        </header>

        <section className="mb-14">
          <h2 className="text-2xl font-semibold tracking-tight">
            چه کاری انجام می‌دهد
          </h2>
          <p className="mt-2 text-muted-foreground">What it does</p>

          <ul className="mt-8 space-y-8">
            {FEATURES.map((f) => (
              <li key={f.en.title} className="border-t border-border pt-6">
                <h3 className="text-lg font-semibold">{f.fa.title}</h3>
                <p
                  lang="fa"
                  dir="rtl"
                  className="mt-2 leading-8 text-muted-foreground"
                >
                  {f.fa.body}
                </p>
                <p className="mt-2 text-sm leading-7 text-muted-foreground">
                  {f.en.title} — {f.en.body}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section className="mb-14">
          <h2 className="text-2xl font-semibold tracking-tight">
            چطور کار می‌کند
          </h2>
          <p className="mt-2 text-muted-foreground">How it works</p>
          <div className="mt-6 space-y-4 leading-8 text-muted-foreground">
            <p>
              Azura routes each message to a pool of language models and streams
              the answer as it is produced. If one provider is rate-limited or
              unavailable, the request fails over to the next healthy one rather
              than returning an error.
            </p>
            <p lang="fa" dir="rtl">
              آزورا هر پیام را به مجموعه‌ای از مدل‌های زبانی می‌فرستد و پاسخ را
              همان‌طور که ساخته می‌شود نمایش می‌دهد. اگر یک سرویس محدودیت
              نرخ داشته باشد، درخواست به‌طور خودکار به سرویس بعدی منتقل
              می‌شود.
            </p>
          </div>
        </section>

        <section className="mb-14">
          <h2 className="text-2xl font-semibold tracking-tight">
            هزینه و دسترسی
          </h2>
          <p className="mt-2 text-muted-foreground">Cost and access</p>
          <div className="mt-6 space-y-4 leading-8 text-muted-foreground">
            <p>
              The assistant is free to use with a daily message allowance, on
              the web and in the Android app — no account required to start. If
              you want programmatic access, the Azura dashboard issues API keys
              you can use from your own code, billed in Toman.
            </p>
            <p lang="fa" dir="rtl">
              استفاده از دستیار رایگان است و سهمیه روزانه دارد؛ برای شروع نیازی به
              ساخت حساب نیست. اگر به دسترسی برنامه‌نویسی نیاز دارید، از پنل
              کاربری می‌توانید کلید API بسازید و هزینه را به تومان پرداخت کنید.
            </p>
          </div>
        </section>

        <footer className="border-t border-border pt-8 text-sm text-muted-foreground">
          <p>
            <Link href="/about" className="underline underline-offset-4">
              About Azura
            </Link>
            {' · '}
            <a
              href="https://azuraai.ir"
              className="underline underline-offset-4"
              rel="canonical"
            >
              azuraai.ir
            </a>
          </p>
        </footer>
      </main>
    </>
  )
}