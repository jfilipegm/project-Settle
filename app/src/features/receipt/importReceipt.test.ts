import { describe, expect, it, vi } from 'vitest'
import { cents } from '../../lib/money.ts'
import { createBill } from '../split/billReducer.ts'
import type { Bill } from '../split/model.ts'
import { parseFiscalQr, type FiscalQr } from './fiscalQr.ts'
import { importReceipt, type ImportDeps } from './importReceipt.ts'
import type {
  ParsedReceipt,
  ReadErrorCode,
  ReadProgress,
  ReadResult,
  ReceiptReader,
  ReceiptSource,
} from './model.ts'

const PAGE = { width: 2, height: 2, data: new Uint8ClampedArray(16) }
const SOURCE: ReceiptSource = {
  pages: [PAGE],
  file: { name: 'r.png', type: 'image/png', size: 10 },
}

const RECEIPT: ParsedReceipt = {
  merchant: 'Restaurante O Cantinho',
  merchantTaxId: '123456789',
  date: '2026-09-27',
  items: [
    {
      name: 'Bitoque',
      quantity: { numerator: 1, denominator: 1 },
      unitPrice: cents(950),
      lineTotal: cents(950),
      needsCheck: false,
    },
    {
      name: 'Imperial',
      quantity: { numerator: 2, denominator: 1 },
      unitPrice: cents(160),
      lineTotal: cents(320),
      needsCheck: true,
    },
  ],
  total: cents(1270),
  warnings: [],
}

function qrOf(text: string): FiscalQr {
  const parsed = parseFiscalQr(text)
  if (!parsed.ok) throw new Error('not a fiscal QR')
  return parsed.qr
}

function reader(read: ReceiptReader['read']): ReceiptReader {
  return { id: 'fake', read }
}

function deps(overrides: Partial<ImportDeps> = {}): ImportDeps {
  return {
    decode: () => Promise.resolve({ ok: true, source: SOURCE }),
    reader: reader(() => Promise.resolve({ ok: true, receipt: RECEIPT })),
    scanQr: () => Promise.resolve(undefined),
    ...overrides,
  }
}

function currentBill(): Bill {
  const bill = createBill(['alice', 'bob', 'old-item'])
  return {
    ...bill,
    people: [
      { id: 'alice', name: 'Alice' },
      { id: 'bob', name: 'Bob' },
    ],
    items: [
      { ...bill.items[0]!, name: 'Typed by hand', unitPrice: cents(500) },
    ],
  }
}

function options(bill: Bill = currentBill()) {
  let n = 0
  return { currentBill: bill, nextId: () => `item-${++n}` }
}

const file = () => new File(['x'], 'r.png', { type: 'image/png' })

