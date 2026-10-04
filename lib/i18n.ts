/**
 * App locale data and detection — pure logic, no React.
 *
 * Kept JSX-free so it can be unit tested directly under Jest. The React
 * provider lives in components/app/i18n-provider.tsx.
 *
 * Why a hand-rolled layer at all: the app ships as a prebuilt APK with no
 * install step for users, so the locale system has to be plain TypeScript with
 * zero new dependencies.
 *
 * Detection order:
 *   1. an explicit choice the user made in Settings (persisted)
 *   2. the device language (navigator.language / navigator.languages)
 *   3. English
 *
 * Persian (and Persian-script locales) map to 'fa' and flip the document to
 * RTL; everything else stays LTR.
 */

export type Locale = 'fa' | 'en'

/** Locales that should render in Persian / RTL. */
const PERSIAN_LOCALE_PREFIXES = ['fa', 'fa-ir', 'fa-af', 'ps', 'tg', 'prs', 'uz-af']
const STORAGE_KEY = 'azura-locale'

/** Arabic/Persian/Urdu codepoint ranges, used for RTL detection. */
export const RTL_RE =
  /[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/

/**
 * Same range, global, for counting. A non-global regex makes String.match
 * return a single-element array, which would silently cap the RTL count at 1.
 */
const RTL_COUNT_RE = new RegExp(RTL_RE.source, 'g')

/** True when a user-typed string looks Persian/Arabic script. */
export function looksPersian(text: string): boolean {
  return RTL_RE.test(text)
}

/**
 * True when the text has more RTL than Latin letters. Counting (rather than
 * just testing presence) means an English sentence quoting one Persian word
 * stays LTR, and vice versa.
 */
export function hasRtlMajority(text: string): boolean {
  const rtl = (text.match(RTL_COUNT_RE) ?? []).length
  const latin = (text.match(/[A-Za-z]/g) ?? []).length
  return rtl > latin
}

function normalize(tag: string): string {
  return tag.toLowerCase().replace('_', '-')
}

export function localeFromLanguageTag(tag: string | undefined | null): Locale {
  if (!tag) return 'en'
  const t = normalize(tag)
  if (PERSIAN_LOCALE_PREFIXES.some((p) => t === p || t.startsWith(`${p}-`))) return 'fa'
  return 'en'
}

/** Best guess at the user's language from the device, ignoring any stored choice. */
export function detectDeviceLocale(): Locale {
  if (typeof navigator === 'undefined') return 'en'
  const tags = navigator.languages?.length ? navigator.languages : [navigator.language]
  // Any Persian tag anywhere in the list wins: many Iranian devices report
  // e.g. ["en-US", "fa-IR"] and should still get Persian.
  for (const tag of tags) {
    if (tag && localeFromLanguageTag(tag) === 'fa') return 'fa'
  }
  return localeFromLanguageTag(tags[0]) ?? 'en'
}

export function readStoredLocale(): Locale | null {
  if (typeof window === 'undefined') return null
  try {
    const v = window.localStorage.getItem(STORAGE_KEY)
    return v === 'fa' || v === 'en' ? v : null
  } catch {
    return null
  }
}

export function writeStoredLocale(locale: Locale): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, locale)
  } catch {
    // private mode — detection still works for this session
  }
}

/** Manual override, falling back to device detection. */
export function resolveLocale(): Locale {
  return readStoredLocale() ?? detectDeviceLocale()
}

/**
 * Keys are grouped by screen. `en` is the reference text; `fa` is written the
 * way a native speaker would say it rather than a literal translation.
 */
