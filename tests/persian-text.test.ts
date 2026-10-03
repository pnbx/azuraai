import { describe, it, expect } from '@jest/globals'
import {
  normalizePersianMarkdown,
  normalizePersianChars,
  applyZwnj,
  applyTanween,
  isPersianText,
  toPersianDigitsIn,
  toPersianNumberSeparators,
} from '@/lib/persian-text'

/** U+200C, spelled out so the intent is readable in a diff. */
const Z = '\u200c'

describe('normalizePersianChars', () => {
  it('maps Arabic yeh and alef maqsura to Persian yeh', () => {
    expect(normalizePersianChars('خورشيد فسنجان')).toBe('خورشید فسنجان')
    expect(normalizePersianChars('على ك')).toBe('علی ک')
  })

  it('maps Arabic kaf to Persian kaf', () => {
    expect(normalizePersianChars('كتاب يادداشت')).toBe('کتاب یادداشت')
  })

  it('strips the decorative tatweel', () => {
    expect(normalizePersianChars('سلامـــ')).toBe('سلام')
  })

  it('leaves a load-bearing hamza alone', () => {
    // ؤ folded to و would turn "تئوری" (theory) into "توری".
    expect(normalizePersianChars('تئوری')).toBe('تئوری')
    expect(normalizePersianChars('مسئول')).toBe('مسئول')
  })

  it('collapses a doubled half-space', () => {
    expect(normalizePersianChars(`${Z}${Z}خوب`)).toBe(`${Z}خوب`)
  })
})

describe('isPersianText', () => {
  it('recognises Persian prose', () => {
    expect(isPersianText('این یک متن فارسی است')).toBe(true)
  })
  it('rejects English prose', () => {
    expect(isPersianText('this is english prose only')).toBe(false)
  })
})

describe('toPersianDigitsIn', () => {
  it('converts ASCII and Arabic-Indic digits', () => {
    expect(toPersianDigitsIn('سال 2024 و ٢٠٢٥')).toBe('سال ۲۰۲۴ و ۲۰۲۵')
  })
})

describe('toPersianNumberSeparators', () => {
  it('converts thousands separators', () => {
    expect(toPersianNumberSeparators('44,500,000')).toBe('44٬500٬000')
    expect(toPersianNumberSeparators('1,000')).toBe('1٬000')
  })

  it('converts a decimal point', () => {
    expect(toPersianNumberSeparators('3.14')).toBe('3٫14')
    expect(toPersianNumberSeparators('1,234.56')).toBe('1٬234٫56')
  })

  it('leaves an ambiguous dot before three digits alone', () => {
    // "1.000" is one thousand in the European convention and one point zero in
    // the English one. Guessing either way would silently change a number, so
    // it is passed through untouched.
    expect(toPersianNumberSeparators('1.000')).toBe('1.000')
  })

  it('never touches a comma between words', () => {
    // The whole point of the digit guard on both sides.
    expect(toPersianNumberSeparators('تهران، اصفهان')).toBe('تهران، اصفهان')
    expect(toPersianNumberSeparators('در سال 2024، امروز')).toBe('در سال 2024، امروز')
  })

  it('never touches a sentence-ending period', () => {
    expect(toPersianNumberSeparators('پایان.')).toBe('پایان.')
  })
})

describe('normalizePersianMarkdown — numbers', () => {
  it('produces a fully Persian number, not mixed digits and ASCII commas', () => {
    // Regression: Persian digits with an ASCII comma looked broken in a table.
    const out = normalizePersianMarkdown('مساحت آسیا 44,500,000 کیلومتر مربع است.')
    expect(out).toBe('مساحت آسیا ۴۴٬۵۰۰٬۰۰۰ کیلومتر مربع است.')
  })

  it('handles a number inside a markdown table row', () => {
    const input = '| آسیا | 44,500,000 |\n| آفریقا | 30,370,000 |'
    const out = normalizePersianMarkdown(input)
    expect(out).toContain('۴۴٬۵۰۰٬۰۰۰')
    expect(out).toContain('۳۰٬۳۷۰٬۰۰۰')
  })

  it('leaves a number in a Persian sentence comma alone', () => {
    const out = normalizePersianMarkdown('در سال 2024، بازار رشد کرد.')
    expect(out).toBe('در سال ۲۰۲۴، بازار رشد کرد.')
  })
})

