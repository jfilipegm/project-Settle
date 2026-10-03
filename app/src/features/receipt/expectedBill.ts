/**
 * The browser smoke test's expected bill (M2.5 plan, CP4): P2's inputs
 * (`ExpectedBill`) derived from a committed sample's `.expected.json`,
 * which keeps M2's format (`ExpectedReceipt`). The rows are the items'
 * names and line totals and the total is the receipt's; the tax, tip and
 * discount count as the bill holds them, by D13's own rule (the
 * combination order from `toBill.ts`): each only in the first combination
 * that makes the items' sum plus it equal the total, and none otherwise.
 * So a VAT-inclusive receipt's printed tax is a bill tax of none. Pure.
 */
import { cents, type Cents } from '../../lib/money.ts'
import type { ExpectedBill } from './accuracy.ts'
import type { ExpectedReceipt } from './fixtures/textFixtures.ts'
import { COMBINATIONS, type AdjustmentName } from './toBill.ts'

/** A decimal string as cents, exactly (`"12.30"` is 1230). */
function toCents(decimal: string): Cents {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(decimal.trim())
  if (match === null) throw new Error(`Not an amount: "${decimal}"`)
  const [, sign, whole, fraction = ''] = match
  const value = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  return cents(sign === '-' ? -value : value)
}

export function expectedBillOf(receipt: ExpectedReceipt): ExpectedBill {
  if (receipt.total === undefined) {
    throw new Error('The expected receipt has no total')
  }
  const total = toCents(receipt.total)
  const items = receipt.items.map((item) => ({
    name: item.name,
    price: toCents(item.lineTotal),
  }))
  const sum = items.reduce((running, item) => running + item.price, 0)
  const read: Partial<Record<AdjustmentName, Cents>> = {}
  for (const name of ['tax', 'tip', 'discount'] as const) {
    const value = receipt[name]
    if (value !== undefined && toCents(value) > 0) read[name] = toCents(value)
  }
  const amount = (
    combination: readonly AdjustmentName[],
    name: AdjustmentName,
  ) => (combination.includes(name) ? (read[name] ?? 0) : 0)
  const closing = COMBINATIONS.find(
    (combination) =>
      combination.every((name) => read[name] !== undefined) &&
      sum +
        amount(combination, 'tax') +
        amount(combination, 'tip') -
        amount(combination, 'discount') ===
        total,
  )
  const bill: ExpectedBill = { total, items }
  for (const name of closing ?? []) {
    const value = read[name]
    if (value !== undefined) bill[name] = value
  }
  return bill
}
