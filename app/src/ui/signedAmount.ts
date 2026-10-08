import type { Region } from '../app/region.ts'
import { formatAmount, negate, type Cents } from '../lib/money.ts'

/** The minus sign, U+2212, never a hyphen (M3 plan, S12). */
export const MINUS = '\u2212'

/**
 * `negative` (the default) marks only amounts below zero; `always` adds a
 * plus sign to positive ones too.
 */
export type AmountSign = 'negative' | 'always'

/** An amount as text in the region's format, with a true minus sign. */
export function signedAmount(
  value: Cents,
  region: Region,
  sign: AmountSign = 'negative',
): string {
  const magnitude = formatAmount(value < 0 ? negate(value) : value, region)
  if (value < 0) return `${MINUS}${magnitude}`
  return sign === 'always' && value > 0 ? `+${magnitude}` : magnitude
}
