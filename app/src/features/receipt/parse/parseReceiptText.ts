/**
 * The rule-based receipt parser: parsing rules 3–10 of the M2 plan
 * ("Parsing rules (D11, specified)"). It takes lines of text with a
 * confidence each, from OCR or a PDF text layer, and never throws.
 */
import {
  cents,
  multiplyRatio,
  negate,
  parseRatio,
  percentOf,
  sum,
  type Cents,
  type MoneyCurrency,
  type Ratio,
} from '../../../lib/money.ts'
import { toBillRatio } from '../../split/model.ts'
import { isValidNif } from '../fiscalQr.ts'
import type {
  ParsedItem,
  ParsedReceipt,
  ReceiptWarning,
  TextLine,
} from '../model.ts'
import { fold, tokenizeLine, type LineToken } from './amounts.ts'
import {
  CARD_ALONE,
  CARD_PAYMENT,
  DISCOUNT,
  DOCUMENT_TITLE,
  IGNORE,
  INCLUDED,
  NOT_MERCHANT,
  PAYMENT_WORDS,
  QUANTITY_TITLE,
  SAVINGS_SUMMARY,
  SPECIFIC_TOTAL,
  SUBTOTAL,
  SUGGESTED,
  TAX,
  TAX_SUMMARY,
  TAX_TABLE_WORDS,
  TIP,
  TOTAL,
  hasPhrase,
  startsWithPhrase,
} from './keywords.ts'

type AmountToken = Extract<LineToken, { kind: 'amount' }>

/** Rule 3's groups, plus `text` for a line that is none of them. */
export type LineGroup =
  | 'ignore'
  | 'taxSummary'
  | 'savings'
  | 'subtotal'
  | 'total'
  | 'tip'
  | 'tax'
  | 'discount'
  | 'item'
  | 'text'

/** Rule 4's regions. */
export type Region = 'header' | 'items' | 'after'

export interface LineClass {
  group: LineGroup
  /** A payment line: always ignored, and it ends the items region. */
  payment: boolean
}

interface Line {
  text: string
  confidence: number
  tokens: LineToken[]
  /** Folded words, currency codes included, for keyword matching. */
  words: string[]
  /** The description's words: no quantity or unit markers. */
  desc: string[]
  /** Letters in the description. */
  letters: number
  amounts: AmountToken[]
  /** The last amount on the line. */
  last?: Cents
  negative: boolean
  /** Any amount on the line needed an OCR character fix. */
  fixed: boolean
  endsInAmount: boolean
}

const MARKER = /^(?:\d+(?:[.,]\d+)?x|x|un|und|unid|uni|kg|kgs)$/

function splitWords(text: string): string[] {
  return fold(text)
    .split(/[^a-z0-9]+/)
    .filter((word) => word !== '')
}

function analyse(text: string, confidence: number): Line {
  const tokens = tokenizeLine(text)
  const words: string[] = []
  const desc: string[] = []
  for (const token of tokens) {
    if (token.kind === 'word' || token.kind === 'currency') {
      const parts = splitWords(token.text)
      words.push(...parts)
      if (token.kind === 'word') {
        desc.push(...parts.filter((part) => !MARKER.test(part)))
      }
    }
  }
  const amounts = tokens.filter(
    (token): token is AmountToken => token.kind === 'amount',
  )
  const last = amounts.at(-1)?.value
  const tail = tokens.filter(
    (token) =>
      token.kind !== 'rate' &&
      token.kind !== 'taxCode' &&
      token.kind !== 'currency',
  )
  return {
    text: tokens.map((token) => token.text).join(' '),
    confidence,
    tokens,
    words,
    desc,
    letters: desc.join('').replace(/[^a-z]/g, '').length,
    amounts,
    last,
    negative: last !== undefined && last < 0,
    fixed: amounts.some((amount) => amount.fixed),
    endsInAmount: tail.at(-1)?.kind === 'amount',
  }
}

const KEYWORD_TABLES: readonly (readonly string[])[] = [
  IGNORE,
  TAX_SUMMARY,
  SAVINGS_SUMMARY,
  SUBTOTAL,
  TOTAL,
  TIP,
  TAX,
  DISCOUNT,
]

