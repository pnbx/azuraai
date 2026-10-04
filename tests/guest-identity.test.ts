/**
 * Guest identity for the free tier.
 *
 * The load-bearing property here is that a caller cannot mint unlimited quota
 * counters by inventing a new device id per request. That is why
 * normaliseDeviceId only accepts a canonical UUID — a test locks it down.
 */

import { describe, it, expect } from '@jest/globals'
import {
  normaliseDeviceId,
  guestKeyFrom,
  resolveGuestKey,
  isDefaultPepper,
  DEFAULT_GUEST_PEPPER,
} from '@/lib/guest-identity'

const VALID_UUID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301'
const PEPPER = 'test-pepper'

describe('normaliseDeviceId', () => {
  it('accepts a canonical UUID and lowercases it', () => {
    expect(normaliseDeviceId(VALID_UUID)).toBe(VALID_UUID)
    expect(normaliseDeviceId(VALID_UUID.toUpperCase())).toBe(VALID_UUID)
  })

  it('trims surrounding whitespace', () => {
    expect(normaliseDeviceId(`  ${VALID_UUID}  `)).toBe(VALID_UUID)
  })

  it('rejects anything that is not a canonical UUID', () => {
    // The dangerous case: an attacker sends a fresh random string each time to
    // get a brand-new counter every request.
    expect(normaliseDeviceId('attacker-1')).toBeNull()
    expect(normaliseDeviceId('')).toBeNull()
    expect(normaliseDeviceId('   ')).toBeNull()
    // Right length, wrong shape.
    expect(normaliseDeviceId('a'.repeat(36))).toBeNull()
    // Right shape, not hex.
    expect(normaliseDeviceId('zzzzzzzz-4f89-41d3-9a0c-0305e82c3301')).toBeNull()
    // UUID with braces or urn prefix — valid UUID text, but not the form
    // randomUUID() emits, so it is refused rather than half-accepted.
    expect(
      normaliseDeviceId(`urn:uuid:${VALID_UUID}`)
    ).toBeNull()
  })

  it('rejects non-strings and nullish input', () => {
    expect(normaliseDeviceId(null)).toBeNull()
    expect(normaliseDeviceId(undefined)).toBeNull()
    // @ts-expect-error deliberately wrong type — runtime must still be safe
    expect(normaliseDeviceId(12345)).toBeNull()
  })
})

describe('guestKeyFrom', () => {
  it('is deterministic', () => {
    expect(guestKeyFrom(PEPPER, VALID_UUID)).toBe(guestKeyFrom(PEPPER, VALID_UUID))
  })

  it('is a 64-char hex sha256, safely over the RPC floor', () => {
    const key = guestKeyFrom(PEPPER, VALID_UUID)
    expect(key).toMatch(/^[0-9a-f]{64}$/)
  })

  it('depends on the pepper, so rotating it resets every counter', () => {
    expect(guestKeyFrom(PEPPER, VALID_UUID)).not.toBe(
      guestKeyFrom('other-pepper', VALID_UUID)
    )
  })

  it('depends on the device id', () => {
    expect(guestKeyFrom(PEPPER, VALID_UUID)).not.toBe(
      guestKeyFrom(PEPPER, '3f2504e0-4f89-41d3-9a0c-0305e82c3302')
    )
  })
})

describe('resolveGuestKey', () => {
  it('prefers the device id', () => {
    const { key, source } = resolveGuestKey({
      pepper: PEPPER,
      deviceId: VALID_UUID,
      ip: '5.1.2.3',
      userAgent: 'test',
    })
    expect(source).toBe('device')
    expect(key).toBe(guestKeyFrom(PEPPER, VALID_UUID))
  })

  it('falls back to a network fingerprint when the header is absent', () => {
    const { key, source } = resolveGuestKey({
      pepper: PEPPER,
      deviceId: null,
      ip: '5.1.2.3',
      userAgent: 'Mozilla/5.0',
    })
    expect(source).toBe('fingerprint')
    expect(key).toMatch(/^[0-9a-f]{64}$/)
  })

  it('falls back when the header is present but malformed', () => {
    const { source } = resolveGuestKey({
      pepper: PEPPER,
      deviceId: 'not-a-uuid',
      ip: '5.1.2.3',
      userAgent: 'Mozilla/5.0',
    })
    expect(source).toBe('fingerprint')
  })

  it('never returns a fingerprint key that collides with a device key', () => {
    // Same pepper and same underlying values: the fingerprint must be
    // distinguishable, or one device could inherit another's counter.
    const device = resolveGuestKey({
      pepper: PEPPER,
      deviceId: VALID_UUID,
      ip: null,
      userAgent: null,
    })
    const fingerprint = resolveGuestKey({
      pepper: PEPPER,
      deviceId: null,
      ip: VALID_UUID,
      userAgent: '',
    })
    expect(fingerprint.key).not.toBe(device.key)
  })

  it('returns no key when there is no identity at all', () => {
    const { key, source } = resolveGuestKey({
      pepper: PEPPER,
      deviceId: null,
      ip: null,
      userAgent: null,
    })
    expect(key).toBeNull()
    expect(source).toBe('none')
  })

  it('uses the development pepper when none is configured', () => {
    const { key } = resolveGuestKey({
      pepper: undefined,
      deviceId: VALID_UUID,
      ip: null,
      userAgent: null,
    })
    expect(key).toBe(guestKeyFrom(DEFAULT_GUEST_PEPPER, VALID_UUID))
  })
})

describe('isDefaultPepper', () => {
  it('flags an unset or placeholder pepper', () => {
    expect(isDefaultPepper(undefined)).toBe(true)
    expect(isDefaultPepper('')).toBe(true)
    expect(isDefaultPepper(DEFAULT_GUEST_PEPPER)).toBe(true)
  })

  it('accepts a real secret', () => {
    expect(isDefaultPepper('a-real-random-secret')).toBe(false)
  })
})