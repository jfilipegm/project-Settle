/**
 * Test support: the import pipeline's dependencies in Node, offline, for
 * the tests that read receipts with the real reader, zxing-wasm and pdf.js
 * (the corpus, M2 CP3; the local real receipts, R17). `fetch` fails on any
 * http(s) URL, so a library falling back to its CDN fails the test instead
 * of passing.
 *
 * The reader is Tesseract.js (the app's default until M2.5's CP4) or
 * PaddleOCR (M2.5 plan, P6): the same engine the browser's worker wraps,
 * run in-process, with ONNX Runtime Web's Node entry, the models read from
 * `public/vendor/paddle/` (`scripts/vendor-paddle.mjs`, run as `pretest`),
 * and `@napi-rs/canvas` standing in for the browser's canvas.
 */
import { copyFile, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { expect, vi } from 'vitest'
import { createBuiltInReader } from './builtInReader.ts'
import type { DecodeResult } from './decode.ts'
import { decodeImageNode } from './decodeImage.node.ts'
import { encodePageNode } from './encodePage.node.ts'
import type { ImportDeps } from './importReceipt.ts'
import { fragmentsToLines, hasTextLayer, toFragments } from './pdfTextLines.ts'
import type { ReceiptReader } from './model.ts'
import {
  createPaddleEngine,
  type PaddleEngine,
  type ReadingOptions,
} from './paddleEngine.ts'
import {
  createPaddleReader,
  PaddleFailure,
  type PaddleBackend,
} from './paddleReader.ts'
import { scanFiscalQr, type ReadBarcodes } from './qrScanner.ts'

export const NODE_MODULES = path.resolve('node_modules')

/** Where `vendor-paddle.mjs` puts the models. */
export const PADDLE_MODELS_DIR = path.resolve('public/vendor/paddle')

export type NodeReader = 'tesseract' | 'paddle'

/** The reader the local measurements use: `SETTLE_READER`, else PaddleOCR. */
export function readerFromEnv(): NodeReader {
  return process.env.SETTLE_READER === 'tesseract' ? 'tesseract' : 'paddle'
}

async function bytesOf(file: string): Promise<ArrayBuffer> {
  const bytes = await readFile(file)
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  )
}

/** The browser's canvas, in Node: `@napi-rs/canvas`, for ppu-ocv. */
async function useNodeCanvas(): Promise<void> {
  const napi = await import('@napi-rs/canvas')
  const { setPlatform } = await import('ppu-ocv/canvas-web')
  setPlatform({
    createCanvas: (width: number, height: number) =>
      napi.createCanvas(width, height),
    loadImage: (source: ArrayBuffer | string) =>
      napi.loadImage(typeof source === 'string' ? source : Buffer.from(source)),
    isCanvas: (value: unknown) => value instanceof napi.Canvas,
  } as unknown as Parameters<typeof setPlatform>[0])
}

/** P6's engine, in-process, as the reader's backend. */
export function inProcessPaddleBackend(): PaddleBackend {
  let engine: PaddleEngine | undefined
  return {
    async load() {
      try {
        engine = await createPaddleEngine({
          models: {
            detection: await bytesOf(path.join(PADDLE_MODELS_DIR, 'det.onnx')),
            recognition: await bytesOf(
              path.join(PADDLE_MODELS_DIR, 'rec.onnx'),
            ),
            dictionary: await bytesOf(path.join(PADDLE_MODELS_DIR, 'dict.txt')),
          },
          setUp: useNodeCanvas,
          // CP3's experiments: reading options to try, as JSON.
          overrides: JSON.parse(
            process.env.SETTLE_PADDLE_OPTIONS ?? '{}',
          ) as ReadingOptions,
        })
      } catch (error) {
        throw new PaddleFailure('assetsUnavailable', String(error))
      }
    },
    async read(page) {
      if (engine === undefined) throw new PaddleFailure('ocrFailed')
      try {
        return await engine.read(page)
      } catch (error) {
        throw new PaddleFailure('ocrFailed', String(error))
      }
    },
    terminate() {
      void engine?.dispose().catch(() => undefined)
      engine = undefined
    },
  }
}

export interface NodeImport {
  deps: () => ImportDeps
  /** Every network request a library tried, and was refused. */
  blocked: string[]
  dispose: () => Promise<void>
}

