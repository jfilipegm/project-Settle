/**
 * The PaddleOCR reader (M2.5 plan, P6): `ReceiptReader` with id `paddle`.
 * In the browser the OCR runs in a dedicated module worker
 * (`paddle.worker.ts`), so the page stays responsive; in the Node tests the
 * same engine runs in-process. Either way it's a backend: load the models
 * once, then read pages.
 *
 * The models load on the first scan (D17's `loadingReader`), then each page
 * is read (`reading`, with progress per page). The backend is kept for the
 * next scan. Cancelling, or any failure, terminates it, so the next scan
 * starts a new one (the browser reloads the models from its HTTP cache).
 * D16's codes keep their meaning: a failed load is `assetsUnavailable`, a
 * failed read `ocrFailed`. A PDF's text layer is parsed with no OCR (D6).
 *
 * P11: with an `onQuality` listener, each page is checked before it's read
 * (detection only, then `photoQuality.ts`), and the findings are passed on
 * at once, so the advice shows while the slow reading runs. A check that
 * fails is skipped: it only ever warns.
 */
import type {
  PhotoQuality,
  ReadErrorCode,
  ReadOptions,
  ReadResult,
  ReceiptPage,
  ReceiptReader,
  ReceiptSource,
  TextLine,
} from './model.ts'
import { assembleLines, type PaddleBox } from './paddleLines.ts'
import { joinPages, parseReceiptText } from './parse/parseReceiptText.ts'

/** A backend failure, with the D16 code it stands for. */
export class PaddleFailure extends Error {
  readonly code: 'assetsUnavailable' | 'ocrFailed'
  constructor(code: 'assetsUnavailable' | 'ocrFailed', message: string = code) {
    super(message)
    this.code = code
  }
}

/** Where the OCR runs: a worker in the browser, in-process in Node. */
export interface PaddleBackend {
  /** Rejects with `PaddleFailure('assetsUnavailable')` on a failed load. */
  load(): Promise<void>
  /** Rejects with `PaddleFailure('ocrFailed')` on a failed read. */
  read(page: ReceiptPage): Promise<PaddleBox[]>
  /**
   * P11's check of one page; `undefined` when it failed (it never fails the
   * import). Rejects only as `read` does when the backend itself fails.
   */
  check(page: ReceiptPage): Promise<PhotoQuality | undefined>
  /** Stops it at once, a load or read still running included. */
  terminate(): void
}

/** A read or load stopped by an abort or a reset. */
class Cancelled extends Error {}

// --- The worker protocol ---------------------------------------------------

/** What the reader sends the worker. */
export type PaddleRequest =
  | {
      type: 'load'
      assets: {
        detection: string
        recognition: string
        dictionary: string
        wasmPaths: string
      }
    }
  | {
      /** `read` reads the page; `check` runs P11's photo quality check. */
      type: 'read' | 'check'
      id: number
      width: number
      height: number
      /** The page's RGBA pixels, transferred. */
      data: ArrayBuffer
    }

/** What the worker answers. */
export type PaddleResponse =
  | { type: 'loaded' }
  | { type: 'boxes'; id: number; boxes: PaddleBox[] }
  | { type: 'quality'; id: number; quality: PhotoQuality | null }
  | { type: 'failed'; code: 'assetsUnavailable' | 'ocrFailed'; id?: number }

/** The part of a `Worker` the backend uses. */
export interface WorkerLike {
  postMessage(message: PaddleRequest, transfer?: Transferable[]): void
  terminate(): void
  onmessage: ((event: { data: PaddleResponse }) => void) | null
  onerror: ((event: unknown) => void) | null
}

const VENDOR = `${import.meta.env.BASE_URL}vendor/`

/** The runtime files, all same-origin (D8, P5). */
export const PADDLE_ASSETS = {
  detection: `${VENDOR}paddle/det.onnx`,
  recognition: `${VENDOR}paddle/rec.onnx`,
  dictionary: `${VENDOR}paddle/dict.txt`,
  wasmPaths: `${VENDOR}ort/`,
} as const

const createModuleWorker = (): WorkerLike =>
  new Worker(new URL('./paddle.worker.ts', import.meta.url), {
    type: 'module',
    name: 'paddle-ocr',
  }) as unknown as WorkerLike

/**
 * A page as a request to the worker. Its pixels are a copy, transferred:
 * the page itself is still needed (the QR scan, the preview).
 */
function pageMessage(
  type: 'read' | 'check',
  id: number,
  page: ReceiptPage,
): { message: PaddleRequest; transfer: Transferable[] } {
  const data = page.data.slice().buffer
  return {
    message: { type, id, width: page.width, height: page.height, data },
    transfer: [data],
  }
}

/**
 * A backend in a worker. One request at a time: the reader never overlaps
 * reads. An error the worker can't report (it failed to start or crashed)
 * fails the request in flight as the load's or the read's code.
 */
