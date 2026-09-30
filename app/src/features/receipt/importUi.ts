/**
 * Small pure helpers for the receipt UI (M2 plan, CP4), kept out of the
 * component files so those only export components.
 */
import type { Adjustment, Bill } from '../split/model.ts'

function isNone(adjustment: Adjustment): boolean {
  return adjustment.kind === 'amount'
    ? adjustment.value === 0
    : adjustment.ratio.numerator === 0
}

/**
 * Whether an import would replace something typed: more than one item, an
 * item with a name or price, or a tax, tip or discount that isn't none.
 */
export function billHasContent(bill: Bill): boolean {
  return (
    bill.items.length > 1 ||
    bill.items.some(
      (item) => item.name.trim() !== '' || item.unitPrice !== 0,
    ) ||
    !isNone(bill.tax) ||
    !isNone(bill.tip) ||
    !isNone(bill.discount)
  )
}

/** Frees a receipt preview's object URL (D14: images live in memory only). */
export function revokeImageUrl(url: string | undefined): void {
  if (url !== undefined && typeof URL.revokeObjectURL === 'function') {
    URL.revokeObjectURL(url)
  }
}
