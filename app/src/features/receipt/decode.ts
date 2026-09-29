/**
 * Decoding a receipt file into pages (M2 plan, CP2; D6, D7, D10, D16), the
 * browser adapter. Raster images go through `createImageBitmap` (which
 * applies EXIF orientation); HEIC tries the browser's own decoder, then the
 * lazily loaded heic-to; PDF uses a lazily loaded pdf.js, rendering up to 3
 * pages and reading the text layer. The libraries are injectable, so the
 * tests can check what they're given.
 */
import { ASSETS, pdfDocumentOptions } from './assets.ts'
import {
  MAX_PIXELS,
  checkFile,
  checkPixels,
  readDimensions,
  type Dimensions,
} from './intake.ts'
import type {
  ReadError,
  ReceiptPage,
  ReceiptSource,
  TextLine,
} from './model.ts'
import { fragmentsToLines, hasTextLayer, toFragments } from './pdfTextLines.ts'

/** The part of pdf.js this module uses. */
export interface PdfjsModule {
  GlobalWorkerOptions: { workerSrc: string }
  getDocument(params: {
    data: Uint8Array
    isEvalSupported: boolean
    wasmUrl: string
    standardFontDataUrl: string
  }): PdfLoadingTask
}

/** pdf.js 6 destroys a document through its loading task. */
interface PdfLoadingTask {
  promise: Promise<PdfDocument>
  destroy(): Promise<void>
}

interface PdfDocument {
  numPages: number
  getPage(pageNumber: number): Promise<PdfPage>
}

interface PdfPage {
  getViewport(params: { scale: number }): { width: number; height: number }
  render(params: {
    canvas: HTMLCanvasElement
    viewport: { width: number; height: number }
  }): { promise: Promise<void> }
  getTextContent(): Promise<{ items: unknown[] }>
  cleanup(): void
}

/** heic-to's CSP build (`heicTo`), as far as this module uses it. */
export interface HeicToModule {
  heicTo(args: {
    blob: Blob
    type: 'bitmap'
    options?: ImageBitmapOptions
  }): Promise<ImageBitmap>
}

export interface DecodeDeps {
  loadPdfjs: () => Promise<PdfjsModule>
  loadHeicTo: () => Promise<HeicToModule>
  createImageBitmap: (
    image: Blob,
    options?: ImageBitmapOptions,
  ) => Promise<ImageBitmap>
}

export const browserDecodeDeps: DecodeDeps = {
  loadPdfjs: async () => (await import('pdfjs-dist')) as unknown as PdfjsModule,
  // Loaded from vendor/ as its own, unmodified file (D7), never bundled.
  loadHeicTo: async () =>
    (await import(/* @vite-ignore */ ASSETS.heicTo)) as HeicToModule,
  createImageBitmap: (image, options) => createImageBitmap(image, options),
}

export type DecodeResult =
  { ok: true; source: ReceiptSource } | { ok: false; error: ReadError }

/** D6: at most 3 pages are rendered. */
export const MAX_PDF_PAGES = 3

/** Pages whose text layer is read (a long e-fatura still reads whole). */
const MAX_PDF_TEXT_PAGES = 10

class DecodeError extends Error {
  readonly error: ReadError

  constructor(error: ReadError) {
    super(error.code)
    this.error = error
  }
}

function fail(code: ReadError['code']): never {
  throw new DecodeError({ code })
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    fail('cancelled')
  }
}

/**
 * The scale a PDF page is rendered at: 2×, or less for a page whose area
 * at scale 1 would take it past 40 MP, with the pixel size floored so the
 * limit always holds.
 */
export function pdfRenderSize(
  width: number,
  height: number,
): { scale: number; width: number; height: number } {
  const scale = Math.min(2, Math.sqrt(MAX_PIXELS / (width * height)))
  return {
    scale,
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale)),
  }
}

function canvasOf(
  width: number,
  height: number,
): {
  canvas: HTMLCanvasElement
  context: CanvasRenderingContext2D
} {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (context === null) {
    fail('decodeFailed')
  }
  return { canvas, context }
}

function toPage(
  context: CanvasRenderingContext2D,
  size: Dimensions,
): ReceiptPage {
  const image = context.getImageData(0, 0, size.width, size.height)
  return { width: size.width, height: size.height, data: image.data }
}

/** A decoded bitmap as a page, after the post-decode pixel check. */
function bitmapPage(bitmap: ImageBitmap): ReceiptPage {
  try {
    const size = { width: bitmap.width, height: bitmap.height }
    const tooMany = checkPixels(size)
    if (tooMany !== undefined) {
      throw new DecodeError(tooMany)
    }
    const { context } = canvasOf(size.width, size.height)
    context.drawImage(bitmap, 0, 0)
    return toPage(context, size)
  } finally {
    bitmap.close()
  }
}