function hasAnyKeyword(line: Line): boolean {
  return KEYWORD_TABLES.some((table) => hasPhrase(line.words, table))
}

function isXMarker(token: LineToken | undefined): boolean {
  return (
    token?.kind === 'word' &&
    /^(?:[x×]|\d+(?:[.,]\d{1,3})?[x×])$/i.test(token.text)
  )
}

/** A line with no description, just a quantity and amounts (rule 6). */
function isQuantityOnly(line: Line): boolean {
  return (
    line.letters === 0 &&
    line.amounts.length > 0 &&
    line.tokens.some((token) => isXMarker(token))
  )
}

/**
 * Rule 6's last form: a quantity-only line completes the item line just
 * before it, or the name-only line that holds its description.
 */
function mergeQuantityLines(lines: readonly Line[]): Line[] {
  const merged: Line[] = []
  for (const line of lines) {
    const previous = merged.at(-1)
    if (
      previous !== undefined &&
      isQuantityOnly(line) &&
      previous.letters >= 2 &&
      !previous.negative &&
      !hasAnyKeyword(previous)
    ) {
      const name = previous.tokens
        .filter(
          (token) =>
            token.kind !== 'amount' &&
            token.kind !== 'rate' &&
            token.kind !== 'taxCode' &&
            token.kind !== 'currency',
        )
        .map((token) => token.text)
        .join(' ')
      merged[merged.length - 1] = analyse(
        `${name} ${line.text}`,
        Math.min(previous.confidence, line.confidence),
      )
    } else {
      merged.push(line)
    }
  }
  return merged
}

function isItemShape(line: Line): boolean {
  return line.endsInAmount && line.letters >= 2 && !line.negative
}

/**
 * A tax-table line: a percentage followed by one or two amounts. It counts
 * only after the items region, or when it has no description beyond tax
 * words, rates and tax codes (R2-I-2).
 */
function isTaxTable(line: Line, region: Region): boolean {
  const rateAt = line.tokens.findIndex((token) => token.kind === 'rate')
  if (rateAt === -1) {
    return false
  }
  const after = line.tokens
    .slice(rateAt + 1)
    .filter((token) => token.kind !== 'taxCode' && token.kind !== 'currency')
  if (
    after.length < 1 ||
    after.length > 2 ||
    !after.every((token) => token.kind === 'amount')
  ) {
    return false
  }
  const beforeRate = line.tokens.slice(0, rateAt)
  const onlyTaxWords =
    beforeRate.every((token) => token.kind !== 'number') &&
    line.desc.every((word) =>
      (TAX_TABLE_WORDS as readonly string[]).includes(word),
    )
  return region === 'after' || onlyTaxWords
}

function classify(line: Line, region: Region): LineClass {
  const { words, desc } = line
  const totalLike =
    hasPhrase(words, TOTAL) ||
    hasPhrase(words, SUBTOTAL) ||
    hasPhrase(words, TAX_SUMMARY) ||
    hasPhrase(words, SAVINGS_SUMMARY)
  const discountWord = hasPhrase(words, DISCOUNT)
  // Inside the items region (or before it starts), a keyword that doesn't
  // start the description leaves an item an item (R3-O-1).
  const staysItem = (table: readonly string[]) =>
    region !== 'after' && isItemShape(line) && !startsWithPhrase(desc, table)
  const as = (group: LineGroup): LineClass => ({ group, payment: false })

  const payment =
    !totalLike &&
    !line.negative &&
    !discountWord &&
    (hasPhrase(words, PAYMENT_WORDS) ||
      hasPhrase(words, CARD_PAYMENT) ||
      (desc.length === 1 &&
        (CARD_ALONE as readonly string[]).includes(desc[0] ?? '')))
  if (payment) {
    return { group: 'ignore', payment: true }
  }
  if (hasPhrase(words, IGNORE) && !totalLike && !discountWord) {
    return as(staysItem(IGNORE) ? 'item' : 'ignore')
  }
  if (hasPhrase(words, TAX_SUMMARY) && !hasPhrase(words, INCLUDED)) {
    return as('taxSummary')
  }
  if (hasPhrase(words, SAVINGS_SUMMARY)) {
    return as('savings')
  }
  if (hasPhrase(words, SUBTOTAL)) {
    return as('subtotal')
  }
  if (hasPhrase(words, TOTAL)) {
    return as(line.negative ? 'savings' : 'total')
  }
  if (hasPhrase(words, TIP)) {
    return as(staysItem(TIP) ? 'item' : 'tip')
  }
  if (hasPhrase(words, TAX) || isTaxTable(line, region)) {
    return as('tax')
  }
  if (discountWord || line.negative) {
    return as(discountWord && staysItem(DISCOUNT) ? 'item' : 'discount')
  }
  return as(isItemShape(line) ? 'item' : 'text')
}

