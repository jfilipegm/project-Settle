/**
 * The one place that names the receipt reader's runtime files (M2 plan,
 * D8). Every URL is on the app's own origin, under `vendor/`, which
 * `scripts/vendor-assets.mjs` fills from node_modules. Nothing is loaded
 * from a CDN, and nothing is handed to a worker as a `blob:` URL.
 */

const VENDOR = `${import.meta.env.BASE_URL}vendor/`

export const ASSETS = {
  tesseractWorker: `${VENDOR}tesseract/worker.min.js`,
  /** A directory: getCore.js picks the core build for the browser. */
  tesseractCore: `${VENDOR}tesseract/core`,
  /** A directory holding `<lang>.traineddata.gz`. */
  tesseractLang: `${VENDOR}tesseract/lang`,
  zxingReaderWasm: `${VENDOR}zxing/zxing_reader.wasm`,
  pdfWorker: `${VENDOR}pdfjs/pdf.worker.min.mjs`,
  /** Directories, with the trailing slash pdf.js expects. */
  pdfWasm: `${VENDOR}pdfjs/wasm/`,
  pdfStandardFonts: `${VENDOR}pdfjs/standard_fonts/`,
  heicTo: `${VENDOR}heic-to/heic-to.js`,
} as const

/** Tesseract.js's `createWorker` options: same-origin, no blob worker. */
export function tesseractWorkerOptions() {
  return {
    workerPath: ASSETS.tesseractWorker,
    corePath: ASSETS.tesseractCore,
    langPath: ASSETS.tesseractLang,
    workerBlobURL: false,
    gzip: true,
  } as const
}

/** pdf.js's `getDocument` options besides the data (D6, D8). */
export function pdfDocumentOptions() {
  return {
    isEvalSupported: false,
    wasmUrl: ASSETS.pdfWasm,
    standardFontDataUrl: ASSETS.pdfStandardFonts,
  } as const
}

/** zxing-wasm's `locateFile`: its wasm from `vendor/` (D5, D8). */
export function zxingLocateFile(path: string, prefix: string): string {
  return path.endsWith('.wasm') ? ASSETS.zxingReaderWasm : prefix + path
}
