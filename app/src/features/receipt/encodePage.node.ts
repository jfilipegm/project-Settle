/**
 * Test support: D2's page encoder for the Node tests, with pngjs. Node's
 * Tesseract.js reads an encoded image from a `Buffer`, not a `Blob`.
 */
import { Buffer } from 'node:buffer'
import { PNG } from 'pngjs'
import type { ReceiptPage } from './model.ts'

export function encodePageNode(page: ReceiptPage): Promise<Buffer> {
  const bytes = PNG.sync.write({
    width: page.width,
    height: page.height,
    data: new Uint8Array(
      page.data.buffer,
      page.data.byteOffset,
      page.data.length,
    ),
  })
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
