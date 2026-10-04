/**
 * A parsed receipt to an M1 bill and the check panel's summary (M2 plan,
 * D12 and D13, with the remediation plan's R8–R10, R14, R18 and R22–R24).
 * Pure: ids come from the caller, as in the bill reducer.
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
import { NOT_READ_ITEM_NAME } from './messages.ts'
import type {
  ParsedItem,
  ParsedReceipt,
  ReceiptSummary,
  ReceiptWarning,
  ReviewLine,
} from './model.ts'

export interface ReceiptToBillOptions {
  /** The region's currency, for the `currencyDiffers` warning (D18). */
  regionCurrency?: MoneyCurrency
}

export interface ReceiptToBillResult {
  bill: Bill
  summary: ReceiptSummary
  /**
   * P15: the receipt's lines, each item line linked to its bill row, for
   * the row-by-row review. Present when the receipt has lines; never saved.
   */
  lines?: ReviewLine[]
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

export type AdjustmentName = 'tax' | 'tip' | 'discount'

/**
 * D13's fixed order: the first combination that closes the arithmetic
 * wins. Exported for the browser smoke test's expected bill (M2.5, CP4),
 * so the two can't drift.
 */
export const COMBINATIONS: readonly (readonly AdjustmentName[])[] = [
  [],
  ['tax'],
  ['tip'],
  ['discount'],
  ['tax', 'tip'],
  ['tax', 'discount'],
  ['tip', 'discount'],
  ['tax', 'tip', 'discount'],
]

type Adjustments = Partial<Record<AdjustmentName, Cents>>

/**
 * Whether `subtotal` plus this combination of the read adjustments equals
 * `total` exactly. An amount of 0 or one `validateBill` would refuse is
 * never used.
 */
function closesWith(
  combination: readonly AdjustmentName[],
  subtotal: Cents,
  read: Adjustments,
  total: Cents,
): boolean {
  const usable = (name: AdjustmentName) => {
    const value = read[name]
    return value !== undefined && value > 0 && isAmountInRange(value)
  }
  const amount = (name: AdjustmentName) =>
    combination.includes(name) ? (read[name] ?? cents(0)) : cents(0)
  return (
    combination.every(usable) &&
    subtract(
      add(subtotal, amount('tax'), amount('tip')),
      amount('discount'),
    ) === total
  )
}

/**
 * D13: applies the read tax, tip and discount, as fixed amounts, only when
 * they make items + adjustments equal the trusted total exactly and the
 * bill stays valid. Otherwise all three stay none.
 */
function withAdjustments(
  bill: Bill,
  read: Adjustments,
  total: Cents | undefined,
): Bill {
  if (total === undefined) {
    return bill
  }
  const subtotal = sum(bill.items.map(lineTotal))
  for (const combination of COMBINATIONS) {
    if (!closesWith(combination, subtotal, read, total)) {
      continue
    }
    const amount = (name: AdjustmentName) =>
      combination.includes(name) ? (read[name] ?? cents(0)) : cents(0)
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

/** R8's two readings of the unsigned savings lines. */
type Variant = 'applied' | 'dropped'
const VARIANTS: readonly Variant[] = ['applied', 'dropped']

/**
 * A list of items read one R8 way, with its read bill-level discount: the
 * parser's negative lines, plus, with the candidates applied, each
 * candidate larger than its (kept) item, which goes to the bill discount
 * as rule 7 sends a discount larger than its item. A candidate within its
 * item reduces it to 1 × (line total − candidate).
 */
function readAs(
  items: readonly ParsedItem[],
  receiptDiscount: Cents,
  variant: Variant,
): { items: ParsedItem[]; discount: Cents } {
  let discount = receiptDiscount
  const read = items.map((item) => {
    const candidate = item.savingsCandidate ?? 0
    if (variant === 'dropped' || candidate === 0) {
      return item
    }
    if (candidate > item.lineTotal) {
      discount = cents(discount + candidate)
      return item
    }
    const reduced = cents(item.lineTotal - candidate)
    return {
      ...item,
      quantity: { numerator: 1, denominator: 1 },
      unitPrice: reduced,
      lineTotal: reduced,
    }
  })
  return { items: read, discount }
}

function itemsSum(items: readonly ParsedItem[]): Cents {
  return sum(items.map((item) => item.lineTotal))
}

/**
 * R23's "near": equal, or the same number of digits with exactly one
 * digit different (`18,77` against `16,77`; not `6,77` against `16,77`).
 */
export function isNearTotal(amount: Cents, total: Cents): boolean {
  const a = String(Math.abs(amount))
  const b = String(Math.abs(total))
  if (a.length !== b.length) {
    return false
  }
  let different = 0
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) different += 1
  }
  return different <= 1
}

/** A step-2 cut: the items it keeps and the ones it leaves out. */
interface Cut {
  kept: ParsedItem[]
  removed: ParsedItem[]
}

/**
 * R23: when a footer line ended the items, the last one or two items whose
 * line total is near the QR total (the footer's `Total` and payment lines,
 * however garbled their words) are left out.
 */
function footerAnchorCut(
  items: readonly ParsedItem[],
  receipt: ParsedReceipt,
  total: Cents,
): Cut | undefined {
  if (receipt.itemsEndedBy === undefined) {
    return undefined
  }
  let keep = items.length
  while (
    keep > 0 &&
    items.length - keep < 2 &&
    isNearTotal(items[keep - 1]?.lineTotal ?? cents(0), total)
  ) {
    keep -= 1
  }
  return keep === items.length
    ? undefined
    : { kept: items.slice(0, keep), removed: items.slice(keep) }
}

/**
 * R9: the first item whose line total equals the QR total is the total
 * line with a garbled label, and it and everything after it are left out;
 * if it's the first item, it's kept as the only one. Only with structural
 * evidence: the matched line looks like a total, or a line after it like a
 * tax-table row.
 */
function totalMatchCut(
  items: readonly ParsedItem[],
  total: Cents,
): Cut | undefined {
  const at = items.findIndex((item) => item.lineTotal === total)
  const matched = items[at]
  if (matched === undefined) {
    return undefined
  }
  const after = items.slice(at + 1)
  const evidence =
    matched.endEvidence === 'totalLike' ||
    after.some((item) => item.endEvidence === 'taxTable')
  if (!evidence) {
    return undefined
  }
  if (at === 0) {
    return after.length === 0 ? undefined : { kept: [matched], removed: after }
  }
  return { kept: items.slice(0, at), removed: items.slice(at) }
}

/**
 * R18: the first prefix whose running sum (read one R8 way, less its read
 * bill-level discount) equals the QR total, when items follow it and one
 * of them looks like a tax-table row: those items are left out.
 */
function runningSumCut(
  items: readonly ParsedItem[],
  receiptDiscount: Cents,
  variant: Variant,
  total: Cents,
): Cut | undefined {
  for (let k = 0; k < items.length; k++) {
    const prefix = readAs(items.slice(0, k + 1), receiptDiscount, variant)
    if (subtract(itemsSum(prefix.items), prefix.discount) !== total) {
      continue
    }
    const after = items.slice(k + 1)
    return after.some((item) => item.endEvidence === 'taxTable')
      ? { kept: items.slice(0, k + 1), removed: after }
      : undefined
  }
  return undefined
}

/** What {@link reconcileWithTrustedTotal} decided. */
export interface Reconciled {
  /** The items, read the chosen R8 way. */
  items: ParsedItem[]
  /** The read bill-level discount that goes with them. */
  discount: Cents
  /**
   * `full`: the whole list closes (D13's combinations allowed); `cut`: a
   * step-2 cut closes, with no adjustment but `discount`; `fallback`:
   * nothing closes, or there's no trusted total.
   */
  outcome: 'full' | 'cut' | 'fallback'
  /** The items a cut left out, in receipt order (R24). */
  removed: ParsedItem[]
}

/**
 * R22: every decision that needs the trusted total, in one stage. Candidate
 * lists are tried in a fixed order and the first that closes the total
 * exactly is taken:
 *
 * 1. the full list, with R8's candidates applied, then dropped (D13's tax,
 *    tip and discount combinations allowed);
 * 2. only with a QR total and no printed total: R23's footer-anchor cut,
 *    then R9's and then R18's cut, each with the candidates applied, then
 *    dropped, each closing with no adjustment but the read bill-level
 *    discount;
 * 3. otherwise the full list with the candidates applied, as before R8, so
 *    the mismatch shows.
 *
 * A cut needs both kinds of evidence (an exact close and the lines'
 * shape), and it returns the lines it left out, for R24.
 */
export function reconcileWithTrustedTotal(
  receipt: ParsedReceipt,
  total: Cents | undefined,
  totalSource: 'qr' | 'printed' | undefined,
): Reconciled {
  const receiptDiscount = receipt.discount ?? cents(0)
  const fallback = (): Reconciled => ({
    ...readAs(receipt.items, receiptDiscount, 'applied'),
    outcome: 'fallback',
    removed: [],
  })
  if (total === undefined) {
    return fallback()
  }

  for (const variant of VARIANTS) {
    const read = readAs(receipt.items, receiptDiscount, variant)
    const closes = COMBINATIONS.some((combination) =>
      closesWith(
        combination,
        itemsSum(read.items),
        { tax: receipt.tax, tip: receipt.tip, discount: read.discount },
        total,
      ),
    )
    if (closes) {
      return { ...read, outcome: 'full', removed: [] }
    }
  }

  if (totalSource !== 'qr' || receipt.total !== undefined) {
    return fallback()
  }
  const cuts: ((variant: Variant) => Cut | undefined)[] = [
    () => footerAnchorCut(receipt.items, receipt, total),
    () => totalMatchCut(receipt.items, total),
    (variant) => runningSumCut(receipt.items, receiptDiscount, variant, total),
  ]
  for (const cut of cuts) {
    for (const variant of VARIANTS) {
      const found = cut(variant)
      if (found === undefined) continue
      const read = readAs(found.kept, receiptDiscount, variant)
      if (subtract(itemsSum(read.items), read.discount) === total) {
        return { ...read, outcome: 'cut', removed: found.removed }
      }
    }
  }
  return fallback()
}

/** R10: any Portuguese fiscal QR region (mainland, Azores, Madeira). */
function isPortugueseQr(qr: FiscalQr | undefined): boolean {
  return Object.values(qr?.regions ?? {}).some((region) =>
    region.country.startsWith('PT'),
  )
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

  // R14: nothing read, but the QR code gives the total: that total, as
  // one flagged item, instead of nothing.
  const read: ParsedReceipt =
    receipt.items.length === 0 && qr !== undefined
      ? {
          ...receipt,
          items: [
            {
              name: NOT_READ_ITEM_NAME,
              quantity: { numerator: 1, denominator: 1 },
              unitPrice: qr.total,
              lineTotal: qr.total,
              needsCheck: true,
            },
          ],
        }
      : receipt
  const total = qr?.total ?? receipt.total
  const reconciled = reconcileWithTrustedTotal(
    read,
    total,
    qr !== undefined
      ? 'qr'
      : receipt.total !== undefined
        ? 'printed'
        : undefined,
  )

  // A cut keeps a prefix of the receipt's items, in order (R22), so the
  // kept items' indices are the receipt's.
  const kept = reconciled.items.slice(0, LIMITS.maxItems)
  const items: Item[] = []
  const flaggedItemIds: string[] = []
  const billItemIds: (string | undefined)[] = []
  for (const parsed of kept) {
    const item = toItem(parsed, nextId(), currentBill)
    billItemIds.push(item?.id)
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
  if (reconciled.items.length > LIMITS.maxItems) {
    warn('itemsTruncated')
  }
  // R10: a Portuguese fiscal QR code means euros, whatever stray symbol
  // the text has.
  const currency = isPortugueseQr(qr) ? 'EUR' : receipt.currencyHint
  if (
    options.regionCurrency !== undefined &&
    currency !== undefined &&
    currency !== options.regionCurrency
  ) {
    warn('currencyDiffers')
  }

  const base: Bill = {
    ...currentBill,
    items,
    tax: NONE,
    tip: NONE,
    discount: NONE,
  }
  // A cut closes with no adjustment but its read bill-level discount
  // (R22); the full list may use D13's combinations.
  const bill =
    reconciled.outcome === 'cut'
      ? withAdjustments(base, { discount: reconciled.discount }, total)
      : withAdjustments(
          base,
          { tax: receipt.tax, tip: receipt.tip, discount: reconciled.discount },
          total,
        )

  const summary: ReceiptSummary = { warnings, flaggedItemIds }
  if (receipt.merchant !== undefined) summary.merchant = receipt.merchant
  const merchantTaxId = qr?.issuerNif ?? receipt.merchantTaxId
  if (merchantTaxId !== undefined) summary.merchantTaxId = merchantTaxId
  const date = qr?.date ?? receipt.date
  if (date !== undefined) summary.date = date
  if (currency !== undefined) summary.currency = currency
  if (total !== undefined) {
    summary.total = total
    summary.totalSource = qr !== undefined ? 'qr' : 'printed'
  }
  if (qr?.totalTax !== undefined) summary.ivaTotal = qr.totalTax
  // R24: a cut is shown, with what it left out, until it's confirmed.
  if (reconciled.removed.length > 0) {
    summary.removedLines = reconciled.removed.map((item) => ({
      name: item.name,
      amount: item.lineTotal,
    }))
  }
  if (receipt.lines === undefined) {
    return { bill, summary }
  }
  // P15: an item line links to its bill row; one whose item a cut or the
  // item limit left out keeps its role and is marked so.
  const lines = receipt.lines.map((line): ReviewLine => {
    if (line.itemIndex === undefined || receipt.items.length === 0) {
      return { ...line }
    }
    const billItemId = billItemIds[line.itemIndex]
    return billItemId === undefined
      ? { ...line, leftOut: true }
      : { ...line, billItemId }
  })
  return { bill, summary, lines }
}
