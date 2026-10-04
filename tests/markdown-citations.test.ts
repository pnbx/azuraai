import { toAsciiDigits, isAllDigits, splitSegments, parseList, isRtl } from '@/components/app/markdown-parsers'

/**
 * Citation digit normalisation.
 *
 * The server rewrites numerals in the authoritative final frame, so a research
 * answer that cited "[1]" arrives as "[۱]". Anything that matches citations on
 * ASCII digits alone silently matches nothing for every Persian answer, which
 * is exactly what happened: citations rendered as inert text instead of chips.
 */

describe('toAsciiDigits', () => {
  it('converts Persian digits', () => {
    expect(toAsciiDigits('۱۲۳۰۹')).toEqual('12309')
  })

  it('converts Arabic-Indic digits', () => {
    expect(toAsciiDigits('٤٥٦')).toEqual('456')
  })

  it('leaves ASCII digits untouched', () => {
    expect(toAsciiDigits('12309')).toEqual('12309')
  })

  it('converts a whole citation marker', () => {
    expect(toAsciiDigits('[۱۲]')).toEqual('[12]')
  })

  it('converts digits inside Persian prose while keeping the letters', () => {
    // Its contract is "every digit becomes ASCII", not "only inside markers" —
    // that is what makes it safe to apply to a citation body.
    expect(toAsciiDigits('مساحت ایران ۱۶۴۹۰۰۰ کیلومتر مربع است')).toEqual(
      'مساحت ایران 1649000 کیلومتر مربع است'
    )
  })

  it('leaves Persian separators and letters untouched', () => {
    expect(toAsciiDigits('۱٬۶۴۹')).toEqual('1٬649')
    expect(toAsciiDigits('سلام')).toEqual('سلام')
  })

  it('handles mixed digits and text', () => {
    expect(toAsciiDigits('قاره ۷')).toEqual('قاره 7')
  })

  it('returns empty for empty input', () => {
    expect(toAsciiDigits('')).toEqual('')
  })
})

describe('isAllDigits', () => {
  it('accepts digits in all three scripts', () => {
    expect(isAllDigits('123')).toEqual(true)
    expect(isAllDigits('۱۲۳')).toEqual(true)
    expect(isAllDigits('٤٥٦')).toEqual(true)
  })

  it('rejects mixed or empty input', () => {
    expect(isAllDigits('۱۲a')).toEqual(false)
    expect(isAllDigits('')).toEqual(false)
    expect(isAllDigits('a')).toEqual(false)
  })
})

describe('regression: a Persian research answer keeps its citations', () => {
  it('parses a marker written with Persian digits the same as ASCII', () => {
    // The exact shape the typography pass produces on the meta frame.
    const marker = '[۱]'
    const inner = marker.slice(1, -1)
    expect(isAllDigits(inner)).toEqual(true)
    expect(Number(toAsciiDigits(inner))).toEqual(1)
  })

  it('resolves a multi-digit Persian marker to the right source index', () => {
    const inner = '۱۲'
    expect(Number(toAsciiDigits(inner)) - 1).toEqual(11)
  })
})

describe('markdown segment splitting still holds', () => {
  it('keeps a fenced code block out of the prose pass', () => {
    const segs = splitSegments('before\n```js\nconst a = 1\n```\nafter')
    expect(segs.some((s) => s.fence?.lang === 'js')).toEqual(true)
  })

  it('marks an unterminated fence as live', () => {
    const segs = splitSegments('text\n```py\nprint(1')
    expect(segs.some((s) => s.fence?.live === true)).toEqual(true)
  })
})

describe('list parsing still holds', () => {
  it('nests by indentation', () => {
    const list = parseList(['- a', '  - b'])
    expect(list).not.toBeNull()
    expect(list!.length).toEqual(1)
    expect(list![0].children?.length).toEqual(1)
  })

  it('returns null for prose', () => {
    expect(parseList(['just a sentence'])).toBeNull()
  })
})

describe('isRtl', () => {
  it('prefers the script with more letters', () => {
    expect(isRtl('سلام دنیا')).toEqual(true)
    expect(isRtl('hello world')).toEqual(false)
  })
})