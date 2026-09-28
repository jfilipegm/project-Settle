/**
 * A parsed receipt to an M1 bill and the check panel's summary (M2 plan,
 * D12 and D13). Pure: ids come from the caller, as in the bill reducer.
 */
import {
  add,
  cents,
  subtract,
  sum,
  type Cents,
  type MoneyCurrency,
} from '../../lib/money.ts'
import {
  LIMITS,
  isBillRatio,
  lineTotal,
  validateBill,
  type Adjustment,
  type Bill,
  type Item,
} from '../split/model.ts'
import type { FiscalQr } from './fiscalQr.ts'
import type {
  ParsedItem,
  ParsedReceipt,
  ReceiptSummary,
  ReceiptWarning,
} from './model.ts'

export interface ReceiptToBillOptions {
  /** The region's currency, for the `currencyDiffers` warning (D18). */
  regionCurrency?: MoneyCurrency
}

export interface ReceiptToBillResult {
  bill: Bill
  summary: ReceiptSummary
}

const NONE: Adjustment = { kind: 'amount', value: cents(0) }

/** Cuts a name to 60 UTF-16 units, never splitting a surrogate pair. */
function cutName(name: string): string {
  let cut = name.trim().slice(0, LIMITS.maxNameLength)
  if (/[\uD800-\uDBFF]$/.test(cut)) {
    cut = cut.slice(0, -1)
  }
  return cut.trimEnd()
}

function isAmountInRange(value: Cents): boolean {
  return value >= 0 && value <= LIMITS.maxAmount
}

/**
 * A parsed item as a bill item, assigned to everyone with weight 1. When
 * its quantity or unit price wouldn't pass `validateBill`, it becomes
 * 1 × its line total; a line total out of range drops the item.
 */
function toItem(parsed: ParsedItem, id: string, bill: Bill): Item | undefined {
  if (!isAmountInRange(parsed.lineTotal)) {
    return undefined
  }
  const item: Item = {
    id,
    name: cutName(parsed.name),
    quantity: parsed.quantity,
    unitPrice: parsed.unitPrice,
    assignees: bill.people.map((person) => ({
      personId: person.id,
      weight: 1,
    })),
  }
  const { quantity } = item
  const quantityOk =
    isBillRatio(quantity) &&
    quantity.numerator > 0 &&
    quantity.numerator <= LIMITS.maxQuantity * quantity.denominator
  if (
    !quantityOk ||
    !isAmountInRange(item.unitPrice) ||
    lineTotal(item) !== parsed.lineTotal
  ) {
    return {
      ...item,
      quantity: { numerator: 1, denominator: 1 },
      unitPrice: parsed.lineTotal,
    }
  }
  return item
}

type AdjustmentName = 'tax' | 'tip' | 'discount'

// D13's fixed order: the first combination that closes the arithmetic wins.
const COMBINATIONS: readonly (readonly AdjustmentName[])[] = [
  [],
  ['tax'],
  ['tip'],
  ['discount'],
  ['tax', 'tip'],
  ['tax', 'discount'],
  ['tip', 'discount'],
  ['tax', 'tip', 'discount'],
]

/**
 * D13: applies the receipt's tax, tip and discount, as fixed amounts, only
 * when they make items + adjustments equal the trusted total exactly and
 * the bill stays valid. Otherwise all three stay none.
 */
