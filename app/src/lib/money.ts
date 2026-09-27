/**
 * Money as integer cents. Every amount in the app goes through this module:
 * there is no float arithmetic on money anywhere, and any product that can
 * exceed 2^53 is computed with BigInt.
 */

/** A safe integer number of cents. Construct one with {@link cents}. */
export type Cents = number & { readonly __brand: 'Cents' }

// Separators per locale, written by hand rather than read from Intl: CLDR's
// pt-PT grouping separator is a no-break space and pt-PT only groups from
// five integer digits, so an Intl-derived parser would misread the
// `.`-grouped input people type. Adding a locale means adding a row here and
// its tests.
const SEPARATORS = {
  'pt-PT': { decimal: ',', grouping: ['.', ' ', ' ', ' '] },
  'en-GB': { decimal: '.', grouping: [','] },
  'en-US': { decimal: '.', grouping: [','] },
} as const satisfies Record<
  string,
  { decimal: string; grouping: readonly string[] }
>

/** A locale whose separators {@link parseAmount} knows. */
export type MoneyLocale = keyof typeof SEPARATORS

export const DEFAULT_LOCALE: MoneyLocale = 'pt-PT'
export const DEFAULT_CURRENCY = 'EUR'

const MAX = BigInt(Number.MAX_SAFE_INTEGER)

/**
 * The one guard every `Cents` result returns through: rejects anything that
 * is not a safe integer and normalizes `-0` to `0`.
 */
function checked(n: number): Cents {
  if (!Number.isSafeInteger(n)) {
    throw new RangeError(`Not a safe integer number of cents: ${n}`)
  }
  return (n === 0 ? 0 : n) as Cents
}

function checkedBig(n: bigint): Cents {
  if (n > MAX || n < -MAX) {
    throw new RangeError(`Amount out of the safe integer range: ${n} cents`)
  }
  return checked(Number(n))
}

function abs(n: bigint): bigint {
  return n < 0n ? -n : n
}

/** Makes `Cents` from a safe integer; throws `RangeError` otherwise. */
export function cents(n: number): Cents {
  return checked(n)
}

export function add(...values: Cents[]): Cents {
  return sum(values)
}

export function sum(values: readonly Cents[]): Cents {
  // Each step adds two safe integers: an exact result inside the safe range
  // passes, and one outside it can't round back in, so the guard catches it.
  let total = checked(0)
  for (const value of values) {
    total = checked(total + value)
  }
  return total
}

export function subtract(a: Cents, b: Cents): Cents {
  return checked(a - b)
}

export function negate(a: Cents): Cents {
  return checked(-(a as number))
}

/** Unit price × an integer quantity (a safe integer of any sign). */
export function multiply(a: Cents, quantity: number): Cents {
  if (!Number.isSafeInteger(quantity)) {
    throw new RangeError(`Quantity must be a safe integer: ${quantity}`)
  }
  return checkedBig(BigInt(a) * BigInt(quantity))
}

/**
 * `a × numerator / denominator`, rounded half away from zero. Use it for
 * fractional quantities (0.75 kg is `3/4`) and percentages (12.5 % is
 * `125/1000`). `numerator` must be a safe integer of any sign and
 * `denominator` a safe integer greater than 0.
 */
export function multiplyRatio(
  a: Cents,
  numerator: number,
  denominator: number,
): Cents {
  if (!Number.isSafeInteger(numerator)) {
    throw new RangeError(`Numerator must be a safe integer: ${numerator}`)
  }
  if (!Number.isSafeInteger(denominator) || denominator <= 0) {
    throw new RangeError(
      `Denominator must be a positive safe integer: ${denominator}`,
    )
  }
  const product = BigInt(a) * BigInt(numerator)
  const divisor = BigInt(denominator)
  let quotient = abs(product) / divisor
  if (2n * (abs(product) % divisor) >= divisor) {
    quotient += 1n
  }
  return checkedBig(product < 0n ? -quotient : quotient)
}

export type ParseRatioResult =
  | { ok: true; numerator: number; denominator: number }
  | { ok: false; error: 'empty' | 'invalid' | 'outOfRange' }

/**
 * Reads a non-negative decimal string (a quantity or a percentage) as an
 * exact, unreduced ratio `numerator / 10^k`, for {@link multiplyRatio}.
 *
 * The decimal separator may be `.` or `,` in any locale, and there is no
 * grouping, sign or exponent. So `"1.234"` means 1.234 (`1234/1000`), unlike
 * `parseAmount("1.234", 'pt-PT')`, which reads 1 234 €. Never throws.
 */
