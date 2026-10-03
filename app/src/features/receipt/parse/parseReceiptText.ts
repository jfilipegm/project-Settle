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
  subtract,
  sum,
  type Cents,
  type MoneyCurrency,
  type Ratio,
} from '../../../lib/money.ts'
import { toBillRatio } from '../../split/model.ts'
import { isValidNif } from '../fiscalQr.ts'
import type {
  ItemsEnd,
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
  TAX_COLUMN_WORDS,
  TAX_SUMMARY,
  TAX_TABLE_WORDS,
  TIP,
  TOTAL,
  findPhrase,
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

/**
 * R4: a quantity and a unit price run together and misread, `1X0,8`: the
 * quantity line still completes its item, as 1 × its line total.
 */
const GARBLED_QUANTITY = /^\d{1,2}[x×]\d+(?:[.,]\d*)?$/i

/** A unit price's unit on its own, `EUR/kg`, `€/kg`. */
const UNIT_OF_PRICE = /^(?:eur|€)?\/(?:kg|un|und|uni)$/i

/** A weight run together with its unit, `0,5484kg`. */
const JOINED_WEIGHT = /^(\d+[.,]\d{1,4})kgs?$/i

/** At most this many noise tokens are dropped from each end of a line. */
const MAX_EDGE_NOISE = 2
const PUNCTUATION = /^[^\p{L}\p{N}]+$/u
const CURRENCY_MARK = /^(?:€|£|\$|US\$)$/
/** Short tokens that are never noise: codes, markers, currencies. */
const SHORT_WORDS = /^(?:NS|UN|KG|X|EUR|GBP|USD)$/i

/** A token a photo's background left at the start of a line (`é.`, `|`). */
function isLeadingNoise(token: string): boolean {
  if (CURRENCY_MARK.test(token)) return false
  // A longer run (`.....`) is a separator row's, never noise.
  if (PUNCTUATION.test(token)) return token.length <= 2
  const letters = token.replace(/[^\p{L}]/gu, '')
  return (
    !/\d/.test(token) &&
    !SHORT_WORDS.test(token) &&
    letters.length > 0 &&
    letters.length <= 2 &&
    (/\P{ASCII}/u.test(letters) || letters === letters.toLowerCase())
  )
}

/** A price and one more digit, `0.201`: a glued, misread tax code. */
const GLUED_CODE = /^\d+[.,]\d{3}$/

/** At most this many tokens before a quantity are dropped as noise. */
const MAX_QUANTITY_NOISE = 3
/** At most this many tokens after a line's last amount are dropped. */
const MAX_TAIL_NOISE = 4

/**
 * Where a quantity starts (`1 X 0,89 0,89`, `1X0,8 0,89`) after up to
 * three short noise tokens (`; z z 1 X …`, `5 - 2 X …`), or -1. A quantity
 * line starts with its quantity, so short tokens before it are noise.
 */
function quantityStart(tokens: readonly string[]): number {
  for (let at = 0; at <= MAX_QUANTITY_NOISE && at < tokens.length; at++) {
    const here = tokens[at] ?? ''
    const next = tokens[at + 1] ?? ''
    if (
      at > 0 &&
      ((/^\d{1,2}$/.test(here) && /^[x×]$/i.test(next)) ||
        GARBLED_QUANTITY.test(here))
    ) {
      return at
    }
    if (here.length > 2) return -1
  }
  return -1
}

/**
 * A token a photo's background left after a line's last amount (`;`,
 * `aE`, `Gi,`, a lone `3`): short, and no digits but a lone one. A
 * receipt line never goes on after its price.
 */
function isTailNoise(token: string): boolean {
  if (CURRENCY_MARK.test(token) || SHORT_WORDS.test(token)) return false
  return /^\d$/.test(token) || (!/\d/.test(token) && token.length <= 3)
}

/**
 * CP3 (user-approved addition): drops the stray characters a photo's
 * table or paper edge adds around a line: up to two at the start
 * (`é. POUPANCA 0,60`), up to three before a quantity (`; z z 1 X 0,89
 * 0,89`), and up to four after the last amount (`AMENDOIM 1,15 : : Gi,`),
 * keeping a tax code right after the amount. A line that doesn't end in
 * an amount keeps its end, so a name is never cut short.
 */
export function trimEdgeNoise(text: string): string {
  let tokens = text.trim().split(/\s+/)
  const quantity = quantityStart(tokens)
  if (quantity > 0) {
    tokens = tokens.slice(quantity)
  } else {
    let start = 0
    while (
      start < MAX_EDGE_NOISE &&
      start < tokens.length - 1 &&
      isLeadingNoise(tokens[start] ?? '')
    ) {
      start += 1
    }
    tokens = tokens.slice(start)
  }
  // A price with its tax code glued on and read as a digit, after another
  // amount (`Deposito 0.20 0.201` for `0,20 F`): the price.
  const final = tokens.at(-1) ?? ''
  if (
    GLUED_CODE.test(final) &&
    tokenizeLine(tokens.at(-2) ?? '')[0]?.kind === 'amount'
  ) {
    tokens = [...tokens.slice(0, -1), final.slice(0, -1)]
  }
  const kinds = tokens.map((token) => tokenizeLine(token)[0]?.kind)
  const lastAmount = kinds.lastIndexOf('amount')
  const tail = tokens.slice(lastAmount + 1)
  if (
    lastAmount === -1 ||
    tail.length === 0 ||
    tail.length > MAX_TAIL_NOISE ||
    !tail.every(isTailNoise)
  ) {
    return tokens.join(' ')
  }
  // A single capital right after the amount is its tax code (`2,39 A`).
  const keep = /^[A-Z]$/.test(tail[0] ?? '') ? 1 : 0
  return tokens.slice(0, lastAmount + 1 + keep).join(' ')
}

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
      if (
        token.kind === 'word' &&
        !GARBLED_QUANTITY.test(token.text) &&
        !JOINED_WEIGHT.test(token.text) &&
        !UNIT_OF_PRICE.test(token.text)
      ) {
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

function isGarbledQuantity(token: LineToken | undefined): boolean {
  return token?.kind === 'word' && GARBLED_QUANTITY.test(token.text)
}

/** A line with no description, just a quantity and amounts (rule 6). */
function isQuantityOnly(line: Line): boolean {
  return (
    line.letters === 0 &&
    line.amounts.length > 0 &&
    line.tokens.some((token) => isXMarker(token) || isGarbledQuantity(token))
  )
}

/**
 * R4: a category header, `Padaria:`, is never an item's name. Its colon
 * is on the word; a lone one (`BOX VEGGIE :`) is a photo's noise.
 */
function isCategoryHeader(line: Line): boolean {
  return line.amounts.length === 0 && /[\p{L}\p{N})]:\s*$/u.test(line.text)
}

/**
 * A quantity line that prints only the unit price, `6 X 0,22` or
 * `0,720 KG × 11,49`: one amount, after its `x`. The line total is on
 * another line.
 */
function isUnitPriceOnly(line: Line): boolean {
  const x = line.tokens.findIndex((token) => isXMarker(token))
  const amountAt = line.tokens.findIndex((token) => token.kind === 'amount')
  return x !== -1 && line.amounts.length === 1 && amountAt > x
}

/** An item line a quantity line can complete. */
function isPlainItemLine(line: Line): boolean {
  return (
    line.endsInAmount &&
    line.letters >= 2 &&
    !line.negative &&
    !isCategoryHeader(line) &&
    !hasAnyKeyword(line)
  )
}

/**
 * CP3: a unit-price-only quantity line printed above its item (`6 X 0,22`
 * / `ACQUA 1,32`, `0,720 KG × 11,49` / `GULASCH 8,27`), as German and
 * Italian receipts do: the next line, when its total is the quantity times
 * the unit price (to the cent, a weight's rounding allowed).
 */
function completesNext(line: Line, next: Line | undefined): boolean {
  if (next === undefined || !isUnitPriceOnly(line) || !isPlainItemLine(next)) {
    return false
  }
  return closesItem(line, next)
}

/**
 * CP3: the same line printed under its item (Lidl's weighed items,
 * `ESPETADAS 2,66` / `0,190 kg × 13,99`), so a promotion under it still
 * belongs to the item.
 */
function completesPrevious(line: Line, previous: Line | undefined): boolean {
  return (
    previous !== undefined &&
    isUnitPriceOnly(line) &&
    isPlainItemLine(previous) &&
    closesItem(line, previous)
  )
}

/** The quantity line's quantity times its unit price is the item's total. */
function closesItem(line: Line, item: Line): boolean {
  const lastAt = line.tokens.findLastIndex((token) => token.kind === 'amount')
  const found = readQuantity(line, lastAt, false)
  if (found === undefined || item.last === undefined) {
    return false
  }
  const product = multiplyRatio(
    found.unitPrice,
    found.quantity.numerator,
    found.quantity.denominator,
  )
  return Math.abs(product - item.last) <= 1
}

/** The item line with the quantity line's tokens before its line total. */
function withQuantity(item: Line, quantity: Line): Line {
  const lastAt = item.tokens.findLastIndex((token) => token.kind === 'amount')
  const text = [
    ...item.tokens.slice(0, lastAt),
    ...quantity.tokens,
    ...item.tokens.slice(lastAt),
  ]
    .map((token) => token.text)
    .join(' ')
  return analyse(text, Math.min(item.confidence, quantity.confidence))
}

/**
 * Rule 6's last form, and R4: a quantity-only line completes the item line
 * just before it, or the name-only line that holds its description. CP3:
 * one that prints only the unit price completes the item after it when the
 * arithmetic says so, and never replaces the price of an item line before
 * it that already has one.
 */
function mergeQuantityLines(lines: readonly Line[]): Line[] {
  const merged: Line[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] as Line
    const previous = merged.at(-1)
    const next = lines[i + 1]
    // A name-only line above keeps its quantity line (rule 6, R4).
    const nameAbove =
      previous !== undefined &&
      previous.amounts.length === 0 &&
      previous.letters >= 2 &&
      !isCategoryHeader(previous) &&
      !hasAnyKeyword(previous)
    if (
      isQuantityOnly(line) &&
      !nameAbove &&
      next !== undefined &&
      completesNext(line, next)
    ) {
      merged.push(withQuantity(next, line))
      i += 1
    } else if (
      previous !== undefined &&
      isQuantityOnly(line) &&
      completesPrevious(line, previous)
    ) {
      merged[merged.length - 1] = withQuantity(previous, line)
    } else if (
      previous !== undefined &&
      isQuantityOnly(line) &&
      previous.letters >= 2 &&
      !previous.negative &&
      !isCategoryHeader(previous) &&
      !hasAnyKeyword(previous) &&
      !(isUnitPriceOnly(line) && previous.endsInAmount)
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

/** A line that is only an amount, with maybe a currency mark (R6). */
function isAmountOnly(line: Line): boolean {
  return (
    line.amounts.length === 1 &&
    line.tokens.every(
      (token) => token.kind === 'amount' || token.kind === 'currency',
    )
  )
}

/**
 * R6: a total, subtotal or tax-summary line with no amount, followed by a
 * line that is only an amount, takes that amount (`Total (Euro):` /
 * `76,11`).
 */
function mergeTotalLines(lines: readonly Line[]): Line[] {
  const merged: Line[] = []
  for (const line of lines) {
    const previous = merged.at(-1)
    if (
      previous !== undefined &&
      previous.amounts.length === 0 &&
      isAmountOnly(line) &&
      (hasPhrase(previous.words, TOTAL) ||
        hasPhrase(previous.words, SUBTOTAL) ||
        hasPhrase(previous.words, TAX_SUMMARY))
    ) {
      merged[merged.length - 1] = analyse(
        `${previous.text} ${line.text}`,
        Math.min(previous.confidence, line.confidence),
      )
    } else {
      merged.push(line)
    }
  }
  return merged
}

/**
 * CP3: a name-only item line whose price is on the next line, alone or
 * after what's left of a quantity the reader lost (`BOCADOS HEURA` /
 * `04 8,08`): the name takes the line's last amount.
 */
function mergePriceLines(lines: readonly Line[]): Line[] {
  const merged: Line[] = []
  for (const line of lines) {
    const previous = merged.at(-1)
    if (
      previous !== undefined &&
      previous.amounts.length === 0 &&
      previous.letters >= 2 &&
      !isCategoryHeader(previous) &&
      !hasAnyKeyword(previous) &&
      line.letters === 0 &&
      line.endsInAmount &&
      !line.negative &&
      !isQuantityOnly(line) &&
      line.tokens.every(
        (token) =>
          token.kind === 'number' ||
          token.kind === 'amount' ||
          token.kind === 'currency' ||
          token.kind === 'taxCode',
      )
    ) {
      const lastAt = line.tokens.findLastIndex(
        (token) => token.kind === 'amount',
      )
      const price = line.tokens
        .slice(lastAt)
        .map((token) => token.text)
        .join(' ')
      merged[merged.length - 1] = analyse(
        `${previous.text} ${price}`,
        Math.min(previous.confidence, line.confidence),
      )
    } else {
      merged.push(line)
    }
  }
  return merged
}

/** An article code: 6–14 digits. */
const ARTICLE_CODE = /^\d{6,14}$/

/**
 * A line with no description that starts with an article code and ends in
 * the price: `1792212 1 23,0% 153,30` (code, quantity, VAT, price).
 */
function isCodeAndPrice(line: Line): boolean {
  const [first] = line.tokens
  return (
    first?.kind === 'number' &&
    ARTICLE_CODE.test(first.text) &&
    line.letters === 0 &&
    line.endsInAmount &&
    !line.negative &&
    line.tokens.every(
      (token) =>
        token.kind === 'number' ||
        token.kind === 'amount' ||
        token.kind === 'rate' ||
        token.kind === 'taxCode' ||
        token.kind === 'currency',
    )
  )
}

/**
 * CP3, P9's code-then-description layout: a code line carrying the
 * quantity and price, then the description under it (`1792212 1 23,0%
 * 153,30` / `THW CLARK 44 GREY`). The description becomes the item, with
 * the code line's quantity first and its amounts last; the code is left
 * out.
 */
function mergeCodeLines(lines: readonly Line[]): Line[] {
  const merged: Line[] = []
  for (const line of lines) {
    const previous = merged.at(-1)
    if (
      previous !== undefined &&
      isCodeAndPrice(previous) &&
      line.amounts.length === 0 &&
      line.letters >= 2 &&
      !isCategoryHeader(line) &&
      !hasAnyKeyword(line)
    ) {
      const rest = previous.tokens.slice(1)
      const quantity = rest
        .filter((token) => token.kind === 'number')
        .map((token) => token.text)
      const amounts = rest
        .filter((token) => token.kind !== 'number')
        .map((token) => token.text)
      merged[merged.length - 1] = analyse(
        [...quantity, line.text, ...amounts].join(' '),
        Math.min(previous.confidence, line.confidence),
      )
    } else {
      merged.push(line)
    }
  }
  return merged
}

/**
 * R5: a line that is only an article code and a size (`71014475 C10 M`),
 * printed under a clothes-shop item. Ignored, and it doesn't separate the
 * item from the discount lines under it.
 */
function isCodeAndSize(line: Line): boolean {
  const [first, ...rest] = line.tokens
  return (
    first?.kind === 'number' &&
    /^\d{6,14}$/.test(first.text) &&
    rest.length >= 1 &&
    rest.length <= 2 &&
    rest.every(
      (token) =>
        (token.kind === 'word' || token.kind === 'number') &&
        token.text.length <= 4,
    )
  )
}

const BRACKETED = /\([^)]*\)|\[[^\]]*\]/g
const FORMULA = /\d+[.,]\d{1,2}\s*[-+x×*]\s*\d+[.,]\d{1,2}/
const FORMULAS = new RegExp(FORMULA.source, 'g')

/**
 * R7: an informational promotion line, whose amounts are all inside
 * brackets or form a formula (`Promoção (25.99-6.00)`): never an item or a
 * discount, and, like R5's code line, transparent to the discount run.
 */
function isInformational(line: Line): boolean {
  const bracketed = (line.text.match(BRACKETED) ?? []).join(' ')
  if (!/\d+[.,]\d{1,2}/.test(bracketed) && !FORMULA.test(line.text)) {
    return false
  }
  const rest = line.text.replace(BRACKETED, ' ').replace(FORMULAS, ' ')
  return tokenizeLine(rest).every((token) => token.kind !== 'amount')
}

/**
 * R18's separator row: only `=`, `-`, `_`, `*` or `.`, and spaces between
 * them, at least 8 of those characters (spaces not counted).
 */
function isSeparator(line: Line): boolean {
  const marks = line.text.replace(/ /g, '')
  return marks.length >= 8 && /^[=\-_*.]+$/.test(marks)
}

/** The distinct R18 column words on a line. */
function columnWords(line: Line): number {
  return new Set(
    line.words.filter((word) =>
      (TAX_COLUMN_WORDS as readonly string[]).includes(word),
    ),
  ).size
}

/**
 * R18's tax-table header: a line with no amount and at least two of the
 * column titles. It ends the items only after one (a receipt's own column
 * header above the items, `IVA DESCRICAO VALOR`, matches too).
 */
function isTaxTableHeader(line: Line): boolean {
  return line.amounts.length === 0 && columnWords(line) >= 2
}

/** Letters that differ between two words of the same length. */
function substitutions(word: string, target: string): number {
  if (word.length !== target.length) {
    return Number.POSITIVE_INFINITY
  }
  let different = 0
  for (let i = 0; i < word.length; i++) {
    if (word[i] !== target[i]) different += 1
  }
  return different
}

/**
 * The line's label, when it is one word (`lozal`, `T0TAL`) and nothing
 * else but amounts, rates, tax codes and currency marks.
 */
function soleLabel(line: Line): string | undefined {
  const words = line.tokens.filter((token) => token.kind === 'word')
  const others = line.tokens.every(
    (token) =>
      token.kind === 'word' ||
      token.kind === 'amount' ||
      token.kind === 'rate' ||
      token.kind === 'taxCode' ||
      token.kind === 'currency',
  )
  const parts = words.length === 1 ? splitWords(words[0]?.text ?? '') : []
  return others && parts.length === 1 ? parts[0] : undefined
}

/**
 * R11: a label within one OCR substitution of `total` (`t0tal`, `tota1`,
 * `lotal`), with an amount, in or after the items. Two (`lozal`) aren't:
 * those are left to R9 and R22.
 */
function isFuzzyTotal(line: Line): boolean {
  const label = soleLabel(line)
  if (line.last === undefined || line.negative) {
    return false
  }
  if (label !== undefined) {
    return substitutions(label, 'total') === 1
  }
  // CP3: or the first word of a longer total phrase (`Totai do documento`).
  const [first, ...rest] = line.desc
  return (
    first !== undefined &&
    substitutions(first, 'total') === 1 &&
    TOTAL.some(
      (phrase) =>
        phrase.includes(' ') && findPhrase(['total', ...rest], phrase) === 0,
    )
  )
}

/**
 * R22's structural evidence on an item line: a one-word label within two
 * substitutions of `total` (`totalLike`), or a rate or two of R18's column
 * words (`taxTable`).
 */
function endEvidenceOf(line: Line): ParsedItem['endEvidence'] {
  const label = soleLabel(line)
  if (label !== undefined && substitutions(label, 'total') <= 2) {
    return 'totalLike'
  }
  if (
    line.tokens.some((token) => token.kind === 'rate') ||
    columnWords(line) >= 2
  ) {
    return 'taxTable'
  }
  return undefined
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

  if (isInformational(line) || isCodeAndSize(line)) {
    return as('ignore')
  }
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
  if (region !== 'header' && isFuzzyTotal(line)) {
    return as('total')
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

/** R3: the `x` of a price-first quantity, and its usual OCR misreads. */
const PRICE_FIRST_X = /^[x×*as]$/i
const PRICE_FIRST_JOINED = /^[x×*](\d{1,2})$/i

/**
 * R3's price-first form, `Name P x Q L` (`Monster 1,74 x 7 12,16`), also
 * `P xQ L`: taken only when `round(P × Q) = L`, so a stray letter never
 * makes a quantity.
 */
function readPriceFirst(line: Line, lastAt: number): Quantity | undefined {
  const { tokens } = line
  const total = line.last ?? cents(0)
  for (let at = 0; at < lastAt; at++) {
    const price = tokens[at]
    if (price?.kind !== 'amount' || price.value <= 0) continue
    const next = tokens[at + 1]
    const joined = PRICE_FIRST_JOINED.exec(next?.text ?? '')
    let quantity: number | undefined
    let used: number[]
    if (joined !== null && at + 1 < lastAt) {
      quantity = Number(joined[1])
      used = [at, at + 1]
    } else if (PRICE_FIRST_X.test(next?.text ?? '') && at + 2 < lastAt) {
      quantity = wholeQuantity(tokens[at + 2])
      used = [at, at + 1, at + 2]
    } else {
      continue
    }
    if (
      quantity !== undefined &&
      quantity >= 1 &&
      multiplyRatio(price.value, quantity, 1) === total
    ) {
      return {
        quantity: { numerator: quantity, denominator: 1 },
        unitPrice: price.value,
        used,
      }
    }
  }
  return undefined
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

  const priceFirst = readPriceFirst(line, lastAt)
  if (priceFirst !== undefined) {
    return priceFirst
  }

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
    const weight = JOINED_WEIGHT.exec(quantityToken?.text ?? '')
    const priceAt = amountAt.find((i) => i > x)
    if (
      priceAt !== undefined &&
      quantityToken !== undefined &&
      (quantityToken.kind === 'number' ||
        quantityToken.kind === 'amount' ||
        (quantityToken.kind === 'word' && weight !== null))
    ) {
      const quantity = ratioOf(joined?.[1] ?? weight?.[1] ?? quantityToken.text)
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
  const nameTokens = tokens
    .filter(
      (token, i) =>
        !used.has(i) &&
        token.kind !== 'amount' &&
        token.kind !== 'rate' &&
        token.kind !== 'taxCode' &&
        token.kind !== 'currency' &&
        !isXMarker(token) &&
        !isGarbledQuantity(token) &&
        !(found !== undefined && UNIT.test(token.text)) &&
        !PER_UNIT.test(token.text),
    )
    .map((token) => token.text)
  // R5: a leading tax code (`(A)`, `NS`) or an 8–14-digit barcode or
  // article code isn't part of the name.
  while (
    nameTokens.length > 1 &&
    /^(?:\([A-Z]\)|NS|\d{8,14})$/.test(nameTokens[0] ?? '')
  ) {
    nameTokens.shift()
  }
  const name = nameTokens.join(' ').trim()

  const item: ParsedItem = {
    name,
    quantity: kept?.quantity ?? { numerator: 1, denominator: 1 },
    unitPrice: kept?.unitPrice ?? lineTotal,
    lineTotal,
    // R4: a quantity line whose unit price was unreadable is checked.
    needsCheck:
      line.confidence < 60 ||
      line.fixed ||
      tokens.some((token) => isGarbledQuantity(token)),
  }
  const evidence = endEvidenceOf(line)
  if (evidence !== undefined) {
    item.endEvidence = evidence
  }
  return item
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

/**
 * D18 with R10: a currency symbol or code counts only when it's attached to
 * an amount, in the same token (`£3.20`) or the next or previous one
 * (`12,50 €`, `Total USD 4.50`). A lone `$` read from noise never does.
 */
function findCurrency(lines: readonly Line[]): MoneyCurrency | undefined {
  for (const line of lines) {
    for (const [i, token] of line.tokens.entries()) {
      if (token.kind === 'amount' && token.currency !== undefined) {
        return token.currency
      }
      if (
        token.kind === 'currency' &&
        (line.tokens[i - 1]?.kind === 'amount' ||
          line.tokens[i + 1]?.kind === 'amount')
      ) {
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
  const lines = mergeTotalLines(
    mergePriceLines(
      mergeCodeLines(
        mergeQuantityLines(
          input
            .map((entry) =>
              analyse(trimEdgeNoise(entry.text), entry.confidence),
            )
            .filter((line) => line.tokens.length > 0),
        ),
      ),
    ),
  )

  // Rules 3 and 4: classify each line in its region. R18: after an item, a
  // tax-table header or a separator row ends the items too; R23 records
  // which footer line ended them.
  const classified: Classified[] = []
  let region: Region = 'header'
  let itemsEndedBy: ItemsEnd | undefined
  for (const line of lines) {
    if (region === 'items' && (isTaxTableHeader(line) || isSeparator(line))) {
      region = 'after'
      itemsEndedBy = isSeparator(line) ? 'separator' : 'taxTableHeader'
      classified.push({ group: 'text', payment: false, line, region })
      continue
    }
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
        if (found.payment) {
          itemsEndedBy = 'payment'
        }
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
  // saving) all belong to that item. R8: a negative one reduces it; an
  // unsigned one is only recorded as a candidate, for the bill conversion
  // to decide with the trusted total. R5's code lines and R7's
  // informational lines don't break the run.
  const items: ParsedItem[] = []
  const billDiscounts: Cents[] = []
  let discountable: number | undefined
  for (const entry of classified) {
    const { line } = entry
    if (isCodeAndSize(line) || isInformational(line)) {
      continue
    }
    if (entry.group === 'item' && entry.region === 'items') {
      items.push(readItem(line, hasQuantityColumn))
      discountable = items.length - 1
    } else if (entry.group === 'discount' && line.last !== undefined) {
      const discount = magnitude(line.last)
      const item = discountable === undefined ? undefined : items[discountable]
      if (entry.region === 'items' && item !== undefined && !line.negative) {
        items[discountable ?? 0] = {
          ...item,
          savingsCandidate: cents((item.savingsCandidate ?? 0) + discount),
        }
      } else if (entry.region === 'items' && item !== undefined) {
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
    // CP3: a total, a bill-level discount, then the total after it
    // (`Summe 34,97`, `MwSt-Senkung -0,88`, `Summe 34,09`).
    const discountsBetween = classified
      .slice(from + 1, next.i)
      .filter(
        (entry) => entry.group === 'discount' && entry.line.last !== undefined,
      )
      .map((entry) => magnitude(entry.line.last ?? cents(0)))
    const discountedTotal =
      discountsBetween.length > 0 &&
      chosen.entry.line.last !== undefined &&
      subtract(chosen.entry.line.last, sum(discountsBetween)) ===
        next.entry.line.last
    if (
      (isSpecific(next.entry.line) && !isSpecific(chosen.entry.line)) ||
      tipBetween ||
      discountedTotal
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
  if (itemsEndedBy !== undefined) receipt.itemsEndedBy = itemsEndedBy
  return receipt
}
