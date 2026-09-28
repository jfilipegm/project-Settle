import { describe, expect, it } from 'vitest'
import {
  add,
  allocate,
  allocateEvenly,
  allocateExact,
  cents,
  DEFAULT_CURRENCY,
  DEFAULT_LOCALE,
  formatAmount,
  multiply,
  multiplyRatio,
  negate,
  parseAmount,
  parseRatio,
  percentOf,
  subtract,
  sum,
  SUPPORTED_CURRENCIES,
  SUPPORTED_LOCALES,
  type Cents,
  type MoneyCurrency,
  type MoneyLocale,
  type ParseAmountResult,
  type Ratio,
} from './money.ts'

const MAX = Number.MAX_SAFE_INTEGER

// Seeded PRNG (mulberry32) so the generated sweeps are reproducible without
// a new dependency.
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

function randomInt(random: () => number, min: number, max: number): number {
  return min + Math.floor(random() * (max - min + 1))
}

// toBe/toEqual would also catch -0, but spell it out: -0 is the bug.
function expectPositiveZero(value: number): void {
  expect(Object.is(value, 0)).toBe(true)
}

describe('defaults', () => {
  it('are pt-PT and EUR', () => {
    expect(DEFAULT_LOCALE).toBe('pt-PT')
    expect(DEFAULT_CURRENCY).toBe('EUR')
  })
})

describe('cents guard', () => {
  it.each([1.5, 2 ** 53, -(2 ** 53), NaN, Infinity])('rejects %s', (n) => {
    expect(() => cents(n)).toThrow(RangeError)
  })

  it('accepts the safe integer bounds', () => {
    expect(cents(MAX)).toBe(MAX)
    expect(cents(-MAX)).toBe(-MAX)
  })

  it('normalizes -0 to 0', () => {
    expectPositiveZero(cents(-0))
  })
})

describe('arithmetic', () => {
  it('adds, sums, subtracts and negates', () => {
    expect(add(cents(150), cents(-20), cents(5))).toBe(135)
    expectPositiveZero(add())
    expect(sum([cents(1), cents(2), cents(3)])).toBe(6)
    expectPositiveZero(sum([]))
    expect(subtract(cents(100), cents(250))).toBe(-150)
    expect(negate(cents(42))).toBe(-42)
  })

  it('throws on overflow', () => {
    expect(() => add(cents(MAX), cents(1))).toThrow(RangeError)
    expect(() => add(cents(-MAX), cents(-1))).toThrow(RangeError)
    expect(() => sum([cents(MAX), cents(MAX), cents(-MAX)])).toThrow(RangeError)
    expect(() => subtract(cents(-MAX), cents(1))).toThrow(RangeError)
    expect(() => multiply(cents(MAX), 2)).toThrow(RangeError)
    expect(() => multiply(cents(2 ** 30), 2 ** 30)).toThrow(RangeError)
  })

  it('multiplies by an integer quantity of any sign', () => {
    expect(multiply(cents(250), 3)).toBe(750)
    expect(multiply(cents(250), -3)).toBe(-750)
    expect(multiply(cents(MAX), -1)).toBe(-MAX)
  })

  it('rejects a non-integer quantity', () => {
    expect(() => multiply(cents(100), 1.5)).toThrow(RangeError)
    expect(() => multiply(cents(100), 2 ** 53)).toThrow(RangeError)
  })
})

describe('negative zero never leaks out', () => {
  it('from arithmetic on zero', () => {
    expectPositiveZero(negate(cents(0)))
    expectPositiveZero(multiply(cents(0), -3))
    expectPositiveZero(multiplyRatio(cents(0), -1, 2))
    expectPositiveZero(subtract(cents(0), cents(0)))
  })

  it('from allocating a negative total', () => {
    const parts = allocate(cents(-1), [1, 1, 1])
    expect(parts).toHaveLength(3)
    expect(parts[0]).toBe(-1)
    expectPositiveZero(parts[1] ?? NaN)
    expectPositiveZero(parts[2] ?? NaN)
  })

  it('from parsing "-0,00"', () => {
    const result = parseAmount('-0,00')
    expect(result.ok).toBe(true)
    expectPositiveZero(result.ok ? result.value : NaN)
  })

  it('from formatting zero', () => {
    expect(formatAmount(cents(0))).not.toMatch(/[-−]/)
  })
})

