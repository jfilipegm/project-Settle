import { describe, expect, it } from 'vitest'
import { cents, type Cents, type Ratio } from '../../lib/money.ts'
import {
  lineTotal,
  toBillRatio,
  type Adjustment,
  type Assignment,
  type Bill,
  type BillErrorCode,
  type Item,
  type SplitMode,
} from './model.ts'
import { computeSplit, type SplitResult } from './split.ts'

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

function randomInt(random: () => number, min: number, max: number): number {
  return min + Math.floor(random() * (max - min + 1))
}

const ONE: Ratio = { numerator: 1, denominator: 1 }
const NONE: Adjustment = { kind: 'amount', value: cents(0) }

function amount(value: number): Adjustment {
  return { kind: 'amount', value: cents(value) }
}

function percent(input: string): Adjustment {
  const parsed = toBillRatio(input)
  if (!parsed.ok) {
    throw new Error(`test percentage ${input} is invalid`)
  }
  return { kind: 'percent', ratio: parsed.ratio }
}

/** An item assigned to `who` with weight 1 each, or to explicit weights. */
function item(
  id: string,
  unitPrice: number,
  who: string[] | Record<string, number>,
  quantity: Ratio = ONE,
): Item {
  const assignees: Assignment[] = Array.isArray(who)
    ? who.map((personId) => ({ personId, weight: 1 }))
    : Object.entries(who).map(([personId, weight]) => ({ personId, weight }))
  return { id, name: id, quantity, unitPrice: unitPrice as Cents, assignees }
}

function bill(
  peopleIds: string[],
  items: Item[],
  options: Partial<Omit<Bill, 'people' | 'items'>> = {},
): Bill {
  return {
    people: peopleIds.map((id) => ({ id, name: id })),
    items,
    tax: NONE,
    taxMode: 'proportional',
    tip: NONE,
    tipMode: 'proportional',
    discount: NONE,
    payerId: peopleIds[0] ?? '',
    ...options,
  }
}

function split(input: Bill): SplitResult {
  const outcome = computeSplit(input)
  if (!outcome.ok) {
    throw new Error(`unexpected errors: ${JSON.stringify(outcome.errors)}`)
  }
  return outcome.result
}

function totals(result: SplitResult): number[] {
  return result.people.map((share) => share.total)
}

function lineAmounts(result: SplitResult, personId: string): number[] {
  return (
    result.people
      .find((share) => share.personId === personId)
      ?.lines.map((line) => line.amount) ?? []
  )
}

// An independent exact reference: plain BigInt rationals, computed straight
// from the plan's step 4 formulas, with no common denominator.
interface Fraction {
  n: bigint
  d: bigint
}

function gcd(a: bigint, b: bigint): bigint {
  a = a < 0n ? -a : a
  while (b !== 0n) {
    ;[a, b] = [b, a % b]
  }
  return a
}

function frac(n: bigint, d = 1n): Fraction {
  const g = gcd(n, d) || 1n
  return { n: n / g, d: d / g }
}

function plus(a: Fraction, b: Fraction): Fraction {
  return frac(a.n * b.d + b.n * a.d, a.d * b.d)
}

function times(a: Fraction, b: Fraction): Fraction {
  return frac(a.n * b.n, a.d * b.d)
}

function distance(value: number, exact: Fraction): Fraction {
  const diff = frac(BigInt(value) * exact.d - exact.n, exact.d)
  return diff.n < 0n ? frac(-diff.n, diff.d) : diff
}

function lessThan(a: Fraction, whole: bigint): boolean {
  return a.n < whole * a.d
}

interface Reference {
  exact: Map<string, Fraction>
  /** Exact item, tax and tip parts, then the (negative) discount part. */
  parts: Map<
    string,
    {
      item: Map<string, Fraction>
      tax: Fraction
      tip: Fraction
      discount: Fraction
    }
  >
}

