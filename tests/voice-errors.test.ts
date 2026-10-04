import { normaliseVoiceError } from '../components/app/voice-input'
import { chunkForSpeech } from '../components/app/use-speech'

describe('normaliseVoiceError', () => {
  it('treats a refused microphone as a permission problem', () => {
    expect(normaliseVoiceError('not-allowed')).toBe('not-allowed')
    expect(normaliseVoiceError('service-not-allowed')).toBe('not-allowed')
  })

  it('surfaces Chrome cloud-recognition failure separately from permission', () => {
    // The recogniser is a cloud service: no network means no dictation, and
    // the user needs a different message than "you denied the mic".
    expect(normaliseVoiceError('network')).toBe('network')
  })

  it('reports silence and deliberate aborts distinctly', () => {
    expect(normaliseVoiceError('no-speech')).toBe('no-speech')
    expect(normaliseVoiceError('aborted')).toBe('aborted')
  })

  it('falls back to unknown for codes it does not recognise', () => {
    expect(normaliseVoiceError('something-new')).toBe('unknown')
    expect(normaliseVoiceError(undefined)).toBe('unknown')
  })
})

describe('chunkForSpeech', () => {
  it('keeps short text in one piece', () => {
    expect(chunkForSpeech('سلام')).toEqual(['سلام'])
  })

  it('splits long prose and loses nothing', () => {
    const sentence = 'این یک جمله نسبتاً بلند است که برای آزمایش نوشته شده است. '
    const text = sentence.repeat(120)
    const chunks = chunkForSpeech(text, 500)

    expect(chunks.length).toBeGreaterThan(1)
    // The whole point of chunking is that every chunk stays speakable.
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(500)
    expect(chunks.join('')).toBe(text)
  })

  it('still chunks a pathological single sentence with no breaks', () => {
    const text = 'ک'.repeat(1200)
    const chunks = chunkForSpeech(text, 500)
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.join('')).toBe(text)
  })

  it('returns nothing for empty input', () => {
    expect(chunkForSpeech('')).toEqual([])
  })
})