describe('multiplyRatio', () => {
  it('rounds half away from zero', () => {
    expect(multiplyRatio(cents(5), 1, 2)).toBe(3)
    expect(multiplyRatio(cents(-5), 1, 2)).toBe(-3)
    expect(multiplyRatio(cents(4), 1, 3)).toBe(1)
    expect(multiplyRatio(cents(5), 1, 3)).toBe(2)
    expect(multiplyRatio(cents(-5), 1, 3)).toBe(-2)
    expect(multiplyRatio(cents(1000), 125, 1000)).toBe(125)
    expect(multiplyRatio(cents(299), 3, 4)).toBe(224)
  })

  it('handles a sign on the numerator', () => {
    expect(multiplyRatio(cents(5), -1, 2)).toBe(-3)
  })

  it('is exact when the intermediate product exceeds 2^53', () => {
    // MAX × 3 / 4 = 6755399441055743.25; MAX × 7 / 8 = …67.125
    expect(multiplyRatio(cents(MAX), 3, 4)).toBe(6755399441055743)
    expect(multiplyRatio(cents(-MAX), 3, 4)).toBe(-6755399441055743)
    expect(multiplyRatio(cents(MAX), 7, 8)).toBe(7881299347898367)
  })

  it('throws when the result is out of range', () => {
    expect(() => multiplyRatio(cents(MAX), 3, 2)).toThrow(RangeError)
  })

  it.each([
    [1, 0],
    [1, -2],
    [1, 1.5],
    [1.5, 2],
    [2 ** 53, 1],
    [NaN, 1],
  ])('rejects numerator %s, denominator %s', (numerator, denominator) => {
    expect(() => multiplyRatio(cents(100), numerator, denominator)).toThrow(
      RangeError,
    )
  })
})

describe('parseRatio', () => {
  it.each([
    ['0.75', 75, 100],
    ['0,75', 75, 100],
    ['2', 2, 1],
    ['1.234', 1234, 1000],
    ['  12.5  ', 125, 10],
    ['0', 0, 1],
  ])('reads %j as %s/%s', (input, numerator, denominator) => {
    expect(parseRatio(input)).toEqual({ ok: true, numerator, denominator })
  })

  it.each(['1e3', '-1', '+1', '1.2.3', '1,234.5', '.5', '5.', '1 000', 'abc'])(
    'rejects %j as invalid',
    (input) => {
      expect(parseRatio(input)).toEqual({ ok: false, error: 'invalid' })
    },
  )

  it.each(['', '   '])('returns empty for %j', (input) => {
    expect(parseRatio(input)).toEqual({ ok: false, error: 'empty' })
  })

  it.each(['9007199254740992', '0.0000000000000001'])(
    'returns outOfRange for %j',
    (input) => {
      expect(parseRatio(input)).toEqual({ ok: false, error: 'outOfRange' })
    },
  )
})

