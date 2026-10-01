import { describe, expect, it, vi } from 'vitest'
import type { ReadProgress, ReceiptPage, ReceiptSource } from './model.ts'
import type { PaddleBox } from './paddleLines.ts'
import {
  createPaddleReader,
  workerBackend,
  type PaddleRequest,
  type PaddleResponse,
  type WorkerLike,
} from './paddleReader.ts'

const page = (width = 4, height = 2): ReceiptPage => ({
  width,
  height,
  data: new Uint8ClampedArray(width * height * 4).fill(200),
})

const source = (pages: ReceiptPage[]): ReceiptSource => ({
  pages,
  file: { name: 'r.jpg', type: 'image/jpeg', size: 10 },
})

const box = (text: string, x: number, y: number): PaddleBox => ({
  text,
  confidence: 0.9,
  box: { x, y, width: 40, height: 20 },
})

/** An invented receipt, as one page's boxes. */
const RECEIPT_BOXES = [
  box('Bica', 10, 10),
  box('0,80', 300, 10),
  box('Tosta mista', 10, 40),
  box('2,50', 300, 40),
  box('TOTAL', 10, 80),
  box('3,30', 300, 80),
]

/**
 * A fake worker: answers each request through `respond`, which may return
 * `undefined` to leave the request hanging (until terminate).
 */
class FakeWorker implements WorkerLike {
  onmessage: ((event: { data: PaddleResponse }) => void) | null = null
  onerror: ((event: unknown) => void) | null = null
  terminated = false
  received: PaddleRequest[] = []
  transferred: Transferable[][] = []
  private readonly respond: (
    request: PaddleRequest,
  ) => PaddleResponse | 'crash' | undefined
  constructor(
    respond: (request: PaddleRequest) => PaddleResponse | 'crash' | undefined,
  ) {
    this.respond = respond
  }
  postMessage(message: PaddleRequest, transfer: Transferable[] = []) {
    this.received.push(message)
    this.transferred.push(transfer)
    const answer = this.respond(message)
    if (answer === undefined) return
    queueMicrotask(() => {
      if (this.terminated) return
      if (answer === 'crash') this.onerror?.(new Event('error'))
      else this.onmessage?.({ data: answer })
    })
  }
  terminate() {
    this.terminated = true
  }
}

const happy = (request: PaddleRequest): PaddleResponse =>
  request.type === 'load'
    ? { type: 'loaded' }
    : { type: 'boxes', id: request.id, boxes: RECEIPT_BOXES }

/** A reader over fake workers, each one recorded. */
function readerWith(
  respond: (request: PaddleRequest) => PaddleResponse | 'crash' | undefined,
) {
  const workers: FakeWorker[] = []
  const reader = createPaddleReader({
    createBackend: () =>
      workerBackend(() => {
        const worker = new FakeWorker(respond)
        workers.push(worker)
        return worker
      }),
  })
  return { reader, workers }
}

