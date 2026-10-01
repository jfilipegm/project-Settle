/**
 * The importer with its real, browser dependencies (M2 plan, CP4). This
 * module and everything it reaches (the parser, the reader, the QR scanner,
 * pdf.js, Tesseract.js or PaddleOCR, zxing-wasm) are loaded on the first
 * scan only, so the Split page's own bundle doesn't grow.
 *
 * The reader is chosen at build time (M2.5 plan, P10): Tesseract stays the
 * default until CP4; `VITE_RECEIPT_READER=paddle` builds with PaddleOCR.
 */
import { tesseractWorkerOptions } from './assets.ts'
import { createBuiltInReader } from './builtInReader.ts'
import { decodeReceipt } from './decode.ts'
import { encodePage } from './encodePage.ts'
import {
  importReceipt,
  type ImportDeps,
  type ImportOptions,
  type ImportResult,
} from './importReceipt.ts'
import type { ReceiptReader } from './model.ts'
import { createPaddleReader } from './paddleReader.ts'
import { scanFiscalQr } from './qrScanner.ts'

const reader: ReceiptReader =
  import.meta.env.VITE_RECEIPT_READER === 'paddle'
    ? createPaddleReader()
    : createBuiltInReader({ assets: tesseractWorkerOptions(), encodePage })

const deps: ImportDeps = {
  decode: (file, { signal }) => decodeReceipt(file, { signal }),
  reader,
  scanQr: (pages, { signal }) => scanFiscalQr(pages, { signal }),
  // Kept in memory only (D14); the Split page revokes it.
  previewUrl: async (page) => URL.createObjectURL(await encodePage(page)),
}

export function importWithBrowser(
  file: File,
  options: ImportOptions,
): Promise<ImportResult> {
  return importReceipt(file, deps, options)
}
