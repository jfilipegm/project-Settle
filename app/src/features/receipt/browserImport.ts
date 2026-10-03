/**
 * The importer with its real, browser dependencies (M2 plan, CP4). This
 * module and everything it reaches (the parser, the reader, the QR scanner,
 * pdf.js, PaddleOCR, zxing-wasm) are loaded on the first scan only, so the
 * Split page's own bundle doesn't grow.
 *
 * The reader is PaddleOCR (M2.5 plan, P6); Tesseract.js was retired in
 * M2.5's CP4 (P10).
 */
import { decodeReceipt } from './decode.ts'
import { encodePage } from './encodePage.ts'
import {
  importReceipt,
  type ImportDeps,
  type ImportOptions,
  type ImportResult,
} from './importReceipt.ts'
import { createPaddleReader } from './paddleReader.ts'
import { scanFiscalQr } from './qrScanner.ts'

const deps: ImportDeps = {
  decode: (file, { signal }) => decodeReceipt(file, { signal }),
  reader: createPaddleReader(),
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
