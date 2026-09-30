/**
 * The check panel's live comparison (M2 plan, D14): the bill total from
 * `computeSplit` against the receipt's trusted total.
 */
import { subtract, type Cents } from '../../lib/money.ts'
import type { Bill } from '../split/model.ts'
import { computeSplit } from '../split/split.ts'
import type { ReceiptSummary } from './model.ts'

export type ReceiptCheck =
  | { status: 'match'; billTotal: Cents; receiptTotal: Cents }
  | {
      status: 'mismatch'
      billTotal: Cents
      receiptTotal: Cents
      /** Bill total − receipt total: negative when the items add up to less. */
      difference: Cents
    }
  /** The receipt has no trusted total to compare with. */
  | { status: 'noTotal' }
  /** The bill can't be split yet, so it has no total. */
  | { status: 'billInvalid' }

export function checkReceipt(
  bill: Bill,
  summary: ReceiptSummary,
): ReceiptCheck {
  const receiptTotal = summary.total
  if (receiptTotal === undefined) {
    return { status: 'noTotal' }
  }
  const outcome = computeSplit(bill)
  if (!outcome.ok) {
    return { status: 'billInvalid' }
  }
  const billTotal = outcome.result.total
  const difference = subtract(billTotal, receiptTotal)
  return difference === 0
    ? { status: 'match', billTotal, receiptTotal }
    : { status: 'mismatch', billTotal, receiptTotal, difference }
}
