// Central data for Azura AI — prices in Toman, all copy in Persian.
// Later these can be fetched from your backend instead of being hard-coded.

import type { IconName } from "@/components/Icon";

export type Plan = {
  id: string;
  name: string;
  tagline: string;
  monthly: number; // Toman
  yearly: number; // Toman per month, billed yearly
  cta: string;
  popular?: boolean;
  features: string[];
};

export const plans: Plan[] = [
  {
    id: "basic",
    name: "پایه",
    tagline: "برای شروع با مدل‌های سریع و اقتصادی",
    monthly: 199000,
    yearly: 169000,
    cta: "شروع کنید",
    features: [
      "۳۰۰ پیام در ماه",
      "۱ میلیون توکن ورودی / ۵۰۰ هزار خروجی",
      "مدل‌های اقتصادی: GPT-5.6 Luna، GLM Flash، Qwen Flash، Nemotron Lightning",
      "۴٬۰۰۰ توکن خروجی در هر درخواست · کانتکست ۳۲ هزار",
      "۵ درخواست در دقیقه",
      "خرید با کیف پول تومانی",
    ],
  },
  {
    id: "plus",
    name: "پلاس",
    tagline: "برای کاربران جدی و تیم‌های کوچک",
    monthly: 499000,
    yearly: 424000,
    cta: "خرید اشتراک پلاس",
    popular: true,
    features: [
      "۱٬۰۰۰ پیام در ماه",
      "۵ میلیون توکن ورودی / ۲ میلیون خروجی",
      "همه مدل‌های پایه + Claude Sonnet 5، GPT-5.6 Terra، Grok 4.6، Qwen Max",
      "سهمیه پریمیوم: ۱۰۰ درخواست Sonnet، ۱۰۰ درخواست Grok در ماه",
      "۸٬۰۰۰ توکن خروجی در هر درخواست · کانتکست ۱۲۸ هزار · ۱۵ درخواست/دقیقه",
      "اولویت بالا در پردازش",
    ],
  },
  {
    id: "scale",
    name: "سازمانی",
    tagline: "برای شرکت‌ها با مصرف سنگین",
    monthly: 1299000,
    yearly: 1096000,
    cta: "خرید اشتراک سازمانی",
    features: [
      "۲٬۵۰۰ پیام در ماه",
      "۱۵ میلیون توکن ورودی / ۶ میلیون خروجی",
      "همه مدل‌های پلاس + Claude Opus 5، GPT-5.6 Sol، Kimi K3",
      "سهمیه پریمیوم: ۴۰۰ Sonnet · ۵۰ Opus · ۵۰ Sol · ۳۰۰ Grok · ۱۰۰ Kimi",
      "۱۶٬۰۰۰ توکن خروجی در هر درخواست · کانتکست ۲۰۰ هزار · ۳۰ درخواست/دقیقه",
      "بالاترین اولویت در پردازش",
    ],
  },
];

export type Model = {
  id: string;
  name: string;
  vendor: string;
  context: string;
  inputToman: number; // per 1M tokens
  outputToman: number; // per 1M tokens
  tags: string[];
  free?: boolean;
  desc: string;
};

