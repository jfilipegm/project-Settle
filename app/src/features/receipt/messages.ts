/**
 * D16's user-facing messages, one per read error. Each ends by pointing at
 * the manual editor, which is right there.
 */
import type { MoneyCurrency } from '../../lib/money.ts'
import type { PhotoIssue, ReadErrorCode, ReceiptWarning } from './model.ts'
import type { ReaderSupport } from './readerSupport.ts'

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
  // M2.5, P16: not the connection, so never assetsUnavailable's message.
  readerUnsupported:
    'This file has to be read as an image, and this browser can’t read images. A PDF receipt with selectable text works.',
  noItems: 'No items were found on this receipt.',
  cancelled: 'Reading was cancelled.',
}

export function readErrorMessage(code: ReadErrorCode): string {
  return `${MESSAGES[code]} ${FALLBACK}`
}

/**
 * M2.5 plan, P16: the note "Scan a receipt" shows in a browser that can't
 * run the reader. The check only knows WebAssembly is off, not why, so
 * Lockdown Mode is named as the usual cause, not the certain one.
 */
const SUPPORT_NOTES: Record<Exclude<ReaderSupport, 'ok'>, string> = {
  noWebAssembly:
    'Photos can’t be read in this browser, because WebAssembly is turned off. On an iPhone, iPad or Mac this is usually Lockdown Mode, which you can turn off for this site: on an iPhone or iPad, tap aA, then Website Settings; on a Mac, choose Safari, then Settings for This Website. A PDF receipt from an app still works.',
  noSimd:
    'Photos can’t be read in this browser: it’s too old for the receipt reader. Update the browser (on an iPhone or iPad, update iOS). A PDF receipt from an app still works.',
}

export function readerSupportNote(
  support: Exclude<ReaderSupport, 'ok'>,
): string {
  return SUPPORT_NOTES[support]
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

/**
 * M2.5 plan, P11: the photo quality check's advice, one specific message
 * per issue, saying how to take a better photo. The import goes on either
 * way: this is advice, never an error.
 */
const PHOTO_ADVICE: Record<PhotoIssue, string> = {
  noText:
    'No text was found in this image. Check it’s the receipt, in focus and well lit.',
  smallText:
    'The text in this image is small, so some numbers may be misread. Move closer to the receipt. For a receipt from an app, share the original image as a document, or use the app’s PDF export: it’s read exactly.',
  blurred:
    'This photo looks blurred. Hold the phone steady and let it focus before taking the photo.',
  dark: 'This photo is dark. Take it in more light.',
  faint:
    'The text in this photo is faint. Take it in even light, without the flash pointing straight at the receipt.',
  glare:
    'There’s glare on the receipt. Tilt it away from the light, or turn off the flash.',
  cutOff:
    'The receipt seems cut off at the edge of the photo. Include the whole receipt, with a little space around it.',
  farAway:
    'The receipt is small in this photo. Come closer, so it fills most of the photo.',
}

export function photoAdvice(issue: PhotoIssue): string {
  return PHOTO_ADVICE[issue]
}

/** The line before the advice, while reading and in the check panel. */
export const PHOTO_ADVICE_LEAD =
  'This photo may not read well. You can cancel and take a better one:'
export const PHOTO_ADVICE_LEAD_DONE =
  'This photo may not have read well. Check the items, or scan a better photo:'
