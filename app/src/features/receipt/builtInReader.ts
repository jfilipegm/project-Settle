/**
 * The built-in reader (M2 plan, CP3; D2, D4, D17): Tesseract.js in a Web
 * Worker, with `por` + `eng`. A PDF's text layer is parsed directly, with
 * no OCR. Otherwise each page is cleaned up (D10), encoded by the injected
 * page encoder (D2) and recognised; the worker is created for each read
 * and terminated after it, on success, failure or abort.
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
import { preprocessPage } from './preprocess.ts'

/** D2's page encoder: the browser's gives a `Blob`, the Node tests' bytes. */
export type PageEncoder = (page: ReceiptPage) => Promise<Blob | Uint8Array>

/** A Tesseract.js logger message. */
export interface TesseractLog {
  status: string
  progress: number
}

interface TesseractLine {
  text: string
  confidence: number
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
  preprocess?: (page: ReceiptPage) => ReceiptPage
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

/** A recognition result's lines, in reading order, with their confidence. */
export function linesOf(page: TesseractPage): TextLine[] {
  const lines: TextLine[] = []
  for (const block of page.blocks ?? []) {
    for (const paragraph of block.paragraphs) {
      for (const line of paragraph.lines) {
        const text = line.text.trim()
        if (text !== '') {
          lines.push({ text, confidence: line.confidence })
        }
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
    const report = (log: TesseractLog) => {
      const phase = phaseOf(log.status)
      if (phase === 'reading') {
        const progress = (page + log.progress) / pages.length
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
        const image = await abortable(
          Promise.resolve().then(() => encodePage(preprocess(source))),
          signal,
        )
        const result = await abortable(
          worker.recognize(image, {}, { text: false, blocks: true }),
          signal,
        )
        text.push(linesOf(result.data))
      }
      return { ok: true, receipt: parseReceiptText(joinPages(text)) }
    } catch (error) {
      return {
        ok: false,
        error: { code: error instanceof Cancelled ? 'cancelled' : 'ocrFailed' },
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
