/**
 * Shared pieces of the Split page: the DOM id of each field (so a
 * validation error can link to it), how stored values are shown in inputs,
 * and every user-facing error message.
 */
import type { Region } from '../../../app/region.ts'
import {
  formatAmount,
  type Cents,
  type MoneyLocale,
  type ParseAmountError,
  type Ratio,
} from '../../../lib/money.ts'
import {
  LIMITS,
  type AdjustmentName,
  type Bill,
  type BillError,
  type BillField,
  type Item,
  type ToBillRatioResult,
} from '../model.ts'

/** The id of the input (or group) that a {@link BillField} names. */
export function fieldId(field: BillField): string {
  switch (field.kind) {
    case 'people':
      return 'split-people-count'
    case 'items':
      return 'split-add-item'
    case 'person':
      return `split-person-${field.personId}`
    case 'item':
      return `split-item-${field.itemId}-${field.part}`
    case 'share':
      return `split-share-${field.itemId}-${field.personId}`
    case 'adjustment':
      return `split-adjustment-${field.adjustment}`
    case 'payer':
      return 'split-payer'
  }
}

function sameField(a: BillField, b: BillField): boolean {
  return fieldId(a) === fieldId(b)
}

/** The first validation error for one field, as a message. */
export function fieldError(
  errors: readonly BillError[],
  field: BillField,
  bill: Bill,
  region: Region,
): string | undefined {
  const error = errors.find((candidate) => sameField(candidate.field, field))
  return error ? billErrorMessage(error, bill, region) : undefined
}

function decimalSeparator(locale: MoneyLocale): string {
  return locale === 'pt-PT' ? ',' : '.'
}

/** A stored amount as input text: `1250` → `"12,50"`; 0 shows empty. */
export function amountText(value: Cents, locale: MoneyLocale): string {
  if (value === 0) {
    return ''
  }
  const magnitude = Math.abs(value)
  const units = Math.trunc(magnitude / 100)
  const hundredths = String(magnitude % 100).padStart(2, '0')
  return `${value < 0 ? '-' : ''}${units}${decimalSeparator(locale)}${hundredths}`
}

/** A stored ratio as input text: `125/100` → `"1,25"`. */
export function ratioText(ratio: Ratio, locale: MoneyLocale): string {
  const digits = Math.log10(ratio.denominator)
  if (!Number.isInteger(digits) || digits < 0) {
    return String(ratio.numerator / ratio.denominator)
  }
  const whole = Math.trunc(ratio.numerator / ratio.denominator)
  if (digits === 0) {
    return String(whole)
  }
  const fraction = String(ratio.numerator % ratio.denominator).padStart(
    digits,
    '0',
  )
  return `${whole}${decimalSeparator(locale)}${fraction}`
}

export function maxAmountText(region: Region): string {
  return formatAmount(LIMITS.maxAmount as Cents, region)
}

export function amountInputMessage(
  error: ParseAmountError | 'negative' | 'tooLarge',
  region: Region,
): string {
  switch (error) {
    case 'subCent':
      return 'Use at most 2 decimal places'
    case 'negative':
      return "Can't be negative"
    case 'tooLarge':
    case 'outOfRange':
      return `At most ${maxAmountText(region)}`
    case 'empty':
    case 'invalid':
      return `Enter an amount, like ${amountText(1250 as Cents, region.locale)}`
  }
}

export type RatioInputKind = 'quantity' | 'percent'

export function ratioInputMessage(
  kind: RatioInputKind,
  error: Exclude<ToBillRatioResult, { ok: true }>['error'] | 'range',
): string {
  if (error === 'tooManyDecimals') {
    return 'Use at most 3 decimal places'
  }
  if (kind === 'quantity') {
    return error === 'empty' || error === 'invalid'
      ? 'Enter a quantity, like 1 or 0,5'
      : `Quantity must be more than 0 and at most ${LIMITS.maxQuantity}`
  }
  return error === 'empty' || error === 'invalid'
    ? 'Enter a percentage, like 10'
    : `At most ${LIMITS.maxPercent} %`
}

const ADJUSTMENT_LABELS: Record<AdjustmentName, string> = {
  tax: 'Tax',
  tip: 'Tip',
  discount: 'Discount',
}

export function adjustmentLabel(name: AdjustmentName): string {
  return ADJUSTMENT_LABELS[name]
}

/** The name to show for an item: its own, or "Item n" (1-based). */
export function itemName(item: Item, index: number): string {
  const name = item.name.trim()
  return name === '' ? `Item ${index + 1}` : name
}

function fieldLabel(field: BillField, bill: Bill): string {
  const itemIndex = (id: string) => bill.items.findIndex((i) => i.id === id)
  const personIndex = (id: string) => bill.people.findIndex((p) => p.id === id)
  switch (field.kind) {
    case 'people':
      return 'People'
    case 'items':
      return 'Items'
    case 'person':
      return `Person ${personIndex(field.personId) + 1}`
    case 'item':
    case 'share': {
      const index = itemIndex(field.itemId)
      const item = bill.items[index]
      return item ? itemName(item, index) : 'Item'
    }
    case 'adjustment':
      return adjustmentLabel(field.adjustment)
    case 'payer':
      return 'Who paid'
  }
}

/** A validation error as a short sentence, for its field and the error list. */
export function billErrorMessage(
  error: BillError,
  bill: Bill,
  region: Region,
): string {
  const { field } = error
  switch (error.code) {
    case 'unassignedItem':
      return 'Choose who shares this item'
    case 'discountAboveSubtotal':
      return "The discount can't be more than the items subtotal"
    case 'proportionalWithZeroSubtotal':
      return 'Split this equally, or enter item prices first'
    case 'limitExceeded':
      if (field.kind === 'people') {
        return `Between ${LIMITS.minPeople} and ${LIMITS.maxPeople} people`
      }
      if (field.kind === 'items') {
        return `Between ${LIMITS.minItems} and ${LIMITS.maxItems} items`
      }
      return `At most ${LIMITS.maxNameLength} characters`
    case 'amountOutOfRange':
      return `Enter an amount from 0 to ${maxAmountText(region)}`
    case 'quantityOutOfRange':
      return ratioInputMessage('quantity', 'range')
    case 'percentOutOfRange':
      return ratioInputMessage('percent', 'range')
    case 'shareOutOfRange':
      return `Shares are whole numbers from 1 to ${LIMITS.maxShare}`
    case 'invalidReference':
      return `${fieldLabel(field, bill)} doesn't match the people on this bill. Start a new bill.`
  }
}

/** The error list's label for an error: which field it's about. */
export function billErrorFieldLabel(error: BillError, bill: Bill): string {
  const label = fieldLabel(error.field, bill)
  if (error.field.kind === 'share') {
    const { personId } = error.field
    const index = bill.people.findIndex((p) => p.id === personId)
    const person = bill.people[index]
    const who = person
      ? person.name.trim() || `Person ${index + 1}`
      : 'Unknown person'
    return `${label}, ${who}'s share`
  }
  return label
}