/**
 * Rule 3 for one line on its own, in a given region: for tests, so a
 * keyword change shows up as a precise failure.
 */
export function classifyLine(
  text: string,
  region: Region = 'items',
): LineClass {
  return classify(analyse(text, 100), region)
}

function ratioOf(text: string): Ratio | undefined {
  const parsed = toBillRatio(text.replace(/[x×]$/i, ''))
  return parsed.ok && parsed.ratio.numerator > 0 ? parsed.ratio : undefined
}

function wholeQuantity(token: LineToken | undefined): number | undefined {
  if (token?.kind !== 'number' || !/^\d{1,2}$/.test(token.text)) {
    return undefined
  }
  const quantity = Number(token.text)
  return quantity >= 1 && quantity <= 99 ? quantity : undefined
}

const UNIT = /^(?:un|und|unid|uni|kg|kgs)\.?$/i
const PER_UNIT = /\/(?:kg|un|und|uni)$/i

interface Quantity {
  quantity: Ratio
  unitPrice: Cents
  /** Token indices the quantity form used, left out of the name. */
  used: number[]
}

/** Rule 6's quantity forms, given the line total's index. */
function readQuantity(
  line: Line,
  lastAt: number,
  hasQuantityColumn: boolean,
): Quantity | undefined {
  const { tokens } = line
  const amountAt = tokens
    .map((token, i) => (token.kind === 'amount' ? i : -1))
    .filter((i) => i !== -1)
  const total = line.last ?? cents(0)

  // `N x Name P L`, `N x P`, `N un x P` and `Q kg x P €/kg`.
  const x = tokens.findIndex((token) => isXMarker(token))
  if (x !== -1) {
    const joined = /^(\d+(?:[.,]\d{1,3})?)[x×]$/i.exec(tokens[x]?.text ?? '')
    let quantityAt = joined ? x : x - 1
    let unitAt: number | undefined
    if (!joined && UNIT.test(tokens[quantityAt]?.text ?? '')) {
      unitAt = quantityAt
      quantityAt -= 1
    }
    const quantityToken = tokens[quantityAt]
    const priceAt = amountAt.find((i) => i > x)
    if (
      priceAt !== undefined &&
      (quantityToken?.kind === 'number' || quantityToken?.kind === 'amount')
    ) {
      const quantity = ratioOf(joined?.[1] ?? quantityToken.text)
      const price = tokens[priceAt]
      if (quantity !== undefined && price?.kind === 'amount') {
        const used = [quantityAt, x, priceAt]
        if (unitAt !== undefined) {
          used.push(unitAt)
        }
        return { quantity, unitPrice: price.value, used }
      }
    }
    return undefined
  }

  const priceAt = amountAt.length >= 2 ? amountAt.at(-2) : undefined
  if (priceAt !== undefined) {
    const price = tokens[priceAt]
    if (price?.kind !== 'amount') {
      return undefined
    }
    // Column layout, `Name Q P L`.
    const before = tokens[priceAt - 1]
    if (before?.kind === 'number' && priceAt - 1 > 0) {
      const quantity = ratioOf(before.text)
      if (
        quantity !== undefined &&
        multiplyRatio(price.value, quantity.numerator, quantity.denominator) ===
          total
      ) {
        return {
          quantity,
          unitPrice: price.value,
          used: [priceAt - 1, priceAt],
        }
      }
    }
    // Quantity first, `Q Name P L`.
    const first = wholeQuantity(tokens[0])
    if (first !== undefined && multiplyRatio(price.value, first, 1) === total) {
      return {
        quantity: { numerator: first, denominator: 1 },
        unitPrice: price.value,
        used: [0, priceAt],
      }
    }
    return undefined
  }

  // One amount: `Name Q L` or `Q Name L`, when the unit price is a whole
  // number of cents. A quantity of 1 needs no quantity column: it changes
  // only the name (`1 Bitoque 23% 9,50` is `Bitoque`).
  const perUnit = (quantity: number, at: number): Quantity | undefined =>
    total % quantity === 0
      ? {
          quantity: { numerator: quantity, denominator: 1 },
          unitPrice: cents(total / quantity),
          used: [at],
        }
      : undefined
  const trailing = wholeQuantity(tokens[lastAt - 1])
  if (
    trailing !== undefined &&
    lastAt - 1 > 0 &&
    (trailing === 1 || hasQuantityColumn)
  ) {
    return perUnit(trailing, lastAt - 1)
  }
  const first = wholeQuantity(tokens[0])
  if (first !== undefined && (first === 1 || hasQuantityColumn) && lastAt > 1) {
    return perUnit(first, 0)
  }
  return undefined
}

