/**
 * Parsing rules 1 and 2 (M2 plan, "Parsing rules"): line normalisation,
 * the OCR digit fixes, and the tokens a line is made of, with amounts,
 * dates, times and rates told apart. Amounts are parsed to cents exactly,
 * never through floats.
 */
import {
  cents,
  negate,
  type Cents,
  type MoneyCurrency,
} from '../../../lib/money.ts'

/** Lowercase, with accents removed: `Serviço` → `servico`. */
export function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

export type LineToken =
  | {
      kind: 'amount'
      text: string
      value: Cents
      currency?: MoneyCurrency
      /** The token needed an OCR character fix (rule 1). */
      fixed: boolean
    }
  | { kind: 'date'; text: string; iso: string }
  | { kind: 'time'; text: string }
  /** A percentage, `23%` or `12,5 %`. */
  | { kind: 'rate'; text: string }
  | { kind: 'currency'; text: string; currency: MoneyCurrency }
  /** A tax-code letter next to an amount or rate: `A`, `(C)`. */
  | { kind: 'taxCode'; text: string }
  /** A number that isn't an amount: `2`, `0,532`, `12,5`. */
  | { kind: 'number'; text: string }
  | { kind: 'word'; text: string }

const MAX = BigInt(Number.MAX_SAFE_INTEGER)

// Rule 2's three shapes, as a whole token.
const AMOUNT =
  /^(?:\d{1,3}(?:\.\d{3})+,\d{2}|\d{1,3}(?:,\d{3})+\.\d{2}|\d+[.,]\d{2})$/

// Longest first, so `US$` is taken before `$`.
const CURRENCY_MARKS: readonly [string, MoneyCurrency][] = [
  ['US$', 'USD'],
  ['€', 'EUR'],
  ['£', 'GBP'],
  ['$', 'USD'],
]
const CURRENCY_CODES: Readonly<Record<string, MoneyCurrency>> = {
  EUR: 'EUR',
  GBP: 'GBP',
  USD: 'USD',
}

/** An amount's digits (rule 2's shapes) to cents, or `undefined`. */
function amountCents(core: string): Cents | undefined {
  if (!AMOUNT.test(core)) {
    return undefined
  }
  // The decimal separator is the last `,` or `.`, with two digits after it;
  // everything else is grouping.
  const digits = core.replace(/[.,]/g, '')
  const value = BigInt(digits)
  return value > MAX ? undefined : cents(Number(value))
}

interface AmountRead {
  value: Cents
  currency?: MoneyCurrency
}

/**
 * Reads one whitespace-free token as an amount: an optional `-`, an
 * optional currency symbol or code before or after the digits, and one of
 * rule 2's shapes.
 */