/**
 * pdf.js's legacy build, which runs in Node, with local fonts only. (pdf.js
 * 6 has no `isEvalSupported` option any more: it never evaluates code.)
 */
export async function openPdf(data: Uint8Array) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  return pdfjs.getDocument({
    data,
    standardFontDataUrl: pathToFileURL(
      path.join(NODE_MODULES, 'pdfjs-dist/standard_fonts/'),
    ).href,
  })
}

/**
 * Node's decoding: a JPEG (upright, by its EXIF orientation) or PNG to its
 * pixels, a PDF to its text layer (D6).
 */
async function decodeNode(file: File): Promise<DecodeResult> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const meta = { name: file.name, type: file.type, size: file.size }
  if (!file.name.endsWith('.pdf')) {
    return {
      ok: true,
      source: { pages: [decodeImageNode(bytes, file.name)], file: meta },
    }
  }
  const task = await openPdf(bytes)
  const pdf = await task.promise
  try {
    const text = []
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number)
      text.push(
        fragmentsToLines(toFragments((await page.getTextContent()).items)),
      )
    }
    // Node has no canvas, so the pages aren't rendered: no QR scan here.
    if (!text.every(hasTextLayer)) {
      return { ok: false, error: { code: 'decodeFailed' } }
    }
    return {
      ok: true,
      source: { pages: [], textLayer: text.flat(), file: meta },
    }
  } finally {
    await task.destroy()
  }
}

/** Sets up the offline dependencies; call from `beforeAll`. */
export async function setUpNodeImport(
  readerName: NodeReader = 'tesseract',
): Promise<NodeImport> {
  const blocked: string[] = []
  // Only local files: a CDN request fails the test. This covers zxing-wasm
  // and pdf.js, which run on this thread. Node's Tesseract.js runs in a
  // worker thread this stub doesn't reach; its only download is the
  // language models, from `langPath`, which is a local directory here, so
  // it reads them from disk (and its core comes from node_modules).
  vi.stubGlobal('fetch', async (input: string | URL | Request) => {
    const url =
      input instanceof Request ? input.url : new URL(String(input)).href
    if (url.startsWith('file:')) {
      return new Response(await readFile(fileURLToPath(url)), {
        headers: { 'content-type': 'application/wasm' },
      })
    }
    blocked.push(url)
    throw new Error(`Network request blocked in the corpus test: ${url}`)
  })

  // One directory with both models, as `vendor/tesseract/lang` has them.
  const langDir = await mkdtemp(path.join(tmpdir(), 'settle-lang-'))
  for (const lang of ['por', 'eng']) {
    await copyFile(
      path.join(
        NODE_MODULES,
        `@tesseract.js-data/${lang}/4.0.0_best_int/${lang}.traineddata.gz`,
      ),
      path.join(langDir, `${lang}.traineddata.gz`),
    )
  }
  expect(URL.canParse(langDir)).toBe(false) // a path, never a URL

  // zxing's default wasm location is a CDN in every environment (I-4).
  const zxing = await import('zxing-wasm/reader')
  const wasm = pathToFileURL(
    path.join(NODE_MODULES, 'zxing-wasm/dist/reader/zxing_reader.wasm'),
  ).href
  zxing.prepareZXingModule({
    overrides: {
      locateFile: (file: string) => (file.endsWith('.wasm') ? wasm : file),
    },
    fireImmediately: false,
  })
  const readBarcodes: ReadBarcodes = (image, options) =>
    zxing.readBarcodes(image, options)

  // One PaddleOCR reader for the whole run: the models load once.
  let backend: PaddleBackend | undefined
  const paddle =
    readerName === 'paddle'
      ? createPaddleReader({
          createBackend: () => (backend = inProcessPaddleBackend()),
        })
      : undefined
  const reader = (): ReceiptReader =>
    paddle ??
    createBuiltInReader({
      // `cacheMethod: 'none'`: no model files written to the working tree.
      assets: { langPath: langDir, cacheMethod: 'none', gzip: true },
      encodePage: encodePageNode,
    })

  return {
    blocked,
    deps: () => ({
      decode: decodeNode,
      reader: reader(),
      scanQr: (pages) => scanFiscalQr(pages, { readBarcodes }),
    }),
    dispose: async () => {
      backend?.terminate()
      vi.unstubAllGlobals()
      await rm(langDir, { recursive: true, force: true })
    },
  }
}
