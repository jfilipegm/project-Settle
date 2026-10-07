/**
 * Test support: pages to and from PNG for the Node tests, with pngjs.
 */
import { Buffer } from 'node:buffer'
import { PNG } from 'pngjs'
import type { ReceiptPage } from './model.ts'

export function encodePageNode(page: ReceiptPage): Promise<Buffer> {
  const data = new Uint8Array(
    page.data.buffer,
    page.data.byteOffset,
    page.data.length,
  )
  const bytes = PNG.sync.write({ width: page.width, height: page.height, data })
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