export const models: Model[] = [
  {
    id: "azura/gpt-4o",
    name: "GPT-4o",
    vendor: "OpenAI",
    context: "۱۲۸ هزار توکن",
    inputToman: 3200000,
    outputToman: 6400000,
    tags: ["چت", "کدنویسی", "چندوجهی"],
    desc: "مدل پرچمدار سریع OpenAI برای گفتگو، تحلیل تصویر و کدنویسی.",
  },
  {
    id: "azura/gpt-4o-mini",
    name: "GPT-4o mini",
    vendor: "OpenAI",
    context: "۱۲۸ هزار توکن",
    inputToman: 190000,
    outputToman: 380000,
    tags: ["چت", "اقتصادی"],
    desc: "سبک، سریع و بسیار ارزان؛ مناسب چت‌بات‌های پرترافیک.",
  },
  {
    id: "azura/o1-preview",
    name: "o1-preview",
    vendor: "OpenAI",
    context: "۱۲۸ هزار توکن",
    inputToman: 19000000,
    outputToman: 76000000,
    tags: ["استدلال", "ریاضی"],
    desc: "مدل استدلالی برای مسائل پیچیده ریاضی، علمی و برنامه‌نویسی.",
  },
  {
    id: "azura/claude-3.5-sonnet",
    name: "Claude 3.5 Sonnet",
    vendor: "Anthropic",
    context: "۲۰۰ هزار توکن",
    inputToman: 2520000,
    outputToman: 12600000,
    tags: ["چت", "کدنویسی", "تحلیل"],
    desc: "نوشتن و تحلیل سطح بالا با کیفیت خروجی فوق‌العاده.",
  },
  {
    id: "azura/claude-3-haiku",
    name: "Claude 3 Haiku",
    vendor: "Anthropic",
    context: "۲۰۰ هزار توکن",
    inputToman: 210000,
    outputToman: 1050000,
    tags: ["چت", "اقتصادی"],
    desc: "سریع‌ترین مدل Anthropic برای پاسخ‌های لحظه‌ای.",
  },
  {
    id: "azura/gemini-1.5-pro",
    name: "Gemini 1.5 Pro",
    vendor: "Google",
    context: "۲ میلیون توکن",
    inputToman: 672000,
    outputToman: 2690000,
    tags: ["چت", "کارتان بالا", "چندوجهی"],
    desc: "کارتان عظیم برای تحلیل اسناد طولانی و ویدئو.",
  },
  {
    id: "azura/gemini-flash",
    name: "Gemini Flash",
    vendor: "Google",
    context: "۱ میلیون توکن",
    inputToman: 80000,
    outputToman: 320000,
    tags: ["اقتصادی", "سریع"],
    desc: "تعادل عالی بین سرعت، قیمت و کیفیت برای کارهای روزمره.",
  },
  {
    id: "azura/llama-3.1-405b",
    name: "Llama 3.1 405B",
    vendor: "Meta",
    context: "۱۳۱ هزار توکن",
    inputToman: 1680000,
    outputToman: 1680000,
    tags: ["متن‌باز", "چت"],
    desc: "قدرتمندترین مدل متن‌باز؛ بدون سانسور سازنده اصلی.",
  },
  {
    id: "azura/mistral-large",
    name: "Mistral Large",
    vendor: "Mistral AI",
    context: "۱۲۸ هزار توکن",
    inputToman: 1120000,
    outputToman: 3360000,
    tags: ["چت", "اروپایی"],
    desc: "مدل پرچمدار اروپایی با عملکرد نزدیک به GPT-4.",
  },
  {
    id: "azura/deepseek-v3",
    name: "DeepSeek V3",
    vendor: "DeepSeek",
    context: "۶۴ هزار توکن",
    inputToman: 120000,
    outputToman: 480000,
    tags: ["کدنویسی", "اقتصادی"],
    desc: "انتخاب اول برنامه‌نویسان؛ کیفیت بالا با قیمت بسیار پایین.",
  },
  {
    id: "azura/qwen-2.5-72b",
    name: "Qwen 2.5 72B",
    vendor: "Alibaba",
    context: "۱۳۱ هزار توکن",
    inputToman: 190000,
    outputToman: 570000,
    tags: ["چندزبانه", "متن‌باز"],
    desc: "عملکرد قوی در زبان فارسی و زبان‌های آسیایی.",
  },
  {
    id: "azura/embed-bge",
    name: "BGE Embedding",
    vendor: "BAAI",
    context: "۸ هزار توکن",
    inputToman: 40000,
    outputToman: 0,
    tags: ["جستجو", "Embedding"],
    free: true,
    desc: "برداری‌سازی متن برای جستجوی معنایی و RAG.",
  },
];

export const vendors = ["همه", "OpenAI", "Anthropic", "Google", "Meta", "Mistral AI", "DeepSeek", "Alibaba", "BAAI"];

export type Feature = { icon: IconName; title: string; desc: string };

export const features: Feature[] = [
  {
    icon: "key",
    title: "کلید API ریالی",
    desc: "کلید API بخرید، به تومان شارژ کنید و از همه مدل‌های جهانی بدون تحریم و ارز خارجی استفاده کنید.",
  },
  {
    icon: "chat",
    title: "چت هوشمند فارسی",
    desc: "گفتگو با مدل‌های برتر، با رابط کاملاً فارسی، راست‌به‌چپ و پشتیبانی کامل از زبان فارسی.",
  },
  {
    icon: "bolt",
    title: "پاسخ لحظه‌ای",
    desc: "زیرساخت سریع با پاسخ‌دهی زیر یک ثانیه؛ مناسب چت‌بات‌ها و اپلیکیشن‌های پرترافیک.",
  },
  {
    icon: "brain",
    title: "حافظه و شخصی‌سازی",
    desc: "مدل‌ها سبک کار شما را یاد می‌گیرند و پاسخ‌ها هر بار دقیق‌تر و شخصی‌تر می‌شود.",
  },
  {
    icon: "shield",
    title: "امنیت و حریم خصوصی",
    desc: "داده‌های شما رمزنگاری می‌شود؛ مکالمات شما هرگز برای آموزش مدل‌ها استفاده نمی‌شود.",
  },
  {
    icon: "chart",
    title: "داشبورد مصرف",
    desc: "مصرف کلیدها را توکن‌به‌توکن ببینید، بودجه تعیین کنید و هزینه‌ها را کنترل کنید.",
  },
];

