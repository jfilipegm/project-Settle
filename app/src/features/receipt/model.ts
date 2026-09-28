/**
 * The receipt model (M2 plan, D2, D3, D15, D16): what a reader turns a
 * receipt into, the interface every reader implements, and the summary the
 * check panel keeps. Pure types, no framework.
 */
import type { Cents, MoneyCurrency, Ratio } from '../../lib/money.ts'

/** One line of text, from OCR or a PDF text layer. */
export interface TextLine {
  text: string
  /** 0–100. A PDF text layer's lines are 100. */
  confidence: number
}

export interface ParsedItem {
  name: string
  quantity: Ratio
  unitPrice: Cents
  /** The printed line total, which is authoritative (parsing rule 6). */
  lineTotal: Cents
  /** Low OCR confidence, or an amount that needed a character fix. */
  needsCheck: boolean
}

/** A typed warning; the UI owns the user-facing message for each code. */
export type ReceiptWarning =
  /** No total was read, from the receipt or a fiscal QR code. */
  | 'noTotal'
  /** The printed total disagrees with the fiscal QR code's (D12). */
  | 'totalMismatchQr'
  /** More than 100 items: only the first 100 were kept (D13). */
  | 'itemsTruncated'
  /** The receipt's currency isn't the region's (D18). */
  | 'currencyDiffers'
  /** The fiscal QR code says this is a credit note (`D:NC`). */
  | 'creditNote'
  /** The text was hard to read: mean confidence under 50. */
  | 'lowConfidence'

export interface ParsedReceipt {
  merchant?: string
  /** A Portuguese NIF with a valid check digit. */
  merchantTaxId?: string
  /** ISO `YYYY-MM-DD`. */
  date?: string
  currencyHint?: MoneyCurrency
  items: ParsedItem[]
  subtotal?: Cents
  tax?: Cents
  tip?: Cents
  /** The bill-level discount, as a positive amount. */
  discount?: Cents
  /** The printed total (parsing rule 8). */
  total?: Cents
  warnings: ReceiptWarning[]
}

/** One decoded page, as RGBA pixels. */
export interface ReceiptPage {
  width: number
  height: number
  data: Uint8ClampedArray
}

/** A decoded receipt file, the input to every reader (D2). */
export interface ReceiptSource {
  pages: ReceiptPage[]
  /** A PDF's text layer, when it has one (D6): read with no OCR. */
  textLayer?: TextLine[]
  file: { name: string; type: string; size: number }
}

/** D16: every way reading can fail. The current bill is never touched. */
export type ReadErrorCode =
  | 'unsupportedType'
  | 'tooLarge'
  | 'tooManyPixels'
  | 'decodeFailed'
  | 'ocrFailed'
  | 'assetsUnavailable'
  | 'noItems'
  | 'cancelled'

export interface ReadError {
  code: ReadErrorCode
}

export type ReadResult =
  { ok: true; receipt: ParsedReceipt } | { ok: false; error: ReadError }

/** D17's phases, in order. */
export type ReadPhase = 'opening' | 'loadingReader' | 'reading' | 'checkingQr'

export interface ReadProgress {
  phase: ReadPhase
  /** 0–1, while `reading`, when the reader knows it. */
  progress?: number
}

export interface ReadOptions {
  signal?: AbortSignal
  onProgress?: (progress: ReadProgress) => void
}

/**
 * The plug-in point for readers (D2). A reader only turns a decoded source
 * into a `ParsedReceipt`: decoding, QR scanning, reconciliation and bill
 * conversion run outside it, the same way for every reader.
 */
export interface ReceiptReader {
  readonly id: string
  read(source: ReceiptSource, options?: ReadOptions): Promise<ReadResult>
}

/** Where the trusted total came from (D12). */
export type TotalSource = 'qr' | 'printed'

/**
 * The check panel's data (D14, D15), saved next to the bill. Never the
 * image.
 */
export interface ReceiptSummary {
  merchant?: string
  merchantTaxId?: string
  date?: string
  currency?: MoneyCurrency
  /** The trusted total (D12), with its source. */
  total?: Cents
  totalSource?: TotalSource
  /** The IVA included, from the fiscal QR code's `N`. */
  ivaTotal?: Cents
  warnings: ReceiptWarning[]
  /** Items whose "Check" marker is still showing. */
  flaggedItemIds: string[]
}