describe('allocate', () => {
  it('breaks ties by lowest index', () => {
    expect(allocate(cents(100), [1, 1, 1])).toEqual([34, 33, 33])
    expect(allocate(cents(-100), [1, 1, 1])).toEqual([-34, -33, -33])
  })

  it('gives leftover cents to the largest remainders', () => {
    // Exact shares 16.67, 33.33, 50: the leftover cent goes to index 0.
    expect(allocate(cents(100), [1, 2, 3])).toEqual([17, 33, 50])
  })

  // total × weight exceeds 2^53 in both cases below. The weights are
  // constructed so that float arithmetic gets them wrong, and the expected
  // parts were computed independently with arbitrary-precision integers.
  it('is exact for a share just below an integer', () => {
    // W = 69 999 999 997. The middle share is 333 333 − 1/W, which float
    // division rounds up to 333 333: its floor is 333 332 and its remainder
    // W − 1 is the largest, so it gets a leftover cent.
    const weights = [15_555_563_332, 23_333_309_999, 31_111_126_666]
    expect(1_000_000 * 15_555_563_332).toBeGreaterThan(2 ** 53)
    expect(allocate(cents(1_000_000), weights)).toEqual([
      222222, 333333, 444445,
    ])
    expect(allocate(cents(-1_000_000), weights)).toEqual([
      -222222, -333333, -444445,
    ])
  })

  it('is exact for remainders 1 apart that float sees as a tie', () => {
    // W = 70 000 000 003. Remainders at indexes 0 and 1 are 23 333 333 346
    // and 23 333 333 347, so the one leftover cent goes to index 1, not to
    // index 0 by the tie-break.
    const weights = [15_555_283_334, 38_888_593_335, 15_556_123_334]
    expect(1_000_000 * 15_555_283_334).toBeGreaterThan(2 ** 53)
    expect(allocate(cents(1_000_000), weights)).toEqual([
      222218, 555552, 222230,
    ])
  })

  it('returns zeros for all-zero weights with a zero total', () => {
    const parts = allocate(cents(0), [0, 0])
    expect(parts).toHaveLength(2)
    parts.forEach(expectPositiveZero)
  })

  it.each([
    ['empty weights', []],
    ['a negative weight', [1, -1]],
    ['a fractional weight', [0.5, 1]],
    ['a huge weight', [1e300]],
    ['a NaN weight', [NaN]],
    ['a weight sum above MAX_SAFE_INTEGER', [MAX, 1]],
    ['all-zero weights with a non-zero total', [0, 0, 0]],
  ])('throws on %s', (_, weights) => {
    expect(() => allocate(cents(100), weights)).toThrow(RangeError)
  })

  it('satisfies its guarantees over a seeded sweep', () => {
    const random = seededRandom(20260927)
    for (let run = 0; run < 3000; run++) {
      const total = randomInt(random, -10_000, 10_000)
      const weights = Array.from({ length: randomInt(random, 1, 6) }, () =>
        random() < 0.25 ? 0 : randomInt(random, 1, 1000),
      )
      if (weights.every((weight) => weight === 0)) {
        if (total !== 0) {
          expect(() => allocate(cents(total), weights)).toThrow(RangeError)
        }
        continue
      }

      const parts = allocate(cents(total), weights)
      const weightSum = BigInt(weights.reduce((acc, w) => acc + w, 0))
      const context = `total ${total}, weights [${weights.join(', ')}]`

      expect(sum(parts), context).toBe(total)
      parts.forEach((part, index) => {
        const weight = weights[index] ?? NaN
        // part is the floor or ceiling of total·w/W exactly when
        // |part·W − total·w| < W.
        const error = BigInt(part) * weightSum - BigInt(total) * BigInt(weight)
        expect(error < weightSum && -error < weightSum, context).toBe(true)
        if (weight === 0) {
          expect(Object.is(part, 0), context).toBe(true)
        }
      })
    }
  })
})

// allocate's seeded sweep, as generated cases: total, weights.
function sweepCases(): [number, number[]][] {
  const random = seededRandom(20260927)
  return Array.from({ length: 3000 }, () => [
    randomInt(random, -10_000, 10_000),
    Array.from({ length: randomInt(random, 1, 6) }, () =>
      random() < 0.25 ? 0 : randomInt(random, 1, 1000),
    ),
  ])
}

