/**
 * The receipt import pipeline (M2 plan, CP3; D2, D12, D16, D17): intake
 * and decoding, then the reader and the QR scan side by side, then the
 * bill conversion. It never touches the current bill: the caller gets a
 * new bill and summary, or a typed error and keeps what it has.
 *
 * Everything that isn't pure is injected (`deps`), so the UI tests and
 * later readers can swap it.
 */
import type { MoneyCurrency } from '../../lib/money.ts'
import type { Bill } from '../split/model.ts'
import type { DecodeResult } from './decode.ts'
import type { FiscalQr } from './fiscalQr.ts'
import type {
  ReadError,
  ReadProgress,
  ReadResult,
  ReceiptPage,
  ReceiptReader,
  ReceiptSummary,
} from './model.ts'
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
}

export type ImportResult =
  | { ok: true; bill: Bill; summary: ReceiptSummary; imageUrl?: string }
  | { ok: false; error: ReadError }

function failure(code: ReadError['code']): ImportResult {
  return { ok: false, error: { code } }
}

export async function importReceipt(
  file: File,
  deps: ImportDeps,
  { currentBill, nextId, regionCurrency, signal, onProgress }: ImportOptions,
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

  // The reader and the QR scan run side by side (CP3). A QR scan that
  // fails only means there's no QR code to use.
  const qrScan = deps.scanQr(source.pages, { signal }).catch(() => undefined)
  let read: ReadResult
  try {
    read = await deps.reader.read(source, { signal, onProgress })
  } catch {
    read = { ok: false, error: { code: 'ocrFailed' } }
  }
  if (cancelled()) {
    return failure('cancelled')
  }
  if (!read.ok) {
    return read
  }
  if (read.receipt.items.length === 0) {
    return failure('noItems')
  }

  onProgress?.({ phase: 'checkingQr' })
  const qr = await qrScan
  if (cancelled()) {
    return failure('cancelled')
  }

  const { bill, summary } = receiptToBill(
    read.receipt,
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
  return imageUrl === undefined
    ? { ok: true, bill, summary }
    : { ok: true, bill, summary, imageUrl }
}
