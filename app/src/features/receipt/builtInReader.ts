/**
 * The built-in reader (M2 plan, CP3; D2, D4, D17): Tesseract.js in a Web
 * Worker, with `por` + `eng`. A PDF's text layer is parsed directly, with
 * no OCR. Otherwise each page is cleaned up strip by strip (D10, R20); each
 * strip is encoded by the injected page encoder (D2) and recognised, and
 * keeps the lines in its own zone. The worker is created for each read and
 * terminated after it, on success, failure or abort.
 */
import type {
  ReadOptions,
  ReadPhase,
  ReadResult,
  ReceiptPage,
  ReceiptReader,
  ReceiptSource,
  TextLine,
} from './model.ts'
import { joinPages, parseReceiptText } from './parse/parseReceiptText.ts'
import {
  preprocessPage,
  type CleanStrip,
  type GrayPage,
  type PreprocessOptions,
} from './preprocess.ts'
import { ownLines, type OcrLine } from './strips.ts'

/** D2's page encoder: the browser's gives a `Blob`, the Node tests' bytes. */
export type PageEncoder = (page: GrayPage) => Promise<Blob | Uint8Array>

/** D10's clean-up of one page, as its strips (R20). */
export type Preprocess = (
  page: ReceiptPage,
  options: PreprocessOptions,
) => AsyncIterable<CleanStrip>

/** A Tesseract.js logger message. */
export interface TesseractLog {
  status: string
  progress: number
}

interface TesseractLine {
  text: string
  confidence: number
  bbox?: { x0: number; y0: number; x1: number; y1: number }
}

/** The part of a Tesseract.js recognition result this module reads. */
export interface TesseractPage {
  blocks: { paragraphs: { lines: TesseractLine[] }[] }[] | null
}

/** The part of a Tesseract.js worker this module uses. */
export interface TesseractWorker {
  recognize(
    image: Blob | Uint8Array,
    options: Record<string, never>,
    output: { text: boolean; blocks: boolean },
  ): Promise<{ data: TesseractPage }>
  terminate(): Promise<unknown>
}

export type CreateTesseractWorker = (
  langs: string[],
  oem: number,
  options: Record<string, unknown> & {
    logger: (log: TesseractLog) => void
  },
) => Promise<TesseractWorker>

export interface BuiltInReaderOptions {
  /**
   * Tesseract.js's worker options: in the browser, `assets.ts`'s
   * same-origin paths (D8); in the Node tests, local files.
   */
  assets: Record<string, unknown>
  encodePage: PageEncoder
  /** Tesseract.js's `createWorker`, loaded on first use by default. */
  createWorker?: CreateTesseractWorker
  /** D10's clean-up, replaceable in the tests. */
  preprocess?: Preprocess
}

/** D4: Portuguese first, then English. */
export const LANGUAGES = ['por', 'eng']

/** Tesseract.js's `OEM.LSTM_ONLY`: the `best_int` models are LSTM only. */
const OEM_LSTM_ONLY = 1

// Tesseract.js's own types don't list a plain Uint8Array (the Node tests'
// encoder gives a Buffer, which they do), hence the cast.
const loadCreateWorker: CreateTesseractWorker = async (langs, oem, options) =>
  (await (
    await import('tesseract.js')
  ).createWorker(langs, oem, options)) as unknown as TesseractWorker

/** D17: Tesseract's own statuses as the reader's phases. */
export function phaseOf(status: string): ReadPhase | undefined {
  if (status === 'recognizing text') {
    return 'reading'
  }
  if (
    status.startsWith('loading') ||
    status.startsWith('initializing') ||
    status.startsWith('initialized')
  ) {
    return 'loadingReader'
  }
  return undefined
}

/**
 * A recognition result's lines, in reading order (block, paragraph, line),
 * with their confidence and, when Tesseract gives one, their vertical
 * extent in the recognised image (R20).
 */
