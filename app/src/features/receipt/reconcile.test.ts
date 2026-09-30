import { describe, expect, it } from 'vitest'
import { cents } from '../../lib/money.ts'
import { createBill } from '../split/billReducer.ts'
import type { Bill } from '../split/model.ts'
import type { ReceiptSummary } from './model.ts'
import { checkReceipt } from './reconcile.ts'

function billOf(...prices: number[]): Bill {
  const bill = createBill(['a', 'b', 'unused'])
  return {
    ...bill,
    items: prices.map((price, i) => ({
      id: `item-${i}`,
      name: `Item ${i}`,
      quantity: { numerator: 1, denominator: 1 },
      unitPrice: cents(price),
      assignees: [{ personId: 'a', weight: 1 }],
    })),
  }
}

function summary(total?: number): ReceiptSummary {
  return total === undefined
    ? { warnings: [], flaggedItemIds: [] }
    : {
        total: cents(total),
        totalSource: 'printed',
        warnings: [],
        flaggedItemIds: [],
      }
}

describe('checkReceipt', () => {
  it('matches when the bill total equals the receipt total', () => {
    expect(checkReceipt(billOf(950, 1390), summary(2340))).toEqual({
      status: 'match',
      billTotal: 2340,
      receiptTotal: 2340,
    })
  })

  it('reports a bill that adds up to less than the receipt', () => {
    expect(checkReceipt(billOf(950), summary(2340))).toEqual({
      status: 'mismatch',
      billTotal: 950,
      receiptTotal: 2340,
      difference: -1390,
    })
  })

  it('reports a bill that adds up to more than the receipt', () => {
    expect(checkReceipt(billOf(950, 1390, 100), summary(2340))).toMatchObject({
      status: 'mismatch',
      difference: 100,
    })
  })

  it('counts tax, tip and discount in the bill total', () => {
    const bill: Bill = {
      ...billOf(2000),
      tax: { kind: 'amount', value: cents(160) },
      tip: { kind: 'amount', value: cents(400) },
    }
    expect(checkReceipt(bill, summary(2560)).status).toBe('match')
  })

  it('has nothing to compare without a receipt total', () => {
    expect(checkReceipt(billOf(950), summary())).toEqual({ status: 'noTotal' })
  })

  it('reports an invalid bill', () => {
    const bill: Bill = { ...billOf(950), payerId: 'nobody' }
    expect(checkReceipt(bill, summary(950))).toEqual({ status: 'billInvalid' })
  })
})