function readItem(line: Line, hasQuantityColumn: boolean): ParsedItem {
  const { tokens } = line
  const lastAt = tokens.findLastIndex((token) => token.kind === 'amount')
  const lineTotal = line.last ?? cents(0)
  const found = readQuantity(line, lastAt, hasQuantityColumn)

  // The printed line total is authoritative.
  const kept =
    found !== undefined &&
    multiplyRatio(
      found.unitPrice,
      found.quantity.numerator,
      found.quantity.denominator,
    ) === lineTotal
      ? found
      : undefined
  // A recognised quantity leaves the name even when its arithmetic doesn't
  // close (only the `x` form is recognised without closing).
  const used = new Set(found?.used ?? [])
  const name = tokens
    .filter(
      (token, i) =>
        !used.has(i) &&
        token.kind !== 'amount' &&
        token.kind !== 'rate' &&
        token.kind !== 'taxCode' &&
        token.kind !== 'currency' &&
        !isXMarker(token) &&
        !(found !== undefined && UNIT.test(token.text)) &&
        !PER_UNIT.test(token.text),
    )
    .map((token) => token.text)
    .join(' ')
    .trim()

  return {
    name,
    quantity: kept?.quantity ?? { numerator: 1, denominator: 1 },
    unitPrice: kept?.unitPrice ?? lineTotal,
    lineTotal,
    needsCheck: line.confidence < 60 || line.fixed,
  }
}

function rateOf(line: Line): Ratio | undefined {
  const rate = line.tokens.find((token) => token.kind === 'rate')
  if (rate === undefined) {
    return undefined
  }
  const parsed = parseRatio(rate.text.replace(/[()%]/g, ''))
  return parsed.ok ? parsed : undefined
}

/**
 * A tax line's tax: its one amount; with a rate, the amount that is that
 * rate of an earlier amount (the base); otherwise the second of three
 * (base, tax, total) or the last.
 */
function taxAmount(line: Line): Cents | undefined {
  const values = line.amounts
    .map((amount) => amount.value)
    .filter((value) => value >= 0)
  if (values.length <= 1) {
    return values[0]
  }
  const rate = rateOf(line)
  if (rate !== undefined) {
    for (let j = 1; j < values.length; j++) {
      for (let i = 0; i < j; i++) {
        const expected = percentOf(values[i] ?? cents(0), rate)
        if (Math.abs(expected - (values[j] ?? 0)) <= 2) {
          return values[j]
        }
      }
    }
  }
  return values.length >= 3 ? values[1] : values.at(-1)
}

interface Classified extends LineClass {
  line: Line
  region: Region
}

/** Rule 8: tip lines that are only suggestions, by index. */
function suggestedTips(classified: readonly Classified[]): Set<number> {
  const suggested = new Set<number>()
  let run: number[] = []
  const flush = () => {
    if (run.length >= 2) {
      run.forEach((i) => suggested.add(i))
    }
    run = []
  }
  classified.forEach((entry, i) => {
    if (entry.group === 'tip' && hasPhrase(entry.line.words, SUGGESTED)) {
      suggested.add(i)
    }
    if (entry.group === 'tip' && rateOf(entry.line) !== undefined) {
      run.push(i)
    } else {
      flush()
    }
  })
  flush()
  return suggested
}

