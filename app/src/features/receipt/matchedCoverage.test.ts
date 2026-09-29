import { describe, expect, it } from 'vitest'
import { cents } from '../../lib/money.ts'
import { matchedCoverage } from './matchedCoverage.ts'

const read = (...items: [string, number][]) =>
  items.map(([name, amount]) => ({ name, amount: cents(amount) }))
const expected = (...amounts: number[]) => amounts.map(cents)

describe('matchedCoverage (R19)', () => {
  it('gives the matched items’ sum over the total', () => {
    expect(
      matchedCoverage(
        read(['Pão', 100], ['Queijo', 300]),
        expected(100, 300, 600),
        cents(1000),
      ),
    ).toEqual({ coverage: 0.4, matchedSum: 400, unmatchedSum: 0 })
  })

  it('matches a price read twice only once', () => {
    expect(
      matchedCoverage(
        read(['Pão', 100], ['Pão', 100]),
        expected(100, 900),
        cents(1000),
      ),
    ).toEqual({ coverage: 0.1, matchedSum: 100, unmatchedSum: 100 })
  })

  it('never counts un-cut tax-table rows, however much they add up to', () => {
    const rows = read(['lVA 23%', 300], ['Base', 200], ['Val.Total', 100])
    expect(matchedCoverage(rows, expected(150, 250, 600), cents(1000))).toEqual(
      { coverage: 0, matchedSum: 0, unmatchedSum: 600 },
    )
  })

  it('never exceeds 100 %', () => {
    // Expected items that sum over the total (the promotions they carry).
    const result = matchedCoverage(
      read(['A', 500], ['B', 700]),
      expected(500, 700),
      cents(1000),
    )
    expect(result.coverage).toBe(1)
  })

  it('leaves the “Not read from the receipt” item out', () => {
    expect(
      matchedCoverage(
        read(['Not read from the receipt', 1000]),
        expected(1000),
        cents(1000),
      ),
    ).toEqual({ coverage: 0, matchedSum: 0, unmatchedSum: 0 })
  })
})
