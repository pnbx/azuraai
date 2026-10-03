import {
  formatStopwatch,
  formatDuration,
  speedBand,
  stageDurations,
  totalStageMs,
} from '@/lib/format-duration'

const FA_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹']

/** Read a Persian-rendered numeral back as an integer, for exact assertions. */
function faToInt(text: string): number {
  return Number(
    text
      .split('')
      .map((ch) => {
        const i = FA_DIGITS.indexOf(ch)
        return i === -1 ? ch : String(i)
      })
      .join('')
  )
}

describe('formatStopwatch', () => {
  it('renders m:ss with a zero-padded seconds field', () => {
    expect(formatStopwatch(0)).toEqual('0:00')
    expect(formatStopwatch(7_000)).toEqual('0:07')
    expect(formatStopwatch(65_000)).toEqual('1:05')
    expect(formatStopwatch(599_000)).toEqual('9:59')
  })

  it('keeps the seconds field two characters wide across a minute boundary', () => {
    // Width is what stops a 10Hz ticking row from reflowing every tick.
    expect(formatStopwatch(59_999).length).toEqual(formatStopwatch(60_000).length)
  })

  it('widens to h:mm:ss past an hour', () => {
    expect(formatStopwatch(3_600_000)).toEqual('1:00:00')
    expect(formatStopwatch(3_725_000)).toEqual('1:02:05')
  })

  it('uses Persian digits in the fa locale', () => {
    expect(formatStopwatch(7_000, 'fa')).toEqual('۰:۰۷')
    expect(faToInt(formatStopwatch(65_000, 'fa').split(':')[1])).toEqual(5)
  })

  it('never renders a negative or NaN clock', () => {
    expect(formatStopwatch(-5_000)).toEqual('0:00')
    expect(formatStopwatch(Number.NaN)).toEqual('0:00')
    expect(formatStopwatch(Number.POSITIVE_INFINITY)).toEqual('0:00')
  })
})

describe('formatDuration', () => {
  it('describes sub-second work without pretending it was zero', () => {
    expect(formatDuration(0, 'en')).toEqual('under a second')
    expect(formatDuration(999, 'en')).toEqual('under a second')
    expect(formatDuration(0, 'fa')).toEqual('زیر یک ثانیه')
  })

  it('phrases whole seconds', () => {
    expect(formatDuration(1_000, 'en')).toEqual('1s')
    expect(formatDuration(12_400, 'en')).toEqual('12s')
  })

  it('floors instead of rounding so 59.9s never reads as 60s', () => {
    expect(formatDuration(59_999, 'en')).toEqual('59s')
    expect(formatDuration(119_999, 'en')).toEqual('1m 59s')
  })

  it('phrases minutes, with and without leftover seconds', () => {
    expect(formatDuration(60_000, 'en')).toEqual('1m')
    expect(formatDuration(65_000, 'en')).toEqual('1m 5s')
  })

  it('phrases hours', () => {
    expect(formatDuration(3_600_000, 'en')).toEqual('1h 0m')
    expect(formatDuration(3_900_000, 'en')).toEqual('1h 5m')
  })

  it('renders Persian sentences with Persian digits', () => {
    expect(formatDuration(12_000, 'fa')).toEqual('۱۲ ثانیه')
    expect(formatDuration(65_000, 'fa')).toEqual('۱ دقیقه و ۵ ثانیه')
    expect(formatDuration(120_000, 'fa')).toEqual('۲ دقیقه')
  })

  it('clamps junk input rather than rendering nonsense', () => {
    expect(formatDuration(-1_000, 'en')).toEqual('under a second')
    expect(formatDuration(Number.NaN, 'en')).toEqual('under a second')
  })
})

describe('speedBand', () => {
  it('bands response lengths around the pinned free model latencies', () => {
    expect(speedBand(1_200)).toEqual('fast')
    expect(speedBand(4_999)).toEqual('fast')
    expect(speedBand(5_000)).toEqual('normal')
    expect(speedBand(14_999)).toEqual('normal')
    expect(speedBand(15_000)).toEqual('slow')
    expect(speedBand(39_999)).toEqual('slow')
    expect(speedBand(40_000)).toEqual('stalled')
  })

  it('treats an unreported duration as fast rather than stalled', () => {
    expect(speedBand(Number.NaN)).toEqual('fast')
    expect(speedBand(-1)).toEqual('fast')
  })
})

describe('stageDurations', () => {
  it('gives each stage the gap up to the next stage start', () => {
    const got = stageDurations({ plan: 0, search: 1_200, read: 3_400 }, 4_900)
    expect([got.map((s) => s.stage), got.map((s) => s.ms)]).toEqual([
      ['plan', 'search', 'read'],
      [1_200, 2_200, 1_500],
    ])
  })

  it('gives the final stage the gap up to the reported total', () => {
    const got = stageDurations(
      { plan: 0, search: 1_200, read: 3_400, synthesize: 4_000 },
      5_500
    )
    expect(got.map((s) => s.ms)).toEqual([1_200, 2_200, 600, 1_500])
  })

  it('never lets a reported total shorten the last stage', () => {
    // An aborted stream can report a total captured before the last stage
    // was marked; the stage still has to report a real, non-negative span.
    const got = stageDurations({ plan: 0, synthesize: 3_000 }, 100)
    expect(got.map((s) => s.ms)).toEqual([3_000, 0])
  })

  it('reports 0 for a last stage with no reported total (aborted stream)', () => {
    const got = stageDurations({ plan: 100, search: 900 })
    expect(got.map((s) => s.ms)).toEqual([800, 0])
  })

  it('clamps a non-monotonic timeline instead of going negative', () => {
    // A pool failover replays "plan"; the route keeps only the first mark, but
    // this must hold even if a reordered timeline ever reaches the renderer.
    const got = stageDurations({ plan: 900, search: 400 }, 1_200)
    expect(got.map((s) => s.ms)).toEqual([0, 800])
  })

  it('tolerates missing and empty input', () => {
    expect(stageDurations(undefined)).toEqual([])
    expect(stageDurations({})).toEqual([])
  })
})

describe('totalStageMs', () => {
  it('sums only finite entries', () => {
    expect(totalStageMs([{ ms: 100 }, { ms: 250 }])).toEqual(350)
    expect(totalStageMs([{ ms: 100 }, { ms: Number.NaN }])).toEqual(100)
    expect(totalStageMs([])).toEqual(0)
  })
})