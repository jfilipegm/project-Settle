import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { cents } from '../../lib/money.ts'
import { createBill } from '../split/billReducer.ts'
import { scoreImage } from './accuracy.ts'
import { expectedBillOf } from './expectedBill.ts'
import type { ExpectedReceipt } from './fixtures/textFixtures.ts'
import type { ParsedReceipt } from './model.ts'
import { receiptToBill } from './toBill.ts'

const FIXTURES = path.resolve('src/features/receipt/fixtures')

async function expectedFile(file: string): Promise<ExpectedReceipt> {
  return JSON.parse(
    await readFile(path.join(FIXTURES, file), 'utf8'),
  ) as ExpectedReceipt
}

/** The bill a correct read of `expected` gives, through the real D13. */
function correctBill(expected: ExpectedReceipt) {
  const amount = (value: string) => cents(Math.round(Number(value) * 100))
  const receipt: ParsedReceipt = {
    items: expected.items.map((item) => ({
      name: item.name,
      quantity: { numerator: 1, denominator: 1 },
      unitPrice: amount(item.lineTotal),
      lineTotal: amount(item.lineTotal),
      needsCheck: false,
    })),
    ...(expected.total !== undefined && { total: amount(expected.total) }),
    ...(expected.tax !== undefined && { tax: amount(expected.tax) }),
    ...(expected.tip !== undefined && { tip: amount(expected.tip) }),
    warnings: [],
  }
  let n = 0
  return receiptToBill(
    receipt,
    undefined,
    createBill(['p1', 'old']),
    () => `item-${++n}`,
  )
}

describe('expectedBillOf (the smoke test’s --expect-bill, M2.5 CP4)', () => {
  it('gives sample 1 (VAT in its prices) a bill tax of none, and its correct bill passes', async () => {
    const expected = await expectedFile('browser/sample-1.expected.json')
    const bill = expectedBillOf(expected)
    expect(bill.total).toBe(2000)
    expect(bill.tax).toBeUndefined()
    expect(bill.items.map((item) => item.price)).toEqual([
      320, 950, 420, 160, 150,
    ])
    const correct = correctBill(expected)
    expect(scoreImage(correct.bill, correct.summary, bill).noEditNeeded).toBe(
      true,
    )
  })

  it('gives an added tax and a tip as adjustments (as 07-us-diner)', async () => {
    const expected = await expectedFile('receipts/07-us-diner.expected.json')
    const bill = expectedBillOf(expected)
    expect(bill).toMatchObject({ total: 4298, tax: 278, tip: 650 })
    expect(bill.discount).toBeUndefined()
    const correct = correctBill(expected)
    expect(scoreImage(correct.bill, correct.summary, bill).noEditNeeded).toBe(
      true,
    )
  })

  it('fails a wrong bill', async () => {
    const expected = await expectedFile('browser/sample-1.expected.json')
    const wrong = correctBill({
      ...expected,
      items: expected.items.map((item, index) =>
        index === 0 ? { ...item, lineTotal: '3.10' } : item,
      ),
    })
    expect(
      scoreImage(wrong.bill, wrong.summary, expectedBillOf(expected))
        .noEditNeeded,
    ).toBe(false)
  })
})