export function linesOf(page: TesseractPage): OcrLine[] {
  const lines: OcrLine[] = []
  for (const block of page.blocks ?? []) {
    for (const paragraph of block.paragraphs) {
      for (const line of paragraph.lines) {
        const text = line.text.trim()
        if (text === '') continue
        lines.push(
          line.bbox === undefined
            ? { text, confidence: line.confidence }
            : {
                text,
                confidence: line.confidence,
                bbox: { y0: line.bbox.y0, y1: line.bbox.y1 },
              },
        )
      }
    }
  }
  return lines
}

class Cancelled extends Error {}

/** Rejects with `Cancelled` when `signal` aborts. */
function abortable<T>(
  promise: Promise<T>,
  signal: AbortSignal | undefined,
): Promise<T> {
  if (signal === undefined) {
    return promise
  }
  if (signal.aborted) {
    return Promise.reject(new Cancelled())
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new Cancelled())
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort)
        resolve(value)
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort)
        reject(error instanceof Error ? error : new Error(String(error)))
      },
    )
  })
}

export function createBuiltInReader({
  assets,
  encodePage,
  createWorker = loadCreateWorker,
  preprocess = preprocessPage,
}: BuiltInReaderOptions): ReceiptReader {
  async function ocr(
    pages: readonly ReceiptPage[],
    { signal, onProgress }: ReadOptions,
  ): Promise<ReadResult> {
    let page = 0
    let strip = 0
    let strips = 1
    const report = (log: TesseractLog) => {
      const phase = phaseOf(log.status)
      if (phase === 'reading') {
        // R20: progress moves across a page's strips.
        const progress = (page + (strip + log.progress) / strips) / pages.length
        onProgress?.({ phase, progress: Math.min(1, progress) })
      } else if (phase !== undefined) {
        onProgress?.({ phase })
      }
    }

    onProgress?.({ phase: 'loadingReader' })
    const creating = createWorker(LANGUAGES, OEM_LSTM_ONLY, {
      ...assets,
      logger: report,
    })
    let worker: TesseractWorker
    try {
      worker = await abortable(creating, signal)
    } catch (error) {
      if (error instanceof Cancelled) {
        // A worker that finishes loading after the abort is still stopped.
        creating.then((late) => late.terminate()).catch(() => undefined)
      }
      return {
        ok: false,
        error: {
          code: error instanceof Cancelled ? 'cancelled' : 'assetsUnavailable',
        },
      }
    }

    try {
      const text: TextLine[][] = []
      for (; page < pages.length; page++) {
        const source = pages[page]
        if (source === undefined) {
          continue
        }
        const lines: TextLine[] = []
        strip = 0
        strips = 1
        for await (const clean of preprocess(source, { signal })) {
          strip = clean.index
          strips = clean.count
          const image = await abortable(encodePage(clean.image), signal)
          const result = await abortable(
            worker.recognize(image, {}, { text: false, blocks: true }),
            signal,
          )
          lines.push(...ownLines(linesOf(result.data), clean))
        }
        text.push(lines)
      }
      return { ok: true, receipt: parseReceiptText(joinPages(text)) }
    } catch (error) {
      // The clean-up stops with the signal's own reason when it aborts.
      const cancelled = error instanceof Cancelled || signal?.aborted === true
      return {
        ok: false,
        error: { code: cancelled ? 'cancelled' : 'ocrFailed' },
      }
    } finally {
      // Terminating also stops a recognition still running after an abort.
      await worker.terminate().catch(() => undefined)
    }
  }

  return {
    id: 'built-in',
    read(source: ReceiptSource, options: ReadOptions = {}) {
      if (options.signal?.aborted) {
        return Promise.resolve({ ok: false, error: { code: 'cancelled' } })
      }
      if (source.textLayer !== undefined) {
        // D6: a PDF's text layer is exact, so it's parsed with no OCR.
        return Promise.resolve({
          ok: true,
          receipt: parseReceiptText(source.textLayer),
        })
      }
      if (source.pages.length === 0) {
        return Promise.resolve({ ok: false, error: { code: 'decodeFailed' } })
      }
      return ocr(source.pages, options)
    },
  }
}