describe('applyZwnj', () => {
  it('joins the verbal prefix می', () => {
    expect(applyZwnj('او می رود')).toBe(`او می${Z}رود`)
    expect(applyZwnj('من نمی دانم')).toBe(`من نمی${Z}دانم`)
  })

  it('prefers نمی over می at the same position', () => {
    expect(applyZwnj('نمی دانم')).toBe(`نمی${Z}دانم`)
    expect(applyZwnj('نمیدانم')).toBe('نمیدانم')
  })

  it('joins the plural suffixes', () => {
    expect(applyZwnj('کتاب ها')).toBe(`کتاب${Z}ها`)
    expect(applyZwnj('این هایی')).toBe(`این${Z}هایی`)
    expect(applyZwnj('آن ها')).toBe(`آن${Z}ها`)
  })

  it('joins the comparative suffixes', () => {
    expect(applyZwnj('یک بزرگ تر ساختمان')).toBe(`یک بزرگ${Z}تر ساختمان`)
  })

  it('leaves a short left-hand side alone', () => {
    // "دو تر" is not "دوتر" — these are separate words, not a suffixed form.
    expect(applyZwnj('دو تر')).toBe('دو تر')
    expect(applyZwnj('کم تر')).toBe('کم تر')
  })

  it('joins the clitic verb suffixes', () => {
    expect(applyZwnj('شما گفته اید')).toBe(`شما گفته${Z}اید`)
  })

  it('does not split a word that already has the half-space', () => {
    expect(applyZwnj(`او می${Z}رود`)).toBe(`او می${Z}رود`)
  })

  it('is reusable across calls (no stale regex cursor)', () => {
    // A global regex reused without resetting lastIndex silently skips
    // matches on the second call.
    expect(applyZwnj('او می رود')).toBe(`او می${Z}رود`)
    expect(applyZwnj('او می رود')).toBe(`او می${Z}رود`)
    expect(applyZwnj('او می رود')).toBe(`او می${Z}رود`)
  })

  it('does not join an English word after می', () => {
    expect(applyZwnj('می iPhone')).toBe('می iPhone')
  })
})

describe('applyTanween', () => {
  it('adds the tanween back', () => {
    expect(applyTanween('لطفا جواب بده')).toBe('لطفاً جواب بده')
    expect(applyTanween('حتما درست است')).toBe('حتماً درست است')
    expect(applyTanween('مطمئنا نیست')).toBe('مطمئناً نیست')
  })

  it('is idempotent', () => {
    const once = applyTanween('لطفا واقعا تقریبا')
    expect(applyTanween(once)).toBe(once)
    expect(once).toBe('لطفاً واقعاً تقریباً')
  })

  it('matches the longest word first', () => {
    expect(applyTanween('مخصوصا خوب است')).toBe('مخصوصاً خوب است')
    expect(applyTanween('طبیعتا')).toBe('طبیعتاً')
  })

  it('does not touch a word that merely contains one', () => {
    expect(applyTanween('خواصا')).toBe('خواصا')
  })
})

