// @vitest-environment node
/**
 * The sample receipt corpus (M2 plan, CP3; REQ-8), read offline with the
 * real Tesseract.js, the real zxing-wasm and the real pdf.js, then turned
 * into a bill and checked (D12–D14). `fetch` fails on any http(s) URL, so
 * a library falling back to its CDN fails the test instead of passing.
 */
import { copyFile, mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { cents } from '../../lib/money.ts'
import { createBill } from '../split/billReducer.ts'
import { createBuiltInReader } from './builtInReader.ts'
import type { DecodeResult } from './decode.ts'
import { decodePngNode, encodePageNode } from './encodePage.node.ts'
import type { ExpectedReceipt } from './fixtures/textFixtures.ts'
import { importReceipt, type ImportDeps } from './importReceipt.ts'
import { checkFile, readDimensions } from './intake.ts'
import { fragmentsToLines, hasTextLayer, toFragments } from './pdfTextLines.ts'
import { scanFiscalQr, type ReadBarcodes } from './qrScanner.ts'
import { checkReceipt } from './reconcile.ts'

interface Sample {
  name: string
  file: string
  expected: ExpectedReceipt & {
    qr?: string
    check: 'match' | 'matchOrFlagged' | 'flagged' | 'noItems'
  }
}

const NODE_MODULES = path.resolve('node_modules')
const CORPUS = path.resolve('src/features/receipt/fixtures/receipts')

async function loadSamples(): Promise<Sample[]> {
  const names = (await readdir(CORPUS))
    .filter((name) => name.endsWith('.expected.json'))
    .map((name) => name.replace(/\.expected\.json$/, ''))
    .sort()
  const files = await readdir(CORPUS)
  return Promise.all(
    names.map(async (name) => {
      const file = files.find(
        (candidate) =>
          candidate === `${name}.png` || candidate === `${name}.pdf`,
      )
      if (file === undefined) {
        throw new Error(`Sample ${name} has no .png or .pdf`)
      }
      const expected = JSON.parse(
        await readFile(path.join(CORPUS, `${name}.expected.json`), 'utf8'),
      ) as Sample['expected']
      return { name, file, expected }
    }),
  )
}

const samples = await loadSamples()

let langDir = ''
let readBarcodes: ReadBarcodes
const blocked: string[] = []

beforeAll(async () => {
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
  langDir = await mkdtemp(path.join(tmpdir(), 'settle-lang-'))
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
  readBarcodes = (image, options) => zxing.readBarcodes(image, options)
})

afterAll(async () => {
  vi.unstubAllGlobals()
  await rm(langDir, { recursive: true, force: true })
})

/**
 * pdf.js's legacy build, which runs in Node, with local fonts only. (pdf.js
 * 6 has no `isEvalSupported` option any more: it never evaluates code.)
 */
async function openPdf(data: Uint8Array) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  return pdfjs.getDocument({
    data,
    standardFontDataUrl: pathToFileURL(
      path.join(NODE_MODULES, 'pdfjs-dist/standard_fonts/'),
    ).href,
  })
}

/** Node's decoding: a PNG to its pixels, a PDF to its text layer (D6). */
async function decodeNode(file: File): Promise<DecodeResult> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const meta = { name: file.name, type: file.type, size: file.size }
  if (!file.name.endsWith('.pdf')) {
    return { ok: true, source: { pages: [decodePngNode(bytes)], file: meta } }
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

function deps(): ImportDeps {
  return {
    decode: decodeNode,
    reader: createBuiltInReader({
      // `cacheMethod: 'none'`: no model files written to the working tree.
      assets: { langPath: langDir, cacheMethod: 'none', gzip: true },
      encodePage: encodePageNode,
    }),
    scanQr: (pages) => scanFiscalQr(pages, { readBarcodes }),
  }
}

function amount(decimal: string | undefined) {
  return decimal === undefined
    ? undefined
    : cents(Math.round(Number(decimal) * 100))
}

describe('the browser-check files (M-I-4)', () => {
  // CP4 scans these in a real browser; here they only pass intake.
  const BROWSER = path.resolve('src/features/receipt/fixtures/browser')
  it.each([
    ['sample-1.jpg', 'jpeg', { width: 598, height: 1064 }],
    ['sample-3.heic', 'heic', { width: 598, height: 1224 }],
    ['sample-6-scanned.pdf', 'pdf', undefined],
    ['sample-9.pdf', 'pdf', undefined],
  ] as const)('%s is a %s file of the right size', async (name, type, size) => {
    const bytes = await readFile(path.join(BROWSER, name))
    const checked = await checkFile(new File([bytes], name))
    if (!checked.ok) throw new Error(checked.error.code)
    expect(checked.type).toBe(type)
    expect(readDimensions(checked.header, checked.type)).toEqual(size)
    const expected = await readFile(
      path.join(BROWSER, name.replace(/\.[a-z]+$/, '.expected.json')),
      'utf8',
    )
    expect((JSON.parse(expected) as { total: string }).total).toMatch(
      /^\d+\.\d{2}$/,
    )
  })
})

describe('the real pdf.js', () => {
  it('has the shape decode.ts relies on (the task is destroyed, not the document)', async () => {
    const task = await openPdf(
      new Uint8Array(await readFile(path.join(CORPUS, '09-pt-efatura.pdf'))),
    )
    const pdf = await task.promise
    expect(typeof task.destroy).toBe('function')
    expect(pdf.numPages).toBe(1)
    const page = await pdf.getPage(1)
    for (const method of [
      'getViewport',
      'render',
      'getTextContent',
      'cleanup',
    ]) {
      expect(typeof (page as unknown as Record<string, unknown>)[method]).toBe(
        'function',
      )
    }
    await task.destroy()
  })
})

describe('the sample receipt corpus (real OCR, offline)', () => {
  it.each(samples)(
    '$name',
    async ({ file, expected }) => {
      const bytes = await readFile(path.join(CORPUS, file))
      const type = file.endsWith('.pdf') ? 'application/pdf' : 'image/png'
      let n = 0
      const currentBill = createBill(['p1', 'p2', 'old-item'])
      const result = await importReceipt(
        new File([bytes], file, { type }),
        deps(),
        { currentBill, nextId: () => `item-${++n}` },
      )

      if (expected.check === 'noItems') {
        expect(result).toEqual({ ok: false, error: { code: 'noItems' } })
        return
      }
      if (!result.ok) {
        throw new Error(`Import failed: ${result.error.code}`)
      }
      const check = checkReceipt(result.bill, result.summary)
      const matches =
        check.status === 'match' &&
        result.bill.items.length === expected.items.length &&
        result.summary.total === amount(expected.total)
      const flagged =
        check.status === 'mismatch' || result.summary.flaggedItemIds.length > 0
      const report = {
        check,
        items: result.bill.items.map((item) => [item.name, item.unitPrice]),
        summary: result.summary,
      }

      if (expected.check === 'match') {
        expect(matches, JSON.stringify(report)).toBe(true)
        // A rendered page with a fiscal QR code gives the trusted total.
        if (expected.qr !== undefined && !file.endsWith('.pdf')) {
          expect(result.summary.totalSource).toBe('qr')
        }
      } else if (expected.check === 'matchOrFlagged') {
        expect(matches || flagged, JSON.stringify(report)).toBe(true)
      } else {
        expect(flagged, JSON.stringify(report)).toBe(true)
      }
      expect(blocked).toEqual([])
    },
    60_000,
  )
})
