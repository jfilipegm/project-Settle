/**
 * Image clean-up (M2 plan, D10), as pure functions over RGBA pixels:
 * scaling, Rec. 601 grayscale, a 1st–99th percentile contrast stretch, and
 * straightening by a projection-profile skew estimate. No hard
 * binarization: Tesseract thresholds by itself. EXIF orientation is applied
 * earlier, when the file is decoded.
 */
import type { ReceiptPage } from './model.ts'

const WHITE = 255

function page(width: number, height: number): ReceiptPage {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) }
}

/**
 * D10's scaling: a short side under 800 px is doubled unless that takes
 * the long side past 2400 px; then the long side is capped at 2400 px.
 */
export function fitSize(
  width: number,
  height: number,
): { width: number; height: number } {
  const long = Math.max(width, height)
  const short = Math.min(width, height)
  let scale = short < 800 && long * 2 <= 2400 ? 2 : 1
  if (long * scale > 2400) {
    scale = 2400 / long
  }
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

/** Bilinear resampling to `width` × `height`. */
export function resize(
  source: ReceiptPage,
  width: number,
  height: number,
): ReceiptPage {
  if (width === source.width && height === source.height) {
    return source
  }
  const out = page(width, height)
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

/** Rec. 601 luma, `(299 R + 587 G + 114 B) / 1000`, in all three channels. */
export function toGrayscale(source: ReceiptPage): ReceiptPage {
  const out = page(source.width, source.height)
  const src = source.data
  for (let i = 0; i < src.length; i += 4) {
    const y = Math.round(
      (299 * (src[i] ?? 0) +
        587 * (src[i + 1] ?? 0) +
        114 * (src[i + 2] ?? 0)) /
        1000,
    )
    out.data[i] = y
    out.data[i + 1] = y
    out.data[i + 2] = y
    out.data[i + 3] = 255
  }
  return out
}

/** The `p`-th percentile (0–1) of a grayscale page's luma. */
function percentile(
  histogram: readonly number[],
  total: number,
  p: number,
): number {
  const target = p * total
  let seen = 0
  for (let v = 0; v < 256; v++) {
    seen += histogram[v] ?? 0
    if (seen >= target) {
      return v
    }
  }
  return 255
}

/**
 * A linear stretch of a grayscale page between its 1st and 99th luma
 * percentiles. A flat page stays flat.
 */
export function stretchContrast(source: ReceiptPage): ReceiptPage {
  const src = source.data
  const histogram = new Array<number>(256).fill(0)
  const total = src.length / 4
  for (let i = 0; i < src.length; i += 4) {
    const v = src[i] ?? 0
    histogram[v] = (histogram[v] ?? 0) + 1
  }
  const low = percentile(histogram, total, 0.01)
  const high = percentile(histogram, total, 0.99)
  if (high <= low) {
    return source
  }
  const out = page(source.width, source.height)
  for (let i = 0; i < src.length; i += 4) {
    const v = (((src[i] ?? 0) - low) * 255) / (high - low)
    out.data[i] = v
    out.data[i + 1] = v
    out.data[i + 2] = v
    out.data[i + 3] = 255
  }
  return out
}

/**
 * Rotates the content by `degrees` about the centre, keeping the size and
 * filling with white. A positive angle tilts a horizontal line downwards to
 * the right (y grows with x, image coordinates), so `rotate(p, -skew)`
 * straightens a page whose lines {@link estimateSkew} measured as `skew`.
 */
export function rotate(source: ReceiptPage, degrees: number): ReceiptPage {
  const { width, height } = source
  const out = page(width, height)
  const radians = (degrees * Math.PI) / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  const cx = (width - 1) / 2
  const cy = (height - 1) / 2
  const src = source.data
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - cx
      const dy = y - cy
      const sx = Math.round(dx * cos + dy * sin + cx)
      const sy = Math.round(-dx * sin + dy * cos + cy)
      const o = (y * width + x) * 4
      if (sx < 0 || sy < 0 || sx >= width || sy >= height) {
        out.data[o] = WHITE
        out.data[o + 1] = WHITE
        out.data[o + 2] = WHITE
        out.data[o + 3] = 255
      } else {
        const s = (sy * width + sx) * 4
        out.data[o] = src[s] ?? WHITE
        out.data[o + 1] = src[s + 1] ?? WHITE
        out.data[o + 2] = src[s + 2] ?? WHITE
        out.data[o + 3] = src[s + 3] ?? 255
      }
    }
  }
  return out
}

