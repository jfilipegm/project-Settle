/**
 * Resampling a decoded page (M2 plan, D10), for the QR scan's crops. The
 * rest of M2's image clean-up was Tesseract's and left with it (M2.5 plan,
 * P10).
 */
import type { ReceiptPage } from './model.ts'

/** Bilinear resampling of an RGBA page to `width` × `height`. */
export function resize(
  source: ReceiptPage,
  width: number,
  height: number,
): ReceiptPage {
  if (width === source.width && height === source.height) {
    return source
  }
  const out: ReceiptPage = {
    width,
    height,
    data: new Uint8ClampedArray(width * height * 4),
  }
  const xRatio = source.width / width
  const yRatio = source.height / height
  const sw = source.width
  const sh = source.height
  const src = source.data
  for (let y = 0; y < height; y++) {
    const sy = Math.min(sh - 1, Math.max(0, (y + 0.5) * yRatio - 0.5))
    const y0 = Math.floor(sy)
    const y1 = Math.min(sh - 1, y0 + 1)
    const fy = sy - y0
    for (let x = 0; x < width; x++) {
      const sx = Math.min(sw - 1, Math.max(0, (x + 0.5) * xRatio - 0.5))
      const x0 = Math.floor(sx)
      const x1 = Math.min(sw - 1, x0 + 1)
      const fx = sx - x0
      const o = (y * width + x) * 4
      for (let c = 0; c < 4; c++) {
        const a = src[(y0 * sw + x0) * 4 + c] ?? 0
        const b = src[(y0 * sw + x1) * 4 + c] ?? 0
        const d = src[(y1 * sw + x0) * 4 + c] ?? 0
        const e = src[(y1 * sw + x1) * 4 + c] ?? 0
        const top = a + (b - a) * fx
        const bottom = d + (e - d) * fx
        out.data[o + c] = top + (bottom - top) * fy
      }
    }
  }
  return out
}
