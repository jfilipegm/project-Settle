import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ASSETS } from './assets.ts'
import {
  decodeReceipt,
  pdfRenderSize,
  type DecodeDeps,
  type HeicToModule,
  type PdfjsModule,
} from './decode.ts'
import { MAX_PIXELS } from './intake.ts'

const JPEG_SOI = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]

function pngHeader(width: number, height: number): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(33)
  out.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13])
  out.set(new TextEncoder().encode('IHDR'), 12)
  new DataView(out.buffer).setUint32(16, width)
  new DataView(out.buffer).setUint32(20, height)
  return out
}

function fakeBitmap(width: number, height: number, close = vi.fn()) {
  return { width, height, close } as unknown as ImageBitmap
}

function deps(overrides: Partial<DecodeDeps> = {}): DecodeDeps {
  return {
    loadPdfjs: () => Promise.reject(new Error('not in this test')),
    loadHeicTo: () => Promise.reject(new Error('not in this test')),
    createImageBitmap: () => Promise.reject(new Error('not in this test')),
    ...overrides,
  }
}

// jsdom has no canvas: a 2D context that returns blank pixels.
beforeEach(() => {
  const context = {
    drawImage: vi.fn(),
    getImageData: (_x: number, _y: number, w: number, h: number) => ({
      data: new Uint8ClampedArray(w * h * 4),
    }),
  } as unknown as CanvasRenderingContext2D
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('pdfRenderSize', () => {
  it('renders an A4 page at 2×', () => {
    expect(pdfRenderSize(595.28, 841.89)).toEqual({
      scale: 2,
      width: 1190,
      height: 1683,
    })
  })

  it('keeps a 5 m × 5 m MediaBox under 40 MP', () => {
    const side = (5000 / 25.4) * 72 // 5 m in points
    const size = pdfRenderSize(side, side)
    expect(size.scale).toBeLessThan(2)
    expect(size.width * size.height).toBeLessThanOrEqual(MAX_PIXELS)
    expect(size.width * size.height).toBeGreaterThan(MAX_PIXELS * 0.99)
  })
})

describe('decodeReceipt', () => {
  it('refuses a 50-MP PNG from its header, without decoding it', async () => {
    const createImageBitmap = vi.fn()
    const result = await decodeReceipt(
      new File([pngHeader(10_000, 5_000)], 'huge.png'),
      { deps: deps({ createImageBitmap }) },
    )
    expect(result).toEqual({ ok: false, error: { code: 'tooManyPixels' } })
    expect(createImageBitmap).not.toHaveBeenCalled()
  })

  it('decodes a truncated header, then checks the size after decoding', async () => {
    const close = vi.fn()
    const createImageBitmap = vi.fn(() =>
      Promise.resolve(fakeBitmap(10_000, 5_000, close)),
    )
    const result = await decodeReceipt(
      new File([new Uint8Array(JPEG_SOI)], 'cut.jpg'),
      { deps: deps({ createImageBitmap }) },
    )
    expect(createImageBitmap).toHaveBeenCalledOnce()
    expect(result).toEqual({ ok: false, error: { code: 'tooManyPixels' } })
    expect(close).toHaveBeenCalled()
  })

  it('decodes a raster image with its EXIF orientation applied', async () => {
    const createImageBitmap = vi.fn(() => Promise.resolve(fakeBitmap(30, 20)))
    const file = new File([pngHeader(30, 20)], 'r.png', { type: 'image/png' })
    const result = await decodeReceipt(file, {
      deps: deps({ createImageBitmap }),
    })
    expect(createImageBitmap).toHaveBeenCalledWith(file, {
      imageOrientation: 'from-image',
    })
    expect(result).toEqual({
      ok: true,
      source: {
        pages: [
          { width: 30, height: 20, data: new Uint8ClampedArray(30 * 20 * 4) },
        ],
        file: { name: 'r.png', type: 'image/png', size: file.size },
      },
    })
  })

  it('reports a raster that won’t decode', async () => {
    const result = await decodeReceipt(new File([pngHeader(30, 20)], 'r.png'), {
      deps: deps(),
    })
    expect(result).toEqual({ ok: false, error: { code: 'decodeFailed' } })
  })

  const heicHeader = (): Uint8Array<ArrayBuffer> => {
    const out = new Uint8Array(24)
    out.set([0, 0, 0, 24])
    out.set(new TextEncoder().encode('ftypheic\0\0\0\0mif1heic'), 4)
    return out
  }

  it('falls back to heic-to when the browser can’t decode HEIC', async () => {
    const heicTo = vi.fn(() => Promise.resolve(fakeBitmap(40, 30)))
    const loadHeicTo = vi.fn(() => Promise.resolve({ heicTo } as HeicToModule))
    const file = new File([heicHeader()], 'IMG_0001.HEIC')
    const result = await decodeReceipt(file, { deps: deps({ loadHeicTo }) })
    expect(loadHeicTo).toHaveBeenCalledOnce()
    expect(heicTo).toHaveBeenCalledWith({
      blob: file,
      type: 'bitmap',
      options: { imageOrientation: 'from-image' },
    })
    expect(result).toMatchObject({
      ok: true,
      source: { pages: [{ width: 40, height: 30 }] },
    })
  })

  it('uses the browser’s own HEIC decoder when it has one', async () => {
    const loadHeicTo = vi.fn()
    const createImageBitmap = vi.fn(() => Promise.resolve(fakeBitmap(40, 30)))
    const result = await decodeReceipt(new File([heicHeader()], 'a.heic'), {
      deps: deps({ createImageBitmap, loadHeicTo }),
    })
    expect(result.ok).toBe(true)
    expect(loadHeicTo).not.toHaveBeenCalled()
  })

  it('reports assetsUnavailable when heic-to can’t load', async () => {
    const result = await decodeReceipt(new File([heicHeader()], 'a.heic'), {
      deps: deps(),
    })
    expect(result).toEqual({ ok: false, error: { code: 'assetsUnavailable' } })
  })

  function fakePdfjs(
    pages: { text: string[]; width?: number; height?: number }[],
  ) {
    const captured: {
      params?: unknown
      workerSrc?: string
      destroyed?: boolean
    } = {}
    const module: PdfjsModule = {
      GlobalWorkerOptions: {
        set workerSrc(value: string) {
          captured.workerSrc = value
        },
        get workerSrc() {
          return captured.workerSrc ?? ''
        },
      },
      getDocument(params) {
        captured.params = params
        return {
          // pdf.js 6: the loading task, not the document, is destroyed.
          destroy: () => {
            captured.destroyed = true
            return Promise.resolve()
          },
          promise: Promise.resolve({
            numPages: pages.length,
            getPage: (n: number) => {
              const page = pages[n - 1] ?? { text: [] }
              return Promise.resolve({
                getViewport: ({ scale }: { scale: number }) => ({
                  width: (page.width ?? 300) * scale,
                  height: (page.height ?? 400) * scale,
                }),
                render: () => ({ promise: Promise.resolve() }),
                getTextContent: () =>
                  Promise.resolve({
                    items: page.text.map((str, i) => ({
                      str,
                      transform: [10, 0, 0, 10, 20, 700 - i * 20],
                      height: 10,
                    })),
                  }),
                cleanup: () => undefined,
              })
            },
          }),
        }
      },
    }
    return { module, captured }
  }

  const pdfFile = () => new File(['%PDF-1.7\n'], 'fatura.pdf')

  it('hands pdf.js only same-origin URLs, with eval off (I-5)', async () => {
    const { module, captured } = fakePdfjs([{ text: ['TOTAL 23,40'] }])
    await decodeReceipt(pdfFile(), {
      deps: deps({ loadPdfjs: () => Promise.resolve(module) }),
    })
    expect(captured.workerSrc).toBe(ASSETS.pdfWorker)
    expect(captured.params).toMatchObject({
      isEvalSupported: false,
      wasmUrl: ASSETS.pdfWasm,
      standardFontDataUrl: ASSETS.pdfStandardFonts,
    })
    for (const url of [
      captured.workerSrc,
      (captured.params as { wasmUrl: string }).wasmUrl,
      (captured.params as { standardFontDataUrl: string }).standardFontDataUrl,
    ]) {
      expect(url).toMatch(/^\/vendor\//)
    }
  })

  it('reads a PDF’s text layer and renders at most 3 pages at 2×', async () => {
    const long = 'Restaurante O Cantinho, Lisboa'
    const { module, captured } = fakePdfjs([
      { text: [long, 'TOTAL 23,40'] },
      { text: [long] },
      { text: [long] },
      { text: [long, 'Obrigado'] },
    ])
    const result = await decodeReceipt(pdfFile(), {
      deps: deps({ loadPdfjs: () => Promise.resolve(module) }),
    })
    if (!result.ok) throw new Error(result.error.code)
    expect(captured.destroyed).toBe(true)
    expect(result.source.pages).toHaveLength(3)
    expect(result.source.pages[0]).toMatchObject({ width: 600, height: 800 })
    expect(result.source.textLayer?.map((line) => line.text)).toEqual([
      long,
      'TOTAL 23,40',
      long,
      long,
      long,
      'Obrigado',
    ])
  })

  it('reads a PDF without a text layer by its pages only', async () => {
    const { module } = fakePdfjs([{ text: ['12,50'] }])
    const result = await decodeReceipt(pdfFile(), {
      deps: deps({ loadPdfjs: () => Promise.resolve(module) }),
    })
    expect(result).toMatchObject({ ok: true })
    expect(result.ok && result.source.textLayer).toBeUndefined()
  })

  it('reports a PDF pdf.js can’t open, and pdf.js failing to load', async () => {
    const broken: PdfjsModule = {
      GlobalWorkerOptions: { workerSrc: '' },
      getDocument: () => ({
        promise: Promise.reject(new Error('Invalid PDF')),
        destroy: () => Promise.resolve(),
      }),
    }
    expect(
      await decodeReceipt(pdfFile(), {
        deps: deps({ loadPdfjs: () => Promise.resolve(broken) }),
      }),
    ).toEqual({ ok: false, error: { code: 'decodeFailed' } })
    expect(await decodeReceipt(pdfFile(), { deps: deps() })).toEqual({
      ok: false,
      error: { code: 'assetsUnavailable' },
    })
  })

  it('stops when cancelled', async () => {
    const controller = new AbortController()
    controller.abort()
    const result = await decodeReceipt(new File([pngHeader(30, 20)], 'r.png'), {
      signal: controller.signal,
      deps: deps({
        createImageBitmap: () => Promise.resolve(fakeBitmap(30, 20)),
      }),
    })
    expect(result).toEqual({ ok: false, error: { code: 'cancelled' } })
  })
})