describe('normalizePersianMarkdown — prose', () => {
  it('fixes a whole realistic paragraph', () => {
    const input =
      'كتاب ها در خورشيد فسنجان لطفا نوشته شده اند و در سال 2024 بازتاب گرفت.'
    const out = normalizePersianMarkdown(input)
    expect(out).toBe(
      `کتاب${Z}ها در خورشید فسنجان لطفاً نوشته شده${Z}اند و در سال ۲۰۲۴ بازتاب گرفت.`
    )
  })

  it('leaves an English answer byte-identical', () => {
    const input = 'The cat sat on the mat. There are 2 cats and 1 mat.'
    expect(normalizePersianMarkdown(input)).toBe(input)
  })

  it('handles an empty string', () => {
    expect(normalizePersianMarkdown('')).toBe('')
  })

  it('does not disturb markdown block markers', () => {
    const input = '## عنوان\n\n- مورد اول\n- مورد دوم'
    const out = normalizePersianMarkdown(input)
    expect(out.startsWith('## ')).toBe(true)
    expect(out).toContain('- مورد اول')
  })

  it('preserves a markdown hard line break', () => {
    // Two trailing spaces are a hard break in CommonMark. Collapsing or
    // trimming them here would silently reflow every answer that used one.
    const input = 'سطر اول  \nسطر دوم'
    expect(normalizePersianMarkdown(input)).toBe(input)
  })

  it('preserves indentation inside prose', () => {
    const input = 'سطر اول\n\n    متن تورفته'
    expect(normalizePersianMarkdown(input)).toBe(input)
  })
})

describe('normalizePersianMarkdown — protected spans', () => {
  it('leaves a fenced code block byte-identical', () => {
    const code = '```ts\nconst كتاب = "ي";\nconst تعداد = 2;\n```'
    const out = normalizePersianMarkdown(`متن فارسی\n\n${code}\n\nپایان`)
    expect(out).toContain(code)
    expect(out.startsWith('متن فارسی')).toBe(true)
    expect(out.endsWith('پایان')).toBe(true)
  })

  it('leaves an inline code span byte-identical', () => {
    const out = normalizePersianMarkdown('برای كد از `كتاب‌ها` استفاده کن')
    expect(out).toContain('`كتاب‌ها`')
  })

  it('leaves display maths byte-identical', () => {
    const math = '$$\\text{كتاب} = y_1 + y_2$$'
    const out = normalizePersianMarkdown(`فرمول:\n\n${math}`)
    expect(out).toContain(math)
  })

  it('leaves inline maths byte-identical', () => {
    const out = normalizePersianMarkdown('مقدار $x_1 + 2$ را بگو')
    expect(out).toContain('$x_1 + 2$')
  })

  it('leaves a bare LaTeX command alone', () => {
    const cmd = '\\begin{align}\ny &= 1\n\\end{align}'
    const out = normalizePersianMarkdown(cmd)
    expect(out).toBe(cmd)
  })

  it('leaves a URL byte-identical, including its digits', () => {
    const url = 'https://example.com/a?x=2024&y=2'
    const out = normalizePersianMarkdown(`برای اطلاعات بیشتر: ${url}`)
    expect(out).toContain(url)
  })

  it('leaves a markdown link target byte-identical', () => {
    const out = normalizePersianMarkdown('متن [پیوند](https://x.com/2024) انتها')
    expect(out).toContain('(https://x.com/2024)')
  })

  it('still normalises the prose around a code block', () => {
    const out = normalizePersianMarkdown(
      'لطفا اين كد را ببين:\n\n```\nkeep me\n```\n\nپايان'
    )
    expect(out).toContain('لطفاً این کد را ببین:')
    expect(out).toContain('```\nkeep me\n```')
  })
})

describe('normalizePersianMarkdown — cost', () => {
  it('handles a very long answer without going quadratic', () => {
    // The scanner looks for protected spans at every character, so an early
    // version that sliced the string per character was quadratic. This runs on
    // every reply the app sends, so a regression here would add seconds of
    // latency to the last frame. Measured ~40ms for 75k characters; the
    // threshold is deliberately loose to stay stable on a loaded CI box.
    const para =
      'می خواهم در مورد اينكه كتاب ها در سال 2024 در بازار چطور بودند صحبت كنم و لطفا جزئيات بيشتري را بگوييد. '
    const big = (para.repeat(120) + '\n\n```ts\nconst x = 1;\n```\n\n').repeat(6)
    const started = Date.now()
    normalizePersianMarkdown(big)
    expect(Date.now() - started).toBeLessThan(2000)
  })
})