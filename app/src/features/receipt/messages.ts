/**
 * D16's user-facing messages, one per read error, and the receipt check's
 * other texts, from the catalogue (M3 plan, S11). Each read error ends by
 * pointing at the manual editor, which is right there.
 */
import type { MessageKey, Translate } from '../../i18n/t.ts'
import type { MoneyCurrency } from '../../lib/money.ts'
import type { PhotoIssue, ReadErrorCode, ReceiptWarning } from './model.ts'
import type { ReaderSupport } from './readerSupport.ts'

const ERRORS: Record<ReadErrorCode, MessageKey> = {
  unsupportedType: 'receipt.error.unsupportedType',
  tooLarge: 'receipt.error.tooLarge',
  // R2-O-6: say how to fix it.
  tooManyPixels: 'receipt.error.tooManyPixels',
  decodeFailed: 'receipt.error.decodeFailed',
  ocrFailed: 'receipt.error.ocrFailed',
  assetsUnavailable: 'receipt.error.assetsUnavailable',
  // M2.5, P16: not the connection, so never assetsUnavailable's message.
  readerUnsupported: 'receipt.error.readerUnsupported',
  noItems: 'receipt.error.noItems',
  cancelled: 'receipt.error.cancelled',
}

export function readErrorMessage(t: Translate, code: ReadErrorCode): string {
  return `${t(ERRORS[code])} ${t('receipt.error.fallback')}`
}

/**
 * M2.5 plan, P16: the note "Scan a receipt" shows in a browser that can't
 * run the reader. The check only knows WebAssembly is off, not why, so
 * Lockdown Mode is named as the usual cause, not the certain one.
 */
const SUPPORT_NOTES: Record<Exclude<ReaderSupport, 'ok'>, MessageKey> = {
  noWebAssembly: 'receipt.support.noWebAssembly',
  noSimd: 'receipt.support.noSimd',
}

export function readerSupportNote(
  t: Translate,
  support: Exclude<ReaderSupport, 'ok'>,
): string {
  return t(SUPPORT_NOTES[support])
}

const WARNINGS: Record<
  Exclude<ReceiptWarning, 'currencyDiffers'>,
  MessageKey
> = {
  noTotal: 'receipt.warning.noTotal',
  totalMismatchQr: 'receipt.warning.totalMismatchQr',
  itemsTruncated: 'receipt.warning.itemsTruncated',
  creditNote: 'receipt.warning.creditNote',
  lowConfidence: 'receipt.warning.lowConfidence',
}

/**
 * The check panel's text for each warning (D14). `currency` is the
 * receipt's, for `currencyDiffers` (D18).
 */
export function warningMessage(
  t: Translate,
  warning: ReceiptWarning,
  currency?: MoneyCurrency,
): string {
  if (warning === 'currencyDiffers') {
    return t('receipt.warning.currencyDiffers', {
      currency: currency ?? t('receipt.warning.anotherCurrency'),
    })
  }
  return t(WARNINGS[warning])
}

/**
 * M2.5 plan, P11: the photo quality check's advice, one specific message
 * per issue, saying how to take a better photo. The import goes on either
 * way: this is advice, never an error.
 */
const PHOTO_ADVICE: Record<PhotoIssue, MessageKey> = {
  noText: 'receipt.photo.noText',
  smallText: 'receipt.photo.smallText',
  blurred: 'receipt.photo.blurred',
  dark: 'receipt.photo.dark',
  faint: 'receipt.photo.faint',
  glare: 'receipt.photo.glare',
  cutOff: 'receipt.photo.cutOff',
  farAway: 'receipt.photo.farAway',
}

export function photoAdvice(t: Translate, issue: PhotoIssue): string {
  return t(PHOTO_ADVICE[issue])
}