export const STRINGS = {
  // ── Chat header ─────────────────────────────────────────────────────────
  'chat.title': { fa: 'آزورا', en: 'Azura' },
  'chat.mode.fast': { fa: 'سریع', en: 'Fast' },
  'chat.mode.thinking': { fa: 'تفکر عمیق', en: 'Deep thinking' },
  'chat.mode.research': { fa: 'جست‌وجو', en: 'Research' },
  'chat.export': { fa: 'خروجی گفتگو', en: 'Export conversation' },
  'chat.newChat': { fa: 'گفتگوی جدید', en: 'New chat' },
  'chat.menu': { fa: 'منو', en: 'Menu' },
  'chat.stop': { fa: 'توقف', en: 'Stop' },
  'chat.send': { fa: 'ارسال', en: 'Send' },
  'chat.placeholder': { fa: 'پیام به آزورا…', en: 'Message Azura…' },
  'chat.placeholderResearch': {
    fa: 'هرچه بپرسی، در وب جست‌وجو می‌کنم…',
    en: 'Ask anything — I will search the web…',
  },
  'chat.placeholderImage': {
    fa: 'درباره این عکس بپرس…',
    en: 'Ask about this image…',
  },
  'chat.startDictation': { fa: 'شروع تایپ صوتی', en: 'Start dictation' },
  'chat.stopDictation': { fa: 'توقف تایپ صوتی', en: 'Stop dictation' },
  'chat.listening': { fa: 'در حال گوش دادن…', en: 'Listening…' },
  'chat.voice': { fa: 'تایپ با صدا', en: 'Voice input' },
  'chat.attach': { fa: 'پیوست عکس', en: 'Attach image' },
  'chat.camera': { fa: 'دوربین', en: 'Take a photo' },
  'chat.thinking': { fa: 'در حال فکر کردن…', en: 'Thinking…' },
  'chat.searching': { fa: 'در حال جست‌وجو…', en: 'Searching…' },
  'chat.reading': { fa: 'در حال خواندن منابع…', en: 'Reading sources…' },
  'chat.planning': { fa: 'در حال برنامه‌ریزی…', en: 'Planning…' },
  'chat.writing': { fa: 'در حال نوشتن…', en: 'Writing…' },
  'chat.disclaimer': {
    fa: 'آزورا ممکن است اشتباه کند — اطلاعات مهم را بررسی کنید.',
    en: 'Azura can make mistakes — verify important info.',
  },
  'chat.demoBadge': { fa: 'حالت نمایشی', en: 'Demo mode' },
  'chat.undo': { fa: 'برگشت', en: 'Undo' },
  'chat.deleted': { fa: 'حذف شد', en: 'Deleted' },
  'chat.copy': { fa: 'کپی', en: 'Copy' },
  'chat.copied': { fa: 'کپی شد', en: 'Copied' },
  'chat.share': { fa: 'اشتراک‌گذاری', en: 'Share' },
  'chat.regenerate': { fa: 'بازتولید', en: 'Regenerate' },
  'chat.listen': { fa: 'خواندن با صدا', en: 'Read aloud' },
  'chat.sources': { fa: 'منابع', en: 'Sources' },
  'chat.emptyTitle': { fa: 'سلام، من آزورا هستم', en: 'Hey, I am Azura' },
  'chat.emptyFast': {
    fa: 'جواب‌های سریع، با مدل‌های رایگان.',
    en: 'Quick answers, powered by free models.',
  },
  'chat.emptyThinking': {
    fa: 'در حین فکر کردن، استدلالم را نشان می‌دهم.',
    en: 'I will show my reasoning as I think.',
  },
  'chat.emptyResearch': {
    fa: 'برنامه‌ریزی می‌کنم، در وب جست‌وجو می‌کنم و منابع را می‌آورم.',
    en: 'I will plan, search the web, and cite sources.',
  },
  'chat.limitReached': {
    fa: 'سقف پیام امروزت تمام شده. فردا دوباره سر بزن.',
    en: "You have reached today's message limit. Try again tomorrow.",
  },

  // ── Suggestions (per mode) ─────────────────────────────────────────────
  'sug.fast.0': {
    fa: 'یک شعر کوتاه درباره باران بگو',
    en: 'Explain quantum computing like I am five',
  },
  'sug.fast.1': {
    fa: 'برای یک رستوران کوچک منو بنویس',
    en: 'Write a menu for a small Persian restaurant',
  },
  'sug.fast.2': {
    fa: 'یک regex برای اعتبارسنجی ایمیل بنویس',
    en: 'Write a regex for email validation',
  },
  'sug.thinking.0': {
    fa: 'یک مسئله ریاضی را قدم‌به‌قدم حل کن',
    en: 'A bat and ball cost $1.10… solve it step by step',
  },
  'sug.thinking.1': {
    fa: 'برای سه روز تهران با بودجه کم برنامه‌ریزی کن',
    en: 'Plan a 3-day Tehran itinerary on a budget',
  },
  'sug.thinking.2': {
    fa: 'REST و GraphQL را برای استارتاپم مقایسه کن',
    en: 'Compare REST vs GraphQL for my startup',
  },
  'sug.research.0': {
    fa: 'جدیدترین اخبار هوش مصنوعی در ایران',
    en: 'Latest news about AI regulation in 2026',
  },
  'sug.research.1': {
    fa: 'بهترین API رایگان هوش مصنوعی الان کدام است؟',
    en: 'Best free AI APIs right now',
  },
  'sug.research.2': {
    fa: 'قیمت لپ‌تاپ مناسب برای برنامه‌نویسی',
    en: 'Price of a good laptop for programming',
  },

  // ── Drawer ──────────────────────────────────────────────────────────────
  'drawer.conversations': { fa: 'گفتگوها', en: 'Conversations' },
  'drawer.searchPlaceholder': { fa: 'جست‌وجوی گفتگوها…', en: 'Search chats…' },
  'drawer.deleteChat': { fa: 'حذف گفتگو؟', en: 'Delete chat?' },
  'drawer.deleteBody': {
    fa: 'این گفتگو برای همیشه پاک می‌شود.',
    en: 'This conversation will be permanently deleted.',
  },
  'drawer.cancel': { fa: 'انصراف', en: 'Cancel' },
  'drawer.delete': { fa: 'حذف', en: 'Delete' },
  'drawer.settings': { fa: 'تنظیمات', en: 'Settings' },
  'drawer.groupToday': { fa: 'امروز', en: 'Today' },
  'drawer.groupYesterday': { fa: 'دیروز', en: 'Yesterday' },
  'drawer.groupWeek': { fa: 'هفت روز گذشته', en: 'Previous 7 days' },
  'drawer.groupMonth': { fa: 'سی روز گذشته', en: 'Previous 30 days' },
  'drawer.groupOlder': { fa: 'قدیمی‌تر', en: 'Older' },
  'drawer.pinned': { fa: 'سنجاق‌شده', en: 'Pinned' },

  // ── Settings ───────────────────────────────────────────────────────────
  'settings.title': { fa: 'تنظیمات', en: 'Settings' },
  'settings.back': { fa: 'بازگشت به گفتگو', en: 'Back to chat' },
  'settings.appearance': { fa: 'ظاهر', en: 'Appearance' },
  'settings.theme': { fa: 'پوسته', en: 'Theme' },
  'settings.themeDark': { fa: 'تیره', en: 'Dark' },
  'settings.themeLight': { fa: 'روشن', en: 'Light' },
  'settings.themeSystem': { fa: 'سیستم', en: 'System' },
  'settings.language': { fa: 'زبان', en: 'Language' },
  'settings.langFa': { fa: 'فارسی', en: 'Persian' },
  'settings.langEn': { fa: 'انگلیسی', en: 'English' },
  'settings.integrations': { fa: 'یکپارچگی‌ها', en: 'Integrations' },
  'settings.google': { fa: 'حساب گوگل', en: 'Google account' },
  'settings.googleSub': {
    fa: 'خلاصه روزانه Gmail و Calendar',
    en: 'Gmail & Calendar daily brief',
  },
  'settings.notAvailable': { fa: 'در دسترس نیست', en: 'Not available' },
  'settings.data': { fa: 'داده‌های شما', en: 'Your data' },
  'settings.exportChats': { fa: 'خروجی گرفتن از گفتگوها', en: 'Export chat history' },
  'settings.exportChatsSub': { fa: 'دانلود به‌صورت JSON', en: 'Download as JSON' },
  'settings.clearChats': { fa: 'حذف همه گفتگوها', en: 'Clear all chats' },
  'settings.clearChatsSub': {
    fa: 'همه تاریخچه گفتگو پاک می‌شود',
    en: 'Removes every conversation',
  },
  'settings.clearConfirm': { fa: 'همه گفتگوها حذف شوند؟', en: 'Delete all conversations?' },
  'settings.cleared': { fa: 'انجام شد ✓', en: 'Done ✓' },
  'settings.memory': { fa: 'حافظه', en: 'Memory' },
  'settings.memoryUnavailable': {
    fa: 'حافظه به حساب آزورا نیاز دارد، پس در اپ خاموش است. گفتگوها بدون آن هم کار می‌کنند.',
    en: 'Memory needs an Azura account, so it is off in the app. Chats still work without it.',
  },
  'settings.newFact': { fa: 'یک واقعیت جدید درباره من…', en: 'A new fact about me…' },
  'settings.rememberPlaceholder': {
    fa: 'چیزی برای به‌خاطر سپردن به آزورا بگویید…',
    en: 'Teach Azura something to remember…',
  },
  'settings.addFact': { fa: 'افزودن', en: 'Add' },
  'settings.noFacts': { fa: 'هنوز چیزی ذخیره نشده.', en: 'Nothing remembered yet.' },
  'composer.attach': { fa: 'پیوست عکس', en: 'Attach images' },
  'composer.camera': { fa: 'گرفتن عکس', en: 'Take a photo' },
  'composer.attachmentsFull': {
    fa: 'حداکثر {n} عکس در هر پیام',
    en: 'Up to {n} images per message',
  },
  'composer.attachmentsCount': { fa: '{n}/{max} عکس', en: '{n}/{max} images' },
  'composer.send': { fa: 'ارسال پیام', en: 'Send message' },
  'composer.stop': { fa: 'توقف پاسخ‌گویی', en: 'Stop generating' },
  'chat.openConversations': { fa: 'باز کردن گفتگوها', en: 'Open conversations' },
  'chat.exportCurrent': { fa: 'خروجی گرفتن از این گفتگو', en: 'Export conversation' },
  'chat.scrollToLatest': { fa: 'رفتن به آخرین پیام', en: 'Scroll to latest' },
  'chat.dismissError': { fa: 'بستن خطا', en: 'Dismiss error' },
  'chat.retry': { fa: 'تلاش دوباره', en: 'Retry' },
  'drawer.rename': { fa: 'تغییر نام گفتگو', en: 'Rename conversation' },
  'drawer.deleteConversation': { fa: 'حذف گفتگو', en: 'Delete conversation' },
  'drawer.close': { fa: 'بستن منو', en: 'Close menu' },
  'drawer.clearSearch': { fa: 'پاک کردن جست‌وجو', en: 'Clear search' },
  'drawer.collapse': { fa: 'بستن فهرست', en: 'Collapse sidebar' },
  'drawer.pin': { fa: 'سنجاق کردن گفتگو', en: 'Pin conversation' },
  'drawer.unpin': { fa: 'برداشتن سنجاق', en: 'Unpin conversation' },
  'markdown.copyCode': { fa: 'کپی کد', en: 'Copy code' },
  'markdown.copied': { fa: 'کپی شد ✓', en: 'Copied ✓' },
  'settings.toggleMemory': { fa: 'روشن/خاموش کردن حافظه', en: 'Toggle memory' },
  'settings.forgetFact': { fa: 'پاک کردن این خاطره', en: 'Forget this memory' },
  'msg.timeNow': { fa: 'همین حالا', en: 'now' },
  'msg.speak': { fa: 'خواندن با صدا', en: 'Read aloud' },
  'msg.stopSpeak': { fa: 'توقف خواندن', en: 'Stop reading aloud' },
  'msg.share': { fa: 'اشتراک‌گذاری پاسخ', en: 'Share response' },
  'msg.copyResponse': { fa: 'کپی پاسخ', en: 'Copy response' },
  'msg.copied': { fa: 'کپی شد', en: 'Copied' },
  'msg.regenerate': { fa: 'پاسخ دوباره', en: 'Regenerate response' },
  'msg.good': { fa: 'پاسخ خوب بود', en: 'Good response' },
  'msg.bad': { fa: 'پاسخ بد بود', en: 'Bad response' },
  'msg.copyMessage': { fa: 'کپی پیام', en: 'Copy message' },
  'msg.edit': { fa: 'ویرایش پیام', en: 'Edit message' },
  'msg.cancel': { fa: 'انصراف', en: 'Cancel' },
  'msg.sendEdit': { fa: 'ارسال', en: 'Send' },
  'msg.failed': {
    fa: 'مشکلی پیش آمد — دوباره تلاش کن.',
    en: 'Something went wrong — try again.',
  },
  'sources.title': { fa: 'منابع', en: 'Sources' },
  'sources.count': { fa: '{n} منبع', en: '{n} sources' },
  'sources.close': { fa: 'بستن منابع', en: 'Close sources' },
  'sources.openCitation': { fa: 'نمایش منبع', en: 'Show source' },
  'msg.reasoning': { fa: 'کمی فکر کرد · {n} حرف', en: 'Thought for a moment · {n} chars' },
  'thinking.liveChars': {
    fa: '{n} حرف استدلال · در حال نوشتن…',
    en: '{n} reasoning chars · streaming…',
  },
  'thinking.settledChars': {
    fa: '{n} حرف استدلال',
    en: '{n} reasoning chars',
  },
  'stage.plan': { fa: 'برنامه‌ریزی جست‌وجو', en: 'Planning search' },
  'stage.search': { fa: 'جست‌وجو در وب', en: 'Searching the web' },
  'stage.read': { fa: 'خواندن منابع', en: 'Reading sources' },
  'stage.synthesize': { fa: 'جمع‌بندی پاسخ', en: 'Synthesizing' },
  // ── Response timer ──────────────────────────────────────────────────────
  'timer.elapsed': { fa: 'زمان پاسخ', en: 'Response time' },
  'timer.elapsedAria': { fa: 'زمان سپری‌شده: {n}', en: 'Elapsed: {n}' },
  'timer.firstToken': { fa: 'شروع پاسخ', en: 'First token' },
  'timer.stages': { fa: 'زمان هر مرحله', en: 'Stage timings' },
  'timer.attempts': { fa: '{n} تلاش', en: '{n} attempts' },
  'timer.band.fast': { fa: 'سریع', en: 'Fast' },
  'timer.band.normal': { fa: 'معمولی', en: 'Normal' },
  'timer.band.slow': { fa: 'کند', en: 'Slow' },
  'timer.band.stalled': { fa: 'خیلی کند', en: 'Very slow' },
  'tools.open': { fa: 'ابزارها', en: 'Tools' },
  'tools.title': { fa: 'ابزارها', en: 'Tools' },
  'tools.subtitle': {
    fa: 'روی هرکدام بزن تا پیامت را بهتر بنویسم',
    en: 'Tap one and I will rewrite your message',
  },
  'tools.close': { fa: 'بستن ابزارها', en: 'Close tools' },
  'tool.summarize': { fa: 'خلاصه کن', en: 'Summarize' },
  'tool.summarizeHint': { fa: 'کوتاه و فشرده', en: 'Short and dense' },
  'tool.explain': { fa: 'ساده توضیح بده', en: 'Explain simply' },
  'tool.explainHint': { fa: 'برای مبتدی', en: 'For a beginner' },
  'tool.translate': { fa: 'ترجمه کن', en: 'Translate' },
  'tool.translateHint': { fa: 'به انگلیسی', en: 'To English' },
  'tool.improve': { fa: 'ویرایش کن', en: 'Fix writing' },
  'tool.improveHint': { fa: 'غلط و نیم‌فاصله', en: 'Spelling and ZWNJ' },
  'tool.code': { fa: 'کد بنویس', en: 'Write code' },
  'tool.codeHint': { fa: 'با مثال', en: 'With examples' },
  'tool.table': { fa: 'جدول کن', en: 'Make a table' },
  'tool.tableHint': { fa: 'مرتب و مقایسه‌ای', en: 'Neat and comparable' },
  'tool.formula': { fa: 'فرمول بنویس', en: 'Show the formula' },
  'tool.formulaHint': { fa: 'با فرمول ریاضی', en: 'Typeset maths' },
} as const