function reference(input: Bill, result: SplitResult): Reference {
  const T = BigInt(result.itemsSubtotal)
  const n = BigInt(input.people.length)
  const parts: Reference['parts'] = new Map()
  for (const person of input.people) {
    parts.set(person.id, {
      item: new Map(),
      tax: frac(0n),
      tip: frac(0n),
      discount: frac(0n),
    })
  }
  const subtotal = new Map(input.people.map((p) => [p.id, frac(0n)]))
  for (const it of input.items) {
    const W = it.assignees.reduce((acc, a) => acc + BigInt(a.weight), 0n)
    for (const a of it.assignees) {
      const share = frac(BigInt(lineTotal(it)) * BigInt(a.weight), W)
      parts.get(a.personId)?.item.set(it.id, share)
      subtotal.set(
        a.personId,
        plus(subtotal.get(a.personId) ?? frac(0n), share),
      )
    }
  }
  const adjustmentPart = (value: Cents, mode: SplitMode, s: Fraction) =>
    mode === 'equal'
      ? frac(BigInt(value), n)
      : T === 0n
        ? frac(0n)
        : times(frac(BigInt(value), T), s)

  const exact = new Map<string, Fraction>()
  for (const person of input.people) {
    const s = subtotal.get(person.id) ?? frac(0n)
    const p = parts.get(person.id)
    if (!p) continue
    p.tax = adjustmentPart(result.tax, input.taxMode, s)
    p.tip = adjustmentPart(result.tip, input.tipMode, s)
    p.discount = times(
      frac(-1n),
      adjustmentPart(result.discount, 'proportional', s),
    )
    exact.set(person.id, plus(plus(plus(s, p.tax), p.tip), p.discount))
  }
  return { exact, parts }
}

describe('computeSplit: properties over a seeded sweep', () => {
  const QUANTITIES: Ratio[] = [
    { numerator: 1, denominator: 1 },
    { numerator: 2, denominator: 1 },
    { numerator: 5, denominator: 10 },
    { numerator: 125, denominator: 100 },
  ]
  const random = seededRandom(20260927)

  function randomAdjustment(maxAmount: number): Adjustment {
    return random() < 0.5
      ? { kind: 'amount', value: cents(randomInt(random, 0, maxAmount)) }
      : {
          kind: 'percent',
          ratio: { numerator: randomInt(random, 0, 30_000), denominator: 1000 },
        }
  }

  function randomBill(): Bill {
    const peopleIds = Array.from(
      { length: randomInt(random, 1, 8) },
      (_, i) => `p${i}`,
    )
    const items = Array.from({ length: randomInt(random, 1, 15) }, (_, i) => {
      let who = peopleIds.filter(() => random() < 0.5)
      if (who.length === 0) {
        who = [peopleIds[randomInt(random, 0, peopleIds.length - 1)] ?? 'p0']
      }
      return item(
        `i${i}`,
        randomInt(random, 0, 50_000),
        Object.fromEntries(who.map((id) => [id, randomInt(random, 1, 5)])),
        QUANTITIES[randomInt(random, 0, QUANTITIES.length - 1)],
      )
    })
    const subtotal = items.reduce((acc, it) => acc + lineTotal(it), 0)
    const mode = (): SplitMode => (random() < 0.5 ? 'proportional' : 'equal')
    return bill(peopleIds, items, {
      tax: randomAdjustment(5000),
      taxMode: mode(),
      tip: randomAdjustment(5000),
      tipMode: mode(),
      discount:
        random() < 0.5
          ? { kind: 'amount', value: cents(randomInt(random, 0, subtotal)) }
          : {
              kind: 'percent',
              ratio: {
                numerator: randomInt(random, 0, 100_000),
                denominator: 1000,
              },
            },
      payerId: peopleIds[randomInt(random, 0, peopleIds.length - 1)] ?? 'p0',
    })
  }

  it('holds every guarantee of steps 4–6', () => {
    let computed = 0
    for (let run = 0; run < 1500; run++) {
      const input = randomBill()
      const outcome = computeSplit(input)
      if (!outcome.ok) {
        // Only an all-zero subtotal with a proportional tax or tip.
        expect(outcome.errors.map((e) => e.code)).toEqual(
          expect.arrayContaining(['proportionalWithZeroSubtotal']) as unknown,
        )
        continue
      }
      computed++
      const { result } = outcome
      const context = JSON.stringify(input)
      const ref = reference(input, result)

      // The totals sum to the bill total exactly, and each is the floor or
      // the ceiling of the exact share.
      expect(
        totals(result).reduce((acc, t) => acc + t, 0),
        context,
      ).toBe(result.total)
      for (const share of result.people) {
        const exact = ref.exact.get(share.personId) ?? frac(0n)
        expect(lessThan(distance(share.total, exact), 1n), context).toBe(true)
        expect(Object.is(share.total, -0), context).toBe(false)
      }

      // Each breakdown sums to its total, each line is within 3 cents of
      // its exact value, and the discount lines sum to the discount.
      let discountLines = 0
      for (const share of result.people) {
        const exact = ref.parts.get(share.personId)
        expect(
          share.lines.reduce((acc, line) => acc + line.amount, 0),
          context,
        ).toBe(share.total)
        for (const line of share.lines) {
          const value =
            line.kind === 'item'
              ? exact?.item.get(line.itemId)
              : exact?.[line.kind]
          expect(value, context).toBeDefined()
          expect(
            lessThan(distance(line.amount, value ?? frac(0n)), 3n),
            `${context} ${JSON.stringify(line)}`,
          ).toBe(true)
          if (line.kind === 'discount') {
            discountLines += line.amount
          }
        }
      }
      expect(discountLines, context).toBe(-(result.discount as number))

      // Deterministic.
      expect(computeSplit(input)).toEqual(outcome)
    }
    expect(computed).toBeGreaterThan(1400)
  })
})

