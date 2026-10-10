// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { cents, sum, type Cents } from '../../lib/money.ts'
import { createBill } from '../split/billReducer.ts'
import { quickExpense } from '../../test/households.ts'
import type { Expense, QuickSplit } from './model.ts'
import { allocateRotated, expenseAmount, expenseShares } from './shares.ts'

function shares(expense: Expense): Cents[] {
  return [...(expenseShares(expense) ?? new Map<string, Cents>()).values()]
}

describe('expenseShares, M1’s exactness guarantees (REQ-11)', () => {
  it('gives 0,01 split three ways to exactly one member', () => {
    const parts = shares(
      quickExpense('x', {
        kind: 'equal',
        amount: cents(1),
        memberIds: ['a', 'b', 'c'],
      }),
    )
    expect(parts.sort()).toEqual([0, 0, 1])
  })

  it('splits 1 000 000,00 by 99/1 exactly', () => {
    const parts = shares(
      quickExpense('x', {
        kind: 'shares',
        amount: cents(100_000_000),
        shares: [
          { memberId: 'a', weight: 99 },
          { memberId: 'b', weight: 1 },
        ],
      }),
    )
    expect(parts).toEqual([99_000_000, 1_000_000])
  })

  it('takes percentages with three decimals summing to 100', () => {
    const parts = shares(
      quickExpense('x', {
        kind: 'percent',
        amount: cents(1000),
        percents: [
          { memberId: 'a', ratio: { numerator: 33333, denominator: 1000 } },
          { memberId: 'b', ratio: { numerator: 33333, denominator: 1000 } },
          { memberId: 'c', ratio: { numerator: 33334, denominator: 1000 } },
        ],
      }),
    )
    expect(sum(parts)).toBe(1000)
    expect(Math.max(...parts) - Math.min(...parts)).toBeLessThanOrEqual(1)
  })

  it('keeps exact amounts as entered', () => {
    expect(
      shares(
        quickExpense('x', {
          kind: 'exact',
          amount: cents(1000),
          amounts: [
            { memberId: 'a', amount: cents(250) },
            { memberId: 'b', amount: cents(750) },
          ],
        }),
      ),
    ).toEqual([250, 750])
  })

  it('returns null for exact amounts or percentages that don’t add up', () => {
    expect(
      expenseShares(
        quickExpense('x', {
          kind: 'exact',
          amount: cents(1000),
          amounts: [{ memberId: 'a', amount: cents(999) }],
        }),
      ),
    ).toBeNull()
    expect(
      expenseShares(
        quickExpense('x', {
          kind: 'percent',
          amount: cents(1000),
          percents: [
            { memberId: 'a', ratio: { numerator: 99, denominator: 1 } },
          ],
        }),
      ),
    ).toBeNull()
  })

  it('rotates the leftover cent by expense id, deterministically (H5)', () => {
    const receivers = new Set<number>()
    for (let i = 0; i < 60; i++) {
      const parts = allocateRotated(cents(1), [1, 1, 1], `expense-${i}`)
      receivers.add(parts.indexOf(cents(1)))
      expect(allocateRotated(cents(1), [1, 1, 1], `expense-${i}`)).toEqual(
        parts,
      )
    }
    expect(receivers).toEqual(new Set([0, 1, 2]))
  })

  it('derives an itemised expense from computeSplit', () => {
    const bill = createBill(['p1', 'p2', 'i1'])
    bill.items[0] = { ...bill.items[0]!, unitPrice: cents(1001) }
    const expense: Expense = {
      ...quickExpense('x', {
        kind: 'equal',
        amount: cents(1),
        memberIds: ['a'],
      }),
      split: {
        kind: 'itemised',
        bill,
        members: [
          { personId: 'p1', memberId: 'ana' },
          { personId: 'p2', memberId: 'marta' },
        ],
      },
    }
    const result = expenseShares(expense)
    expect(result).not.toBeNull()
    expect([...result!.keys()]).toEqual(['ana', 'marta'])
    expect(sum([...result!.values()])).toBe(1001)
    expect(expenseAmount(expense)).toBe(1001)
  })

  it('holds the sum invariant over 2000 seeded random expenses', () => {
    let seed = 20261009
    const random = () => {
      seed = (Math.imul(seed, 1103515245) + 12345) >>> 0
      return seed / 2 ** 32
    }
    const int = (min: number, max: number) =>
      min + Math.floor(random() * (max - min + 1))
    for (let n = 0; n < 2000; n++) {
      const count = int(1, 20)
      const ids = Array.from({ length: count }, (_, i) => `m${i}`)
      const amount = cents(int(1, 100_000_000))
      let split: QuickSplit
      switch (n % 4) {
        case 0:
          split = { kind: 'equal', amount, memberIds: ids }
          break
        case 1:
          split = {
            kind: 'shares',
            amount,
            shares: ids.map((memberId) => ({ memberId, weight: int(1, 99) })),
          }
          break
        case 2: {
          let left: number = amount
          const amounts = ids.map((memberId, i) => {
            const part = i === ids.length - 1 ? left : int(0, left)
            left -= part
            return { memberId, amount: cents(part) }
          })
          split = { kind: 'exact', amount, amounts }
          break
        }
        default: {
          let left = 100_000
          const percents = ids.map((memberId, i) => {
            const part = i === ids.length - 1 ? left : int(0, left)
            left -= part
            return { memberId, ratio: { numerator: part, denominator: 1000 } }
          })
          split = { kind: 'percent', amount, percents }
        }
      }
      const parts = shares(quickExpense(`e${n}`, split))
      expect(parts).toHaveLength(count)
      expect(sum(parts)).toBe(amount)
      expect(parts.every((part) => part >= 0)).toBe(true)
      if (split.kind === 'equal') {
        expect(Math.max(...parts) - Math.min(...parts)).toBeLessThanOrEqual(1)
      }
    }
  })
})