function withAdjustments(
  bill: Bill,
  receipt: ParsedReceipt,
  total: Cents | undefined,
): Bill {
  if (total === undefined) {
    return bill
  }
  const subtotal = sum(bill.items.map(lineTotal))
  const read: Partial<Record<AdjustmentName, Cents>> = {
    tax: receipt.tax,
    tip: receipt.tip,
    discount: receipt.discount,
  }
  // An amount of 0 or one `validateBill` would refuse is never applied.
  const usable = (name: AdjustmentName) => {
    const value = read[name]
    return value !== undefined && value > 0 && isAmountInRange(value)
  }
  for (const combination of COMBINATIONS) {
    if (!combination.every(usable)) {
      continue
    }
    const amount = (name: AdjustmentName) =>
      combination.includes(name) ? (read[name] ?? cents(0)) : cents(0)
    const candidateTotal = subtract(
      add(subtotal, amount('tax'), amount('tip')),
      amount('discount'),
    )
    if (candidateTotal !== total) {
      continue
    }
    const adjust = (name: AdjustmentName): Adjustment =>
      combination.includes(name)
        ? { kind: 'amount', value: amount(name) }
        : NONE
    const candidate: Bill = {
      ...bill,
      tax: adjust('tax'),
      tip: adjust('tip'),
      discount: adjust('discount'),
    }
    if (validateBill(candidate).length === 0) {
      return candidate
    }
  }
  return bill
}

/**
 * D12 and D13: the receipt's items replace the current bill's items, its
 * tax, tip and discount; the people, the payer and the tax and tip modes
 * are kept. The trusted total is a valid fiscal QR's, else the printed one.
 * `nextId` is called once per item kept. The bill always passes
 * `validateBill`: a receipt with no items gives one empty item.
 */
export function receiptToBill(
  receipt: ParsedReceipt,
  qr: FiscalQr | undefined,
  currentBill: Bill,
  nextId: () => string,
  options: ReceiptToBillOptions = {},
): ReceiptToBillResult {
  const warnings: ReceiptWarning[] = []
  const warn = (warning: ReceiptWarning) => {
    if (!warnings.includes(warning)) {
      warnings.push(warning)
    }
  }

  const kept = receipt.items.slice(0, LIMITS.maxItems)
  const items: Item[] = []
  const flaggedItemIds: string[] = []
  for (const parsed of kept) {
    const item = toItem(parsed, nextId(), currentBill)
    if (item !== undefined) {
      items.push(item)
      if (parsed.needsCheck) {
        flaggedItemIds.push(item.id)
      }
    }
  }
  if (items.length === 0) {
    items.push({
      id: nextId(),
      name: '',
      quantity: { numerator: 1, denominator: 1 },
      unitPrice: cents(0),
      assignees: currentBill.people.map((person) => ({
        personId: person.id,
        weight: 1,
      })),
    })
  }

  const total = qr?.total ?? receipt.total
  for (const warning of receipt.warnings) {
    if (!(warning === 'noTotal' && total !== undefined)) {
      warn(warning)
    }
  }
  qr?.warnings.forEach(warn)
  if (
    qr !== undefined &&
    receipt.total !== undefined &&
    receipt.total !== qr.total
  ) {
    warn('totalMismatchQr')
  }
  if (receipt.items.length > LIMITS.maxItems) {
    warn('itemsTruncated')
  }
  if (
    options.regionCurrency !== undefined &&
    receipt.currencyHint !== undefined &&
    receipt.currencyHint !== options.regionCurrency
  ) {
    warn('currencyDiffers')
  }

  const bill = withAdjustments(
    { ...currentBill, items, tax: NONE, tip: NONE, discount: NONE },
    receipt,
    total,
  )

  const summary: ReceiptSummary = { warnings, flaggedItemIds }
  if (receipt.merchant !== undefined) summary.merchant = receipt.merchant
  const merchantTaxId = qr?.issuerNif ?? receipt.merchantTaxId
  if (merchantTaxId !== undefined) summary.merchantTaxId = merchantTaxId
  const date = qr?.date ?? receipt.date
  if (date !== undefined) summary.date = date
  if (receipt.currencyHint !== undefined)
    summary.currency = receipt.currencyHint
  if (total !== undefined) {
    summary.total = total
    summary.totalSource = qr !== undefined ? 'qr' : 'printed'
  }
  if (qr?.totalTax !== undefined) summary.ivaTotal = qr.totalTax
  return { bill, summary }
}
