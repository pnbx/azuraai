import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { navLinks } from "@/lib/data";
import MobileMenu from "@/components/MobileMenu";
import EnamadSeal from "@/components/EnamadSeal";
import Icon from "@/components/Icon";
import { HeaderAuthButtons } from "@/components/HeaderAuthButtons";
import LogoMark from "@/components/LogoMark";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://azuraai.ir"),
  title: "Azura AI — چت هوشمند و فروش کلید API مدل‌های هوش مصنوعی",
  description:
    "Azura AI: چت با مدل‌های هوش مصنوعی و خرید کلید API با پرداخت ریالی، به تومان و پشتیبانی فارسی.",
  applicationName: "Azura AI",
  // No `manifest` key on purpose: this host ships no web app manifest, and
  // declaring one would 404 on every page load.
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
  keywords: [
    "چت هوش مصنوعی",
    "هوش مصنوعی",
    "دستیار هوشمند",
    "خرید کلید API",
    "API هوش مصنوعی",
    "ChatGPT ایران",
    "AI chat",
    "AI API key",
    "OpenAI API",
    "پرداخت ریالی",
  ],
  authors: [{ name: "Azura AI" }],
  creator: "Azura AI",
  alternates: {
    canonical: "/",
    languages: { "fa-IR": "/", en: "/" },
  },
  openGraph: {
    type: "website",
    locale: "fa_IR",
    url: "/",
    siteName: "Azura AI",
    title: "Azura AI — چت هوشمند و فروش کلید API مدل‌های هوش مصنوعی",
    description:
      "چت با مدل‌های هوش مصنوعی و خرید کلید API با پرداخت ریالی، به تومان و پشتیبانی فارسی.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Azura AI — چت هوشمند و فروش کلید API مدل‌های هوش مصنوعی",
    description:
      "چت با مدل‌های هوش مصنوعی و خرید کلید API با پرداخت ریالی، به تومان و پشتیبانی فارسی.",
  },
};

/**
 * Structured data for the organization and its web presence.
 *
 * Static and author-controlled — no user input reaches this string. Sits in the
 * root layout rather than on individual pages so a link shared from any screen
 * resolves to a known publisher instead of an anonymous URL.
 */
const organizationJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://azuraai.ir/#organization",
      name: "Azura AI",
      alternateName: "آزورا",
      url: "https://azuraai.ir",
      logo: "https://azuraai.ir/logo-mark.png",
      description:
        "Iranian AI platform offering a Persian-first chat assistant and resold API keys for leading language models, billed in Toman via ZarinPal.",
      inLanguage: "fa-IR",
    },
    {
      "@type": "WebSite",
      "@id": "https://azuraai.ir/#website",
      url: "https://azuraai.ir",
      name: "Azura AI",
      inLanguage: "fa-IR",
      publisher: { "@id": "https://azuraai.ir/#organization" },
    },
    {
      "@type": "SoftwareApplication",
      "@id": "https://azuraai.ir/#app",
      name: "Azura AI",
      applicationCategory: "UtilitiesApplication",
      operatingSystem: "Android, Web",
      url: "https://azuraai.ir",
      inLanguage: "fa-IR",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "IRR",
        description:
          "Free daily chat allowance; API keys billed per token in Toman.",
      },
      publisher: { "@id": "https://azuraai.ir/#organization" },
    },
  ],
};

function Logo() {
  return (
    <Link href="/" className="group flex items-center gap-2.5">
      <LogoMark
        size={34}
        className="transition-transform duration-500 ease-smooth group-hover:rotate-6 group-hover:scale-110"
      />
      <span className="text-lg font-extrabold tracking-tight text-white">
        Azura <span className="text-mist-400">AI</span>
      </span>
    </Link>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;700;800;900&display=swap"
          rel="stylesheet"
        />
        <link rel="alternate" href="https://azuraai.ir/llms.txt" type="text/plain" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
      </head>
      <body className="min-h-screen">
        <header className="sticky top-0 z-50 border-b border-white/5 bg-black/70 backdrop-blur-xl">
          <div className="container-site flex h-16 items-center justify-between">
            <Logo />
            <nav className="hidden flex-1 items-center gap-1 md:flex">
              {navLinks.map((l) => (
                <Link
                  key={l.label}
                  href={l.href}
                  className="rounded-full px-4 py-2 text-sm font-medium text-mist-300 transition-all duration-300 ease-smooth hover:bg-white/[0.06] hover:text-white"
                >
                  {l.label}
                </Link>
              ))}
            </nav>
            <div className="flex flex-1 items-center justify-end gap-2 md:flex-none">
              <div className="hidden sm:block">
                <HeaderAuthButtons />
              </div>
              <Link
                href="/chat"
                className="inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-2 text-[13px] font-semibold text-black transition-all duration-300 ease-smooth hover:bg-mist-200 hover:shadow-glow active:scale-[0.97] sm:gap-2 sm:px-5 sm:text-sm"
              >
                <span className="hidden sm:inline">شروع </span>چت
                <Icon name="arrow-left" size={15} />
              </Link>
              <MobileMenu />
            </div>
          </div>
        </header>

        <main>{children}</main>

        <footer className="border-t border-white/5 bg-black">
          <div className="container-site grid gap-10 py-16 md:grid-cols-4">
            <div className="md:col-span-2">
              <Logo />
              <p className="mt-4 max-w-sm text-sm leading-7 text-mist-400">
                Azura AI پلتفرم ایرانی چت هوشمند و فروش کلید API مدل‌های هوش مصنوعی است — پرداخت
                ریالی، قیمت تومانی، پشتیبانی فارسی.
              </p>
            </div>
            <div>
              <h4 className="mb-3 text-sm font-bold text-white">محصول</h4>
              <ul className="space-y-2 text-sm text-mist-400">
                <li><Link className="transition hover:text-white" href="/models">مدل‌ها</Link></li>
                <li><Link className="transition hover:text-white" href="/chat">چت هوشمند</Link></li>
                <li><Link className="transition hover:text-white" href="/download">دانلود اپلیکیشن</Link></li>
                <li><Link className="transition hover:text-white" href="/#pricing">تعرفه‌ها</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="mb-3 text-sm font-bold text-white">پشتیبانی</h4>
              <ul className="space-y-2 text-sm text-mist-400">
                <li><Link className="transition hover:text-white" href="/#faq">سؤالات متداول</Link></li>
                <li><Link className="transition hover:text-white" href="/account">حساب کاربری</Link></li>
                <li><a className="transition hover:text-white" href="mailto:support@azuraai.ir">support@azuraai.ir</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-white/5">
            <div className="container-site flex flex-col items-center justify-between gap-5 py-6 sm:flex-row">
              <p className="text-xs text-mist-400">© ۱۴۰۵ Azura AI — همه حقوق محفوظ است.</p>
              <EnamadSeal />
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