export function parseRatio(input: string): ParseRatioResult {
  const trimmed = input.trim()
  if (trimmed === '') {
    return { ok: false, error: 'empty' }
  }
  const match = /^(\d+)(?:[.,](\d+))?$/.exec(trimmed)
  if (!match) {
    return { ok: false, error: 'invalid' }
  }
  const [, whole = '', fraction = ''] = match
  const numerator = BigInt(whole + fraction)
  const denominator = 10n ** BigInt(fraction.length)
  if (numerator > MAX || denominator > MAX) {
    return { ok: false, error: 'outOfRange' }
  }
  return {
    ok: true,
    numerator: Number(numerator),
    denominator: Number(denominator),
  }
}

/**
 * Splits `total` into parts proportional to `weights` with the
 * largest-remainder method, computed exactly with BigInt:
 *
 * - `sum(parts) === total`;
 * - every part is the floor or the ceiling of its exact share
 *   `total × wᵢ / Σw`, so it is within 1 cent of it;
 * - zero-weight entries get exactly 0.
 *
 * Leftover cents go to the largest remainders, ties to the lowest index, so
 * the result is deterministic. A negative total is split as its absolute
 * value, then each part is negated.
 *
 * Weights must be non-negative safe integers whose sum is a safe integer.
 * All-zero weights are only allowed with a zero total.
 *
 * Fairness note for M1: because ties go to the lowest index, calling this
 * item by item with equal weights makes the same person absorb every
 * leftover cent. Allocate once per bill over the aggregated exact
 * per-person shares (common-denominator weights, which are handled exactly
 * however large they get), or rotate the tie-break.
 */
export function allocate(total: Cents, weights: readonly number[]): Cents[] {
  if (weights.length === 0) {
    throw new RangeError('Cannot allocate over an empty list of weights')
  }
  for (const weight of weights) {
    if (!Number.isSafeInteger(weight) || weight < 0) {
      throw new RangeError(
        `Weights must be non-negative safe integers: ${weight}`,
      )
    }
  }
  const bigWeights = weights.map((weight) => BigInt(weight))
  const weightSum = bigWeights.reduce((acc, weight) => acc + weight, 0n)
  if (weightSum > MAX) {
    throw new RangeError('Weights sum beyond the safe integer range')
  }
  if (weightSum === 0n) {
    if (total !== 0) {
      throw new RangeError('Cannot allocate a non-zero total over zero weights')
    }
    return weights.map(() => checked(0))
  }

  const negative = total < 0
  const whole = abs(BigInt(total))
  const quotients = bigWeights.map((weight) => (whole * weight) / weightSum)
  const remainders = bigWeights.map((weight) => (whole * weight) % weightSum)
  const leftover = Number(
    whole - quotients.reduce((acc, quotient) => acc + quotient, 0n),
  )

  const byRemainder = weights
    .map((_, index) => index)
    .sort((i, j) => {
      const ri = remainders[i] ?? 0n
      const rj = remainders[j] ?? 0n
      if (ri !== rj) {
        return ri > rj ? -1 : 1
      }
      return i - j
    })
  for (const index of byRemainder.slice(0, leftover)) {
    quotients[index] = (quotients[index] ?? 0n) + 1n
  }

  return quotients.map((part) => checkedBig(negative ? -part : part))
}

/** {@link allocate} over `n` equal weights; `n` must be a positive safe integer. */
export function allocateEvenly(total: Cents, n: number): Cents[] {
  if (!Number.isSafeInteger(n) || n <= 0) {
    throw new RangeError(
      `Number of parts must be a positive safe integer: ${n}`,
    )
  }
  return allocate(total, new Array<number>(n).fill(1))
}

export type ParseAmountError = 'empty' | 'invalid' | 'subCent' | 'outOfRange'

export type ParseAmountResult =
  { ok: true; value: Cents } | { ok: false; error: ParseAmountError }

/**
 * Reads an amount the user typed, such as `"12,50"`, `"-€3,20"` or
 * `"1.234,56 €"`. Never throws for user input and never rounds: more than 2
 * decimal digits is `subCent`.
 *
 * Accepts at most one `€` (prefix or suffix) and at most one ASCII `-`,
 * right before the digits or right before a prefix `€`. Grouping must be
 * 1–3 digits followed by groups of exactly 3, with one separator character
 * throughout. When the locale's decimal separator is absent, a lone `.` or
 * `,` followed by 1–2 final digits is read as the decimal separator
 * (`"12.50"` under pt-PT).
 *
 * Throws `RangeError` for a locale missing from the separator table: the
 * locale comes from app settings, never from user input.
 */
