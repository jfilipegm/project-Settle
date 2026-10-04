/**
 * The receipt model (M2 plan, D2, D3, D15, D16): what a reader turns a
 * receipt into, the interface every reader implements, and the summary the
 * check panel keeps. Pure types, no framework.
 */
import type { Cents, MoneyCurrency, Ratio } from '../../lib/money.ts'

/** M2.5 plan, P15: where a line is on the decoded pages, in pixels. */
export interface LineBox {
  /** The page's index, from 0. */
  page: number
  x: number
  y: number
  width: number
  height: number
}

/** One line of text, from OCR or a PDF text layer. */
export interface TextLine {
  text: string
  /** 0–100. A PDF text layer's lines are 100. */
  confidence: number
  /** Where OCR found it (P15); a PDF text layer's lines have none. */
  box?: LineBox
}

/**
 * P15: the role the parser gave a line. `itemDetail` is a line that
 * belongs to an item without being it (a quantity, code or variant line);
 * `discount` covers savings; `total` covers subtotals.
 */
export type LineRole =
  | 'item'
  | 'itemDetail'
  | 'discount'
  | 'total'
  | 'tip'
  | 'taxTable'
  | 'payment'
  | 'ignored'

/** P15: one input line, as the parser read it. */
export interface ReceiptLine {
  /** The line as read. */
  text: string
  box?: LineBox
  /** The line's last amount, when it has one. */
  amount?: Cents
  role: LineRole
  /** The parsed item it produced or belongs to (`ParsedReceipt.items`). */
  itemIndex?: number
}

export interface ParsedItem {
  name: string
  quantity: Ratio
  unitPrice: Cents
  /** The printed line total, which is authoritative (parsing rule 6). */
  lineTotal: Cents
  /** Low OCR confidence, or an amount that needed a character fix. */
  needsCheck: boolean
  /**
   * R8: the unsigned savings lines printed under the item, summed. They may
   * already be in the price (Continente's `POUPANCA 0,60`) or not; the bill
   * conversion decides with the trusted total. Negative lines are applied
   * to `lineTotal` by the parser, as rule 7 always did.
   */
  savingsCandidate?: Cents
  /**
   * R22's structural evidence that the line isn't an item: a total whose
   * label was garbled (`totalLike`), or a tax-table row (`taxTable`).
   */
  endEvidence?: 'totalLike' | 'taxTable'
}

/** R23: how the items region ended, when a footer line ended it. */
export type ItemsEnd = 'taxTableHeader' | 'separator' | 'payment'

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
  /**
   * The bill-level discount, as a positive amount: negative lines only (an
   * orphaned one, or one larger than its item), never an R8 candidate.
   */
  discount?: Cents
  /** The printed total (parsing rule 8). */
  total?: Cents
  /** R23: the footer line that ended the items region, if one did. */
  itemsEndedBy?: ItemsEnd
  warnings: ReceiptWarning[]
  /** P15: every input line in order, with its role. */
  lines?: ReceiptLine[]
}

/**
 * P15: a line for the row-by-row review, linked to the bill row its item
 * became. Kept in memory for the import that produced it, never saved.
 */
export interface ReviewLine extends ReceiptLine {
  billItemId?: string
  /** Its item was left out of the bill: a cut (R23, R24) or the limit. */
  leftOut?: boolean
}

/** R24: a line the import left out to match the receipt's total. */
export interface RemovedLine {
  name: string
  amount: Cents
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

/**
 * M2.5 plan, P11: what the photo quality check found on a page. Each has
 * its own advice (`messages.ts`).
 */
export type PhotoIssue =
  /** No text was detected at all. */
  | 'noText'
  /** The text is too small to read reliably. */
  | 'smallText'
  | 'blurred'
  | 'dark'
  /** Faint, washed-out text: too much light, or too little contrast. */
  | 'faint'
  | 'glare'
  /** Text runs into an edge of the image: the receipt is cut off. */
  | 'cutOff'
  /** The text covers a small part of the image: taken from too far away. */
  | 'farAway'

/** P11's measurements on one page; absent when there was no text box. */
export interface PhotoMeasures {
  boxes: number
  /** The detection boxes' median height, in the page's pixels. */
  textHeight?: number
  /** The Laplacian's standard deviation (0–255 scale), at text scale. */
  sharpness?: number
  /** Mean brightness inside the boxes, 0–255. */
  brightness?: number
  /** Standard deviation of the brightness inside the boxes, 0–255. */
  contrast?: number
  /** The share of boxes washed out white. */
  glare?: number
  /** The share of boxes touching an edge of the image. */
  edgeShare?: number
  /** The share of the image inside the rectangle around the text. */
  coverage?: number
}

/** P11: one page's check, shown for the import and never stored. */
export interface PhotoQuality {
  issues: PhotoIssue[]
  measures: PhotoMeasures
  /** How long the check took (detection included), for the measurements. */
  milliseconds?: number
}

export interface ReadOptions {
  signal?: AbortSignal
  onProgress?: (progress: ReadProgress) => void
  /**
   * P11: called with each page's photo quality check, before that page is
   * read. Without it, no check runs; the reading is the same either way.
   */
  onQuality?: (quality: PhotoQuality) => void
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
  /**
   * R24: the lines a cut left out to match the trusted total, in receipt
   * order, until the user confirms them. Absent when nothing was cut; never
   * an empty list.
   */
  removedLines?: RemovedLine[]
}
