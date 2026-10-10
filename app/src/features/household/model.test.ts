// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { cents } from '../../lib/money.ts'
import { createBill } from '../split/billReducer.ts'
import {
  equalSplit,
  fourMembers,
  member,
  quickExpense,
  TODAY,
} from '../../test/households.ts'
import {
  activeMembers,
  isActiveOn,
  isIsoDate,
  isoDate,
  isValidName,
  maxExpenseDate,
  referencedMemberIds,
  validateExpense,
  type Expense,
  type ExpenseErrorCode,
} from './model.ts'

const members = fourMembers()

function codes(expense: Expense): ExpenseErrorCode[] {
  return validateExpense(expense, members, TODAY).map((error) => error.code)
}

describe('dates', () => {
  it('accepts real calendar dates only', () => {
    expect(isIsoDate('2026-02-28')).toBe(true)
    expect(isIsoDate('2024-02-29')).toBe(true)
    expect(isIsoDate('2026-02-29')).toBe(false)
    expect(isIsoDate('2026-13-01')).toBe(false)
    expect(isIsoDate('20026-01-01')).toBe(false)
    expect(isIsoDate('2026-1-1')).toBe(false)
    expect(isIsoDate(20260101)).toBe(false)
  })

  it('writes a local date', () => {
    expect(isoDate(new Date(2026, 0, 5))).toBe('2026-01-05')
  })

  it('allows up to a year after today (L1-O3)', () => {
    expect(maxExpenseDate('2026-10-09')).toBe('2027-10-09')
    expect(maxExpenseDate('2028-02-29')).toBe('2029-02-28')
  })
})

describe('members', () => {
  it('is active from joining to leaving, both days included', () => {
    const left = member('m', 'M', 0, {
      joinedOn: '2026-03-01',
      leftOn: '2026-06-30',
    })
    expect(isActiveOn(left, '2026-02-28')).toBe(false)
    expect(isActiveOn(left, '2026-03-01')).toBe(true)
    expect(isActiveOn(left, '2026-06-30')).toBe(true)
    expect(isActiveOn(left, '2026-07-01')).toBe(false)
  })

  it('lists the active members in position order', () => {
    const list = [
      member('b', 'B', 1),
      member('a', 'A', 0),
      member('c', 'C', 2, { leftOn: '2026-05-01' }),
    ]
    expect(activeMembers(list, '2026-10-01').map((m) => m.id)).toEqual([
      'a',
      'b',
    ])
  })

  it('takes trimmed names of 1 to 60 characters', () => {
    expect(isValidName('Ana')).toBe(true)
    expect(isValidName('')).toBe(false)
    expect(isValidName(' Ana')).toBe(false)
    expect(isValidName('x'.repeat(61))).toBe(false)
  })
})

describe('validateExpense', () => {
  it('accepts a valid quick expense, with a payer outside the split', () => {
    const expense = quickExpense('e', equalSplit(1000, ['marta', 'joao']))
    expect(codes(expense)).toEqual([])
    expect(referencedMemberIds(expense)).toEqual(['ana', 'marta', 'joao'])
  })

  it('reports each field', () => {
    const expense = quickExpense('e', equalSplit(0, []), {
      description: ' ',
      date: '1999-12-31',
      category: 'nope' as Expense['category'],
      payerId: 'stranger',
    })
    expect(codes(expense)).toEqual([
      'descriptionInvalid',
      'dateOutOfRange',
      'categoryUnknown',
      'amountOutOfRange',
      'noMembers',
      'unknownMember',
    ])
  })

  it('rejects a date more than a year ahead, and an impossible one', () => {
    expect(
      codes(
        quickExpense('e', equalSplit(100, ['ana']), { date: '2027-10-10' }),
      ),
    ).toEqual(['dateOutOfRange'])
    expect(
      codes(
        quickExpense('e', equalSplit(100, ['ana']), { date: '2026-02-30' }),
      ),
    ).toEqual(['dateInvalid'])
  })

  it('checks shares, exact amounts and percentages', () => {
    expect(
      codes(
        quickExpense('e', {
          kind: 'shares',
          amount: cents(100),
          shares: [
            { memberId: 'ana', weight: 0 },
            { memberId: 'ana', weight: 2 },
          ],
        }),
      ),
    ).toEqual(['duplicateMember', 'shareOutOfRange'])
    expect(
      codes(
        quickExpense('e', {
          kind: 'exact',
          amount: cents(1000),
          amounts: [
            { memberId: 'ana', amount: cents(600) },
            { memberId: 'marta', amount: cents(300) },
          ],
        }),
      ),
    ).toEqual(['exactSumMismatch'])
    expect(
      codes(
        quickExpense('e', {
          kind: 'percent',
          amount: cents(1000),
          percents: [
            { memberId: 'ana', ratio: { numerator: 33333, denominator: 1000 } },
            {
              memberId: 'marta',
              ratio: { numerator: 66666, denominator: 1000 },
            },
          ],
        }),
      ),
    ).toEqual(['percentSumMismatch'])
    expect(
      codes(
        quickExpense('e', {
          kind: 'percent',
          amount: cents(1000),
          percents: [
            { memberId: 'ana', ratio: { numerator: 33333, denominator: 1000 } },
            {
              memberId: 'marta',
              ratio: { numerator: 66667, denominator: 1000 },
            },
          ],
        }),
      ),
    ).toEqual([])
  })

  it('checks an itemised bill and its people-to-member map', () => {
    const bill = createBill(['p1', 'p2', 'i1'])
    const base = quickExpense('e', equalSplit(1, ['ana']))
    const itemised = (
      map: { personId: string; memberId: string }[],
    ): Expense => ({
      ...base,
      split: { kind: 'itemised', bill, members: map },
    })
    // A fresh bill's item has no price: valid as a bill (price 0).
    const good = itemised([
      { personId: 'p1', memberId: 'ana' },
      { personId: 'p2', memberId: 'marta' },
    ])
    expect(codes(good)).toEqual([])
    expect(codes(itemised([{ personId: 'p1', memberId: 'ana' }]))).toEqual([
      'mappingInvalid',
    ])
    expect(
      codes(
        itemised([
          { personId: 'p1', memberId: 'ana' },
          { personId: 'p2', memberId: 'ana' },
        ]),
      ),
    ).toEqual(['duplicateMember'])
  })
})
