import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import Icon from "@/components/Icon";
import Reveal from "@/components/Reveal";
import type { IconName } from "@/components/Icon";

export const metadata: Metadata = {
  title: "دانلود اپلیکیشن اندروید — Azura AI",
  description:
    "اپلیکیشن رسمی Azura AI برای اندروید؛ چت با مدل‌های هوش مصنوعی، پیوست عکس، صدای فارسی و پرداخت به تومان. دانلود مستقیم و رایگان.",
  alternates: { canonical: "/download" },
  openGraph: {
    title: "دانلود اپلیکیشن اندروید — Azura AI",
    description: "چت هوشمند فارسی با GPT، Claude و Gemini — مستقیم روی گوشی اندرویدی شما.",
    url: "/download",
  },
};

const APK = "/downloads/azura-app.apk";
const APK_MB = "۳٫۸ مگابایت";

/**
 * Only claims the shipped build actually backs up — each one can be pointed
 * at in the screenshots below. The UI follows the phone's language (Persian or
 * English), and chat works in both.
 */
const features: { icon: IconName; title: string; desc: string }[] = [
  {
    icon: "bolt",
    title: "سه حالت پاسخ‌گویی",
    desc: "برای هر پیام حالت مناسب را انتخاب کنید: Fast برای جواب سریع، Deep thinking برای مسائل سخت و Research برای جست‌وجوی گسترده.",
  },
  {
    icon: "image",
    title: "عکس و دوربین",
    desc: "دکمه گالری یا دکمه دوربین را بزنید تا عکس را همراه پیامتان بفرستید — بدون نیاز به ذخیره‌سازی میانی.",
  },
  {
    icon: "mic",
    title: "نوشتن با میکروفون",
    desc: "دکمه میکروفون کنار کادر پیام، حرف‌زدن را به متن تبدیل می‌کند تا تایپ نکنید.",
  },
  {
    icon: "share",
    title: "کپی، بازتولید و اشتراک‌گذاری",
    desc: "زیر هر پاسخ، کپی، ساخت دوباره پاسخ، پسند و نپسند و اشتراک‌گذاری در یک ردیف جمع شده‌اند.",
  },
  {
    icon: "download",
    title: "خروجی گرفتن از گفتگو",
    desc: "دکمه دانلود در نوار بالا، کل مکالمه را به‌صورت فایل متنی ذخیره می‌کند.",
  },
  {
    icon: "chat",
    title: "تاریخچه گفتگوها",
    desc: "از منوی بالای صفحه بین مکالمه‌های قبلی جابه‌جا شوید و هر کدام را ادامه دهید.",
  },
  {
    icon: "globe",
    title: "پاسخ‌دهی به فارسی",
    desc: "پیامتان را فارسی یا انگلیسی بنویسید؛ مدل‌ها فارسی روان و بدون ترجمه ماشینی جواب می‌دهند.",
  },
  {
    icon: "key",
    title: "همان حساب سایت",
    desc: "با ایمیل و رمز حساب کاربری سایت وارد می‌شوید؛ نیازی به ساختن حساب جدید در اپ نیست.",
  },
];

/** Shots captured from the real app on a physical device (see scripts/capture-app-shots.js). */
const WELCOME = {
  src: "/images/app/welcome.webp",
  alt: "صفحه اصلی اپلیکیشن آزورا با پیشنهادهای آماده گفتگو",
};
const CONVERSATION = {
  src: "/images/app/conversation.webp",
  alt: "پاسخ یک مدل هوش مصنوعی در اپلیکیشن آزورا با دکمه‌های کپی و اشتراک‌گذاری",
};