async function decodeRaster(
  file: Blob,
  deps: DecodeDeps,
): Promise<ReceiptPage> {
  let bitmap: ImageBitmap
  try {
    bitmap = await deps.createImageBitmap(file, {
      imageOrientation: 'from-image',
    })
  } catch {
    fail('decodeFailed')
  }
  return bitmapPage(bitmap)
}

async function decodeHeic(file: Blob, deps: DecodeDeps): Promise<ReceiptPage> {
  // The browser's own decoder first (Safari), then heic-to (D7).
  let bitmap: ImageBitmap | undefined
  try {
    bitmap = await deps.createImageBitmap(file, {
      imageOrientation: 'from-image',
    })
  } catch {
    bitmap = undefined
  }
  if (bitmap === undefined) {
    let heic: HeicToModule
    try {
      heic = await deps.loadHeicTo()
    } catch {
      fail('assetsUnavailable')
    }
    try {
      bitmap = await heic.heicTo({
        blob: file,
        type: 'bitmap',
        options: { imageOrientation: 'from-image' },
      })
    } catch {
      fail('decodeFailed')
    }
  }
  return bitmapPage(bitmap)
}

async function decodePdf(
  file: Blob,
  deps: DecodeDeps,
  signal: AbortSignal | undefined,
): Promise<{ pages: ReceiptPage[]; textLayer?: TextLine[] }> {
  let pdfjs: PdfjsModule
  try {
    pdfjs = await deps.loadPdfjs()
  } catch {
    fail('assetsUnavailable')
  }
  pdfjs.GlobalWorkerOptions.workerSrc = ASSETS.pdfWorker
  const data = new Uint8Array(await file.arrayBuffer())
  const task = pdfjs.getDocument({ data, ...pdfDocumentOptions() })
  let pdf: PdfDocument
  try {
    pdf = await task.promise
  } catch {
    await task.destroy().catch(() => undefined)
    fail('decodeFailed') // not a PDF, damaged, or password-protected
  }
  try {
    const pages: ReceiptPage[] = []
    const text: TextLine[][] = []
    const count = Math.min(pdf.numPages, MAX_PDF_TEXT_PAGES)
    for (let number = 1; number <= count; number++) {
      throwIfAborted(signal)
      const page = await pdf.getPage(number)
      try {
        text.push(
          fragmentsToLines(toFragments((await page.getTextContent()).items)),
        )
        if (number <= MAX_PDF_PAGES) {
          const base = page.getViewport({ scale: 1 })
          const size = pdfRenderSize(base.width, base.height)
          const viewport = page.getViewport({ scale: size.scale })
          const { canvas, context } = canvasOf(size.width, size.height)
          await page.render({ canvas, viewport }).promise
          pages.push(toPage(context, size))
        }
      } finally {
        page.cleanup()
      }
    }
    // A text layer only when every page read has one (D6).
    const textLayer =
      text.length > 0 && text.every(hasTextLayer) ? text.flat() : undefined
    return textLayer === undefined ? { pages } : { pages, textLayer }
  } catch (error) {
    if (error instanceof DecodeError) {
      throw error
    }
    fail('decodeFailed')
  } finally {
    await task.destroy().catch(() => undefined)
  }
}

/**
 * A file to a `ReceiptSource`, or a typed error (D16): `tooLarge`,
 * `unsupportedType`, `tooManyPixels` (from the header where it can say,
 * otherwise right after decoding), `decodeFailed`, `assetsUnavailable` or
 * `cancelled`.
 */
export async function decodeReceipt(
  file: File,
  {
    signal,
    deps = browserDecodeDeps,
  }: { signal?: AbortSignal; deps?: DecodeDeps } = {},
): Promise<DecodeResult> {
  try {
    const checked = await checkFile(file)
    if (!checked.ok) {
      return checked
    }
    const size = readDimensions(checked.header, checked.type)
    const tooMany = size === undefined ? undefined : checkPixels(size)
    if (tooMany !== undefined) {
      return { ok: false, error: tooMany }
    }
    throwIfAborted(signal)
    const meta = { name: file.name, type: file.type, size: file.size }
    if (checked.type === 'pdf') {
      const pdf = await decodePdf(file, deps, signal)
      throwIfAborted(signal)
      return { ok: true, source: { ...pdf, file: meta } }
    }
    const page =
      checked.type === 'heic'
        ? await decodeHeic(file, deps)
        : await decodeRaster(file, deps)
    throwIfAborted(signal)
    return { ok: true, source: { pages: [page], file: meta } }
  } catch (error) {
    if (error instanceof DecodeError) {
      return { ok: false, error: error.error }
    }
    return { ok: false, error: { code: 'decodeFailed' } }
  }
}
