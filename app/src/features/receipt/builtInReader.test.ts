import { describe, expect, it, vi } from 'vitest'
import {
  LANGUAGES,
  createBuiltInReader,
  linesOf,
  phaseOf,
  type CreateTesseractWorker,
  type TesseractLog,
  type TesseractPage,
  type TesseractWorker,
} from './builtInReader.ts'
import type { ReadProgress, ReceiptPage, ReceiptSource } from './model.ts'

const page = (width: number): ReceiptPage => ({
  width,
  height: 1,
  data: new Uint8ClampedArray(width * 4),
})

const source = (pages: ReceiptPage[]): ReceiptSource => ({
  pages,
  file: { name: 'r.png', type: 'image/png', size: 10 },
})

function tesseractPage(lines: [string, number][]): TesseractPage {
  return {
    blocks: [
      {
        paragraphs: [
          { lines: lines.map(([text, confidence]) => ({ text, confidence })) },
        ],
      },
    ],
  }
}

const RECEIPT_LINES: [string, number][] = [
  ['Pastelaria Aurora\n', 96],
  ['Galão 1,40\n', 91],
  ['Torrada 2,10\n', 40],
  ['Total 3,50\n', 95],
]

interface StubOptions {
  pages?: TesseractPage[]
  /** Logger messages sent while loading, and per recognised page. */
  loadLogs?: TesseractLog[]
  recognizeLogs?: TesseractLog[]
  recognize?: TesseractWorker['recognize']
  createFails?: boolean
}

function stub(options: StubOptions = {}) {
  const terminate = vi.fn(() => Promise.resolve())
  const encoded: ReceiptPage[] = []
  let logger: (log: TesseractLog) => void = () => undefined
  let recognised = 0
  const recognize =
    options.recognize ??
    vi.fn(() => {
      for (const log of options.recognizeLogs ?? []) logger(log)
      const result = options.pages?.[recognised] ?? tesseractPage(RECEIPT_LINES)
      recognised += 1
      return Promise.resolve({ data: result })
    })
  const createWorker = vi.fn<CreateTesseractWorker>((_langs, _oem, opts) => {
    logger = opts.logger
    if (options.createFails) {
      return Promise.reject(new Error('Network error while fetching core'))
    }
    for (const log of options.loadLogs ?? []) logger(log)
    return Promise.resolve({ recognize, terminate })
  })
  const reader = createBuiltInReader({
    assets: { workerPath: '/vendor/tesseract/worker.min.js', langPath: '/l' },
    encodePage: (encodedPage) => {
      encoded.push(encodedPage)
      return Promise.resolve(new Blob(['png']))
    },
    createWorker,
    preprocess: (p) => ({ ...p, height: 99 }),
  })
  return { reader, createWorker, recognize, terminate, encoded }
}

describe('phaseOf and linesOf', () => {
  it('maps Tesseract’s statuses to D17’s phases', () => {
    expect(phaseOf('loading tesseract core')).toBe('loadingReader')
    expect(phaseOf('initializing tesseract')).toBe('loadingReader')
    expect(phaseOf('loading language traineddata')).toBe('loadingReader')
    expect(phaseOf('initializing api')).toBe('loadingReader')
    expect(phaseOf('recognizing text')).toBe('reading')
    expect(phaseOf('something else')).toBeUndefined()
  })

  it('reads the lines in order, trimmed, with their confidence', () => {
    expect(
      linesOf(
        tesseractPage([
          ['  A 1,00 \n', 80],
          ['\n', 10],
        ]),
      ),
    ).toEqual([{ text: 'A 1,00', confidence: 80 }])
    expect(linesOf({ blocks: null })).toEqual([])
  })
})