const installNotes = [
  {
    q: "چطور فایل نصب را باز کنم؟",
    a: "بعد از دانلود، روی فایل APK بزنید. گوشی یک‌بار از شما اجازه «نصب از منابع ناشناس» می‌خواهد؛ آن را برای مرورگری که دانلود کرده فعال کنید و برگردید.",
  },
  {
    q: "چرا Play Protect هشدار می‌دهد؟",
    a: "این نسخه از کانال رسمی سایت عرضه می‌شود و در فروشگاه Google Play لیست نشده، پس گوشی هشدار می‌دهد. اگر نسخه را از همین صفحه دانلود کرده‌اید، می‌توانید نصب را ادامه دهید.",
  },
  {
    q: "برای چه نسخه‌ای از اندروید کار می‌کند؟",
    a: "اندروید ۷ به بالا. روی گوشی‌های قدیمی‌تر یا خیلی کم‌حافظه ممکن است اجرا نشود.",
  },
  {
    q: "بدون اینترنت کار می‌کند؟",
    a: "اپ برای گفتگو به اینترنت نیاز دارد، چون پاسخ‌ها روی سرورهای Azura پردازش می‌شوند. رابط کاربری و تاریخچه گفتگو به‌سرعت بارگذاری می‌شود.",
  },
  {
    q: "حساب کاربری جدا لازم دارد؟",
    a: "نه. اپ را باز کنید و مستقیم چت کنید — نه ثبت‌نام، نه ورود، نه محدودیت تعداد پیام.",
  },
  {
    q: "رابط کاربری فارسی است؟",
    a: "بله. رابط کاربری خودکار با زبان گوشی شما تنظیم می‌شود — فارسی یا انگلیسی — و هر زمان خواستید از بخش تنظیمات می‌توانید آن را عوض کنید. متن راست‌به‌چپ و جدول هم درست نمایش داده می‌شوند.",
  },
];

function DownloadButton({ className = "" }: { className?: string }) {
  return (
    <a href={APK} download="azura-app.apk" className={`btn-primary ${className}`}>
      <Icon name="download" size={16} />
      دانلود اپلیکیشن
    </a>
  );
}

/** Frames a screenshot in a phone body. */
function PhoneShot({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="relative mx-auto w-full max-w-[300px]">
      <div className="absolute -inset-6 rounded-[3rem] bg-white/[0.05] blur-2xl" aria-hidden />
      <div className="relative rounded-[2.2rem] border border-white/15 bg-ink-950 p-2 shadow-card">
        <div className="relative overflow-hidden rounded-[1.8rem] bg-black">
          <Image src={src} alt={alt} width={720} height={1444} className="h-auto w-full" />
        </div>
      </div>
    </div>
  );
}