describe('computeSplit: hand-computed examples', () => {
  it('splits one item three ways', () => {
    expect(
      totals(split(bill(['a', 'b', 'c'], [item('x', 1000, ['a', 'b', 'c'])]))),
    ).toEqual([334, 333, 333])
  })

  it('splits by custom shares 2 : 1', () => {
    // 1000 × 2/3 = 666.67, 1000 × 1/3 = 333.33.
    expect(
      totals(split(bill(['a', 'b'], [item('x', 1000, { a: 2, b: 1 })]))),
    ).toEqual([667, 333])
  })

  it('rounds a fractional quantity once per line', () => {
    // 0,75 × 3,99 € = 2,9925 €, rounded once to 2,99 €.
    const result = split(
      bill(['a'], [item('x', 399, ['a'], { numerator: 75, denominator: 100 })]),
    )
    expect(result.itemsSubtotal).toBe(299)
    expect(totals(result)).toEqual([299])
  })

  describe('a 10 % tip, with a person who has no items', () => {
    // a: 20,00 €, b: 10,00 €, c: nothing. Tip = 3,00 €.
    const items = [item('x', 2000, ['a']), item('y', 1000, ['b'])]

    it('proportional: c pays nothing', () => {
      const result = split(bill(['a', 'b', 'c'], items, { tip: percent('10') }))
      expect(result.tip).toBe(300)
      expect(totals(result)).toEqual([2200, 1100, 0])
    })

    it('equal: c pays a third of the tip', () => {
      const result = split(
        bill(['a', 'b', 'c'], items, { tip: percent('10'), tipMode: 'equal' }),
      )
      expect(totals(result)).toEqual([2100, 1100, 100])
      expect(lineAmounts(result, 'c')).toEqual([100])
    })
  })

  it('splits a fixed discount proportionally', () => {
    // 3,00 € off 30,00 €: a pays 20,00 − 2,00, b pays 10,00 − 1,00.
    const result = split(
      bill(['a', 'b'], [item('x', 2000, ['a']), item('y', 1000, ['b'])], {
        discount: amount(300),
      }),
    )
    expect(result.total).toBe(2700)
    expect(totals(result)).toEqual([1800, 900])
    expect(lineAmounts(result, 'a')).toEqual([2000, -200])
    expect(lineAmounts(result, 'b')).toEqual([1000, -100])
  })

  it('adds a percentage tax', () => {
    // 23 % of 15,55 € = 3,5765 € → 3,58 €. Exact shares 12,302 and 6,828:
    // floors 1230 + 682 = 1912, and the leftover cent goes to b's .7749.
    const result = split(
      bill(['a', 'b'], [item('x', 1000, ['a']), item('y', 555, ['b'])], {
        tax: percent('23'),
      }),
    )
    expect(result.tax).toBe(358)
    expect(result.total).toBe(1913)
    expect(totals(result)).toEqual([1230, 683])
  })

  it('allocates once per bill, not item by item (the fairness case)', () => {
    const items = Array.from({ length: 10 }, (_, i) =>
      item(`i${i}`, 100, ['a', 'b', 'c']),
    )
    const result = split(bill(['a', 'b', 'c'], items))

    // Item by item, a would absorb every leftover cent: 3,40 / 3,30 / 3,30.
    expect(totals(result)).toEqual([334, 333, 333])
    expect(lineAmounts(result, 'a')).toEqual([
      34, 34, 34, 34, 33, 33, 33, 33, 33, 33,
    ])
    expect(lineAmounts(result, 'b')).toEqual([
      34, 34, 34, 33, 33, 33, 33, 33, 33, 33,
    ])
    expect(lineAmounts(result, 'c')).toEqual([
      34, 34, 34, 33, 33, 33, 33, 33, 33, 33,
    ])
    for (const share of result.people) {
      expect(share.lines.every((line) => line.kind === 'item')).toBe(true)
    }
  })

  it('computes the zero bill end to end', () => {
    const result = split(
      bill(['a', 'b'], [item('x', 0, ['a']), item('y', 0, ['a', 'b'])], {
        tip: amount(0),
        tipMode: 'equal',
      }),
    )
    expect(result.itemsSubtotal).toBe(0)
    expect(result.total).toBe(0)
    for (const share of result.people) {
      expect(Object.is(share.total, 0)).toBe(true)
    }
    expect(result.settlements).toEqual([])
  })

  it('splits a fixed equal tip on a zero subtotal', () => {
    const result = split(
      bill(['a', 'b', 'c'], [item('x', 0, ['a'])], {
        tip: amount(100),
        tipMode: 'equal',
      }),
    )
    expect(totals(result)).toEqual([34, 33, 33])
  })
})