/** The union of valid translation keys. */
export type I18nKey = keyof typeof STRINGS

/** Every key, for exhaustiveness checks in tests. */
export const I18N_KEYS = Object.keys(STRINGS) as I18nKey[]

/** Look up a translation. Returns the key itself if it is missing. */
export function translate(locale: Locale, key: I18nKey): string {
  return STRINGS[key]?.[locale] ?? key
}

/**
 * Look up a translation and fill `{placeholder}` slots. Persian and English
 * put numbers and units in different places, so the sentence has to stay
 * translatable rather than being concatenated at the call site.
 */
export function translateWith(
  locale: Locale,
  key: I18nKey,
  values: Record<string, string | number> = {},
): string {
  return translate(locale, key).replace(/\{(\w+)\}/g, (match, name: string) =>
    name in values ? String(values[name]) : match,
  )
}

/**
 * Script run before first paint. Detection has to happen here rather than in a
 * React effect, or an English phone flashes a Persian layout for a frame.
 * Kept dependency-free and defensive — it must never throw.
 */
export const localeInitScript = `(function(){try{
if(location.pathname.indexOf('/app')!==0)return;
var S='azura-locale';
var FA=['fa','fa-ir','fa-af','ps','tg','prs','uz-af'];
function isFa(t){if(!t)return false;t=String(t).toLowerCase().replace('_','-');
for(var i=0;i<FA.length;i++){if(t===FA[i]||t.indexOf(FA[i]+'-')===0)return true;}return false;}
var loc=null;try{var v=localStorage.getItem(S);if(v==='fa'||v==='en')loc=v;}catch(e){}
if(!loc){var tags=(navigator.languages&&navigator.languages.length)?navigator.languages:[navigator.language];
for(var i=0;i<tags.length;i++){if(isFa(tags[i])){loc='fa';break;}}
if(!loc)loc=isFa(tags[0])?'fa':'en';}
var r=document.documentElement;r.setAttribute('lang',loc);r.setAttribute('dir',loc==='fa'?'rtl':'ltr');
}catch(e){}})();`