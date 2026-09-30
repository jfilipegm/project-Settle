/**
 * The review step's decisions (remediation plan, R12–R15 and R24), pure:
 * what the check panel and the result section say about a receipt whose
 * items don't match its total, and what they offer to fix it.
 */
import type { Region } from '../../app/region.ts'
import { formatAmount, negate, sum, type Cents } from '../../lib/money.ts'
import { LIMITS, lineTotal, type Bill } from '../split/model.ts'
import { NOT_READ_ITEM_NAME } from './messages.ts'
import type { ReceiptSummary } from './model.ts'
import type { ReceiptCheck } from './reconcile.ts'

/** R15: under this share of the total read, the read is called incomplete. */
export const INCOMPLETE_BELOW = 0.8

/**
 * R15's in-app coverage (R19): the items' sum, the "Not read from the
 * receipt" item left out, over the receipt's total. Computed live, never
 * saved.
 */
export function readShare(
  bill: Bill,
  summary: ReceiptSummary,
): { read: Cents; share: number } | undefined {
  if (summary.total === undefined || summary.total <= 0) {
    return undefined
  }
  const read = sum(
    bill.items
      .filter((item) => item.name !== NOT_READ_ITEM_NAME)
      .map((item) => lineTotal(item)),
  )
  return { read, share: read / summary.total }
}

/** Why R13's button isn't offered, when the items add up to less. */
export type DifferenceOffer =
  | { kind: 'button'; amount: Cents }
  /** A percentage tax or tip would grow with the item: no button. */
  | { kind: 'percentage' }
  | { kind: 'none' }

/**
 * R13: "Add the difference" is offered only when the items add up to less
 * than the receipt, the tax and tip are none or fixed amounts, and the
 * bill has room for one more item.
 */
export function differenceOffer(
  bill: Bill,
  check: ReceiptCheck,
): DifferenceOffer {
  if (check.status !== 'mismatch' || check.difference >= 0) {
    return { kind: 'none' }
  }
  if (bill.tax.kind === 'percent' || bill.tip.kind === 'percent') {
    return { kind: 'percentage' }
  }
  if (bill.items.length >= LIMITS.maxItems) {
    return { kind: 'none' }
  }
  return { kind: 'button', amount: negate(check.difference) }
}

/**
 * R14: the import read no item, only the QR total, and its single flagged
 * stand-in item hasn't been edited since.
 */
export function isUnreadImport(bill: Bill, summary: ReceiptSummary): boolean {
  const [only] = bill.items
  return (
    bill.items.length === 1 &&
    only !== undefined &&
    only.name === NOT_READ_ITEM_NAME &&
    summary.flaggedItemIds.includes(only.id)
  )
}

/** "1 line" or "N lines". */
export function linesCount(count: number): string {
  return count === 1 ? '1 line' : `${String(count)} lines`
}

/**
 * The result section's notices (R12, R24), as text: the gap first, then
 * the lines left out. Neither blocks the split. Also the lines "Copy as
 * text" adds.
 */
export function receiptNotices(
  check: ReceiptCheck,
  summary: ReceiptSummary,
  region: Region,
): string[] {
  const money = (value: Cents) => formatAmount(value, region)
  const notices: string[] = []
  if (check.status === 'mismatch') {
    const less = check.difference < 0
    const gap = money(less ? negate(check.difference) : check.difference)
    notices.push(
      `These totals don’t match the receipt: the items add up to ${money(check.billTotal)}, ${gap} ${less ? 'less' : 'more'} than the receipt’s ${money(check.receiptTotal)}.`,
    )
  }
  const removed = summary.removedLines?.length ?? 0
  if (removed > 0) {
    notices.push(
      `${linesCount(removed)} ${removed === 1 ? 'was' : 'were'} left out of this receipt to match its total. Check them before settling up.`,
    )
  }
  return notices
}
