import { describe, expect, it } from 'vitest'
import type { Cents } from '../../lib/money.ts'
import {
  CATEGORY_CHART_COLOURS,
  categorySlices,
  dailyTotals,
  daysIn,
  inOwnSlice,
  MAX_SLICES,
  monthlyTotals,
  percentages,
} from './charts.ts'
import { CATEGORY_IDS, type CategoryId, type Expense } from './model.ts'
import { categoryTotals, inMonth, totalOf } from './totals.ts'

const c = (n: number) => n as Cents

function expense(
  id: string,
  date: string,
  amount: number,
  category: CategoryId = 'groceries',
): Expense {
  return {
    v: 1,
    id,
    householdId: 'h1',
    description: id,
    date,
    category,
    payerId: 'ana',
    split: { kind: 'equal', amount: c(amount), memberIds: ['ana'] },
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  }
}

describe('category colours', () => {
  it('gives each category its own colour, and Other the neutral', () => {
    const named = CATEGORY_IDS.filter((id) => id !== 'other').map(
      (id) => CATEGORY_CHART_COLOURS[id],
    )
    expect(new Set(named).size).toBe(named.length)
    expect(named.every((colour) => /^var\(--chart-[1-8]\)$/.test(colour))).toBe(
      true,
    )
    expect(CATEGORY_CHART_COLOURS.other).toBe('var(--chart-rest)')
  })
})

describe('categorySlices', () => {
  const totals = (n: number) =>
    CATEGORY_IDS.slice(0, n).map((category, i) => ({
      category,
      total: c((n - i) * 100),
    }))

  it('keeps up to six categories as they are', () => {
    expect(categorySlices(totals(6))).toEqual(totals(6))
    expect(categorySlices([])).toEqual([])
  })

  it('folds the rest past six into one slice, keeping every cent', () => {
    const all = totals(9)
    const slices = categorySlices(all)
    expect(slices).toHaveLength(MAX_SLICES)
    expect(slices.slice(0, 5)).toEqual(all.slice(0, 5))
    expect(slices[5]).toEqual({
      category: null,
      total: c(400 + 300 + 200 + 100),
    })
    expect(slices.reduce((a, s) => a + s.total, 0)).toBe(
      all.reduce((a, s) => a + s.total, 0),
    )
    expect(inOwnSlice(slices, all[0]!.category)).toBe(true)
    expect(inOwnSlice(slices, all[8]!.category)).toBe(false)
  })
})

describe('percentages', () => {
  it('sums to exactly 100 by largest remainder', () => {
    expect(percentages([c(1), c(1), c(1)])).toEqual([34, 33, 33])
    expect(percentages([c(2550), c(450)])).toEqual([85, 15])
    expect(percentages([c(5)])).toEqual([100])
  })

  it('is all zeros for nothing', () => {
    expect(percentages([])).toEqual([])
    expect(percentages([c(0), c(0)])).toEqual([0, 0])
  })
})

describe('dailyTotals', () => {
  const expenses = [
    expense('a', '2026-10-01', 1000),
    expense('b', '2026-10-01', 250),
    expense('c', '2026-10-31', 999),
    expense('d', '2026-09-30', 5000),
    expense('e', '2026-11-01', 7000),
  ]

  it('has one entry per day of the month, summing to the month’s total', () => {
    const days = dailyTotals(expenses, '2026-10')
    expect(days).toHaveLength(31)
    expect(days[0]).toEqual({ date: '2026-10-01', total: 1250 })
    expect(days[30]).toEqual({ date: '2026-10-31', total: 999 })
    expect(days.reduce((a, d) => a + d.total, 0)).toBe(
      totalOf(inMonth(expenses, '2026-10')),
    )
  })

  it('knows the length of every month', () => {
    expect(daysIn('2026-02')).toBe(28)
    expect(daysIn('2028-02')).toBe(29)
    expect(daysIn('2026-04')).toBe(30)
    expect(dailyTotals([], '2026-02')).toHaveLength(28)
  })
})

describe('monthlyTotals', () => {
  it('gives the six months ending with this one, oldest first, across a year', () => {
    const expenses = [
      expense('a', '2026-01-15', 100),
      expense('b', '2025-12-31', 200),
      expense('c', '2025-08-01', 300),
      expense('d', '2025-07-31', 400),
    ]
    expect(monthlyTotals(expenses, '2026-01')).toEqual([
      { month: '2025-08', total: 300 },
      { month: '2025-09', total: 0 },
      { month: '2025-10', total: 0 },
      { month: '2025-11', total: 0 },
      { month: '2025-12', total: 200 },
      { month: '2026-01', total: 100 },
    ])
  })

  it('agrees with the month totals the overview shows', () => {
    const expenses = [
      expense('a', '2026-10-02', 8640, 'utilities'),
      expense('b', '2026-10-03', 4290, 'eatingOut'),
      expense('c', '2026-09-04', 3854, 'internet'),
    ]
    for (const { month, total } of monthlyTotals(expenses, '2026-10')) {
      expect(total).toBe(totalOf(inMonth(expenses, month)))
    }
    const slices = categorySlices(categoryTotals(inMonth(expenses, '2026-10')))
    expect(slices.reduce((a, s) => a + s.total, 0)).toBe(
      totalOf(inMonth(expenses, '2026-10')),
    )
  })
})
