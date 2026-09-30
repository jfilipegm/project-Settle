import { describe, expect, it } from 'vitest'
import { cents } from '../../lib/money.ts'
import { createBill } from '../split/billReducer.ts'
import type { Bill } from '../split/model.ts'
import { billHasContent } from './importUi.ts'
import { warningMessage } from './messages.ts'

const fresh = (): Bill => createBill(['p1', 'p2', 'i1'])

describe('billHasContent', () => {
  it('is false for a fresh bill, or one whose adjustments are zero', () => {
    expect(billHasContent(fresh())).toBe(false)
    expect(
      billHasContent({
        ...fresh(),
        tip: { kind: 'percent', ratio: { numerator: 0, denominator: 1 } },
      }),
    ).toBe(false)
  })

  it('is true for more than one item, a named or priced item, or an adjustment', () => {
    const bill = fresh()
    const item = bill.items[0]!
    expect(
      billHasContent({ ...bill, items: [item, { ...item, id: 'i2' }] }),
    ).toBe(true)
    expect(
      billHasContent({ ...bill, items: [{ ...item, name: 'Wine' }] }),
    ).toBe(true)
    expect(
      billHasContent({ ...bill, items: [{ ...item, unitPrice: cents(1) }] }),
    ).toBe(true)
    expect(
      billHasContent({ ...bill, tax: { kind: 'amount', value: cents(50) } }),
    ).toBe(true)
    expect(
      billHasContent({
        ...bill,
        discount: { kind: 'percent', ratio: { numerator: 10, denominator: 1 } },
      }),
    ).toBe(true)
  })
})

describe('warningMessage', () => {
  it('has a message for every warning, naming the receipt’s currency', () => {
    for (const warning of [
      'noTotal',
      'totalMismatchQr',
      'itemsTruncated',
      'creditNote',
      'lowConfidence',
    ] as const) {
      expect(warningMessage(warning).length).toBeGreaterThan(20)
    }
    expect(warningMessage('currencyDiffers', 'GBP')).toContain('in GBP')
    expect(warningMessage('currencyDiffers', 'GBP')).toContain(
      'Settings → Region',
    )
  })
})
