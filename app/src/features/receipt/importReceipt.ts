/**
 * The receipt import pipeline (M2 plan, CP3; D2, D12, D16, D17): intake
 * and decoding, then the reader and the QR scan side by side, then the
 * bill conversion. It never touches the current bill: the caller gets a
 * new bill and summary, or a typed error and keeps what it has.
 *
 * Everything that isn't pure is injected (`deps`), so the UI tests and
 * later readers can swap it.
 *
 * M2.5's photo quality check (P11): the reader's findings are passed on as
 * they come (`onQuality`) and returned with the import, for that import's
 * check panel only; they're never part of the summary, so never saved.
 */
import type { MoneyCurrency } from '../../lib/money.ts'
import type { Bill } from '../split/model.ts'
import type { DecodeResult } from './decode.ts'
import type { FiscalQr } from './fiscalQr.ts'
import type {
  ParsedReceipt,
  PhotoIssue,
  PhotoQuality,
  ReadError,
  ReadProgress,
  ReadResult,
  ReceiptPage,
  ReceiptReader,
  ReceiptSummary,
  ReviewLine,
} from './model.ts'
import { combineIssues } from './photoQuality.ts'
import { receiptToBill } from './toBill.ts'

export interface ImportDeps {
  decode: (
    file: File,
    options: { signal?: AbortSignal },
  ) => Promise<DecodeResult>
  reader: ReceiptReader
  scanQr: (
    pages: readonly ReceiptPage[],
    options: { signal?: AbortSignal },
  ) => Promise<FiscalQr | undefined>
  /**
   * The "Show receipt image" preview (D14): an object URL of the first
   * page, kept in memory only. Optional: without it there's no preview.
   */
  previewUrl?: (page: ReceiptPage) => Promise<string>
}

export interface ImportOptions {
  /** The bill the receipt replaces the items of (D13); never modified. */
  currentBill: Bill
  /** A new item id, called once per item kept. */
  nextId: () => string
  /** The region's currency, for `currencyDiffers` (D18). */
  regionCurrency?: MoneyCurrency
  signal?: AbortSignal
  onProgress?: (progress: ReadProgress) => void
  /** P11: every page's photo issues so far, each time a page is checked. */
  onQuality?: (issues: PhotoIssue[]) => void
}

export type ImportResult =
  | {
      ok: true
      bill: Bill
      summary: ReceiptSummary
      imageUrl?: string
      /** P11: the photo's issues, when it has any. Never saved. */
      photoIssues?: PhotoIssue[]
      /**
       * P11: each checked page's measurements, when a check ran, for
       * `scripts/measure-quality.mjs`. Never saved.
       */
      photoChecks?: PhotoQuality[]
      /** P15: the lines read, with their roles, for the review. Never saved. */
      lines?: ReviewLine[]
    }
  | { ok: false; error: ReadError }

function failure(code: ReadError['code']): ImportResult {
  return { ok: false, error: { code } }
}

export async function importReceipt(
  file: File,
  deps: ImportDeps,
  {
    currentBill,
    nextId,
    regionCurrency,
    signal,
    onProgress,
    onQuality,
  }: ImportOptions,
): Promise<ImportResult> {
  const cancelled = () => signal?.aborted === true
  if (cancelled()) {
    return failure('cancelled')
  }

  onProgress?.({ phase: 'opening' })
  let decoded: DecodeResult
  try {
    decoded = await deps.decode(file, { signal })
  } catch {
    decoded = { ok: false, error: { code: 'decodeFailed' } }
  }
  if (cancelled()) {
    return failure('cancelled')
  }
  if (!decoded.ok) {
    return decoded
  }
  const { source } = decoded
  let receipt: ParsedReceipt

  // The reader and the QR scan run side by side (CP3). A QR scan that
  // fails only means there's no QR code to use. The scan has its own
  // signal, aborted with the caller's, and also as soon as the import ends
  // another way, so a failed read doesn't leave it running.
  const qrController = new AbortController()
  const stopQr = () => {
    qrController.abort()
  }
  signal?.addEventListener('abort', stopQr, { once: true })
  let qr: FiscalQr | undefined
  const qualities: PhotoQuality[] = []
  try {
    const qrScan = deps
      .scanQr(source.pages, { signal: qrController.signal })
      .catch(() => undefined)
    let read: ReadResult
    try {
      read = await deps.reader.read(source, {
        signal,
        onProgress,
        onQuality: (quality) => {
          qualities.push(quality)
          onQuality?.(combineIssues(qualities))
        },
      })
    } catch {
      read = { ok: false, error: { code: 'ocrFailed' } }
    }
    if (cancelled()) {
      return failure('cancelled')
    }
    if (!read.ok) {
      return read
    }

    onProgress?.({ phase: 'checkingQr' })
    qr = await qrScan
    if (cancelled()) {
      return failure('cancelled')
    }
    // R14: with no items read, a QR total still gives a bill (its total as
    // one flagged item); without one there's nothing to import.
    if (read.receipt.items.length === 0 && qr === undefined) {
      return failure('noItems')
    }
    receipt = read.receipt
  } finally {
    signal?.removeEventListener('abort', stopQr)
    stopQr()
  }

  const { bill, summary, lines } = receiptToBill(
    receipt,
    qr,
    currentBill,
    nextId,
    regionCurrency === undefined ? {} : { regionCurrency },
  )
  const first = source.pages[0]
  let imageUrl: string | undefined
  if (deps.previewUrl !== undefined && first !== undefined) {
    imageUrl = await deps.previewUrl(first).catch(() => undefined)
  }
  const photoIssues = combineIssues(qualities)
  return {
    ok: true,
    bill,
    summary,
    ...(imageUrl !== undefined && { imageUrl }),
    ...(photoIssues.length > 0 && { photoIssues }),
    ...(qualities.length > 0 && { photoChecks: qualities }),
    ...(lines !== undefined && { lines }),
  }
}
