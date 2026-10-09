/**
 * The row-by-row review's pure helpers (M2.5 plan, P15), kept out of the
 * component file so it only exports components.
 */
import type { MessageKey } from '../../i18n/t.ts'
import { LIMITS } from '../split/model.ts'
import type { LineRole, ReviewLine } from './model.ts'

/** Each role's text, as the review writes it (never colour alone). */
export const ROLE_KEYS: Record<LineRole, MessageKey> = {
  item: 'receipt.lines.role.item',
  itemDetail: 'receipt.lines.role.itemDetail',
  discount: 'receipt.lines.role.discount',
  total: 'receipt.lines.role.total',
  tip: 'receipt.lines.role.tip',
  taxTable: 'receipt.lines.role.taxTable',
  payment: 'receipt.lines.role.payment',
  ignored: 'receipt.lines.role.ignored',
}

/**
 * Whether "Add as item" is offered for a line: an ignored line, or an item
 * detail, with a positive amount, while the bill has room.
 */
export function canAddAsItem(line: ReviewLine, itemCount: number): boolean {
  return (
    (line.role === 'ignored' || line.role === 'itemDetail') &&
    line.amount !== undefined &&
    line.amount > 0 &&
    itemCount < LIMITS.maxItems
  )
}

/**
 * The item name for a line added as an item: its text without the amount
 * at its end and what follows it (a tax code), cut to the name limit.
 */
export function nameFromLine(text: string): string {
  const name = text
    .replace(/\s*[-–]?\s*[€$£]?\s*\d+(?:[.,]\d{3})*[.,]\d{2}\b[^\d]*$/u, '')
    .trim()
  return (name === '' ? text.trim() : name)
    .slice(0, LIMITS.maxNameLength)
    .trim()
}