describe('createPaddleReader (P6) over a worker', () => {
  it('is the `paddle` reader, and reads a page into a parsed receipt', async () => {
    const { reader, workers } = readerWith(happy)
    expect(reader.id).toBe('paddle')
    const result = await reader.read(source([page()]))
    if (!result.ok) throw new Error(result.error.code)
    expect(result.receipt.items.map((item) => item.name)).toEqual([
      'Bica',
      'Tosta mista',
    ])
    expect(result.receipt.total).toBe(330)
    expect(workers).toHaveLength(1)
    expect(workers[0]?.received.map((request) => request.type)).toEqual([
      'load',
      'read',
    ])
  })

  it('loads the same-origin vendor files', async () => {
    const { reader, workers } = readerWith(happy)
    await reader.read(source([page()]))
    const load = workers[0]?.received[0]
    expect(load).toEqual({
      type: 'load',
      assets: {
        detection: '/vendor/paddle/det.onnx',
        recognition: '/vendor/paddle/rec.onnx',
        dictionary: '/vendor/paddle/dict.txt',
        wasmPaths: '/vendor/ort/',
      },
    })
  })

  it('transfers a copy of each page’s pixels, keeping the page', async () => {
    const { reader, workers } = readerWith(happy)
    const original = page(3, 1)
    await reader.read(source([original]))
    const read = workers[0]?.received[1]
    expect(read).toMatchObject({ type: 'read', width: 3, height: 1 })
    expect(workers[0]?.transferred[1]).toHaveLength(1)
    expect(original.data.length).toBe(12)
  })

  it('reports the phases in order, with progress per page', async () => {
    const { reader } = readerWith(happy)
    const progress: ReadProgress[] = []
    await reader.read(source([page(), page()]), {
      onProgress: (next) => progress.push(next),
    })
    expect(progress).toEqual([
      { phase: 'loadingReader' },
      { phase: 'reading', progress: 0 },
      { phase: 'reading', progress: 0.5 },
      { phase: 'reading', progress: 1 },
    ])
  })

  it('loads the models once, keeping the worker for the next scan', async () => {
    const { reader, workers } = readerWith(happy)
    await reader.read(source([page()]))
    await reader.read(source([page()]))
    expect(workers).toHaveLength(1)
    expect(workers[0]?.received.map((request) => request.type)).toEqual([
      'load',
      'read',
      'read',
    ])
    expect(workers[0]?.terminated).toBe(false)
  })

  it('fails a failed model or runtime load as assetsUnavailable, then starts afresh', async () => {
    let fail = true
    const { reader, workers } = readerWith((request) =>
      request.type === 'load' && fail
        ? { type: 'failed', code: 'assetsUnavailable' }
        : happy(request),
    )
    expect(await reader.read(source([page()]))).toEqual({
      ok: false,
      error: { code: 'assetsUnavailable' },
    })
    expect(workers[0]?.terminated).toBe(true)
    fail = false
    expect((await reader.read(source([page()]))).ok).toBe(true)
    expect(workers).toHaveLength(2)
  })

  it('fails a worker that can’t start as assetsUnavailable', async () => {
    const { reader } = readerWith(() => 'crash')
    expect(await reader.read(source([page()]))).toEqual({
      ok: false,
      error: { code: 'assetsUnavailable' },
    })
  })

  it('fails a failed inference as ocrFailed, and terminates the worker', async () => {
    const { reader, workers } = readerWith((request) =>
      request.type === 'read'
        ? { type: 'failed', code: 'ocrFailed', id: request.id }
        : happy(request),
    )
    expect(await reader.read(source([page()]))).toEqual({
      ok: false,
      error: { code: 'ocrFailed' },
    })
    expect(workers[0]?.terminated).toBe(true)
  })

  it('fails a worker crash while reading as ocrFailed', async () => {
    const { reader } = readerWith((request) =>
      request.type === 'read' ? 'crash' : happy(request),
    )
    expect(await reader.read(source([page()]))).toEqual({
      ok: false,
      error: { code: 'ocrFailed' },
    })
  })

  describe('cancelling', () => {
    it('before the read starts no worker', async () => {
      const { reader, workers } = readerWith(happy)
      const controller = new AbortController()
      controller.abort()
      expect(
        await reader.read(source([page()]), { signal: controller.signal }),
      ).toEqual({ ok: false, error: { code: 'cancelled' } })
      expect(workers).toHaveLength(0)
    })

    it('while the models load terminates the worker; the next read starts a new one', async () => {
      const { reader, workers } = readerWith((request) =>
        request.type === 'load' ? undefined : happy(request),
      )
      const controller = new AbortController()
      const reading = reader.read(source([page()]), {
        signal: controller.signal,
      })
      await vi.waitFor(() => expect(workers).toHaveLength(1))
      controller.abort()
      expect(await reading).toEqual({
        ok: false,
        error: { code: 'cancelled' },
      })
      expect(workers[0]?.terminated).toBe(true)
      void reader.read(source([page()]))
      await vi.waitFor(() => expect(workers).toHaveLength(2))
    })

    it('during a page terminates the worker', async () => {
      const { reader, workers } = readerWith((request) =>
        request.type === 'read' ? undefined : happy(request),
      )
      const controller = new AbortController()
      const reading = reader.read(source([page()]), {
        signal: controller.signal,
      })
      await vi.waitFor(() =>
        expect(workers[0]?.received.at(-1)?.type).toBe('read'),
      )
      controller.abort()
      expect(await reading).toEqual({
        ok: false,
        error: { code: 'cancelled' },
      })
      expect(workers[0]?.terminated).toBe(true)
    })

    it('after the read changes nothing', async () => {
      const { reader, workers } = readerWith(happy)
      const controller = new AbortController()
      const result = await reader.read(source([page()]), {
        signal: controller.signal,
      })
      controller.abort()
      expect(result.ok).toBe(true)
      expect(workers[0]?.terminated).toBe(false)
    })
  })

  it('parses a PDF text layer with no OCR (D6)', async () => {
    const { reader, workers } = readerWith(happy)
    const result = await reader.read({
      ...source([]),
      textLayer: [
        { text: 'Bica 0,80', confidence: 100 },
        { text: 'TOTAL 0,80', confidence: 100 },
      ],
    })
    if (!result.ok) throw new Error(result.error.code)
    expect(result.receipt.total).toBe(80)
    expect(workers).toHaveLength(0)
  })

  it('fails a source with no pages as decodeFailed', async () => {
    const { reader } = readerWith(happy)
    expect(await reader.read(source([]))).toEqual({
      ok: false,
      error: { code: 'decodeFailed' },
    })
  })
})
