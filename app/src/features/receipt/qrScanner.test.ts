import { describe, expect, it, vi } from 'vitest'
import type { ReceiptPage } from './model.ts'
import {
  MAX_CROP_PIXELS,
  bottomHalf,
  scanFiscalQr,
  type ReadBarcodes,
} from './qrScanner.ts'

const FISCAL = 'A:500000000*B:999999990*C:PT*D:FS*F:20260928*O:12.50'

function page(width: number, height: number, fill = 0): ReceiptPage {
  return {
    width,
    height,
    data: new Uint8ClampedArray(width * height * 4).fill(fill),
  }
}

/** A page whose rows are numbered: row y has every channel = y. */
function rowsPage(width: number, height: number): ReceiptPage {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    data.fill(y, y * width * 4, (y + 1) * width * 4)
  }
  return { width, height, data }
}

describe('bottomHalf', () => {
  it('crops to the bottom half and scales it up 2×', () => {
    const half = bottomHalf(rowsPage(10, 7))
    expect(half.width).toBe(20)
    expect(half.height).toBe(8) // rows 3–6, doubled
    expect(half.data[0]).toBe(3)
    expect(half.data[half.data.length - 1]).toBe(6)
  })

  it('scales less on a large page', () => {
    // A 3000 × 1500 crop: 2× would be 18 MP, so it's scaled about 1.6×.
    const half = bottomHalf(page(3000, 3000))
    expect(half.width * half.height).toBeLessThanOrEqual(MAX_CROP_PIXELS * 1.01)
    expect(half.width).toBeGreaterThan(4500)
    expect(half.width).toBeLessThan(6000)
    // A crop already at the limit isn't scaled at all.
    expect(bottomHalf(page(4000, 6000)).width).toBe(4000)
  })
})

describe('scanFiscalQr', () => {
  it('returns the first fiscal payload, ignoring other QR codes', async () => {
    const readBarcodes = vi.fn<ReadBarcodes>(() =>
      Promise.resolve([{ text: 'https://example.com/menu' }, { text: FISCAL }]),
    )
    const qr = await scanFiscalQr([page(4, 4)], { readBarcodes })
    expect(qr).toMatchObject({ issuerNif: '500000000', total: 1250 })
    expect(readBarcodes).toHaveBeenCalledOnce()
    expect(readBarcodes.mock.calls[0]?.[1]).toEqual({
      formats: ['QRCode'],
      tryHarder: true,
      maxNumberOfSymbols: 4,
    })
  })

  it('tries each page whole, then its bottom half (D5)', async () => {
    const seen: [number, number][] = []
    const readBarcodes = vi.fn<ReadBarcodes>((image) => {
      seen.push([image.width, image.height])
      return Promise.resolve(
        seen.length === 4 ? [{ text: FISCAL }] : [{ text: 'not fiscal' }],
      )
    })
    const qr = await scanFiscalQr([page(10, 10), page(6, 8)], { readBarcodes })
    expect(qr?.total).toBe(1250)
    expect(seen).toEqual([
      [10, 10],
      [20, 10],
      [6, 8],
      [12, 8],
    ])
  })

  it('gives undefined when there is no fiscal QR code, or when aborted', async () => {
    const none = vi.fn<ReadBarcodes>(() => Promise.resolve([]))
    expect(await scanFiscalQr([page(4, 4)], { readBarcodes: none })).toBe(
      undefined,
    )
    const controller = new AbortController()
    controller.abort()
    const unused = vi.fn<ReadBarcodes>()
    expect(
      await scanFiscalQr([page(4, 4)], {
        readBarcodes: unused,
        signal: controller.signal,
      }),
    ).toBe(undefined)
    expect(unused).not.toHaveBeenCalled()
  })
})
