// @vitest-environment node
/**
 * The sample receipt corpus (M2 plan, CP3; REQ-8), read offline with the
 * real Tesseract.js, the real zxing-wasm and the real pdf.js, then turned
 * into a bill and checked (D12–D14). `fetch` fails on any http(s) URL, so
 * a library falling back to its CDN fails the test instead of passing.
 *
 * The corpus is also read with PaddleOCR (M2.5 plan, CP2): its results are
 * printed, not yet enforced (CP4 enforces them, when it becomes the only
 * reader).
 */
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cents } from '../../lib/money.ts'
import type { ExpectedReceipt } from './fixtures/textFixtures.ts'
import { openPdf, setUpNodeImport, type NodeImport } from './importDeps.node.ts'
import { importReceipt } from './importReceipt.ts'
import { checkFile, readDimensions } from './intake.ts'
import { checkReceipt } from './reconcile.ts'
import { createBill } from '../split/billReducer.ts'

interface Sample {
  name: string
  file: string
  expected: ExpectedReceipt & {
    qr?: string
    check: 'match' | 'matchOrFlagged' | 'flagged' | 'noItems'
    /** R24: the lines a cut leaves out on the way to the check. */
    removedLines?: { name: string; amount: number }[]
  }
}

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

let node: NodeImport

beforeAll(async () => {
  node = await setUpNodeImport()
})

afterAll(async () => {
  await node.dispose()
})

const deps = () => node.deps()

function amount(decimal: string | undefined) {
  return decimal === undefined
    ? undefined
    : cents(Math.round(Number(decimal) * 100))
}

/** Whether an import meets the sample's expected check. */
function meetsExpected(
  result: Awaited<ReturnType<typeof importReceipt>>,
  expected: Sample['expected'],
): { meets: boolean; report: unknown } {
  if (expected.check === 'noItems') {
    return {
      meets: !result.ok && result.error.code === 'noItems',
      report: result.ok ? 'imported' : result.error.code,
    }
  }
  if (!result.ok) return { meets: false, report: result.error.code }
  const check = checkReceipt(result.bill, result.summary)
  const matches =
    check.status === 'match' &&
    result.bill.items.length === expected.items.length &&
    result.summary.total === amount(expected.total)
  const flagged =
    check.status === 'mismatch' || result.summary.flaggedItemIds.length > 0
  const meets =
    expected.check === 'match'
      ? matches
      : expected.check === 'matchOrFlagged'
        ? matches || flagged
        : flagged
  return {
    meets,
    report: {
      check: check.status,
      items: result.bill.items.length,
      expectedItems: expected.items.length,
    },
  }
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
      // Whether the match came through a cut (R24): a cut that appears or
      // disappears shows as a change.
      if (expected.removedLines !== undefined) {
        expect(
          result.summary.removedLines ?? [],
          JSON.stringify(report),
        ).toEqual(expected.removedLines)
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
      expect(node.blocked).toEqual([])
    },
    60_000,
  )
})

describe('the sample receipt corpus with PaddleOCR (recorded, CP4 enforces)', () => {
  let paddle: NodeImport
  const results: { sample: string; meets: boolean }[] = []

  beforeAll(async () => {
    paddle = await setUpNodeImport('paddle')
  })

  afterAll(async () => {
    await paddle.dispose()
    console.log(
      JSON.stringify({
        reader: 'paddle',
        corpusMeets: results.filter((entry) => entry.meets).length,
        of: results.length,
      }),
    )
  })

  it.each(samples)(
    '$name',
    async ({ name, file, expected }) => {
      const bytes = await readFile(path.join(CORPUS, file))
      const type = file.endsWith('.pdf') ? 'application/pdf' : 'image/png'
      let n = 0
      const result = await importReceipt(
        new File([bytes], file, { type }),
        paddle.deps(),
        {
          currentBill: createBill(['p1', 'p2', 'old-item']),
          nextId: () => `item-${++n}`,
        },
      )
      const { meets, report } = meetsExpected(result, expected)
      results.push({ sample: name, meets })
      console.log(
        JSON.stringify({ reader: 'paddle', sample: name, meets, report }),
      )
      expect(paddle.blocked).toEqual([])
    },
    120_000,
  )
})