describe('createBuiltInReader', () => {
  it('reads a page with por + eng, same-origin options and no blob worker', async () => {
    const { reader, createWorker, encoded, terminate } = stub()
    const result = await reader.read(source([page(3)]))
    if (!result.ok) throw new Error(result.error.code)
    expect(result.receipt.items.map((item) => item.name)).toEqual([
      'Galão',
      'Torrada',
    ])
    // The low-confidence line is flagged (parsing rule 9).
    expect(result.receipt.items.map((item) => item.needsCheck)).toEqual([
      false,
      true,
    ])
    expect(createWorker).toHaveBeenCalledWith(
      LANGUAGES,
      1,
      expect.objectContaining({
        workerPath: '/vendor/tesseract/worker.min.js',
        langPath: '/l',
      }),
    )
    // The page is cleaned up (D10) before it's encoded (D2).
    expect(encoded).toEqual([{ ...page(3), height: 99 }])
    expect(terminate).toHaveBeenCalledOnce()
  })

  it('parses a text layer directly, with no worker (D6)', async () => {
    const { reader, createWorker } = stub()
    const result = await reader.read({
      ...source([page(3)]),
      textLayer: [
        { text: 'Galão 1,40', confidence: 100 },
        { text: 'Total 1,40', confidence: 100 },
      ],
    })
    expect(result).toMatchObject({ ok: true, receipt: { total: 140 } })
    expect(createWorker).not.toHaveBeenCalled()
  })

  it('maps progress across pages and joins them in order', async () => {
    const { reader } = stub({
      loadLogs: [
        { status: 'loading tesseract core', progress: 0 },
        { status: 'loading language traineddata', progress: 0.5 },
      ],
      recognizeLogs: [
        { status: 'recognizing text', progress: 0.5 },
        { status: 'recognizing text', progress: 1 },
      ],
      pages: [
        tesseractPage([['Galão 1,40', 90]]),
        tesseractPage([['Total 1,40', 90]]),
      ],
    })
    const progress: ReadProgress[] = []
    const result = await reader.read(source([page(1), page(2)]), {
      onProgress: (p) => progress.push(p),
    })
    expect(result).toMatchObject({ ok: true, receipt: { total: 140 } })
    expect(progress).toEqual([
      { phase: 'loadingReader' },
      { phase: 'loadingReader' },
      { phase: 'loadingReader' },
      { phase: 'reading', progress: 0.25 },
      { phase: 'reading', progress: 0.5 },
      { phase: 'reading', progress: 0.75 },
      { phase: 'reading', progress: 1 },
    ])
  })

  it('terminates the worker when aborted mid-read', async () => {
    const controller = new AbortController()
    const { reader, terminate } = stub({
      // A recognition that never finishes on its own.
      recognize: () => {
        controller.abort()
        return new Promise(() => undefined)
      },
    })
    const result = await reader.read(source([page(1)]), {
      signal: controller.signal,
    })
    expect(result).toEqual({ ok: false, error: { code: 'cancelled' } })
    expect(terminate).toHaveBeenCalledOnce()
  })

  it('terminates a worker that finishes loading after the abort', async () => {
    const controller = new AbortController()
    const terminate = vi.fn(() => Promise.resolve())
    let finishLoading: (worker: TesseractWorker) => void = () => undefined
    const reader = createBuiltInReader({
      assets: {},
      encodePage: () => Promise.resolve(new Blob()),
      createWorker: () =>
        new Promise((resolve) => {
          finishLoading = resolve
        }),
    })
    const pending = reader.read(source([page(1)]), {
      signal: controller.signal,
    })
    controller.abort()
    expect(await pending).toEqual({ ok: false, error: { code: 'cancelled' } })
    expect(terminate).not.toHaveBeenCalled()
    finishLoading({ recognize: vi.fn(), terminate })
    await vi.waitFor(() => expect(terminate).toHaveBeenCalledOnce())
  })

  it('is cancelled without a worker when already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    const { reader, createWorker } = stub()
    expect(
      await reader.read(source([page(1)]), { signal: controller.signal }),
    ).toEqual({ ok: false, error: { code: 'cancelled' } })
    expect(createWorker).not.toHaveBeenCalled()
  })

  it('reports assetsUnavailable when the worker can’t load', async () => {
    const { reader } = stub({ createFails: true })
    expect(await reader.read(source([page(1)]))).toEqual({
      ok: false,
      error: { code: 'assetsUnavailable' },
    })
  })

  it('reports ocrFailed, and terminates, when recognition fails', async () => {
    const { reader, terminate } = stub({
      recognize: () => Promise.reject(new Error('RuntimeError')),
    })
    expect(await reader.read(source([page(1)]))).toEqual({
      ok: false,
      error: { code: 'ocrFailed' },
    })
    expect(terminate).toHaveBeenCalledOnce()
  })
})