describe('allocateExact', () => {
  it('is exact for weights beyond 2^53', () => {
    // Equal weights tie, so index 0 gets the leftover cent. With weights
    // 2^60, 2^60, 2^60 + 1, the remainders of 100·wᵢ mod Σw are 2^60 − 33
    // twice and 2^60 + 67, so index 2 gets it: a float sum would see a tie.
    const big = 2n ** 60n
    const weights = [big + 1n, big + 1n, big + 1n]
    expect(allocateExact(cents(100), weights)).toEqual([34, 33, 33])
    expect(allocateExact(cents(100), [big, big, big + 1n])).toEqual([
      33, 33, 34,
    ])
    expect(allocateExact(cents(-100), [big, big, big + 1n])).toEqual([
      -33, -33, -34,
    ])
  })

  it('gives each weight its exact floor or ceiling far beyond 2^53', () => {
    // Weights 10^30, 2·10^30, 3·10^30 split 1 000 001 as 1 : 2 : 3:
    // exact shares 166 666.83, 333 333.67 and 500 000.5.
    const unit = 10n ** 30n
    expect(
      allocateExact(cents(1_000_001), [unit, 2n * unit, 3n * unit]),
    ).toEqual([166667, 333334, 500000])
  })

  it('returns zeros for a zero total over all-zero weights', () => {
    const parts = allocateExact(cents(0), [0n, 0n, 0n])
    expect(parts).toHaveLength(3)
    parts.forEach(expectPositiveZero)
  })

  it('agrees with allocate on its seeded sweep', () => {
    for (const [total, weights] of sweepCases()) {
      if (weights.every((weight) => weight === 0) && total !== 0) {
        continue
      }
      expect(
        allocateExact(
          cents(total),
          weights.map((weight) => BigInt(weight)),
        ),
        `total ${total}, weights [${weights.join(', ')}]`,
      ).toEqual(allocate(cents(total), weights))
    }
  })

  it.each([
    ['empty weights', []],
    ['a negative weight', [1n, -1n]],
    ['all-zero weights with a non-zero total', [0n, 0n, 0n]],
  ])('throws on %s, like allocate', (_, weights) => {
    expect(() => allocateExact(cents(100), weights)).toThrow(RangeError)
  })
})

describe('percentOf', () => {
  function ratio(input: string): Ratio {
    const parsed = parseRatio(input)
    if (!parsed.ok) {
      throw new Error(`test ratio ${input} is invalid`)
    }
    return parsed
  }

  it('takes a decimal percentage of an amount', () => {
    expect(percentOf(cents(1000), ratio('12,5'))).toBe(125)
    expect(percentOf(cents(2000), ratio('10'))).toBe(200)
    expect(percentOf(cents(1234), ratio('0'))).toBe(0)
    expect(percentOf(cents(100), ratio('1000'))).toBe(1000)
  })

  it('rounds half away from zero, both signs', () => {
    // 50 × 1 % = 0.5 cents; 150 × 1 % = 1.5; 149 × 1 % = 1.49.
    expect(percentOf(cents(50), ratio('1'))).toBe(1)
    expect(percentOf(cents(-50), ratio('1'))).toBe(-1)
    expect(percentOf(cents(150), ratio('1'))).toBe(2)
    expect(percentOf(cents(-150), ratio('1'))).toBe(-2)
    expect(percentOf(cents(149), ratio('1'))).toBe(1)
    expect(percentOf(cents(-149), ratio('1'))).toBe(-1)
  })

  it('is exact for the largest bill the split engine allows', () => {
    // 10^14 cents × 1000 % = 10^15 cents, via a 10^20 BigInt product.
    expect(percentOf(cents(1e14), ratio('1000,000'))).toBe(1e15)
  })

  it('throws RangeError when denominator × 100 is unsafe', () => {
    expect(() =>
      percentOf(cents(100), { numerator: 1, denominator: 2 ** 50 }),
    ).toThrow(RangeError)
  })
})

