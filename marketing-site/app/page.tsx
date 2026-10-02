import Link from "next/link";
import { plans, features, processSteps, outcomes, testimonials, faqs, blogPosts } from "@/lib/data";
import Toman from "@/components/Toman";
import Icon from "@/components/Icon";
import Reveal from "@/components/Reveal";

const logos = ["OpenAI", "Anthropic", "Google", "Meta", "Mistral", "DeepSeek", "Qwen", "xAI"];

function FaqItem({ q, a }: { q: string; a: string }) {
  return (
    <details className="card group p-6 transition-colors duration-300">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-bold text-white [&::-webkit-details-marker]:hidden">
        {q}
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/10 text-mist-300 transition-transform duration-500 ease-smooth group-open:rotate-45">
          <Icon name="plus" size={15} />
        </span>
      </summary>
      <p className="mt-3 text-sm leading-8 text-mist-400">{a}</p>
    </details>
  );
}

export default function Home() {
  return (
    <div>
      {/* Hero */}
      <section className="hero-glow relative overflow-hidden">
        <div className="grid-lines absolute inset-0" aria-hidden />
        <div className="container-site relative flex flex-col items-center py-28 text-center sm:py-36">
          <span className="badge animate-fade-up">
            <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse-soft" />
            بدون تحریم — دسترسی کامل به همه مدل‌ها
          </span>
          <h1 className="animate-fade-up mt-7 max-w-3xl text-4xl font-black leading-[1.3] sm:text-6xl sm:leading-[1.25]">
            <span className="gradient-text">یک دستیار هوشمند</span>
            <br />
            برای همه کارهای شما.
          </h1>
          <p className="animate-fade-up mt-6 max-w-2xl text-lg leading-9 text-mist-400">
            با Azura AI با GPT، Claude، Gemini و ده‌ها مدل دیگر به فارسی حرف بزنید — یا با یک کلید
            API به تومان شارژ شده، در محصول خودتان از آن‌ها استفاده کنید.
          </p>
          <div className="animate-fade-up mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link href="/chat" className="btn-primary">
              شروع رایگان چت
              <Icon name="arrow-left" size={16} />
            </Link>
            <Link href="/models" className="btn-ghost">
              مشاهده مدل‌ها
            </Link>
          </div>
          <div className="animate-fade-up mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-mist-400">
            <span>✓ بدون نیاز به کارت ارزی</span>
            <span>✓ پرداخت ریالی</span>
            <span>✓ پشتیبانی فارسی</span>
          </div>

          {/* Hero chat preview */}
          <Reveal className="mt-16 w-full max-w-2xl" delay={150}>
            <div className="card overflow-hidden text-right">
              <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-white/70" />
                  <span className="text-xs font-bold text-mist-200">Azura — مدل: GPT-4o</span>
                </div>
                <span className="text-[10px] text-mist-400">۱۴۰۵/۰۶/۲۲</span>
              </div>
              <div className="space-y-4 p-5">
                <div className="flex justify-start">
                  <div className="max-w-[80%] rounded-3xl rounded-ss-lg bg-ink-700 px-4 py-3 text-sm leading-7 text-mist-100">
                    یه خلاصه دو خطی از این گزارش برام بنویس.
                  </div>
                </div>
                <div className="flex justify-end">
                  <div className="max-w-[80%] rounded-3xl rounded-ee-lg border border-white/10 bg-white/[0.06] px-4 py-3 text-sm leading-7 text-white">
                    حتماً! این هم خلاصه دو خطی گزارش شما: فروش سه ماه اول ۴۲٪ رشد کرده و بیشترین
                    سهم از کانال موبایل است. پیشنهاد می‌شود بودجه تبلیغات موبایل افزایش یابد.
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-ink-900 px-4 py-3 text-xs text-mist-400">
                  <span>پیام بنویسید…</span>
                  <span className="ms-auto grid h-7 w-7 place-items-center rounded-full bg-white text-black">
                    <Icon name="arrow-left" size={13} />
                  </span>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Logos marquee */}
      <section className="border-y border-white/5 bg-black py-12">
        <p className="container-site text-center text-xs font-medium tracking-widest text-mist-400">
          دسترسی به بهترین مدل‌های دنیا با یک کلید
        </p>
        <div className="mt-7 overflow-hidden [mask-image:linear-gradient(to_left,transparent,black_15%,black_85%,transparent)]">
          <div className="flex w-max animate-marquee gap-16 px-8">
            {[...logos, ...logos].map((logo, i) => (
              <span key={i} className="text-xl font-black tracking-tight text-mist-400/60 transition hover:text-white">
                {logo}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Process */}
      <section className="container-site py-28">
        <Reveal className="text-center">
          <span className="badge">مراحل</span>
          <h2 className="section-title mt-5">ساده، سریع، ریالی.</h2>
          <p className="section-sub mx-auto">
            چهار قدم تا استفاده از قدرتمندترین مدل‌های هوش مصنوعی — بدون کارت ارزی و واسطه.
          </p>
        </Reveal>
        <div className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {processSteps.map((s, i) => (
            <Reveal key={s.step} delay={i * 80}>
              <div className="card card-hover h-full p-6">
                <span className="grid h-11 w-11 place-items-center rounded-2xl border border-white/10 bg-white/[0.04] text-sm font-black text-white">
                  {s.step}
                </span>
                <h3 className="mt-5 text-base font-bold text-white">{s.title}</h3>
                <p className="mt-2 text-sm leading-7 text-mist-400">{s.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="border-y border-white/5 bg-black py-28">
        <div className="container-site">
          <Reveal className="text-center">
            <span className="badge">امکانات</span>
            <h2 className="section-title mt-5">همه چیز در یک پلتفرم.</h2>
            <p className="section-sub mx-auto">
              از چت روزمره تا API سازمانی — Azura هر آنچه برای کار با هوش مصنوعی نیاز دارید.
            </p>
          </Reveal>
          <div className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f, i) => (
              <Reveal key={f.title} delay={i * 70}>
                <div className="card card-hover h-full p-7">
                  <span className="grid h-11 w-11 place-items-center rounded-2xl border border-white/10 bg-white/[0.04] text-white">
                    <Icon name={f.icon} size={20} />
                  </span>
                  <h3 className="mt-5 text-base font-bold text-white">{f.title}</h3>
                  <p className="mt-2 text-sm leading-7 text-mist-400">{f.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Outcomes / testimonials */}
      <section className="container-site py-28">
        <Reveal className="text-center">
          <span className="badge">نتایج کاربران</span>
          <h2 className="section-title mt-5">تیم‌هایی که با Azura سریع‌تر می‌سازند.</h2>
          <p className="section-sub mx-auto">
            از استارتاپ‌ها تا تیم‌های محصول — تجربه واقعی کاربران Azura AI.
          </p>
        </Reveal>
        <div className="mt-16 grid gap-4 sm:grid-cols-3">
          {outcomes.map((o, i) => (
            <Reveal key={o.label} delay={i * 90}>
              <div className="card card-hover p-7 text-center">
                <div className="gradient-text text-4xl font-black">{o.stat}</div>
                <div className="mt-2 text-sm text-mist-400">{o.label}</div>
              </div>
            </Reveal>
          ))}
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {testimonials.map((t, i) => (
            <Reveal key={t.name} delay={i * 90}>
              <figure className="card card-hover h-full p-7">
                <blockquote className="text-sm leading-8 text-mist-100">«{t.quote}»</blockquote>
                <figcaption className="mt-4 text-xs text-mist-400">
                  <span className="font-bold text-white">{t.name}</span> — {t.role}
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="border-y border-white/5 bg-black py-28">
        <div className="container-site">
          <Reveal className="text-center">
            <span className="badge">تعرفه‌ها</span>
            <h2 className="section-title mt-5">پلن مناسب کسب‌وکار شما.</h2>
            <p className="section-sub mx-auto">
              قیمت‌ها به تومان و ریالی؛ هر وقت خواستید می‌توانید پلن را عوض کنید یا لغو کنید.
            </p>
          </Reveal>
          <div className="mt-16 grid gap-4 lg:grid-cols-3">
            {plans.map((plan, i) => (
              <Reveal key={plan.id} delay={i * 100}>
                <div
                  className={`card card-hover relative h-full p-8 ${
                    plan.popular ? "border-white/30 bg-ink-850" : ""
                  }`}
                >
                  {plan.popular && (
                    <span className="absolute -top-3 start-8 rounded-full bg-white px-3.5 py-1 text-[10px] font-black text-black">
                      پرطرفدارترین
                    </span>
                  )}
                  <h3 className="text-lg font-black text-white">{plan.name}</h3>
                  <p className="mt-2 min-h-12 text-sm leading-7 text-mist-400">{plan.tagline}</p>
                  <div className="mt-6 flex items-baseline gap-2">
                    <Toman value={plan.monthly} suffix="تومان / ماهانه" />
                  </div>
                  <div className="mt-1 text-xs text-mist-400">
                    پرداخت سالانه: {plan.yearly.toLocaleString("fa-IR")} تومان در ماه (۱۵٪ تخفیف)
                  </div>
                  <Link
                    href="/account/subscription"
                    className={`mt-7 w-full ${plan.popular ? "btn-primary" : "btn-ghost"}`}
                  >
                    {plan.cta}
                  </Link>
                  <ul className="mt-7 space-y-3.5 border-t border-white/5 pt-7">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2.5 text-sm text-mist-100">
                        <span className="mt-0.5 text-white">
                          <Icon name="check" size={15} />
                        </span>
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            ))}
          </div>
          <p className="mt-8 text-center text-xs text-mist-400">
            خرید اشتراک با کیف پول تومانی • تمدید خودکار ۳۰ روزه • ارتقا در هر زمان
          </p>
        </div>
      </section>

      {/* Blog */}
      <section className="container-site py-28">
        <Reveal className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="badge">وبلاگ</span>
            <h2 className="section-title mt-5">آخرین مقاله‌ها و راهنماها.</h2>
          </div>
          <Link href="/#blog" className="btn-ghost !py-2.5 !text-xs">
            مشاهده همه
          </Link>
        </Reveal>
        <div className="mt-12 grid gap-4 sm:grid-cols-3">
          {blogPosts.map((p, i) => (
            <Reveal key={p.title} delay={i * 90}>
              <article className="card card-hover group h-full p-7">
                <span className="badge">{p.tag}</span>
                <h3 className="mt-5 text-base font-bold leading-7 text-white">{p.title}</h3>
                <p className="mt-2 text-sm leading-7 text-mist-400">{p.excerpt}</p>
                <div className="mt-6 flex items-center justify-between text-xs text-mist-400">
                  <span>{p.author}</span>
                  <span className="flex items-center gap-1.5">
                    {p.read} مطالعه
                    <span className="transition-transform duration-300 ease-smooth group-hover:-translate-x-1">
                      <Icon name="arrow-left" size={13} />
                    </span>
                  </span>
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="border-y border-white/5 bg-black py-28">
        <div className="container-site grid gap-14 lg:grid-cols-2">
          <Reveal>
            <span className="badge">سؤالات متداول</span>
            <h2 className="section-title mt-5">هر سوالی داری، جوابش اینجاست.</h2>
            <p className="section-sub">
              جواب رایج‌ترین سؤال‌ها را جمع کرده‌ایم. چیزی پیدانکردی؟ تیم پشتیبانی فارسی ما آماده
              کمک است.
            </p>
            <a href="mailto:support@azuraai.ir" className="btn-ghost mt-8">
              تماس با پشتیبانی
            </a>
          </Reveal>
          <div className="space-y-3">
            {faqs.map((f, i) => (
              <Reveal key={f.q} delay={i * 50}>
                <FaqItem q={f.q} a={f.a} />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="hero-glow relative overflow-hidden">
        <div className="container-site relative py-32 text-center">
          <Reveal>
            <h2 className="section-title">همین امروز با Azura شروع کنید.</h2>
            <p className="section-sub mx-auto text-center">
              حساب بساز، شارژ کن به تومان، و اولین پیام را بفرست. کل فرآیند کمتر از دو دقیقه.
            </p>
            <div className="mt-9 flex flex-wrap justify-center gap-3">
              <Link href="/chat" className="btn-primary">
                شروع رایگان
                <Icon name="arrow-left" size={16} />
              </Link>
              <Link href="/#pricing" className="btn-ghost">
                دیدن تعرفه‌ها
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
    </div>
  );
}