describe('computeSplit: validation', () => {
  function errorCodes(input: Bill): BillErrorCode[] {
    const outcome = computeSplit(input)
    return outcome.ok ? [] : outcome.errors.map((error) => error.code)
  }

  const valid = () => bill(['a', 'b'], [item('x', 1000, ['a', 'b'])])

  it('accepts a valid bill', () => {
    expect(errorCodes(valid())).toEqual([])
  })

  it.each<[string, (b: Bill) => Bill, BillErrorCode]>([
    [
      'an unassigned item',
      (b) => ({ ...b, items: [item('x', 1000, [])] }),
      'unassignedItem',
    ],
    [
      'a discount above the subtotal',
      (b) => ({ ...b, discount: amount(1001) }),
      'discountAboveSubtotal',
    ],
    [
      'a discount above 100 %',
      (b) => ({ ...b, discount: percent('100,1') }),
      'discountAboveSubtotal',
    ],
    [
      'a proportional tip with a zero subtotal',
      (b) => ({ ...b, items: [item('x', 0, ['a'])], tip: amount(100) }),
      'proportionalWithZeroSubtotal',
    ],
    [
      '0 people',
      (b) => ({ ...b, people: [], items: [item('x', 1000, [])] }),
      'limitExceeded',
    ],
    [
      '21 people',
      (b) => ({
        ...b,
        people: Array.from({ length: 21 }, (_, i) => ({
          id: `p${i}`,
          name: '',
        })),
        payerId: 'p0',
        items: [item('x', 1000, ['p0'])],
      }),
      'limitExceeded',
    ],
    ['0 items', (b) => ({ ...b, items: [] }), 'limitExceeded'],
    [
      '101 items',
      (b) => ({
        ...b,
        items: Array.from({ length: 101 }, (_, i) => item(`i${i}`, 1, ['a'])),
      }),
      'limitExceeded',
    ],
    [
      'an item name of 61 characters',
      (b) => ({
        ...b,
        items: [{ ...item('x', 1, ['a']), name: 'x'.repeat(61) }],
      }),
      'limitExceeded',
    ],
    [
      'a person name of 61 characters',
      (b) => ({
        ...b,
        people: [
          { id: 'a', name: 'x'.repeat(61) },
          { id: 'b', name: '' },
        ],
      }),
      'limitExceeded',
    ],
    [
      'a unit price of 1 000 000,01',
      (b) => ({ ...b, items: [item('x', 100_000_001, ['a'])] }),
      'amountOutOfRange',
    ],
    [
      'a unit price of 1.5 cents',
      (b) => ({ ...b, items: [item('x', 1.5, ['a'])] }),
      'amountOutOfRange',
    ],
    [
      'a negative unit price',
      (b) => ({ ...b, items: [item('x', -1, ['a'])] }),
      'amountOutOfRange',
    ],
    [
      'a NaN tip',
      (b) => ({ ...b, tip: { kind: 'amount', value: NaN as Cents } }),
      'amountOutOfRange',
    ],
    [
      'a quantity of 0',
      (b) => ({
        ...b,
        items: [item('x', 1, ['a'], { numerator: 0, denominator: 1 })],
      }),
      'quantityOutOfRange',
    ],
    [
      'a quantity of 10 000,5',
      (b) => ({
        ...b,
        items: [item('x', 1, ['a'], { numerator: 100_005, denominator: 10 })],
      }),
      'quantityOutOfRange',
    ],
    [
      'a quantity with 4 significant decimals',
      (b) => ({
        ...b,
        items: [item('x', 1, ['a'], { numerator: 1, denominator: 10_000 })],
      }),
      'quantityOutOfRange',
    ],
    [
      'a quantity ratio with denominator 0',
      (b) => ({
        ...b,
        items: [item('x', 1, ['a'], { numerator: 1, denominator: 0 })],
      }),
      'quantityOutOfRange',
    ],
    [
      'a quantity ratio with denominator 3',
      (b) => ({
        ...b,
        items: [item('x', 1, ['a'], { numerator: 1, denominator: 3 })],
      }),
      'quantityOutOfRange',
    ],
    [
      'a 1000,5 % tip',
      (b) => ({ ...b, tip: percent('1000,5') }),
      'percentOutOfRange',
    ],
    [
      'a percentage with a negative numerator',
      (b) => ({
        ...b,
        tax: { kind: 'percent', ratio: { numerator: -10, denominator: 1 } },
      }),
      'percentOutOfRange',
    ],
    [
      'a share weight of 0',
      (b) => ({ ...b, items: [item('x', 1000, { a: 0, b: 0 })] }),
      'shareOutOfRange',
    ],
    [
      'a share weight of 1.5',
      (b) => ({ ...b, items: [item('x', 1000, { a: 1.5 })] }),
      'shareOutOfRange',
    ],
    [
      'a share weight of 100',
      (b) => ({ ...b, items: [item('x', 1000, { a: 100 })] }),
      'shareOutOfRange',
    ],
    [
      'an unknown assignee',
      (b) => ({ ...b, items: [item('x', 1000, ['a', 'zz'])] }),
      'invalidReference',
    ],
    [
      'a person assigned twice to one item',
      (b) => ({ ...b, items: [item('x', 1000, ['a', 'a'])] }),
      'invalidReference',
    ],
    [
      'a duplicate person id',
      (b) => ({
        ...b,
        people: [
          { id: 'a', name: '' },
          { id: 'a', name: '' },
        ],
      }),
      'invalidReference',
    ],
    [
      'a duplicate item id',
      (b) => ({ ...b, items: [item('x', 1, ['a']), item('x', 2, ['b'])] }),
      'invalidReference',
    ],
    [
      'a payer who is not a person',
      (b) => ({ ...b, payerId: 'zz' }),
      'invalidReference',
    ],
  ])('reports %s, without throwing', (_, change, code) => {
    const input = change(valid())
    let codes: BillErrorCode[] = []
    expect(() => {
      codes = errorCodes(input)
    }).not.toThrow()
    expect(codes).toContain(code)
  })

  it('accepts a proportional percentage on a zero subtotal (it is 0)', () => {
    expect(
      errorCodes({
        ...valid(),
        items: [item('x', 0, ['a'])],
        tax: percent('10'),
      }),
    ).toEqual([])
  })

  it('points each error at its field', () => {
    const outcome = computeSplit({
      ...valid(),
      items: [item('x', 1000, { a: 1, b: 100 })],
      tip: percent('2000'),
    })
    expect(outcome.ok).toBe(false)
    expect(outcome.ok ? [] : outcome.errors).toEqual([
      {
        code: 'shareOutOfRange',
        field: { kind: 'share', itemId: 'x', personId: 'b' },
      },
      {
        code: 'percentOutOfRange',
        field: { kind: 'adjustment', adjustment: 'tip' },
      },
    ])
  })

  it('never throws for an unbounded bill passed straight to computeSplit', () => {
    const huge: Bill = {
      ...valid(),
      items: [
        item('x', Number.MAX_SAFE_INTEGER, ['a'], {
          numerator: Number.MAX_SAFE_INTEGER,
          denominator: 1,
        }),
      ],
      tip: {
        kind: 'percent',
        ratio: { numerator: Number.MAX_SAFE_INTEGER, denominator: 1 },
      },
      discount: { kind: 'amount', value: Infinity as Cents },
    }
    expect(() => computeSplit(huge)).not.toThrow()
    expect(computeSplit(huge).ok).toBe(false)
  })
})