describe('allocateEvenly', () => {
  it('splits into n equal weights', () => {
    expect(allocateEvenly(cents(100), 3)).toEqual([34, 33, 33])
    expect(allocateEvenly(cents(1000), 4)).toEqual([250, 250, 250, 250])
  })

  it.each([0, -1, 1.5, NaN])('rejects n = %s', (n) => {
    expect(() => allocateEvenly(cents(100), n)).toThrow(RangeError)
  })
})

describe('parseAmount', () => {
  const ok = (value: number): ParseAmountResult => ({
    ok: true,
    value: value as Cents,
  })
  const fail = (
    error: 'empty' | 'invalid' | 'subCent' | 'outOfRange',
  ): ParseAmountResult => ({ ok: false, error })

  const rows: [string, MoneyLocale, ParseAmountResult][] = [
    // Plain amounts, with and without a fraction.
    ['12,50', 'pt-PT', ok(1250)],
    ['12,5', 'pt-PT', ok(1250)],
    ['12', 'pt-PT', ok(1200)],
    ['1234', 'pt-PT', ok(123400)],
    ['0012', 'pt-PT', ok(1200)],
    ['0,01', 'pt-PT', ok(1)],
    ['12.50', 'en-GB', ok(1250)],
    ['12', 'en-US', ok(1200)],
    // The euro sign, as a prefix or a suffix, with optional whitespace.
    ['€12,50', 'pt-PT', ok(1250)],
    ['€ 12,50', 'pt-PT', ok(1250)],
    ['12,50€', 'pt-PT', ok(1250)],
    ['12,50 €', 'pt-PT', ok(1250)],
    ['12,50 €', 'pt-PT', ok(1250)],
    ['€1,234.56', 'en-GB', ok(123456)],
    // Sign.
    ['-3,20', 'pt-PT', ok(-320)],
    ['-€3,20', 'pt-PT', ok(-320)],
    ['€-3,20', 'pt-PT', ok(-320)],
    ['-3,20 €', 'pt-PT', ok(-320)],
    ['-€1,234.56', 'en-GB', ok(-123456)],
    ['-0,00', 'pt-PT', ok(0)],
    // Surrounding whitespace, including no-break spaces.
    ['  12,50  ', 'pt-PT', ok(1250)],
    [' 12,50 ', 'pt-PT', ok(1250)],
    // Grouping.
    ['1.234,56', 'pt-PT', ok(123456)],
    ['1.234.567', 'pt-PT', ok(123456700)],
    ['12 345', 'pt-PT', ok(1234500)],
    ['12 345,67', 'pt-PT', ok(1234567)],
    ['12 345,67', 'pt-PT', ok(1234567)],
    ['12 345,67', 'pt-PT', ok(1234567)],
    ['1.234', 'pt-PT', ok(123400)],
    ['1,234.56', 'en-GB', ok(123456)],
    ['1,234', 'en-GB', ok(123400)],
    ['1,234,567.89', 'en-US', ok(123456789)],
    // A lone `.` or `,` followed by 1–2 final digits is the decimal separator.
    ['12.50', 'pt-PT', ok(1250)],
    ['12.5', 'pt-PT', ok(1250)],
    ['12,5', 'en-GB', ok(1250)],
    ['12,50', 'en-US', ok(1250)],
    // More than 2 decimal digits is never rounded.
    ['12,505', 'pt-PT', fail('subCent')],
    ['1,234', 'pt-PT', fail('subCent')],
    ['1.234', 'en-GB', fail('subCent')],
    // Malformed.
    ['12,5,0', 'pt-PT', fail('invalid')],
    ['abc', 'pt-PT', fail('invalid')],
    ['1e3', 'pt-PT', fail('invalid')],
    ['12,', 'pt-PT', fail('invalid')],
    [',50', 'pt-PT', fail('invalid')],
    ['.50', 'pt-PT', fail('invalid')],
    ['.50', 'en-GB', fail('invalid')],
    ['1.23,45', 'pt-PT', fail('invalid')],
    ['12.3456', 'pt-PT', fail('invalid')],
    ['12 34', 'pt-PT', fail('invalid')],
    ['1.234 567', 'pt-PT', fail('invalid')],
    ['1 234.56', 'pt-PT', fail('invalid')],
    ['1.234,56', 'en-GB', fail('invalid')],
    ['12 345.67', 'en-GB', fail('invalid')],
    ['£12.50', 'en-GB', fail('invalid')],
    ['$12.50', 'en-US', fail('invalid')],
    ['EUR 12', 'pt-PT', fail('invalid')],
    ['+12', 'pt-PT', fail('invalid')],
    ['12-', 'pt-PT', fail('invalid')],
    ['--12', 'pt-PT', fail('invalid')],
    ['-€-12', 'pt-PT', fail('invalid')],
    ['- 12', 'pt-PT', fail('invalid')],
    ['(12)', 'pt-PT', fail('invalid')],
    ['€12€', 'pt-PT', fail('invalid')],
    ['€', 'pt-PT', fail('invalid')],
    ['-', 'pt-PT', fail('invalid')],
    ['1.,50', 'pt-PT', fail('invalid')],
    // Nothing to read.
    ['', 'pt-PT', fail('empty')],
    ['   ', 'pt-PT', fail('empty')],
    // Beyond Number.MAX_SAFE_INTEGER cents.
    ['99999999999999999999', 'pt-PT', fail('outOfRange')],
    ['90.071.992.547.409,92', 'pt-PT', fail('outOfRange')],
    ['90.071.992.547.409,91', 'pt-PT', ok(MAX)],
    ['-90.071.992.547.409,91', 'pt-PT', ok(-MAX)],
  ]

  it.each(rows)('reads %j under %s', (input, locale, expected) => {
    expect(parseAmount(input, locale)).toEqual(expected)
  })

  it('defaults to pt-PT', () => {
    expect(parseAmount('1.234,56')).toEqual(ok(123456))
  })

  it('throws RangeError for an unknown locale', () => {
    expect(() => parseAmount('12', 'de-DE' as MoneyLocale)).toThrow(RangeError)
    expect(() => parseAmount('12', 'toString' as MoneyLocale)).toThrow(
      RangeError,
    )
  })

  it('reads every M0 row unchanged with EUR passed explicitly', () => {
    for (const [input, locale, expected] of rows) {
      expect(parseAmount(input, locale, 'EUR'), input).toEqual(expected)
    }
  })

  const currencyRows: [
    string,
    MoneyLocale,
    MoneyCurrency,
    ParseAmountResult,
  ][] = [
    // Each currency's own symbols.
    ['£12.50', 'en-GB', 'GBP', ok(1250)],
    ['-£12.50', 'en-GB', 'GBP', ok(-1250)],
    ['12,50 £', 'pt-PT', 'GBP', ok(1250)],
    ['$12.50', 'en-US', 'USD', ok(1250)],
    ['-$3.20', 'en-US', 'USD', ok(-320)],
    ['US$1,234.56', 'en-GB', 'USD', ok(123456)],
    ['-US$3.20', 'en-GB', 'USD', ok(-320)],
    ['1234,56 US$', 'pt-PT', 'USD', ok(123456)],
    ['-3,20 US$', 'pt-PT', 'USD', ok(-320)],
    ['12,50 $', 'pt-PT', 'USD', ok(1250)],
    ['12.50', 'en-US', 'USD', ok(1250)],
    // Another currency's symbol is invalid.
    ['€12,50', 'en-GB', 'GBP', fail('invalid')],
    ['12,50 €', 'pt-PT', 'USD', fail('invalid')],
    ['US$12.50', 'pt-PT', 'EUR', fail('invalid')],
    ['$12.50', 'en-US', 'EUR', fail('invalid')],
    ['US$12.50', 'en-GB', 'GBP', fail('invalid')],
    ['$12.50', 'en-GB', 'GBP', fail('invalid')],
    ['£12.50', 'en-US', 'USD', fail('invalid')],
    // One symbol at most, and one sign.
    ['US$12.50$', 'en-US', 'USD', fail('invalid')],
    ['$$12.50', 'en-US', 'USD', fail('invalid')],
    ['-$-12.50', 'en-US', 'USD', fail('invalid')],
    ['US12.50', 'en-US', 'USD', fail('invalid')],
  ]

  it.each(currencyRows)(
    'reads %j under %s with %s',
    (input, locale, currency, expected) => {
      expect(parseAmount(input, locale, currency)).toEqual(expected)
    },
  )

  it('throws RangeError for an unknown currency', () => {
    expect(() => parseAmount('12', 'pt-PT', 'JPY' as MoneyCurrency)).toThrow(
      RangeError,
    )
  })
})

