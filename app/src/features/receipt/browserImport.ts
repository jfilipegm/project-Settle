/**
 * The importer with its real, browser dependencies (M2 plan, CP4). This
 * module and everything it reaches (the parser, the reader, the QR scanner,
 * pdf.js, Tesseract.js, zxing-wasm) are loaded on the first scan only, so
 * the Split page's own bundle doesn't grow.
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
import { scanFiscalQr } from './qrScanner.ts'

const deps: ImportDeps = {
  decode: (file, { signal }) => decodeReceipt(file, { signal }),
  reader: createBuiltInReader({
    assets: tesseractWorkerOptions(),
    encodePage,
  }),
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
