/**
 * D16's user-facing messages, one per read error. Each ends by pointing at
 * the manual editor, which is right there.
 */
import type { MoneyCurrency } from '../../lib/money.ts'
import type { ReadErrorCode, ReceiptWarning } from './model.ts'

const FALLBACK = 'You can type the items in below.'

/**
 * The name of an item that stands for what the reader couldn't read: the
 * whole receipt when no item was read (R14), or the difference (R13).
 */
export const NOT_READ_ITEM_NAME = 'Not read from the receipt'

const MESSAGES: Record<ReadErrorCode, string> = {
  unsupportedType:
    'This file type can’t be read. Use a JPEG, PNG, HEIC or PDF.',
  tooLarge: 'This file is over 20 MB, too large to read.',
  // R2-O-6: say how to fix it.
  tooManyPixels:
    'This photo is too large to read. Take the photo at normal resolution, or crop it.',
  decodeFailed: 'This file couldn’t be opened.',
  ocrFailed: 'The text on this receipt couldn’t be read.',
  assetsUnavailable:
    'The receipt reader couldn’t load. Check your connection: the first scan downloads it.',
  noItems: 'No items were found on this receipt.',
  cancelled: 'Reading was cancelled.',
}

export function readErrorMessage(code: ReadErrorCode): string {
  return `${MESSAGES[code]} ${FALLBACK}`
}

const WARNINGS: Record<Exclude<ReceiptWarning, 'currencyDiffers'>, string> = {
  noTotal:
    'No total was found on the receipt, so the items can’t be checked against it.',
  totalMismatchQr:
    'The printed total differs from the fiscal QR code’s. The QR code’s total is used.',
  itemsTruncated:
    'The receipt has more than 100 items. Only the first 100 were kept.',
  creditNote:
    'The fiscal QR code says this is a credit note (a refund), not a sale.',
  lowConfidence: 'This photo was hard to read. Check the items carefully.',
}

/**
 * The check panel's text for each warning (D14). `currency` is the
 * receipt's, for `currencyDiffers` (D18).
 */
export function warningMessage(
  warning: ReceiptWarning,
  currency?: MoneyCurrency,
): string {
  if (warning === 'currencyDiffers') {
    const which = currency === undefined ? 'another currency' : currency
    return `This receipt is in ${which}, not your region’s currency. Amounts aren’t converted: change the currency in Settings → Region if you need to.`
  }
  return WARNINGS[warning]
}
