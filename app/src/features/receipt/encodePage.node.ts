/**
 * Test support: D2's page encoder for the Node tests, with pngjs. Node's
 * Tesseract.js reads an encoded image from a `Buffer`, not a `Blob`.
 */
import { Buffer } from 'node:buffer'
import { PNG } from 'pngjs'
import type { ReceiptPage } from './model.ts'
import type { GrayPage } from './preprocess.ts'

/** PNG color type 0: grayscale, one byte per pixel (R2's strips). */
const GRAYSCALE = 0

export function encodePageNode(page: ReceiptPage | GrayPage): Promise<Buffer> {
  const data = new Uint8Array(
    page.data.buffer,
    page.data.byteOffset,
    page.data.length,
  )
  const bytes =
    'channels' in page
      ? PNG.sync.write(
          { width: page.width, height: page.height, data },
          { colorType: GRAYSCALE, inputColorType: GRAYSCALE },
        )
      : PNG.sync.write({ width: page.width, height: page.height, data })
  return Promise.resolve(
    Buffer.from(bytes.buffer, bytes.byteOffset, bytes.length),
  )
}

/** A PNG file's pixels as a page. */
export function decodePngNode(bytes: Uint8Array): ReceiptPage {
  const png = PNG.sync.read(
    Buffer.from(bytes.buffer, bytes.byteOffset, bytes.length),
  )
  return {
    width: png.width,
    height: png.height,
    data: new Uint8ClampedArray(
      png.data.buffer,
      png.data.byteOffset,
      png.data.length,
    ),
  }
}
