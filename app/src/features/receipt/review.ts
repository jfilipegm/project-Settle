/**
 * The review step's decisions (remediation plan, R12–R15 and R24), pure:
 * what the check panel and the result section say about a receipt whose
 * items don't match its total, and what they offer to fix it.
 */
import type { Region } from '../../app/region.ts'
import { isNotReadItemName } from '../../i18n/notRead.ts'
import type { Translate } from '../../i18n/t.ts'
import { formatAmount, negate, sum, type Cents } from '../../lib/money.ts'
import { LIMITS, lineTotal, type Bill } from '../split/model.ts'
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
      .filter((item) => !isNotReadItemName(item.name))
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
    isNotReadItemName(only.name) &&
    summary.flaggedItemIds.includes(only.id)
  )
}

/**
 * The result section's notices (R12, R24), as text: the gap first, then
 * the lines left out. Neither blocks the split. Also the lines "Copy as
 * text" adds.
 */
export function receiptNotices(
  t: Translate,
  check: ReceiptCheck,
  summary: ReceiptSummary,
  region: Region,
): string[] {
  const money = (value: Cents) => formatAmount(value, region)
  const notices: string[] = []
  if (check.status === 'mismatch') {
    const less = check.difference < 0
    const params = {
      total: money(check.billTotal),
      gap: money(less ? negate(check.difference) : check.difference),
      receiptTotal: money(check.receiptTotal),
    }
    notices.push(
      t(
        less ? 'receipt.notice.mismatchLess' : 'receipt.notice.mismatchMore',
        params,
      ),
    )
  }
  const removed = summary.removedLines?.length ?? 0
  if (removed > 0) {
    notices.push(t('receipt.notice.leftOut', { count: removed }))
  }
  return notices
}