export function parseAmount(
  input: string,
  locale: MoneyLocale = DEFAULT_LOCALE,
): ParseAmountResult {
  if (!Object.hasOwn(SEPARATORS, locale)) {
    throw new RangeError(`No separator table for locale: ${locale}`)
  }
  const { decimal, grouping } = SEPARATORS[locale]
  const invalid: ParseAmountResult = { ok: false, error: 'invalid' }

  // 1. Surrounding whitespace.
  let rest = input.trim()
  if (rest === '') {
    return { ok: false, error: 'empty' }
  }

  // 2–3. At most one `€`, prefix or suffix, and at most one `-`, right
  // before the digits or right before a prefix `€`.
  let negative = false
  let symbol = false
  if (rest.startsWith('-€')) {
    negative = true
    symbol = true
    rest = rest.slice(2).trimStart()
  } else if (rest.startsWith('€')) {
    symbol = true
    rest = rest.slice(1).trimStart()
  }
  if (rest.startsWith('-')) {
    if (negative) {
      return invalid
    }
    negative = true
    rest = rest.slice(1)
  }
  if (!symbol && rest.endsWith('€')) {
    rest = rest.slice(0, -1).trimEnd()
  }

  // 4. Only digits and the locale's separators, starting with a digit.
  const separators: readonly string[] = [decimal, ...grouping]
  if (!/^\d/.test(rest)) {
    return invalid
  }
  for (const char of rest) {
    if (!/\d/.test(char) && !separators.includes(char)) {
      return invalid
    }
  }

  // 5. Split off the fraction.
  let integerPart = rest
  let fraction = ''
  const decimalIndex = rest.indexOf(decimal)
  if (decimalIndex !== -1) {
    if (rest.indexOf(decimal, decimalIndex + 1) !== -1) {
      return invalid
    }
    integerPart = rest.slice(0, decimalIndex)
    fraction = rest.slice(decimalIndex + 1)
    if (!/^\d+$/.test(fraction)) {
      return invalid
    }
    if (fraction.length > 2) {
      return { ok: false, error: 'subCent' }
    }
  } else {
    // A lone `.` or `,` followed by 1–2 final digits can only be a decimal
    // separator: a grouping separator is always followed by 3 digits.
    const lenient = /^(\d+)[.,](\d{1,2})$/.exec(rest)
    if (lenient) {
      integerPart = lenient[1] ?? ''
      fraction = lenient[2] ?? ''
    }
  }

  // 6. Plain digits, or 1–3 digits then groups of exactly 3 digits with the
  // same separator throughout.
  if (!/^\d+$/.test(integerPart)) {
    const separator = /\D/.exec(integerPart)?.[0] ?? ''
    const [first = '', ...groups] = integerPart.split(separator)
    if (
      !/^\d{1,3}$/.test(first) ||
      !groups.every((group) => /^\d{3}$/.test(group))
    ) {
      return invalid
    }
    integerPart = first + groups.join('')
  }

  // 7. Exact value; the sign goes on last, through the guard.
  const value = BigInt(integerPart) * 100n + BigInt(fraction.padEnd(2, '0'))
  if (value > MAX) {
    return { ok: false, error: 'outOfRange' }
  }
  return { ok: true, value: checkedBig(negative ? -value : value) }
}

export interface FormatAmountOptions {
  locale?: MoneyLocale
  currency?: string
}

/**
 * Formats cents as a currency string for display, for example
 * `"1234,56 €"` under pt-PT. Throws `RangeError` unless the currency has 2
 * minor-unit digits (cents are hundredths, so JPY or KWD would be off by a
 * factor of 100 or 10).
 */
export function formatAmount(
  value: Cents,
  {
    locale = DEFAULT_LOCALE,
    currency = DEFAULT_CURRENCY,
  }: FormatAmountOptions = {},
): string {
  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
  })
  const digits = formatter.resolvedOptions().maximumFractionDigits
  if (digits !== 2) {
    throw new RangeError(
      `Currency ${currency} has ${digits} minor-unit digits, not 2`,
    )
  }
  return formatter.format(toDecimalString(value))
}

/**
 * The exact decimal string for an amount (`-123456` → `"-1234.56"`), so the
 * formatter never sees `value / 100`. Intl.NumberFormat v3 engines format
 * the string exactly; older ones convert it to a number, which is still
 * exact below about 7·10¹³ €.
 */
function toDecimalString(value: Cents): `${number}` {
  const magnitude = abs(BigInt(value))
  const sign = value < 0 ? '-' : ''
  const units = magnitude / 100n
  const hundredths = (magnitude % 100n).toString().padStart(2, '0')
  return `${sign}${units}.${hundredths}` as `${number}`
}