function isMerchantLine(line: Line): boolean {
  const text = line.text
  if (fold(text).replace(/[^a-z]/g, '').length < 3) {
    return false
  }
  if (/^\d/.test(text) || /\b\d{4}-\d{3}\b/.test(text)) {
    return false // an address
  }
  if (/^[+\d\s().-]{9,}$/.test(text)) {
    return false // a phone number
  }
  return !(
    line.amounts.length > 0 ||
    line.tokens.some((token) => token.kind === 'date') ||
    startsWithPhrase(line.words, DOCUMENT_TITLE) ||
    hasPhrase(line.words, NOT_MERCHANT) ||
    hasPhrase(line.words, IGNORE)
  )
}

const NIF =
  /(?:^|[^a-z])(?:n\.?\s?i\.?\s?f|contribuinte)(?![a-z])[^0-9]{0,15}?(\d(?:\s?\d){8})(?!\s?\d)/

function findNif(lines: readonly Line[]): string | undefined {
  for (const line of lines) {
    const digits = NIF.exec(fold(line.text))?.[1]?.replace(/\s/g, '')
    if (digits !== undefined && isValidNif(digits)) {
      return digits
    }
  }
  return undefined
}

function findDate(lines: readonly Line[]): string | undefined {
  for (const line of lines) {
    for (const token of line.tokens) {
      if (token.kind === 'date') {
        return token.iso
      }
    }
  }
  return undefined
}

function findCurrency(lines: readonly Line[]): MoneyCurrency | undefined {
  for (const line of lines) {
    for (const token of line.tokens) {
      if (token.kind === 'currency') {
        return token.currency
      }
      if (token.kind === 'amount' && token.currency !== undefined) {
        return token.currency
      }
    }
  }
  return undefined
}

function magnitude(value: Cents): Cents {
  return value < 0 ? negate(value) : value
}

/** The lines of several pages, in page order (they share one items region). */
export function joinPages(pages: readonly (readonly TextLine[])[]): TextLine[] {
  return pages.flat()
}

/**
 * Parsing rules 3–10: lines in reading order to a `ParsedReceipt`. Never
 * throws: text whose numbers leave the safe money range (the money helpers
 * throw `RangeError`) reads as a receipt with nothing on it.
 */
export function parseReceiptText(input: readonly TextLine[]): ParsedReceipt {
  try {
    return parse(input)
  } catch {
    return { items: [], warnings: ['noTotal'] }
  }
}

