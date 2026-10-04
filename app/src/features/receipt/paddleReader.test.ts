import { describe, expect, it, vi } from 'vitest'
import type {
  PhotoQuality,
  ReadProgress,
  ReceiptPage,
  ReceiptSource,
} from './model.ts'
import type { PaddleBox } from './paddleLines.ts'
import {
  createPaddleReader,
  workerBackend,
  type PaddleRequest,
  type PaddleResponse,
  type WorkerLike,
} from './paddleReader.ts'
import type { ReaderSupport } from './readerSupport.ts'

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

/** An invented check result: small text. */
const SMALL_TEXT: PhotoQuality = {
  issues: ['smallText'],
  measures: { boxes: 6, textHeight: 8 },
}

const happy = (request: PaddleRequest): PaddleResponse =>
  request.type === 'load'
    ? { type: 'loaded' }
    : request.type === 'check'
      ? { type: 'quality', id: request.id, quality: SMALL_TEXT }
      : { type: 'boxes', id: request.id, boxes: RECEIPT_BOXES }

/** A reader over fake workers, each one recorded. */
function readerWith(
  respond: (request: PaddleRequest) => PaddleResponse | 'crash' | undefined,
  support: () => ReaderSupport = () => 'ok',
) {
  const workers: FakeWorker[] = []
  const reader = createPaddleReader({
    support,
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

  describe('the photo quality check (M2.5 plan, P11)', () => {
    it('checks each page before reading it, and passes the findings on first', async () => {
      const { reader, workers } = readerWith(happy)
      const events: string[] = []
      const result = await reader.read(source([page(), page()]), {
        onQuality: (quality) => {
          events.push(
            `quality ${quality.issues.join()} after ${workers[0]?.received.at(-1)?.type}`,
          )
        },
        onProgress: (progress) => {
          if (progress.phase === 'reading') events.push(`reading`)
        },
      })
      expect(result.ok).toBe(true)
      expect(workers[0]?.received.map((request) => request.type)).toEqual([
        'load',
        'check',
        'read',
        'check',
        'read',
      ])
      // Each page's findings arrive before its read is even sent.
      expect(events).toEqual([
        'reading',
        'quality smallText after check',
        'reading',
        'quality smallText after check',
        'reading',
      ])
    })

    it('doesn’t change the reading, and runs no check without a listener', async () => {
      const without = readerWith(happy)
      const plain = await without.reader.read(source([page()]))
      expect(without.workers[0]?.received.map((r) => r.type)).toEqual([
        'load',
        'read',
      ])
      const checked = await readerWith(happy).reader.read(source([page()]), {
        onQuality: () => undefined,
      })
      expect(checked).toEqual(plain)
    })

    it('skips a check that failed and reads on', async () => {
      const { reader } = readerWith((request) =>
        request.type === 'check'
          ? { type: 'quality', id: request.id, quality: null }
          : happy(request),
      )
      const onQuality = vi.fn()
      const result = await reader.read(source([page()]), { onQuality })
      expect(result.ok).toBe(true)
      expect(onQuality).not.toHaveBeenCalled()
    })

    it('fails a worker crash during the check as ocrFailed', async () => {
      const { reader, workers } = readerWith((request) =>
        request.type === 'check' ? 'crash' : happy(request),
      )
      expect(
        await reader.read(source([page()]), { onQuality: () => undefined }),
      ).toEqual({ ok: false, error: { code: 'ocrFailed' } })
      expect(workers[0]?.terminated).toBe(true)
    })

    it('cancelling during the check terminates the worker', async () => {
      const { reader, workers } = readerWith((request) =>
        request.type === 'check' ? undefined : happy(request),
      )
      const controller = new AbortController()
      const reading = reader.read(source([page()]), {
        signal: controller.signal,
        onQuality: () => undefined,
      })
      await vi.waitFor(() =>
        expect(workers[0]?.received.at(-1)?.type).toBe('check'),
      )
      controller.abort()
      expect(await reading).toEqual({
        ok: false,
        error: { code: 'cancelled' },
      })
      expect(workers[0]?.terminated).toBe(true)
    })

    it('doesn’t check a PDF read from its text layer', async () => {
      const { reader, workers } = readerWith(happy)
      const onQuality = vi.fn()
      await reader.read(
        {
          ...source([page()]),
          textLayer: [{ text: 'TOTAL 0,80', confidence: 100 }],
        },
        { onQuality },
      )
      expect(onQuality).not.toHaveBeenCalled()
      expect(workers).toHaveLength(0)
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

  describe('in a browser that can’t run the reader (M2.5 plan, P16)', () => {
    it.each(['noWebAssembly', 'noSimd'] as const)(
      'answers readerUnsupported for an image with %s, starting no worker',
      async (support) => {
        const { reader, workers } = readerWith(happy, () => support)
        const progress: ReadProgress[] = []
        expect(
          await reader.read(source([page()]), {
            onProgress: (next) => progress.push(next),
          }),
        ).toEqual({ ok: false, error: { code: 'readerUnsupported' } })
        expect(workers).toHaveLength(0)
        expect(progress).toEqual([])
      },
    )

    it('still parses a PDF text layer', async () => {
      const support = vi.fn<() => ReaderSupport>(() => 'noWebAssembly')
      const { reader, workers } = readerWith(happy, support)
      const result = await reader.read({
        ...source([page()]),
        textLayer: [
          { text: 'Bica 0,80', confidence: 100 },
          { text: 'TOTAL 0,80', confidence: 100 },
        ],
      })
      if (!result.ok) throw new Error(result.error.code)
      expect(result.receipt.items.map((item) => item.name)).toEqual(['Bica'])
      expect(workers).toHaveLength(0)
      expect(support).not.toHaveBeenCalled()
    })

    it('reads as before when the check answers ok', async () => {
      const support = vi.fn<() => ReaderSupport>(() => 'ok')
      const { reader, workers } = readerWith(happy, support)
      expect((await reader.read(source([page()]))).ok).toBe(true)
      expect(workers).toHaveLength(1)
      expect(support).toHaveBeenCalled()
    })
  })

  it('fails a source with no pages as decodeFailed', async () => {
    const { reader } = readerWith(happy)
    expect(await reader.read(source([]))).toEqual({
      ok: false,
      error: { code: 'decodeFailed' },
    })
  })
})