export function workerBackend(
  createWorker: () => WorkerLike = createModuleWorker,
  assets: PaddleRequest & { type: 'load' } = {
    type: 'load',
    assets: { ...PADDLE_ASSETS },
  },
): PaddleBackend {
  const worker = createWorker()
  let pending:
    | {
        resolve: (response: PaddleResponse) => void
        reject: (error: Error) => void
        code: 'assetsUnavailable' | 'ocrFailed'
      }
    | undefined
  let nextId = 0

  worker.onmessage = (event) => {
    const waiter = pending
    pending = undefined
    waiter?.resolve(event.data)
  }
  worker.onerror = () => {
    const waiter = pending
    pending = undefined
    if (waiter !== undefined) {
      waiter.reject(new PaddleFailure(waiter.code, 'The OCR worker failed'))
    }
  }

  const request = (
    message: PaddleRequest,
    code: 'assetsUnavailable' | 'ocrFailed',
    transfer: Transferable[] = [],
  ) =>
    new Promise<PaddleResponse>((resolve, reject) => {
      pending = { resolve, reject, code }
      worker.postMessage(message, transfer)
    })

  return {
    async load() {
      const response = await request(assets, 'assetsUnavailable')
      if (response.type !== 'loaded') {
        throw new PaddleFailure('assetsUnavailable')
      }
    },
    async read(page) {
      const id = ++nextId
      const { message, transfer } = pageMessage('read', id, page)
      const response = await request(message, 'ocrFailed', transfer)
      if (response.type !== 'boxes' || response.id !== id) {
        throw new PaddleFailure('ocrFailed')
      }
      return response.boxes
    },
    async check(page) {
      const id = ++nextId
      const { message, transfer } = pageMessage('check', id, page)
      const response = await request(message, 'ocrFailed', transfer)
      if (response.type !== 'quality' || response.id !== id) {
        throw new PaddleFailure('ocrFailed')
      }
      return response.quality ?? undefined
    },
    terminate() {
      const waiter = pending
      pending = undefined
      worker.terminate()
      waiter?.reject(new Cancelled())
    },
  }
}

// --- The reader -----------------------------------------------------------

/** Rejects with `Cancelled` when `signal` aborts. */
function abortable<T>(
  promise: Promise<T>,
  signal: AbortSignal | undefined,
): Promise<T> {
  if (signal === undefined) return promise
  if (signal.aborted) return Promise.reject(new Cancelled())
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

export interface PaddleReaderOptions {
  /** A new backend; the browser's worker by default. */
  createBackend?: () => PaddleBackend
}

export function createPaddleReader({
  createBackend = () => workerBackend(),
}: PaddleReaderOptions = {}): ReceiptReader {
  let current: { backend: PaddleBackend; loaded: Promise<void> } | undefined

  /** Stops the backend, so the next read starts a new one. */
  const reset = () => {
    current?.backend.terminate()
    current = undefined
  }

  const failure = (code: ReadErrorCode): ReadResult => ({
    ok: false,
    error: { code },
  })

  async function ocr(
    pages: readonly ReceiptPage[],
    { signal, onProgress, onQuality }: ReadOptions,
  ): Promise<ReadResult> {
    onProgress?.({ phase: 'loadingReader' })
    if (current === undefined) {
      const backend = createBackend()
      current = { backend, loaded: backend.load() }
    }
    const { backend, loaded } = current
    try {
      await abortable(loaded, signal)
    } catch (error) {
      reset()
      if (error instanceof Cancelled) return failure('cancelled')
      return failure('assetsUnavailable')
    }

    try {
      const text: TextLine[][] = []
      for (const [index, page] of pages.entries()) {
        onProgress?.({ phase: 'reading', progress: index / pages.length })
        if (onQuality !== undefined) {
          // A check that failed is `undefined` and skipped; only a crashed
          // worker rejects, and then the read would fail too.
          const quality = await abortable(backend.check(page), signal)
          if (quality !== undefined) onQuality(quality)
        }
        const boxes = await abortable(backend.read(page), signal)
        text.push(assembleLines(boxes, { page: index }))
      }
      onProgress?.({ phase: 'reading', progress: 1 })
      return { ok: true, receipt: parseReceiptText(joinPages(text)) }
    } catch (error) {
      // A read may still be running after an abort: terminating stops it.
      reset()
      return failure(
        error instanceof Cancelled || signal?.aborted === true
          ? 'cancelled'
          : 'ocrFailed',
      )
    }
  }

  return {
    id: 'paddle',
    read(source: ReceiptSource, options: ReadOptions = {}) {
      if (options.signal?.aborted) {
        return Promise.resolve(failure('cancelled'))
      }
      if (source.textLayer !== undefined) {
        // D6: a PDF's text layer is exact, so it's parsed with no OCR.
        return Promise.resolve({
          ok: true,
          receipt: parseReceiptText(source.textLayer),
        })
      }
      if (source.pages.length === 0) {
        return Promise.resolve(failure('decodeFailed'))
      }
      return ocr(source.pages, options)
    },
  }
}
