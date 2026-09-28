import { describe, expect, it } from 'vitest'
import { isValidNif, parseFiscalQr } from './fiscalQr.ts'

// The spike's payload (TEST_RESULTS.md), in full: 11,00 at the reduced
// rate and 42,50 at the normal rate.
const FULL =
  'A:509442013*B:999999990*C:PT*D:FS*E:N*F:20260928*G:FS 01P2026/123*' +
  'H:JJ3PKKP3-123*I1:PT*I3:10.38*I4:0.62*I7:34.55*I8:7.95*N:8.57*' +
  'O:53.50*Q:ab1C*R:1234'

// Seeded PRNG (mulberry32), as in money.test.ts.
function seededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('isValidNif', () => {
  it.each(['123456789', '509442013', '501234560', '999999990', '200123459'])(
    '%s is valid',
    (nif) => {
      expect(isValidNif(nif)).toBe(true)
    },
  )

  it.each([
    '123456780',
    '509442014',
    '12345678',
    '1234567890',
    '12345678a',
    '',
  ])('%j is not', (nif) => {
    expect(isValidNif(nif)).toBe(false)
  })
})

describe('parseFiscalQr', () => {
  it('reads a full payload', () => {
    expect(parseFiscalQr(FULL)).toEqual({
      ok: true,
      qr: {
        issuerNif: '509442013',
        date: '2026-09-28',
        total: 5350,
        documentType: 'FS',
        totalTax: 857,
        atcud: 'JJ3PKKP3-123',
        regions: {
          I: {
            country: 'PT',
            reducedBase: 1038,
            reducedTax: 62,
            normalBase: 3455,
            normalTax: 795,
          },
        },
        warnings: [],
      },
    })
  })

  it('reads a minimal payload', () => {
    expect(parseFiscalQr('A:123456789*F:20260101*O:0.99')).toEqual({
      ok: true,
      qr: {
        issuerNif: '123456789',
        date: '2026-01-01',
        total: 99,
        regions: {},
        warnings: [],
      },
    })
  })

  it('reads the Azores and Madeira regions', () => {
    const result = parseFiscalQr(
      'A:123456789*F:20260101*J1:PT-AC*J2:5.00*K1:PT-MA*K7:10.00*K8:2.20*O:17.20',
    )
    expect(result.ok && result.qr.regions).toEqual({
      J: { country: 'PT-AC', exemptBase: 500 },
      K: { country: 'PT-MA', normalBase: 1000, normalTax: 220 },
    })
  })

  it.each([
    ['a bad NIF', 'A:123456780*F:20260928*O:53.50'],
    ['a bad date', 'A:123456789*F:20260231*O:53.50'],
    ['a date in the wrong format', 'A:123456789*F:2026-09-28*O:53.50'],
    ['a missing O', 'A:123456789*F:20260928*N:1.00'],
    ['a malformed O', 'A:123456789*F:20260928*O:53,50'],
    ['a missing A', 'F:20260928*O:53.50'],
    ['a URL', 'https://example.com/?A:123456789*F:20260928*O:53.50'],
    ['a product code', '5601234567890'],
    ['an empty string', ''],
    ['a repeated key', 'A:123456789*F:20260928*O:53.50*O:1.00'],
  ])('rejects %s', (_, text) => {
    expect(parseFiscalQr(text)).toEqual({ ok: false })
  })

  it('leaves out a malformed optional field', () => {
    const result = parseFiscalQr('A:123456789*F:20260928*N:abc*O:53.50')
    expect(result).toMatchObject({ ok: true })
    expect(result.ok && result.qr.totalTax).toBeUndefined()
  })

  it('warns about a credit note', () => {
    const result = parseFiscalQr('A:123456789*D:NC*F:20260928*O:10.00')
    expect(result.ok && result.qr.warnings).toEqual(['creditNote'])
  })

  it('never throws, for any generated string', () => {
    const random = seededRandom(195)
    const alphabet = 'AFONDHIJK0123456789.:*-PT é\u{1F600}'
    const pieces = [
      'A:123456789',
      'F:20260928',
      'O:53.50',
      'D:NC',
      'N:',
      'I1:PT',
      '*',
      ':',
    ]
    for (let run = 0; run < 2000; run++) {
      let text = ''
      const length = Math.floor(random() * 60)
      for (let i = 0; i < length; i++) {
        text +=
          random() < 0.2
            ? (pieces[Math.floor(random() * pieces.length)] ?? '')
            : ([...alphabet][Math.floor(random() * [...alphabet].length)] ?? '')
      }
      expect(() => parseFiscalQr(text)).not.toThrow()
      const result = parseFiscalQr(text)
      expect(typeof result.ok).toBe('boolean')
    }
  })
})