describe('importReceipt', () => {
  it('turns a read receipt into a bill and its summary', async () => {
    const bill = currentBill()
    const result = await importReceipt(file(), deps(), options(bill))
    if (!result.ok) throw new Error(result.error.code)
    expect(result.bill.people).toEqual(bill.people)
    expect(result.bill.items.map((item) => item.name)).toEqual([
      'Bitoque',
      'Imperial',
    ])
    expect(result.summary).toMatchObject({
      merchant: 'Restaurante O Cantinho',
      total: 1270,
      totalSource: 'printed',
      flaggedItemIds: ['item-2'],
    })
    expect(result).not.toHaveProperty('imageUrl')
  })

  const decodeErrors: ReadErrorCode[] = [
    'unsupportedType',
    'tooLarge',
    'tooManyPixels',
    'decodeFailed',
    'assetsUnavailable',
    'cancelled',
  ]
  it.each(decodeErrors)(
    'passes the decoder’s %s through, leaving the bill alone',
    async (code) => {
      const bill = currentBill()
      const before = structuredClone(bill)
      const read = vi.fn()
      const result = await importReceipt(
        file(),
        deps({
          decode: () => Promise.resolve({ ok: false, error: { code } }),
          reader: reader(read),
        }),
        options(bill),
      )
      expect(result).toEqual({ ok: false, error: { code } })
      expect(read).not.toHaveBeenCalled()
      expect(bill).toEqual(before)
    },
  )

  const readErrors: ReadErrorCode[] = [
    'ocrFailed',
    'assetsUnavailable',
    'noItems',
    'cancelled',
  ]
  it.each(readErrors)(
    'passes the reader’s %s through, leaving the bill alone',
    async (code) => {
      const bill = currentBill()
      const before = structuredClone(bill)
      const result = await importReceipt(
        file(),
        deps({
          reader: reader(() => Promise.resolve({ ok: false, error: { code } })),
        }),
        options(bill),
      )
      expect(result).toEqual({ ok: false, error: { code } })
      expect(bill).toEqual(before)
    },
  )

  it('gives noItems when no item and no QR total were read (R14)', async () => {
    const result = await importReceipt(
      file(),
      deps({
        reader: reader(() =>
          Promise.resolve({ ok: true, receipt: { items: [], warnings: [] } }),
        ),
      }),
      options(),
    )
    expect(result).toEqual({ ok: false, error: { code: 'noItems' } })
  })

  it('imports the QR total as one flagged item when no item was read (R14)', async () => {
    const result = await importReceipt(
      file(),
      deps({
        reader: reader(() =>
          Promise.resolve({ ok: true, receipt: { items: [], warnings: [] } }),
        ),
        scanQr: () =>
          Promise.resolve(
            qrOf('A:123456789*B:999999990*C:PT*D:FS*F:20260928*I1:PT*O:12.70'),
          ),
      }),
      options(),
    )
    if (!result.ok) throw new Error(result.error.code)
    expect(result.bill.items).toEqual([
      expect.objectContaining({
        name: 'Not read from the receipt',
        quantity: { numerator: 1, denominator: 1 },
        unitPrice: 1270,
        assignees: [
          { personId: 'alice', weight: 1 },
          { personId: 'bob', weight: 1 },
        ],
      }),
    ])
    expect(result.summary.flaggedItemIds).toEqual([result.bill.items[0]?.id])
    expect(result.summary).toMatchObject({ total: 1270, totalSource: 'qr' })
  })

  it('turns a decoder or reader that throws into a typed error', async () => {
    expect(
      await importReceipt(
        file(),
        deps({ decode: () => Promise.reject(new Error('boom')) }),
        options(),
      ),
    ).toEqual({ ok: false, error: { code: 'decodeFailed' } })
    expect(
      await importReceipt(
        file(),
        deps({ reader: reader(() => Promise.reject(new Error('boom'))) }),
        options(),
      ),
    ).toEqual({ ok: false, error: { code: 'ocrFailed' } })
  })

  it('is cancelled when aborted before, or while, reading', async () => {
    const aborted = new AbortController()
    aborted.abort()
    const decode = vi.fn()
    expect(
      await importReceipt(file(), deps({ decode }), {
        ...options(),
        signal: aborted.signal,
      }),
    ).toEqual({ ok: false, error: { code: 'cancelled' } })
    expect(decode).not.toHaveBeenCalled()

    const controller = new AbortController()
    let seen: AbortSignal | undefined
    const result = await importReceipt(
      file(),
      deps({
        reader: reader((_source, { signal } = {}) => {
          seen = signal
          controller.abort()
          // A reader that ignores the abort still ends up cancelled.
          return Promise.resolve({ ok: true, receipt: RECEIPT })
        }),
      }),
      { ...options(), signal: controller.signal },
    )
    expect(result).toEqual({ ok: false, error: { code: 'cancelled' } })
    expect(seen).toBe(controller.signal)
  })

  it.each<[string, ImportDeps['reader'], ReadErrorCode]>([
    [
      'fails',
      reader(() =>
        Promise.resolve({ ok: false, error: { code: 'ocrFailed' } }),
      ),
      'ocrFailed',
    ],
    [
      'throws',
      reader(() => Promise.reject(new Error('worker crashed'))),
      'ocrFailed',
    ],
  ])('stops the QR scan when the reader %s', async (_, failing, code) => {
    let qrSignal: AbortSignal | undefined
    const result = await importReceipt(
      file(),
      deps({
        reader: failing,
        scanQr: (_pages, { signal }) => {
          qrSignal = signal
          return new Promise(() => undefined)
        },
      }),
      options(),
    )
    expect(result).toEqual({ ok: false, error: { code } })
    expect(qrSignal?.aborted).toBe(true)
  })

  it("stops the QR scan when the caller's signal aborts", async () => {
    const controller = new AbortController()
    let qrSignal: AbortSignal | undefined
    const pending = importReceipt(
      file(),
      deps({
        reader: reader(() => new Promise(() => undefined)),
        scanQr: (_pages, { signal }) => {
          qrSignal = signal
          return new Promise(() => undefined)
        },
      }),
      { ...options(), signal: controller.signal },
    )
    await vi.waitFor(() => expect(qrSignal).toBeDefined())
    expect(qrSignal?.aborted).toBe(false)
    controller.abort()
    expect(qrSignal?.aborted).toBe(true)
    void pending
  })

  it('runs the reader and the QR scan side by side', async () => {
    let finishRead: (result: ReadResult) => void = () => undefined
    const scanQr = vi.fn(() => Promise.resolve(undefined))
    const pending = importReceipt(
      file(),
      deps({
        reader: reader(
          () =>
            new Promise((resolve) => {
              finishRead = resolve
            }),
        ),
        scanQr,
      }),
      options(),
    )
    await vi.waitFor(() =>
      expect(scanQr).toHaveBeenCalledWith([PAGE], {
        signal: expect.any(AbortSignal) as AbortSignal,
      }),
    )
    finishRead({ ok: true, receipt: RECEIPT })
    expect((await pending).ok).toBe(true)
  })

  it('combines the QR code and the reader per D12', async () => {
    const qr = qrOf(
      'A:500000000*B:999999990*C:PT*D:FS*F:20260928*N:1.50*O:13.00',
    )
    const result = await importReceipt(
      file(),
      deps({ scanQr: () => Promise.resolve(qr) }),
      options(),
    )
    if (!result.ok) throw new Error(result.error.code)
    // The QR's total, NIF and date win; the printed total disagrees.
    expect(result.summary).toMatchObject({
      merchant: 'Restaurante O Cantinho',
      merchantTaxId: '500000000',
      date: '2026-09-28',
      total: 1300,
      totalSource: 'qr',
      ivaTotal: 150,
      warnings: ['totalMismatchQr'],
    })
  })

  it('carries on without a QR code when the scan fails', async () => {
    const result = await importReceipt(
      file(),
      deps({ scanQr: () => Promise.reject(new Error('no wasm')) }),
      options(),
    )
    expect(result).toMatchObject({
      ok: true,
      summary: { total: 1270, totalSource: 'printed' },
    })
  })

  it('reports the phases in order', async () => {
    const phases: ReadProgress[] = []
    await importReceipt(
      file(),
      deps({
        reader: reader((_source, { onProgress } = {}) => {
          onProgress?.({ phase: 'loadingReader' })
          onProgress?.({ phase: 'reading', progress: 0.5 })
          return Promise.resolve({ ok: true, receipt: RECEIPT })
        }),
      }),
      { ...options(), onProgress: (progress) => phases.push(progress) },
    )
    expect(phases).toEqual([
      { phase: 'opening' },
      { phase: 'loadingReader' },
      { phase: 'reading', progress: 0.5 },
      { phase: 'checkingQr' },
    ])
  })

  it('gives the first page’s preview URL, and none if it fails', async () => {
    const previewUrl = vi.fn(() => Promise.resolve('blob:preview'))
    expect(
      await importReceipt(file(), deps({ previewUrl }), options()),
    ).toMatchObject({ ok: true, imageUrl: 'blob:preview' })
    expect(previewUrl).toHaveBeenCalledWith(PAGE)

    const failing = await importReceipt(
      file(),
      deps({ previewUrl: () => Promise.reject(new Error('no canvas')) }),
      options(),
    )
    expect(failing.ok).toBe(true)
    expect(failing).not.toHaveProperty('imageUrl')
  })

  it('passes the region’s currency on (D18)', async () => {
    const result = await importReceipt(
      file(),
      deps({
        reader: reader(() =>
          Promise.resolve({
            ok: true,
            receipt: { ...RECEIPT, currencyHint: 'GBP' },
          }),
        ),
      }),
      { ...options(), regionCurrency: 'EUR' },
    )
    expect(result).toMatchObject({
      ok: true,
      summary: { warnings: ['currencyDiffers'] },
    })
  })

  it('passes the photo check’s issues on as they come, and returns them, never in the summary (P11)', async () => {
    const seen: string[][] = []
    const result = await importReceipt(
      file(),
      deps({
        reader: reader((_source, { onQuality } = {}) => {
          onQuality?.({ issues: ['farAway'], measures: { boxes: 4 } })
          onQuality?.({ issues: ['smallText'], measures: { boxes: 4 } })
          return Promise.resolve({ ok: true, receipt: RECEIPT })
        }),
      }),
      { ...options(), onQuality: (issues) => seen.push(issues) },
    )
    expect(seen).toEqual([['farAway'], ['smallText', 'farAway']])
    expect(result).toMatchObject({
      ok: true,
      photoIssues: ['smallText', 'farAway'],
    })
    if (!result.ok) throw new Error('not imported')
    expect(result.photoChecks).toHaveLength(2)
    expect(JSON.stringify(result.summary)).not.toMatch(/small|far/i)
  })

  it('returns no photo issues when the check found none', async () => {
    const result = await importReceipt(
      file(),
      deps({
        reader: reader((_source, { onQuality } = {}) => {
          onQuality?.({ issues: [], measures: { boxes: 4 } })
          return Promise.resolve({ ok: true, receipt: RECEIPT })
        }),
      }),
      options(),
    )
    expect(result.ok).toBe(true)
    expect(result).not.toHaveProperty('photoIssues')
  })
})