/** Otsu's threshold over a 256-bin histogram. */
function otsu(histogram: readonly number[], total: number): number {
  let sum = 0
  for (let v = 0; v < 256; v++) {
    sum += v * (histogram[v] ?? 0)
  }
  let background = 0
  let backgroundSum = 0
  let best = 0
  let threshold = 127
  for (let v = 0; v < 256; v++) {
    background += histogram[v] ?? 0
    if (background === 0) continue
    const foreground = total - background
    if (foreground === 0) break
    backgroundSum += v * (histogram[v] ?? 0)
    const meanB = backgroundSum / background
    const meanF = (sum - backgroundSum) / foreground
    const between = background * foreground * (meanB - meanF) ** 2
    if (between > best) {
      best = between
      threshold = v
    }
  }
  return threshold
}

/**
 * D10's skew estimate, in degrees (see {@link rotate} for the sign): on an
 * 800-px binarized copy, the angle in −15°…+15° (0.5° steps) whose
 * projection profile of the dark pixels is the sharpest.
 */
export function estimateSkew(source: ReceiptPage): number {
  const long = Math.max(source.width, source.height)
  const scale = long > 800 ? 800 / long : 1
  const width = Math.max(1, Math.round(source.width * scale))
  const height = Math.max(1, Math.round(source.height * scale))

  // Nearest-neighbour luma of the small copy.
  const luma = new Uint8Array(width * height)
  const histogram = new Array<number>(256).fill(0)
  for (let y = 0; y < height; y++) {
    const sy = Math.min(source.height - 1, Math.floor(y / scale))
    for (let x = 0; x < width; x++) {
      const sx = Math.min(source.width - 1, Math.floor(x / scale))
      const s = (sy * source.width + sx) * 4
      const v = Math.round(
        (299 * (source.data[s] ?? 0) +
          587 * (source.data[s + 1] ?? 0) +
          114 * (source.data[s + 2] ?? 0)) /
          1000,
      )
      luma[y * width + x] = v
      histogram[v] = (histogram[v] ?? 0) + 1
    }
  }
  const threshold = otsu(histogram, width * height)
  const darkX: number[] = []
  const darkY: number[] = []
  const cx = width / 2
  const cy = height / 2
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if ((luma[y * width + x] ?? 255) <= threshold) {
        darkX.push(x - cx)
        darkY.push(y - cy)
      }
    }
  }
  // Mostly dark (or blank) pages have no lines to measure.
  if (darkX.length === 0 || darkX.length > width * height * 0.5) {
    return 0
  }

  const span = Math.ceil(Math.hypot(width, height)) + 2
  let bestAngle = 0
  let bestScore = -1
  for (let step = -30; step <= 30; step++) {
    const degrees = step / 2
    const radians = (degrees * Math.PI) / 180
    const cos = Math.cos(radians)
    const sin = Math.sin(radians)
    const bins = new Float64Array(span * 2)
    for (let i = 0; i < darkX.length; i++) {
      // The distance from a line tilted by `degrees` through the centre.
      const d = (darkY[i] ?? 0) * cos - (darkX[i] ?? 0) * sin
      const bin = Math.round(d) + span
      bins[bin] = (bins[bin] ?? 0) + 1
    }
    let score = 0
    for (const count of bins) {
      score += count * count
    }
    if (score > bestScore) {
      bestScore = score
      bestAngle = degrees
    }
  }
  return bestAngle
}

/** Straightens a page if its skew is at least 0.5° (D10). */
export function straighten(source: ReceiptPage): ReceiptPage {
  const skew = estimateSkew(source)
  return Math.abs(skew) >= 0.5 ? rotate(source, -skew) : source
}

/** D10's whole clean-up, in order: scale, grayscale, contrast, straighten. */
export function preprocessPage(source: ReceiptPage): ReceiptPage {
  const size = fitSize(source.width, source.height)
  return straighten(
    stretchContrast(toGrayscale(resize(source, size.width, size.height))),
  )
}