export default function DownloadPage() {
  return (
    <div>
      {/* Hero */}
      <section className="hero-glow relative overflow-hidden">
        <div className="grid-lines absolute inset-0" aria-hidden />
        <div className="container-site relative grid items-center gap-14 py-20 lg:grid-cols-2 lg:py-28">
          <div className="text-center lg:text-right">
            <span className="badge animate-fade-up">
              <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-white" />
              اپلیکیشن رسمی اندروید
            </span>
            <h1 className="animate-fade-up mt-7 text-4xl font-black leading-[1.3] sm:text-5xl">
              <span className="gradient-text">دستیار هوشمند آزورا</span>
              <br />
              همیشه در جیب شما.
            </h1>
            <p className="animate-fade-up mt-6 text-base leading-8 text-mist-400 sm:text-lg">
              همان چت هوشمند سایت، حالا روی گوشی اندرویدی شما — با پیوست عکس، تایپ با میکروفون و
              سه حالت پاسخ‌گویی. رایگان، امضاشده با کلید رسمی آزورا، بدون نیاز به ارز خارجی.
            </p>

            <div className="animate-fade-up mt-9 flex flex-wrap items-center justify-center gap-3 lg:justify-start">
              <DownloadButton />
              <Link href="/chat" className="btn-ghost">
                قبلش توی سایت امتحان کن
                <Icon name="arrow-left" size={15} />
              </Link>
            </div>

            <div className="animate-fade-up mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-mist-400 lg:justify-start">
              <span>✓ اندروید ۷ به بالا</span>
              <span>✓ حجم {APK_MB}</span>
              <span>✓ رایگان</span>
            </div>
          </div>

          <Reveal delay={120}>
            <PhoneShot src={WELCOME.src} alt={WELCOME.alt} />
          </Reveal>
        </div>
      </section>

      {/* Screenshots */}
      <section className="container-site py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="section-title">اپ را در عمل ببینید</h2>
          <p className="section-sub">
            تصویرهای این صفحه واقعاً از خود اپ روی گوشی اندرویدی گرفته شده‌اند — نه طرح‌های تبلیغاتی.
          </p>
        </div>

        <div className="mt-14 grid items-center gap-12 lg:grid-cols-2">
          <Reveal>
            <PhoneShot src={CONVERSATION.src} alt={CONVERSATION.alt} />
          </Reveal>
          <Reveal delay={120}>
            <ul className="space-y-5">
              {[
                {
                  icon: "chat" as IconName,
                  title: "شروع سریع",
                  desc: "پیشنهادهای آماده بالای صفحه، با یک ضربه گفتگو را شروع می‌کنند.",
                },
                {
                  icon: "share" as IconName,
                  title: "پاسخ‌های قابل استفاده",
                  desc: "زیر هر پاسخ، دکمه‌های کپی، بازتولید، پسند و نپسند و اشتراک‌گذاری را می‌بینید.",
                },
                {
                  icon: "download" as IconName,
                  title: "خروجی گرفتن از گفتگو",
                  desc: "دکمه دانلود در بالای صفحه، کل مکالمه را به‌صورت فایل متنی ذخیره می‌کند.",
                },
              ].map((item) => (
                <li key={item.title} className="card flex gap-4 p-5">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/[0.04] text-white">
                    <Icon name={item.icon} size={18} />
                  </span>
                  <div>
                    <h3 className="text-sm font-bold text-white">{item.title}</h3>
                    <p className="mt-1.5 text-[13px] leading-7 text-mist-400">{item.desc}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>

      {/* Features */}
      <section className="container-site py-20">
        <div className="mx-auto max-w-2xl text-center">
          <span className="badge">قابلیت‌ها</span>
          <h2 className="section-title mt-5">در اپ چه چیزی دارید</h2>
        </div>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f, i) => (
            <Reveal key={f.title} delay={(i % 4) * 80}>
              <article className="card card-hover h-full p-6">
                <span className="grid h-11 w-11 place-items-center rounded-2xl border border-white/10 bg-white/[0.04] text-white">
                  <Icon name={f.icon} size={19} />
                </span>
                <h3 className="mt-5 text-sm font-bold text-white">{f.title}</h3>
                <p className="mt-2.5 text-[13px] leading-7 text-mist-400">{f.desc}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Install notes */}
      <section className="container-site py-20">
        <div className="mx-auto max-w-2xl text-center">
          <span className="badge">قبل از نصب</span>
          <h2 className="section-title mt-5">سؤال‌های رایج نصب</h2>
        </div>

        <div className="mx-auto mt-12 max-w-3xl space-y-4">
          {installNotes.map((item, i) => (
            <Reveal key={item.q} delay={i * 70}>
              <details className="card group p-6 transition-colors duration-300">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-bold text-white [&::-webkit-details-marker]:hidden">
                  {item.q}
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/10 text-mist-300 transition-transform duration-500 ease-smooth group-open:rotate-45">
                    <Icon name="plus" size={15} />
                  </span>
                </summary>
                <p className="mt-3 text-sm leading-8 text-mist-400">{item.a}</p>
              </details>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="container-site pb-28">
        <Reveal>
          <div className="card relative overflow-hidden p-10 text-center sm:p-16">
            <div className="grid-lines absolute inset-0" aria-hidden />
            <div className="relative">
              <span className="badge">آماده‌اید؟</span>
              <h2 className="section-title mt-5">همین حالا نصب کنید</h2>
              <p className="section-sub mx-auto">
                حجم فایل فقط {APK_MB} است — روی اینترنت موبایل هم در چند ثانیه دانلود می‌شود.
              </p>
              <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
                <DownloadButton />
                <Link href="/#pricing" className="btn-ghost">
                  دیدن تعرفه‌ها
                </Link>
              </div>
              <p className="mt-7 text-xs text-mist-400">
                سؤالی درباره نصب دارید؟{" "}
                <a className="text-white underline-offset-4 hover:underline" href="mailto:support@azuraai.ir">
                  support@azuraai.ir
                </a>
              </p>
            </div>
          </div>
        </Reveal>
      </section>
    </div>
  );
}