describe('formatAmount', () => {
  // Assert on digits, separators and symbol; Intl picks the space character.
  it('formats pt-PT euros', () => {
    expect(formatAmount(cents(1234567))).toMatch(/^12\s345,67\s€$/)
    expect(formatAmount(cents(-1234567))).toMatch(/^-12\s345,67\s€$/)
    expect(formatAmount(cents(5))).toMatch(/^0,05\s€$/)
  })

  it('formats en-GB pounds', () => {
    const options = { locale: 'en-GB', currency: 'GBP' } as const
    expect(formatAmount(cents(123456), options)).toBe('£1,234.56')
    expect(formatAmount(cents(-123456), options)).toBe('-£1,234.56')
  })

  it.each(['JPY', 'KWD'])('throws for %s', (currency) => {
    expect(() => formatAmount(cents(100), { currency })).toThrow(RangeError)
  })

  it('shows the exact digits of the largest amount', () => {
    const formatted = formatAmount(cents(MAX))
    expect(formatted.replace(/\D/g, '')).toBe('9007199254740991')
    expect(formatted).toMatch(/,91\s€$/)
  })
})

describe('supported regions', () => {
  it('lists the three locales and three currencies', () => {
    expect(SUPPORTED_LOCALES).toEqual(['pt-PT', 'en-GB', 'en-US'])
    expect(SUPPORTED_CURRENCIES).toEqual(['EUR', 'GBP', 'USD'])
  })
})

