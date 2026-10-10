// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { equalSplit, quickExpense } from '../../test/households.ts'
import {
  categoryTotals,
  inMonth,
  isMonth,
  newestFirst,
  shiftMonth,
  totalOf,
} from './totals.ts'

describe('month totals (H13)', () => {
  const expenses = [
    quickExpense('a', equalSplit(1000, ['ana']), { date: '2026-09-30' }),
    quickExpense('b', equalSplit(2550, ['ana']), {
      date: '2026-10-01',
      category: 'rent',
    }),
    quickExpense('c', equalSplit(450, ['ana']), { date: '2026-10-31' }),
    quickExpense('d', equalSplit(700, ['ana']), { date: '2026-11-01' }),
  ]

  it('takes a month by its dates, first and last day included', () => {
    expect(inMonth(expenses, '2026-10').map((e) => e.id)).toEqual(['b', 'c'])
    expect(totalOf(inMonth(expenses, '2026-10'))).toBe(3000)
  })

  it('sums each category, largest first', () => {
    expect(categoryTotals(inMonth(expenses, '2026-10'))).toEqual([
      { category: 'rent', total: 2550 },
      { category: 'groceries', total: 450 },
    ])
  })

  it('moves between months across years', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    expect(isMonth('2026-13')).toBe(false)
    expect(isMonth('2026-10')).toBe(true)
  })

  it('sorts newest first, then the latest created', () => {
    const sameDay = [
      quickExpense('x', equalSplit(1, ['ana']), {
        createdAt: '2026-10-01T08:00:00Z',
      }),
      quickExpense('y', equalSplit(1, ['ana']), {
        createdAt: '2026-10-01T09:00:00Z',
      }),
    ]
    expect([...sameDay].sort(newestFirst).map((e) => e.id)).toEqual(['y', 'x'])
  })
})
