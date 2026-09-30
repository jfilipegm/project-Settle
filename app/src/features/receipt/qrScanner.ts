/**
 * Finding a Portuguese fiscal QR code on the receipt's pages (M2 plan, CP3;
 * D5), with zxing-wasm. Each page is tried whole first, then its bottom
 * half scaled up, where these codes usually sit. The first payload
 * `parseFiscalQr` accepts wins; any other QR code is ignored.
 */
import { zxingLocateFile } from './assets.ts'
import { parseFiscalQr, type FiscalQr } from './fiscalQr.ts'
import type { ReceiptPage } from './model.ts'
import { resize } from './preprocess.ts'

/** zxing-wasm's `readBarcodes`, as far as this module uses it. */
export type ReadBarcodes = (
  image: ImageData,
  options: {
    formats: 'QRCode'[]
    tryHarder: boolean
    maxNumberOfSymbols: number
  },
) => Promise<{ text: string }[]>

export interface ScanFiscalQrOptions {
  /** zxing-wasm's reader, loaded on first use by default. */
  readBarcodes?: ReadBarcodes
  signal?: AbortSignal
}

/**
 * The bottom half's upscale is 2× (D5), or less, so that the scaled copy
 * stays under this many pixels on a large photo.
 */
export const MAX_CROP_PIXELS = 12_000_000

const loadReadBarcodes: ReadBarcodes = async (image, options) => {
  const zxing = await import('zxing-wasm/reader')
  // Same-origin wasm (D8): zxing's default is a CDN.
  zxing.prepareZXingModule({
    overrides: { locateFile: zxingLocateFile },
    fireImmediately: false,
  })
  return zxing.readBarcodes(image, options)
}

/** The page's bottom half, scaled up 2× (less for a large page). */
export function bottomHalf(page: ReceiptPage): ReceiptPage {
  const top = Math.floor(page.height / 2)
  const height = page.height - top
  const rowBytes = page.width * 4
  const crop: ReceiptPage = {
    width: page.width,
    height,
    data: page.data.slice(top * rowBytes, page.height * rowBytes),
  }
  const scale = Math.min(
    2,
    Math.sqrt(MAX_CROP_PIXELS / Math.max(1, page.width * height)),
  )
  return scale <= 1
    ? crop
    : resize(crop, Math.round(page.width * scale), Math.round(height * scale))
}

async function fiscalQrOn(
  image: ReceiptPage,
  readBarcodes: ReadBarcodes,
): Promise<FiscalQr | undefined> {
  // zxing reads any `{ data, width, height }`; a real ImageData isn't needed.
  const found = await readBarcodes(image as unknown as ImageData, {
    formats: ['QRCode'],
    tryHarder: true,
    maxNumberOfSymbols: 4,
  })
  for (const { text } of found) {
    const parsed = parseFiscalQr(text)
    if (parsed.ok) {
      return parsed.qr
    }
  }
  return undefined
}

/**
 * The first fiscal QR code on `pages`, or `undefined`. Throws only if
 * zxing itself fails (the caller treats that as no code).
 */
export async function scanFiscalQr(
  pages: readonly ReceiptPage[],
  { readBarcodes = loadReadBarcodes, signal }: ScanFiscalQrOptions = {},
): Promise<FiscalQr | undefined> {
  for (const page of pages) {
    for (const attempt of [() => page, () => bottomHalf(page)]) {
      if (signal?.aborted) {
        return undefined
      }
      const qr = await fiscalQrOn(attempt(), readBarcodes)
      if (qr !== undefined) {
        return qr
      }
    }
  }
  return undefined
}
