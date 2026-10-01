/**
 * Test support: JPEG decoding for the Node tests (M2.5 plan, CP1), so the
 * local set is read from the images as the phone made them. `jpeg-js`
 * ignores EXIF, so the orientation tag is read here and applied the way the
 * browser's `imageOrientation: 'from-image'` does (D2): the page comes out
 * upright.
 */
import jpeg from 'jpeg-js'
import { decodePngNode } from './encodePage.node.ts'
import { MAX_PIXELS } from './intake.ts'
import type { ReceiptPage } from './model.ts'

/** EXIF orientation, 1–8; 1 (upright) when absent or unreadable. */
export function readJpegOrientation(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return 1
  let at = 2
  while (at + 4 <= view.byteLength) {
    const marker = view.getUint16(at)
    // Start of scan or a non-marker: no more metadata segments.
    if (marker === 0xffda || (marker & 0xff00) !== 0xff00) return 1
    const length = view.getUint16(at + 2)
    if (marker === 0xffe1) {
      const orientation = exifOrientation(view, at + 4, length - 2)
      if (orientation !== undefined) return orientation
    }
    at += 2 + length
  }
  return 1
}

/** The orientation in one APP1 segment's EXIF data, if it has one. */
function exifOrientation(
  view: DataView,
  start: number,
  length: number,
): number | undefined {
  const end = Math.min(view.byteLength, start + length)
  // "Exif\0\0", then a TIFF header.
  if (end - start < 14 || view.getUint32(start) !== 0x45786966) return undefined
  const tiff = start + 6
  const order = view.getUint16(tiff)
  if (order !== 0x4949 && order !== 0x4d4d) return undefined
  const little = order === 0x4949
  const ifd = tiff + view.getUint32(tiff + 4, little)
  if (ifd + 2 > end) return undefined
  const count = view.getUint16(ifd, little)
  for (let index = 0; index < count; index++) {
    const entry = ifd + 2 + index * 12
    if (entry + 12 > end) return undefined
    if (view.getUint16(entry, little) === 0x0112) {
      const value = view.getUint16(entry + 8, little)
      return value >= 1 && value <= 8 ? value : undefined
    }
  }
  return undefined
}

/** The page turned upright for EXIF orientation `orientation`. */
export function applyOrientation(
  page: ReceiptPage,
  orientation: number,
): ReceiptPage {
  if (orientation <= 1 || orientation > 8) return page
  const { width: w, height: h, data } = page
  const swap = orientation >= 5
  const width = swap ? h : w
  const height = swap ? w : h
  // Where each upright pixel (x, y) is in the stored image.
  const source: (x: number, y: number) => [number, number] = {
    2: (x: number, y: number): [number, number] => [w - 1 - x, y],
    3: (x: number, y: number): [number, number] => [w - 1 - x, h - 1 - y],
    4: (x: number, y: number): [number, number] => [x, h - 1 - y],
    5: (x: number, y: number): [number, number] => [y, x],
    6: (x: number, y: number): [number, number] => [y, h - 1 - x],
    7: (x: number, y: number): [number, number] => [w - 1 - y, h - 1 - x],
    8: (x: number, y: number): [number, number] => [w - 1 - y, x],
  }[orientation as 2 | 3 | 4 | 5 | 6 | 7 | 8]
  const out = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [sx, sy] = source(x, y)
      const from = (sy * w + sx) * 4
      const to = (y * width + x) * 4
      out[to] = data[from] ?? 0
      out[to + 1] = data[from + 1] ?? 0
      out[to + 2] = data[from + 2] ?? 0
      out[to + 3] = data[from + 3] ?? 0
    }
  }
  return { width, height, data: out }
}

/** A JPEG file's pixels as an upright page. */
export function decodeJpegNode(bytes: Uint8Array): ReceiptPage {
  const image = jpeg.decode(bytes, {
    useTArray: true,
    formatAsRGBA: true,
    // The intake limit (D7) bounds what can be decoded at all.
    maxResolutionInMP: MAX_PIXELS / 1_000_000,
    maxMemoryUsageInMB: 1024,
  })
  const page: ReceiptPage = {
    width: image.width,
    height: image.height,
    data: new Uint8ClampedArray(
      image.data.buffer,
      image.data.byteOffset,
      image.data.length,
    ),
  }
  return applyOrientation(page, readJpegOrientation(bytes))
}

/** A JPEG or PNG file as a page, by its name; HEIC has no Node decoder. */
export function decodeImageNode(bytes: Uint8Array, name: string): ReceiptPage {
  return /\.jpe?g$/i.test(name) ? decodeJpegNode(bytes) : decodePngNode(bytes)
}