describe('format → parse round trip', () => {
  const fixed = [0, 1, 99, 100, 123_456, 1_000_000, MAX]
  const random = seededRandom(424242)
  const swept = Array.from({ length: 500 }, () =>
    // Log-uniform magnitudes from 1 000 000 cents (10 000 €, where pt-PT
    // grouping starts) up to MAX_SAFE_INTEGER.
    Math.min(MAX, Math.floor(10 ** (6 + random() * 10))),
  )
  const amounts = [...fixed, ...swept].flatMap((n) => [n, -n])

  it.each([
    ['pt-PT', undefined],
    ['en-GB', 'en-GB'],
  ] as const)('round-trips under %s', (_, locale) => {
    for (const amount of amounts) {
      const value = cents(amount)
      const formatted = locale
        ? formatAmount(value, { locale })
        : formatAmount(value)
      expect(parseAmount(formatted, locale ?? 'pt-PT'), formatted).toEqual({
        ok: true,
        value,
      })
    }
  })
})

describe('format → parse round trip in every region', () => {
  const amounts = [0, 5, 320, 123_456, 123_456_789, 10 ** 14].flatMap((n) => [
    n,
    -n,
  ])
  const regions = SUPPORTED_LOCALES.flatMap((locale) =>
    SUPPORTED_CURRENCIES.map((currency) => [locale, currency] as const),
  )

  it.each(regions)('round-trips under %s with %s', (locale, currency) => {
    for (const amount of amounts) {
      const value = cents(amount)
      const formatted = formatAmount(value, { locale, currency })
      expect(parseAmount(formatted, locale, currency), formatted).toEqual({
        ok: true,
        value,
      })
    }
  })
})
