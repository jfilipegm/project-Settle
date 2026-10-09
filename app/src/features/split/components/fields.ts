/**
 * Shared pieces of the Split page: the DOM id of each field (so a
 * validation error can link to it), how stored values are shown in inputs,
 * and every user-facing error message.
 */
import type { Region } from '../../../app/region.ts'
import type { Translate } from '../../../i18n/t.ts'
import {
  formatAmount,
  type Cents,
  type MoneyLocale,
  type ParseAmountError,
  type Ratio,
} from '../../../lib/money.ts'
import {
  LIMITS,
  displayName,
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
  t: Translate,
  errors: readonly BillError[],
  field: BillField,
  bill: Bill,
  region: Region,
): string | undefined {
  const error = errors.find((candidate) => sameField(candidate.field, field))
  return error ? billErrorMessage(t, error, bill, region) : undefined
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
  t: Translate,
  error: ParseAmountError | 'negative' | 'tooLarge',
  region: Region,
): string {
  switch (error) {
    case 'subCent':
      return t('split.errors.subCent')
    case 'negative':
      return t('split.errors.negative')
    case 'tooLarge':
    case 'outOfRange':
      return t('split.errors.atMost', { max: maxAmountText(region) })
    case 'empty':
    case 'invalid':
      return t('split.errors.enterAmount', {
        example: amountText(1250 as Cents, region.locale),
      })
  }
}

export type RatioInputKind = 'quantity' | 'percent'

export function ratioInputMessage(
  t: Translate,
  kind: RatioInputKind,
  error: Exclude<ToBillRatioResult, { ok: true }>['error'] | 'range',
): string {
  if (error === 'tooManyDecimals') {
    return t('split.errors.threeDecimals')
  }
  const missing = error === 'empty' || error === 'invalid'
  if (kind === 'quantity') {
    return missing
      ? t('split.errors.enterQuantity')
      : t('split.errors.quantityRange', { max: LIMITS.maxQuantity })
  }
  return missing
    ? t('split.errors.enterPercent')
    : t('split.errors.percentMax', { max: LIMITS.maxPercent })
}

export function adjustmentLabel(t: Translate, name: AdjustmentName): string {
  return t(`split.adjustments.${name}.name`)
}

/** The name to show for an item: its own, or "Item n" (1-based). */
export function itemName(t: Translate, item: Item, index: number): string {
  const name = item.name.trim()
  return name === '' ? t('split.items.defaultName', { n: index + 1 }) : name
}

function fieldLabel(t: Translate, field: BillField, bill: Bill): string {
  const itemIndex = (id: string) => bill.items.findIndex((i) => i.id === id)
  const personIndex = (id: string) => bill.people.findIndex((p) => p.id === id)
  switch (field.kind) {
    case 'people':
      return t('split.errors.fieldPeople')
    case 'items':
      return t('split.errors.fieldItems')
    case 'person':
      return t('split.people.defaultName', {
        n: personIndex(field.personId) + 1,
      })
    case 'item':
    case 'share': {
      const index = itemIndex(field.itemId)
      const item = bill.items[index]
      return item ? itemName(t, item, index) : t('split.errors.fieldItem')
    }
    case 'adjustment':
      return adjustmentLabel(t, field.adjustment)
    case 'payer':
      return t('split.errors.fieldPayer')
  }
}

/** A validation error as a short sentence, for its field and the error list. */
export function billErrorMessage(
  t: Translate,
  error: BillError,
  bill: Bill,
  region: Region,
): string {
  const { field } = error
  switch (error.code) {
    case 'unassignedItem':
      return t('split.errors.unassigned')
    case 'discountAboveSubtotal':
      return t('split.errors.discountAboveSubtotal')
    case 'proportionalWithZeroSubtotal':
      return t('split.errors.proportionalWithZeroSubtotal')
    case 'limitExceeded':
      if (field.kind === 'people') {
        return t('split.errors.peopleRange', {
          min: LIMITS.minPeople,
          max: LIMITS.maxPeople,
        })
      }
      if (field.kind === 'items') {
        return t('split.errors.itemsRange', {
          min: LIMITS.minItems,
          max: LIMITS.maxItems,
        })
      }
      return t('split.errors.nameLength', { max: LIMITS.maxNameLength })
    case 'amountOutOfRange':
      return t('split.errors.amountRange', { max: maxAmountText(region) })
    case 'quantityOutOfRange':
      return ratioInputMessage(t, 'quantity', 'range')
    case 'percentOutOfRange':
      return ratioInputMessage(t, 'percent', 'range')
    case 'shareOutOfRange':
      return t('split.errors.shareRange', { max: LIMITS.maxShare })
    case 'invalidReference':
      return t('split.errors.invalidReference', {
        field: fieldLabel(t, field, bill),
      })
  }
}

/** The error list's label for an error: which field it's about. */
export function billErrorFieldLabel(
  t: Translate,
  error: BillError,
  bill: Bill,
): string {
  const label = fieldLabel(t, error.field, bill)
  if (error.field.kind === 'share') {
    const { personId } = error.field
    const index = bill.people.findIndex((p) => p.id === personId)
    const person = bill.people[index]
    const who = person
      ? displayName(t, person, index)
      : t('split.items.unknownPerson')
    return t('split.errors.shareField', { field: label, person: who })
  }
  return label
}
