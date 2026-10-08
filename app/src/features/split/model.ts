/**
 * The bill model and its validation. Pure and framework-free: the split
 * engine (split.ts), the bill reducer and the saved draft all build on it.
 */
import type { Translate } from '../../i18n/t.ts'
import {
  multiplyRatio,
  parseRatio,
  percentOf,
  sum,
  type Cents,
  type Ratio,
} from '../../lib/money.ts'

export interface Person {
  id: string
  /** May be empty: the UI shows "Person n" instead. */
  name: string
}

/** One person's share of an item: a whole-number weight, 1–99. */
export interface Assignment {
  personId: string
  weight: number
}

export interface Item {
  id: string
  name: string
  /** A bill ratio (see {@link isBillRatio}): `2`, `0,75`, … */
  quantity: Ratio
  unitPrice: Cents
  assignees: Assignment[]
}

/** A fixed amount, or a percentage of the items subtotal. */
export type Adjustment =
  { kind: 'amount'; value: Cents } | { kind: 'percent'; ratio: Ratio }

/** How tax and tip are split: by each person's items subtotal, or evenly. */
export type SplitMode = 'proportional' | 'equal'

export interface Bill {
  people: Person[]
  items: Item[]
  tax: Adjustment
  taxMode: SplitMode
  tip: Adjustment
  tipMode: SplitMode
  /** Always split proportionally, and never above the items subtotal. */
  discount: Adjustment
  payerId: string
}

export type AdjustmentName = 'tax' | 'tip' | 'discount'

// D14's limits. With them the items subtotal is at most 10¹⁴ cents and the
// bill total below 3·10¹⁵, so the engine's arithmetic never leaves the safe
// integer range.
export const LIMITS = {
  minPeople: 1,
  maxPeople: 20,
  minItems: 1,
  maxItems: 100,
  maxNameLength: 60,
  maxShare: 99,
  /** 1 000 000,00 in cents: each unit price and each fixed adjustment. */
  maxAmount: 100_000_000,
  maxQuantity: 10_000,
  maxPercent: 1000,
} as const

/** The denominators a stored ratio may have: at most 3 decimal places. */
const BILL_DENOMINATORS: readonly number[] = [1, 10, 100, 1000]

/**
 * A ratio as a bill stores it: a safe-integer numerator ≥ 0 over 1, 10, 100
 * or 1000.
 */
export function isBillRatio(ratio: Ratio): boolean {
  return (
    Number.isSafeInteger(ratio.numerator) &&
    ratio.numerator >= 0 &&
    BILL_DENOMINATORS.includes(ratio.denominator)
  )
}

export type ToBillRatioResult =
  | { ok: true; ratio: Ratio }
  | { ok: false; error: 'empty' | 'invalid' | 'outOfRange' | 'tooManyDecimals' }

/**
 * Reads a typed quantity or percentage as a bill ratio: {@link parseRatio},
 * then trailing zeros stripped, so `1,0000` is `1/1` and `10,500` is
 * `105/10`. More than 3 significant decimals is `tooManyDecimals`. Range
 * limits are {@link validateBill}'s job.
 */
export function toBillRatio(input: string): ToBillRatioResult {
  const parsed = parseRatio(input)
  if (!parsed.ok) {
    return parsed
  }
  let { numerator, denominator } = parsed
  while (denominator > 1 && numerator % 10 === 0) {
    numerator /= 10
    denominator /= 10
  }
  if (!BILL_DENOMINATORS.includes(denominator)) {
    return { ok: false, error: 'tooManyDecimals' }
  }
  return { ok: true, ratio: { numerator, denominator } }
}

/** Where an error belongs, so the UI can show it next to its field. */
export type BillField =
  | { kind: 'people' }
  | { kind: 'items' }
  | { kind: 'person'; personId: string }
  | {
      kind: 'item'
      itemId: string
      part: 'name' | 'quantity' | 'unitPrice' | 'assignees'
    }
  | { kind: 'share'; itemId: string; personId: string }
  | { kind: 'adjustment'; adjustment: AdjustmentName }
  | { kind: 'payer' }

export type BillErrorCode =
  /** An item with no assignees. */
  | 'unassignedItem'
  /** The discount is more than the items subtotal. */
  | 'discountAboveSubtotal'
  /** A proportional tax or tip on a bill whose items subtotal is 0. */
  | 'proportionalWithZeroSubtotal'
  /** Too few or too many people or items, or a name that's too long. */
  | 'limitExceeded'
  /** A unit price or fixed adjustment that isn't a whole number of cents in 0–1 000 000,00. */
  | 'amountOutOfRange'
  /** A quantity of 0, above 10 000, or not a bill ratio. */
  | 'quantityOutOfRange'
  /** A percentage above 1000 %, or not a bill ratio (which covers below 0). */
  | 'percentOutOfRange'
  /** A share weight that isn't a whole number in 1–99. */
  | 'shareOutOfRange'
  /** An unknown or duplicate id, a person assigned twice, or a payer who isn't a person. */
  | 'invalidReference'

export interface BillError {
  code: BillErrorCode
  field: BillField
}

/** The line total: quantity × unit price, rounded once, half away from zero. */
export function lineTotal(item: Item): Cents {
  return multiplyRatio(
    item.unitPrice,
    item.quantity.numerator,
    item.quantity.denominator,
  )
}