describe('toBillRatio', () => {
  it.each([
    ['1,0000', 1, 1],
    ['10,500', 105, 10],
    ['0,75', 75, 100],
    ['12,5', 125, 10],
    ['0', 0, 1],
    ['0,000', 0, 1],
  ])('reads %j as %s/%s', (input, numerator, denominator) => {
    expect(toBillRatio(input)).toEqual({
      ok: true,
      ratio: { numerator, denominator },
    })
  })

  it('rejects more than 3 significant decimals', () => {
    expect(toBillRatio('0,0001')).toEqual({
      ok: false,
      error: 'tooManyDecimals',
    })
  })

  it('passes on parseRatio errors', () => {
    expect(toBillRatio('')).toEqual({ ok: false, error: 'empty' })
    expect(toBillRatio('-1')).toEqual({ ok: false, error: 'invalid' })
  })

  it('a stored 0,0001 is quantityOutOfRange', () => {
    const outcome = computeSplit(
      bill(
        ['a'],
        [item('x', 100, ['a'], { numerator: 1, denominator: 10_000 })],
      ),
    )
    expect(outcome.ok ? [] : outcome.errors.map((e) => e.code)).toEqual([
      'quantityOutOfRange',
    ])
  })
})

describe('settle-up', () => {
  const items = [
    item('x', 1000, ['a']),
    item('y', 600, ['b']),
    item('z', 0, ['c']),
  ]

  it('has everyone else with something to pay pay the payer', () => {
    expect(split(bill(['a', 'b', 'c'], items)).settlements).toEqual([
      { fromId: 'b', toId: 'a', amount: 600 },
    ])
  })

  it('follows the payer', () => {
    expect(
      split(bill(['a', 'b', 'c'], items, { payerId: 'c' })).settlements,
    ).toEqual([
      { fromId: 'a', toId: 'c', amount: 1000 },
      { fromId: 'b', toId: 'c', amount: 600 },
    ])
  })
})
