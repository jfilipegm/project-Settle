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
import type {
  ReadProgress,
  ReceiptPage,
  ReceiptSource,
  TextLine,
} from './model.ts'
import type { CleanStrip, GrayPage } from './preprocess.ts'

/** The lines each read hands the parser, in order. */
const parsed = vi.hoisted(() => ({ lines: [] as string[][] }))
vi.mock('./parse/parseReceiptText.ts', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('./parse/parseReceiptText.ts')>()
  return {
    ...actual,
    parseReceiptText: (input: readonly TextLine[]) => {
      parsed.lines.push(input.map((line) => line.text))
      return actual.parseReceiptText(input)
    },
  }
})

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

/** A line with its box, `y0`–`y1` in the recognised strip. */
type BoxedLine = [string, number, number]

/** A recognition result whose blocks each hold boxed lines. */
function boxedPage(blocks: BoxedLine[][]): TesseractPage {
  return {
    blocks: blocks.map((lines) => ({
      paragraphs: [
        {
          lines: lines.map(([text, y0, y1]) => ({
            text,
            confidence: 90,
            bbox: { x0: 0, y0, x1: 100, y1 },
          })),
        },
      ],
    })),
  }
}

/** A clean-up that cuts every page into `strips` given strips. */
function stripsOf(
  strips: Omit<CleanStrip, 'image' | 'index' | 'count'>[],
): (page: ReceiptPage) => AsyncIterable<CleanStrip> {
  return async function* (page) {
    for (const [index, strip] of strips.entries()) {
      const image: GrayPage = {
        channels: 1,
        width: page.width,
        height: 1,
        data: new Uint8ClampedArray(page.width),
      }
      await Promise.resolve()
      yield { ...strip, image, index, count: strips.length }
    }
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
  preprocess?: (page: ReceiptPage) => AsyncIterable<CleanStrip>
}

function stub(options: StubOptions = {}) {
  const terminate = vi.fn(() => Promise.resolve())
  const encoded: GrayPage[] = []
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
    preprocess:
      options.preprocess ??
      async function* (p) {
        await Promise.resolve()
        yield {
          image: { channels: 1, width: p.width, height: 99, data: p.data },
          top: 0,
          ownTop: 0,
          ownBottom: 99,
          index: 0,
          count: 1,
        }
      },
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

  it('keeps each line’s vertical extent (R20)', () => {
    expect(linesOf(boxedPage([[['Total 3,50', 40, 70]]]))).toEqual([
      { text: 'Total 3,50', confidence: 90, bbox: { y0: 40, y1: 70 } },
    ])
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
    expect(encoded).toEqual([
      { channels: 1, width: 3, height: 99, data: page(3).data },
    ])
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

  it('reads a page in strips, keeping each line once, in order (R20)', async () => {
    // Strip 0 covers rows 0–1000 and owns 0–900; strip 1 covers 800–1800
    // and owns 900–1800. Each is recognised as two blocks (names, then
    // amounts), as a name column and an amount column can be.
    const { reader } = stub({
      preprocess: stripsOf([
        { top: 0, ownTop: 0, ownBottom: 900 },
        { top: 800, ownTop: 900, ownBottom: 1800 },
      ]),
      pages: [
        boxedPage([
          [
            ['Galão', 100, 130],
            ['Torrada', 880, 910], // centre 895: owned here
            ['Sumo', 960, 1000], // cut by the edge; the next strip owns it
          ],
          [
            ['1,40', 100, 130],
            ['2,10', 880, 910],
          ],
        ]),
        boxedPage([
          [
            ['Torrada', 80, 110], // centre 895: strip 0's
            ['Sumo', 160, 200], // centre 980
            ['Total 5,00', 400, 430],
          ],
          [['1,50', 160, 200]],
        ]),
      ],
    })
    parsed.lines = []
    const result = await reader.read(source([page(3)]))
    if (!result.ok) throw new Error(result.error.code)
    // Strip after strip; within each, Tesseract's own order (each strip's
    // names, then its amounts). No line lost or doubled.
    expect(parsed.lines).toEqual([
      ['Galão', 'Torrada', '1,40', '2,10', 'Sumo', 'Total 5,00', '1,50'],
    ])
  })

  it('joins a one-strip page’s lines exactly as linesOf gives them', async () => {
    parsed.lines = []
    const { reader } = stub({
      preprocess: stripsOf([{ top: 0, ownTop: 0, ownBottom: 1000 }]),
      pages: [
        boxedPage([
          [
            ['Galão 1,40', 10, 40],
            ['Total 1,40', 900, 930],
          ],
        ]),
      ],
    })
    expect(await reader.read(source([page(3)]))).toMatchObject({
      ok: true,
      receipt: { total: 140, items: [{ name: 'Galão' }] },
    })
    expect(parsed.lines).toEqual([['Galão 1,40', 'Total 1,40']])
  })

  it('moves the progress across a page’s strips, never back', async () => {
    const { reader } = stub({
      preprocess: stripsOf([
        { top: 0, ownTop: 0, ownBottom: 10 },
        { top: 5, ownTop: 10, ownBottom: 20 },
        { top: 15, ownTop: 20, ownBottom: 30 },
      ]),
      recognizeLogs: [
        { status: 'recognizing text', progress: 0.5 },
        { status: 'recognizing text', progress: 1 },
      ],
    })
    const progress: number[] = []
    await reader.read(source([page(1)]), {
      onProgress: (p) => {
        if (p.phase === 'reading') progress.push(p.progress ?? 0)
      },
    })
    expect(progress.map((p) => Math.round(p * 6))).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('stops, and terminates the worker, when aborted during the clean-up', async () => {
    const controller = new AbortController()
    const { reader, terminate, recognize } = stub({
      // The real clean-up stops at its next step with the signal's reason.
      preprocess: () => ({
        [Symbol.asyncIterator]: () => ({
          next: async () => {
            await Promise.resolve()
            controller.abort()
            throw controller.signal.reason
          },
        }),
      }),
    })
    const result = await reader.read(source([page(1)]), {
      signal: controller.signal,
    })
    expect(result).toEqual({ ok: false, error: { code: 'cancelled' } })
    expect(recognize).not.toHaveBeenCalled()
    expect(terminate).toHaveBeenCalledOnce()
  })
})