/** The amount of an adjustment on a given items subtotal. */
export function adjustmentAmount(
  adjustment: Adjustment,
  subtotal: Cents,
): Cents {
  return adjustment.kind === 'amount'
    ? adjustment.value
    : percentOf(subtotal, adjustment.ratio)
}

function isAmountInRange(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0 && value <= LIMITS.maxAmount
}

function isQuantityInRange(quantity: Ratio): boolean {
  return (
    isBillRatio(quantity) &&
    quantity.numerator > 0 &&
    quantity.numerator <= LIMITS.maxQuantity * quantity.denominator
  )
}

function isPercentInRange(ratio: Ratio): boolean {
  return (
    isBillRatio(ratio) &&
    ratio.numerator <= LIMITS.maxPercent * ratio.denominator
  )
}

function isShareInRange(weight: number): boolean {
  return Number.isInteger(weight) && weight >= 1 && weight <= LIMITS.maxShare
}

function adjustmentErrors(
  name: AdjustmentName,
  adjustment: Adjustment,
): BillError[] {
  const field: BillField = { kind: 'adjustment', adjustment: name }
  if (adjustment.kind === 'amount') {
    return isAmountInRange(adjustment.value)
      ? []
      : [{ code: 'amountOutOfRange', field }]
  }
  return isPercentInRange(adjustment.ratio)
    ? []
    : [{ code: 'percentOutOfRange', field }]
}

/**
 * Every problem that stops the bill from being split, in field order.
 * There's a rule for every numeric and reference field, so a bill with no
 * errors can be computed without any helper throwing. The two rules that
 * need the subtotal (discount and proportional adjustments) run only when
 * every field is otherwise valid.
 */
export function validateBill(bill: Bill): BillError[] {
  const errors: BillError[] = []

  const { people, items } = bill
  if (people.length < LIMITS.minPeople || people.length > LIMITS.maxPeople) {
    errors.push({ code: 'limitExceeded', field: { kind: 'people' } })
  }
  const personIds = new Set<string>()
  for (const person of people) {
    const field: BillField = { kind: 'person', personId: person.id }
    if (personIds.has(person.id)) {
      errors.push({ code: 'invalidReference', field })
    }
    personIds.add(person.id)
    if (person.name.length > LIMITS.maxNameLength) {
      errors.push({ code: 'limitExceeded', field })
    }
  }
  if (!personIds.has(bill.payerId)) {
    errors.push({ code: 'invalidReference', field: { kind: 'payer' } })
  }

  if (items.length < LIMITS.minItems || items.length > LIMITS.maxItems) {
    errors.push({ code: 'limitExceeded', field: { kind: 'items' } })
  }
  const itemIds = new Set<string>()
  for (const item of items) {
    const at = (part: 'name' | 'quantity' | 'unitPrice' | 'assignees') =>
      ({ kind: 'item', itemId: item.id, part }) as const
    if (itemIds.has(item.id)) {
      errors.push({ code: 'invalidReference', field: at('name') })
    }
    itemIds.add(item.id)
    if (item.name.length > LIMITS.maxNameLength) {
      errors.push({ code: 'limitExceeded', field: at('name') })
    }
    if (!isQuantityInRange(item.quantity)) {
      errors.push({ code: 'quantityOutOfRange', field: at('quantity') })
    }
    if (!isAmountInRange(item.unitPrice)) {
      errors.push({ code: 'amountOutOfRange', field: at('unitPrice') })
    }
    if (item.assignees.length === 0) {
      errors.push({ code: 'unassignedItem', field: at('assignees') })
    }
    const assigned = new Set<string>()
    for (const { personId, weight } of item.assignees) {
      const field: BillField = { kind: 'share', itemId: item.id, personId }
      if (!personIds.has(personId) || assigned.has(personId)) {
        errors.push({ code: 'invalidReference', field })
      }
      assigned.add(personId)
      if (!isShareInRange(weight)) {
        errors.push({ code: 'shareOutOfRange', field })
      }
    }
  }

  errors.push(
    ...adjustmentErrors('tax', bill.tax),
    ...adjustmentErrors('tip', bill.tip),
    ...adjustmentErrors('discount', bill.discount),
  )

  if (errors.length > 0) {
    return errors
  }

  const subtotal = sum(items.map(lineTotal))
  if (adjustmentAmount(bill.discount, subtotal) > subtotal) {
    errors.push({
      code: 'discountAboveSubtotal',
      field: { kind: 'adjustment', adjustment: 'discount' },
    })
  }
  if (subtotal === 0) {
    for (const name of ['tax', 'tip'] as const) {
      const mode = name === 'tax' ? bill.taxMode : bill.tipMode
      // Anything but 'equal' is split proportionally, as in split.ts.
      if (mode !== 'equal' && adjustmentAmount(bill[name], subtotal) > 0) {
        errors.push({
          code: 'proportionalWithZeroSubtotal',
          field: { kind: 'adjustment', adjustment: name },
        })
      }
    }
  }
  return errors
}

/** The name to show for a person: their own, or "Person n" (1-based). */
export function displayName(
  t: Translate,
  person: Person,
  index: number,
): string {
  const name = person.name.trim()
  return name === '' ? t('split.people.defaultName', { n: index + 1 }) : name
}
