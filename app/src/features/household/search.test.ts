// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { translator } from '../../i18n/t.ts'
import { createBill } from '../split/billReducer.ts'
import { equalSplit, quickExpense } from '../../test/households.ts'
import type { Expense } from './model.ts'
import { groupByMonth, matchesFilter, searchText } from './search.ts'

const en = translator('en')
const pt = translator('pt')

const water = quickExpense('w', equalSplit(100, ['ana']), {
  description: 'Água e luz',
  category: 'utilities',
  payerId: 'marta',
})
const bill = createBill(['p1', 'p2', 'i1'])
bill.items[0] = { ...bill.items[0]!, name: 'Pão de forma' }
const shop: Expense = {
  ...quickExpense('s', equalSplit(1, ['ana']), {
    description: 'Compras',
    receipt: { merchant: 'Pingo Doce' },
  }),
  split: {
    kind: 'itemised',
    bill,
    members: [
      { personId: 'p1', memberId: 'ana' },
      { personId: 'p2', memberId: 'joao' },
    ],
  },
}

describe('history search (H12)', () => {
  it('ignores case and accents', () => {
    expect(matchesFilter(water, { query: 'agua' }, en)).toBe(true)
    expect(matchesFilter(water, { query: 'ÁGUA LUZ' }, en)).toBe(true)
    expect(matchesFilter(water, { query: 'gas' }, en)).toBe(false)
  })

  it('finds the shop and the items of an itemised expense', () => {
    expect(matchesFilter(shop, { query: 'pingo' }, en)).toBe(true)
    expect(matchesFilter(shop, { query: 'pao forma' }, en)).toBe(true)
  })

  it('finds the category by its name in the current language', () => {
    expect(matchesFilter(water, { query: 'utilities' }, en)).toBe(true)
    expect(matchesFilter(water, { query: 'agua, luz e gas' }, pt)).toBe(true)
    expect(searchText(water, pt)).toContain('agua, luz e gas')
  })

  it('filters by member: the payer or anyone sharing it', () => {
    expect(matchesFilter(water, { memberId: 'marta' }, en)).toBe(true)
    expect(matchesFilter(water, { memberId: 'ana' }, en)).toBe(true)
    expect(matchesFilter(water, { memberId: 'joao' }, en)).toBe(false)
    expect(matchesFilter(shop, { memberId: 'joao' }, en)).toBe(true)
  })

  it('filters by category, and combines every filter', () => {
    expect(matchesFilter(water, { category: 'utilities' }, en)).toBe(true)
    expect(matchesFilter(water, { category: 'rent' }, en)).toBe(false)
    expect(
      matchesFilter(water, { category: 'utilities', memberId: 'joao' }, en),
    ).toBe(false)
  })

  it('groups by month in the order given', () => {
    const list = [
      quickExpense('a', equalSplit(1, ['ana']), { date: '2026-10-02' }),
      quickExpense('b', equalSplit(1, ['ana']), { date: '2026-10-01' }),
      quickExpense('c', equalSplit(1, ['ana']), { date: '2026-09-30' }),
    ]
    expect(
      groupByMonth(list).map((g) => [g.month, g.expenses.map((e) => e.id)]),
    ).toEqual([
      ['2026-10', ['a', 'b']],
      ['2026-09', ['c']],
    ])
  })
})