function parse(input: readonly TextLine[]): ParsedReceipt {
  const lines = mergeQuantityLines(
    input
      .map((entry) => analyse(entry.text, entry.confidence))
      .filter((line) => line.tokens.length > 0),
  )

  // Rules 3 and 4: classify each line in its region.
  const classified: Classified[] = []
  let region: Region = 'header'
  for (const line of lines) {
    const found = classify(line, region)
    if (region === 'header') {
      if (found.group === 'item') {
        region = 'items'
      } else if (
        (found.group === 'total' || found.group === 'subtotal') &&
        line.last !== undefined
      ) {
        region = 'after'
      }
    } else if (region === 'items') {
      if (
        found.group === 'subtotal' ||
        found.group === 'total' ||
        found.payment
      ) {
        region = 'after'
      }
    }
    classified.push({ ...found, line, region })
  }
  // A bare percentage line under a tip line is a tip line too (a block of
  // suggested tips), never a tax table.
  classified.forEach((entry, i) => {
    const previous = classified[i - 1]
    if (
      entry.region === 'after' &&
      entry.group === 'tax' &&
      entry.line.desc.length === 0 &&
      !hasPhrase(entry.line.words, TAX) &&
      previous?.group === 'tip'
    ) {
      entry.group = 'tip'
    }
  })

  const header = classified.filter((entry) => entry.region === 'header')
  const headerLines = header.map((entry) => entry.line)
  const hasQuantityColumn = headerLines.some((line) =>
    hasPhrase(line.words, QUANTITY_TITLE),
  )

  // Rules 6 and 7: items, and the discounts right after them. A run of
  // discount lines under one item (a card discount, then an instant
  // saving) all reduce that item.
  const items: ParsedItem[] = []
  const billDiscounts: Cents[] = []
  let discountable: number | undefined
  for (const entry of classified) {
    const { line } = entry
    if (entry.group === 'item' && entry.region === 'items') {
      items.push(readItem(line, hasQuantityColumn))
      discountable = items.length - 1
    } else if (entry.group === 'discount' && line.last !== undefined) {
      const discount = magnitude(line.last)
      const item = discountable === undefined ? undefined : items[discountable]
      if (entry.region === 'items' && item !== undefined) {
        const reduced = item.lineTotal - discount
        if (reduced >= 0) {
          items[discountable ?? 0] = {
            ...item,
            quantity: { numerator: 1, denominator: 1 },
            unitPrice: cents(reduced),
            lineTotal: cents(reduced),
          }
        } else {
          billDiscounts.push(discount)
        }
      } else {
        billDiscounts.push(discount)
      }
    } else {
      discountable = undefined
    }
  }

  // Rule 8: totals.
  const suggested = suggestedTips(classified)
  const eligibleTip = (i: number) => {
    const entry = classified[i]
    return (
      entry?.group === 'tip' &&
      entry.line.last !== undefined &&
      !suggested.has(i)
    )
  }
  const tips = classified
    .map((entry, i) => (eligibleTip(i) ? entry.line.last : undefined))
    .filter((value): value is Cents => value !== undefined)

  const taxSummary = classified.find(
    (entry) => entry.group === 'taxSummary' && entry.line.last !== undefined,
  )
  const taxes = classified
    .filter((entry) => entry.group === 'tax')
    .map((entry) => taxAmount(entry.line))
    .filter((value): value is Cents => value !== undefined)

  const subtotal = classified.find(
    (entry) => entry.group === 'subtotal' && entry.line.last !== undefined,
  )?.line.last

  const totals = classified
    .map((entry, i) => ({ entry, i }))
    .filter(
      ({ entry }) =>
        entry.group === 'total' &&
        entry.region === 'after' &&
        entry.line.last !== undefined,
    )
  const isSpecific = (line: Line) => hasPhrase(line.words, SPECIFIC_TOTAL)
  let chosen = totals[0]
  for (const next of totals.slice(1)) {
    if (chosen === undefined) {
      break
    }
    const from = chosen.i
    const tipBetween = classified
      .slice(from + 1, next.i)
      .some((_, offset) => eligibleTip(from + 1 + offset))
    if (
      (isSpecific(next.entry.line) && !isSpecific(chosen.entry.line)) ||
      tipBetween
    ) {
      chosen = next
    }
  }
  const total = chosen?.entry.line.last

  // Rule 5: header facts.
  const merchant = headerLines.find(isMerchantLine)?.text
  const merchantTaxId = findNif(headerLines)
  const date = findDate(headerLines) ?? findDate(lines)
  const currencyHint = findCurrency(lines)

  // Rule 10: warnings.
  const warnings: ReceiptWarning[] = []
  if (total === undefined) {
    warnings.push('noTotal')
  }
  const read = input.filter((entry) => entry.text.trim() !== '')
  if (
    read.length > 0 &&
    read.reduce((acc, entry) => acc + entry.confidence, 0) / read.length < 50
  ) {
    warnings.push('lowConfidence')
  }

  const receipt: ParsedReceipt = { items, warnings }
  if (merchant !== undefined) receipt.merchant = merchant
  if (merchantTaxId !== undefined) receipt.merchantTaxId = merchantTaxId
  if (date !== undefined) receipt.date = date
  if (currencyHint !== undefined) receipt.currencyHint = currencyHint
  if (subtotal !== undefined) receipt.subtotal = subtotal
  const tax =
    taxSummary?.line.last ?? (taxes.length > 0 ? sum(taxes) : undefined)
  if (tax !== undefined) receipt.tax = tax
  if (tips.length > 0) receipt.tip = sum(tips)
  if (billDiscounts.length > 0) receipt.discount = sum(billDiscounts)
  if (total !== undefined) receipt.total = total
  return receipt
}