export function readAmountToken(token: string): AmountRead | undefined {
  let rest = token.replace(/−/g, '-')
  let negative = false
  let currency: MoneyCurrency | undefined
  if (rest.startsWith('-')) {
    negative = true
    rest = rest.slice(1)
  }
  for (const [mark, code] of CURRENCY_MARKS) {
    if (rest.startsWith(mark)) {
      currency = code
      rest = rest.slice(mark.length)
      break
    }
  }
  if (currency === undefined) {
    const code = /^(EUR|GBP|USD)/i.exec(rest)?.[1]
    if (code !== undefined) {
      currency = CURRENCY_CODES[code.toUpperCase()]
      rest = rest.slice(code.length)
    }
  }
  if (!negative && currency !== undefined && rest.startsWith('-')) {
    negative = true
    rest = rest.slice(1)
  }
  if (currency === undefined) {
    for (const [mark, code] of CURRENCY_MARKS) {
      if (rest.endsWith(mark)) {
        currency = code
        rest = rest.slice(0, -mark.length)
        break
      }
    }
  }
  if (currency === undefined) {
    const code = /(EUR|GBP|USD)$/i.exec(rest)?.[1]
    if (code !== undefined) {
      currency = CURRENCY_CODES[code.toUpperCase()]
      rest = rest.slice(0, -code.length)
    }
  }
  const value = amountCents(rest)
  if (value === undefined) {
    return undefined
  }
  const signed = negative ? negate(value) : value
  return currency === undefined
    ? { value: signed }
    : { value: signed, currency }
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** `YYYY-MM-DD` if the parts are a real calendar date. */
export function isoDate(
  year: number,
  month: number,
  day: number,
): string | undefined {
  if (year < 1900 || year > 2999 || month < 1 || month > 12 || day < 1) {
    return undefined
  }
  if (day > daysInMonth(year, month)) {
    return undefined
  }
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${year}-${pad(month)}-${pad(day)}`
}

/**
 * Rule 5's date shapes, as one token: `dd-mm-yyyy`, `dd/mm/yyyy`,
 * `dd.mm.yy(yy)` and `yyyy-mm-dd`, accepted only if it's a real date.
 */
export function readDateToken(token: string): string | undefined {
  const dayFirst = /^(\d{1,2})([-/.])(\d{1,2})\2(\d{4}|\d{2})$/.exec(token)
  if (dayFirst) {
    const [, day = '', separator, month = '', year = ''] = dayFirst
    // Two-digit years are only printed with dots (rule 5).
    if (year.length === 2 && separator !== '.') {
      return undefined
    }
    const fullYear = year.length === 2 ? 2000 + Number(year) : Number(year)
    return isoDate(fullYear, Number(month), Number(day))
  }
  const yearFirst = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(token)
  if (yearFirst) {
    const [, year = '', month = '', day = ''] = yearFirst
    return isoDate(Number(year), Number(month), Number(day))
  }
  return undefined
}

const TIME = /^(?:[01]?\d|2[0-3])[.:][0-5]\d(?::[0-5]\d)?$/
const RATE = /^\d{1,2}(?:[.,]\d+)?%$/
const NUMBER = /^\d+(?:[.,]\d+)?$/
// Any capital but `X`, which is a multiplication sign (`2 X 2,20`).
const TAX_CODE = /^\(?[A-WYZ]\)?$/

/**
 * Enclosing punctuation that never belongs to what's inside it, and a
 * stray quote mark the OCR puts before a price (`'3,29`).
 */
function stripEnclosing(token: string): string {
  return token.replace(/^[([‘’'`"]+/, '').replace(/[)\]:;]+$/, '')
}

/**
 * Rule 1's OCR swaps, inside a token that looks like a number: `O`/`o` →
 * `0`, `l`/`I`/`|` → `1`, and `S` → `5` between digits. The fix is kept
 * only if it turns the token into an amount or a date.
 */
function fixDigits(token: string): string | undefined {
  if (!/\d/.test(token) || !/^[-\d.,OoIl|S€£$]+$/.test(token)) {
    return undefined
  }
  const chars = [...token]
  const fixed = chars
    .map((char, i) => {
      if (char === 'O' || char === 'o') return '0'
      if (char === 'l' || char === 'I' || char === '|') return '1'
      if (
        char === 'S' &&
        /\d/.test(chars[i - 1] ?? '') &&
        /\d/.test(chars[i + 1] ?? '')
      ) {
        return '5'
      }
      return char
    })
    .join('')
  if (fixed === token) {
    return undefined
  }
  return readAmountToken(fixed) !== undefined ||
    readDateToken(fixed) !== undefined
    ? fixed
    : undefined
}

/**
 * Rule 1: collapse whitespace, and close up `1, 50` → `1,50`. The OCR
 * character fixes happen per token, in {@link tokenizeLine}.
 */
export function normalizeLine(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/(\d[.,]) (\d{2})(?![\d.,])/g, '$1$2')
}

function isTimeContext(token: LineToken | undefined): boolean {
  if (token === undefined) {
    return false
  }
  if (token.kind === 'date') {
    return true
  }
  return (
    token.kind === 'word' &&
    /^(?:hora|time)$/.test(fold(token.text).replace(/[^a-z]/g, ''))
  )
}

/**
 * Splits a line into tokens (rules 1 and 2). An amount is always a whole
 * token; a date is never an amount, and neither is a time that follows
 * `hora`/`time` or sits next to a date.
 */
export function tokenizeLine(text: string): LineToken[] {
  const raw = normalizeLine(text)
    .replace(/(\d) %/g, '$1%')
    // A VAT rate printed against the quantity (`13%3`, M2.5 P9): the rate
    // and the quantity are two tokens.
    .replace(/(\d%)(\d{1,3})(?![\d.,%])/g, '$1 $2')
    // A tax code read against the line's last price (`2,69A`).
    .replace(/(\d[.,]\d{2})([A-WYZ])$/, '$1 $2')
  if (raw === '') {
    return []
  }
  const tokens: LineToken[] = raw.split(' ').map((original): LineToken => {
    const fixed = fixDigits(original)
    const token = fixed ?? original
    const core = stripEnclosing(token)
    const date = readDateToken(core)
    if (date !== undefined) {
      return { kind: 'date', text: token, iso: date }
    }
    // A unit price may carry its unit: `£0.95/kg`, `0,95€/kg`.
    const amount = readAmountToken(core.replace(/\/(?:kg|un|und|uni)$/i, ''))
    if (amount !== undefined) {
      return {
        kind: 'amount',
        text: token,
        ...amount,
        fixed: fixed !== undefined,
      }
    }
    if (TIME.test(core) && core.includes(':')) {
      return { kind: 'time', text: token }
    }
    if (RATE.test(core)) {
      return { kind: 'rate', text: token }
    }
    for (const [mark, code] of CURRENCY_MARKS) {
      if (core === mark) {
        return { kind: 'currency', text: token, currency: code }
      }
    }
    const code = CURRENCY_CODES[core.toUpperCase()]
    if (code !== undefined && /^[A-Za-z]{3}$/.test(core)) {
      return { kind: 'currency', text: token, currency: code }
    }
    if (NUMBER.test(core)) {
      return { kind: 'number', text: token }
    }
    return { kind: 'word', text: token }
  })

  // Second pass, with neighbours: times next to a date or after
  // `hora`/`time`, and tax codes next to an amount or a rate.
  return tokens.map((token, i) => {
    const before = tokens[i - 1]
    const after = tokens[i + 1]
    if (
      token.kind === 'amount' &&
      TIME.test(stripEnclosing(token.text)) &&
      (isTimeContext(before) || after?.kind === 'date')
    ) {
      return { kind: 'time', text: token.text }
    }
    if (
      token.kind === 'word' &&
      TAX_CODE.test(token.text) &&
      (before?.kind === 'amount' ||
        before?.kind === 'rate' ||
        after?.kind === 'amount' ||
        after?.kind === 'rate')
    ) {
      return { kind: 'taxCode', text: token.text }
    }
    return token
  })
}