export const processSteps = [
  { step: "۱", title: "ثبت‌نام کنید", desc: "در کمتر از یک دقیقه حساب Azura بسازید — فقط ایمیل و شماره موبایل." },
  { step: "۲", title: "کلید بگیرید", desc: "کلید API خود را بسازید یا مستقیم وارد چت هوشمند شوید." },
  { step: "۳", title: "به تومان شارژ کنید", desc: "با درگاه بانکی ایرانی شارژ کنید؛ بدون ارز، بدون دردسر." },
  { step: "۴", title: "بسازید و لذت ببرید", desc: "به همه مدل‌های GPT، Claude، Gemini و بیشتر با یک کلید وصل شوید." },
];

export const outcomes = [
  { stat: "۹۸٪", label: "رضایت کاربران از کیفیت پاسخ‌ها" },
  { stat: "۱۰ برابر", label: "ارزان‌تر از خرید مستقیم ارزی" },
  { stat: "۲۴/۷", label: "پشتیبانی فارسی، حتی آخر هفته" },
];

export const testimonials = [
  {
    quote: "با Azura بالاخره بدون تحریم به GPT-4 وصل شدیم. یک کلید، همه مدل‌ها.",
    name: "سارا محمدی",
    role: "بنیان‌گذار استارتاپ آموزشی",
  },
  {
    quote: "چت فارسی Azura از خیلی رقبای خارجی بهتر فهمیده است چی می‌خواهم.",
    name: "امیر رضایی",
    role: "توسعه‌دهنده ارشد",
  },
  {
    quote: "داشبورد مصرف، هزینه تیم ما را دقیقاً نصف کرد.",
    name: "نگار کریمی",
    role: "مدیر محصول",
  },
];

export type Faq = { q: string; a: string };

export const faqs: Faq[] = [
  {
    q: "Azura AI چطور کار می‌کند؟",
    a: "شما ثبت‌نام می‌کنید، حساب خود را به تومان شارژ می‌کنید و بعد یا در چت هوشمند گفتگو می‌کنید یا با کلید API به مدل‌های مختلف وصل می‌شوید. هزینه بر اساس مصرف توکن محاسبه می‌شود.",
  },
  {
    q: "آیا می‌توانم مدل‌ها را یاد بگیرم سلیقه من باشند؟",
    a: "بله. با فعال بودن حافظه، مدل‌ها سبک کار، لحن و ترجیحات شما را یاد می‌گیرند و پاسخ‌ها شخصی‌تر می‌شود.",
  },
  {
    q: "چه مدل‌هایی در دسترس هستند؟",
    a: "مدل‌های OpenAI، Anthropic، Google، Meta، Mistral، DeepSeek و بیشتر — همه از طریق یک کلید واحد Azura. لیست کامل در صفحه «مدل‌ها» است.",
  },
  {
    q: "اطلاعات من امن است؟",
    a: "بله. ارتباطات رمزنگاری می‌شود، کلیدها فقط یک بار نمایش داده می‌شوند و مکالمات شما برای آموزش مدل‌ها استفاده نمی‌شود.",
  },
  {
    q: "پرداخت چطور انجام می‌شود؟",
    a: "کاملاً ریالی و به تومان با درگاه بانکی ایرانی؛ شارژ حساب، خرید اشتراک و تمدید همه بدون نیاز به ارز خارجی.",
  },
  {
    q: "اگر از API استفاده کنم چقدر طول می‌کشد؟",
    a: "اکثر پاسخ‌ها در چند ثانیه آماده می‌شوند. مدل‌های استدلالی ممکن است کمی بیشتر طول بکشند اما زیرساخت ما بهینه است.",
  },
];

export const blogPosts = [
  {
    tag: "معرفی محصول",
    title: "چطور Azura کلید API را برای ایرانی‌ها ساده کرد",
    excerpt: "ما مسیر دسترسی به مدل‌های جهانی را به یک کلید و یک درگاه بانکی ایرانی خلاصه کردیم.",
    author: "تیم Azura",
    read: "۴ دقیقه",
  },
  {
    tag: "راهنما",
    title: "۱۰ ترفند چت هوشمند که بهره‌وری شما را دو برابر می‌کند",
    excerpt: "از پرامپت‌های سیستم تا حافظه مکالمه — بهترین روش‌های کار با مدل‌ها.",
    author: "تیم Azura",
    read: "۷ دقیقه",
  },
  {
    tag: "تحلیل",
    title: "مقایسه قیمت مدل‌ها: کدام مدل برای چه کاری؟",
    excerpt: "راهنمای انتخاب مدل بر اساس بودجه و نوع کار، با جدول قیمت تومانی.",
    author: "تیم Azura",
    read: "۵ دقیقه",
  },
];

export const navLinks = [
  { href: "/", label: "خانه" },
  { href: "/models", label: "مدل‌ها" },
  { href: "/chat", label: "چت هوشمند" },
  { href: "/#pricing", label: "تعرفه‌ها" },
  { href: "/#faq", label: "سؤالات" },
];
