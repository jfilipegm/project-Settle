/**
 * Image clean-up (M2 plan, D10, as changed by the remediation plan's R1, R2
 * and R20). The page is analysed on a small working copy (text height and
 * skew), scaled by its text height, converted to one 8-bit channel,
 * straightened, then cut into strips; each strip is scaled on the page's
 * grid, flattened (the page divided by a heavily blurred copy of itself) and
 * contrast-stretched on its own. No hard binarization: Tesseract thresholds
 * by itself. EXIF orientation is applied earlier, when the file is decoded.
 */
import type { ReceiptPage } from './model.ts'
import {
  STRIP_BUDGET,
  flattenRadius,
  planStrips,
  type Strip,
} from './strips.ts'

/** A page with one 8-bit luma channel: one byte per pixel. */
export interface GrayPage {
  readonly channels: 1
  width: number
  height: number
  data: Uint8ClampedArray
}

const WHITE = 255

/** R1: the text height the scaling aims for, and when it acts. */
export const TEXT_TARGET = 32
export const ENLARGE_BELOW = 24
export const SHRINK_ABOVE = 64
const MIN_FACTOR = 0.5
const MAX_FACTOR = 4
/** R1: the page limits that win over the thresholds and the clamp. */
export const MAX_PAGE_PIXELS = 14_000_000
export const MAX_PAGE_WIDTH = 4000
/** R1: a page read in strips has its text brought down to at most this. */
export const STRIP_TEXT_LIMIT = 40
const LOWEST_FACTOR = 0.2
/** R1's working copy: at most the area of an 800 × 800 page. */
const WORKING_PIXELS = 800 * 800
/** R1: a character's height range, and the fewest that make an estimate. */
const MIN_CHAR_HEIGHT = 3
const MAX_CHAR_HEIGHT = 200
const MIN_COMPONENTS = 20

function gray(width: number, height: number): GrayPage {
  return {
    channels: 1,
    width,
    height,
    data: new Uint8ClampedArray(width * height),
  }
}

/** Rec. 601 luma, `(299 R + 587 G + 114 B) / 1000`, unrounded. */
function luma(data: Uint8ClampedArray, i: number): number {
  return (
    (299 * (data[i] ?? 0) +
      587 * (data[i + 1] ?? 0) +
      114 * (data[i + 2] ?? 0)) /
    1000
  )
}

/**
 * D10's scaling, the fallback when the text height can't be estimated: a
 * short side under 800 px is doubled unless that takes the long side past
 * 2400 px; then the long side is capped at 2400 px.
 */
function d10Factor(width: number, height: number): number {
  const long = Math.max(width, height)
  const short = Math.min(width, height)
  const scale = short < 800 && long * 2 <= 2400 ? 2 : 1
  return long * scale > 2400 ? 2400 / long : scale
}

/**
 * R1's scaling factor for a page whose characters are `textHeight` px
 * tall, or D10's when there's no estimate. In order: the thresholds and the
 * clamp; the 14-MP and 4000-px limits; then, for a page still read in
 * strips, text of at most 40 px. A factor under 0.2 falls back to D10.
 */
export function scaleFactor(
  width: number,
  height: number,
  textHeight?: number,
): number {
  if (textHeight === undefined) {
    return d10Factor(width, height)
  }
  let factor = 1
  if (textHeight < ENLARGE_BELOW || textHeight > SHRINK_ABOVE) {
    factor = Math.min(
      MAX_FACTOR,
      Math.max(MIN_FACTOR, TEXT_TARGET / textHeight),
    )
  }
  factor = Math.min(
    factor,
    Math.sqrt(MAX_PAGE_PIXELS / (width * height)),
    MAX_PAGE_WIDTH / width,
  )
  if (
    width * height * factor * factor > STRIP_BUDGET &&
    textHeight * factor > STRIP_TEXT_LIMIT
  ) {
    factor = TEXT_TARGET / textHeight
  }
  return factor < LOWEST_FACTOR ? d10Factor(width, height) : factor
}

/**
 * The scaled page's size (R1; D10 with no estimate). Rounded, except when
 * rounding would break the 14-MP or 4000-px limit.
 */
export function fitSize(
  width: number,
  height: number,
  textHeight?: number,
): { width: number; height: number } {
  const factor = scaleFactor(width, height, textHeight)
  const rounded = {
    width: Math.max(1, Math.round(width * factor)),
    height: Math.max(1, Math.round(height * factor)),
  }
  if (
    textHeight !== undefined &&
    (rounded.width * rounded.height > MAX_PAGE_PIXELS ||
      rounded.width > MAX_PAGE_WIDTH)
  ) {
    return {
      width: Math.max(1, Math.floor(width * factor)),
      height: Math.max(1, Math.floor(height * factor)),
    }
  }
  return rounded
}

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

/** Rec. 601 luma of an RGBA page, rounded: one byte per pixel. */
export function toGrayscale(source: ReceiptPage): GrayPage {
  const out = gray(source.width, source.height)
  const src = source.data
  for (let i = 0, o = 0; i < src.length; i += 4, o++) {
    out.data[o] = Math.round(luma(src, i))
  }
  return out
}

/**
 * Bilinear resampling and grayscale in one pass (R2's shrink path): the
 * RGBA source is never copied at its own resolution.
 */
export function resizeToGrayscale(
  source: ReceiptPage,
  width: number,
  height: number,
): GrayPage {
  const out = gray(width, height)
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
      const a = luma(src, (y0 * sw + x0) * 4)
      const b = luma(src, (y0 * sw + x1) * 4)
      const d = luma(src, (y1 * sw + x0) * 4)
      const e = luma(src, (y1 * sw + x1) * 4)
      const top = a + (b - a) * fx
      const bottom = d + (e - d) * fx
      out.data[y * width + x] = top + (bottom - top) * fy
    }
  }
  return out
}

/**
 * Rows `rowStart`–`rowEnd` (end excluded) of `source` resampled to
 * `width` × `height`, bilinearly: exactly those rows of the whole resized
 * page, so a strip scaled on its own lines up with its neighbours (R2).
 */
export function resizeRows(
  source: GrayPage,
  width: number,
  height: number,
  rowStart = 0,
  rowEnd = height,
): GrayPage {
  if (
    width === source.width &&
    height === source.height &&
    rowStart === 0 &&
    rowEnd === height
  ) {
    return source
  }
  const out = gray(width, rowEnd - rowStart)
  const xRatio = source.width / width
  const yRatio = source.height / height
  const sw = source.width
  const sh = source.height
  const src = source.data
  // The horizontal sampling is the same on every row.
  const x0s = new Int32Array(width)
  const x1s = new Int32Array(width)
  const fxs = new Float64Array(width)
  for (let x = 0; x < width; x++) {
    const sx = Math.min(sw - 1, Math.max(0, (x + 0.5) * xRatio - 0.5))
    const x0 = Math.floor(sx)
    x0s[x] = x0
    x1s[x] = Math.min(sw - 1, x0 + 1)
    fxs[x] = sx - x0
  }
  for (let y = rowStart; y < rowEnd; y++) {
    const sy = Math.min(sh - 1, Math.max(0, (y + 0.5) * yRatio - 0.5))
    const y0 = Math.floor(sy)
    const r0 = y0 * sw
    const r1 = Math.min(sh - 1, y0 + 1) * sw
    const fy = sy - y0
    const o = (y - rowStart) * width
    for (let x = 0; x < width; x++) {
      const x0 = x0s[x] ?? 0
      const x1 = x1s[x] ?? 0
      const fx = fxs[x] ?? 0
      const a = src[r0 + x0] ?? 0
      const b = src[r0 + x1] ?? 0
      const d = src[r1 + x0] ?? 0
      const e = src[r1 + x1] ?? 0
      const top = a + (b - a) * fx
      const bottom = d + (e - d) * fx
      out.data[o + x] = top + (bottom - top) * fy
    }
  }
  return out
}

/** The `p`-th percentile (0–1) of a 256-bin histogram. */
function percentile(histogram: Float64Array, total: number, p: number): number {
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

function histogramOf(page: GrayPage): Float64Array {
  const histogram = new Float64Array(256)
  for (const v of page.data) {
    histogram[v] = (histogram[v] ?? 0) + 1
  }
  return histogram
}

/**
 * A linear stretch between the page's 1st and 99th luma percentiles. A
 * flat page stays flat.
 */
export function stretchContrast(source: GrayPage): GrayPage {
  const histogram = histogramOf(source)
  const total = source.data.length
  const low = percentile(histogram, total, 0.01)
  const high = percentile(histogram, total, 0.99)
  if (high <= low) {
    return source
  }
  const out = gray(source.width, source.height)
  const src = source.data
  for (let i = 0; i < src.length; i++) {
    out.data[i] = (((src[i] ?? 0) - low) * 255) / (high - low)
  }
  return out
}

/**
 * Rotates the content by `degrees` about the centre, keeping the size and
 * filling with white. A positive angle tilts a horizontal line downwards to
 * the right (y grows with x, image coordinates), so `rotate(p, -skew)`
 * straightens a page whose lines {@link estimateSkew} measured as `skew`.
 */
export function rotate(source: GrayPage, degrees: number): GrayPage {
  const { width, height } = source
  const out = gray(width, height)
  const radians = (degrees * Math.PI) / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  const cx = (width - 1) / 2
  const cy = (height - 1) / 2
  const src = source.data
  for (let y = 0; y < height; y++) {
    const dy = y - cy
    for (let x = 0; x < width; x++) {
      const dx = x - cx
      const sx = Math.round(dx * cos + dy * sin + cx)
      const sy = Math.round(-dx * sin + dy * cos + cy)
      out.data[y * width + x] =
        sx < 0 || sy < 0 || sx >= width || sy >= height
          ? WHITE
          : (src[sy * width + sx] ?? WHITE)
    }
  }
  return out
}

/**
 * One box-blur pass of half-width `r` (a window of 2r + 1), along rows
 * (`step` 1) or columns (`step` = width), by running sums, with the edges
 * repeated. Each output is rounded, so the result depends only on the
 * inputs within `r`, never on where a strip starts.
 */
function boxPass(
  src: Uint8ClampedArray,
  dst: Uint8ClampedArray,
  lines: number,
  length: number,
  lineStep: number,
  step: number,
  r: number,
  line: Uint8ClampedArray,
): void {
  const window = 2 * r + 1
  const last = length - 1
  for (let l = 0; l < lines; l++) {
    const base = l * lineStep
    for (let i = 0; i < length; i++) {
      line[i] = src[base + i * step] ?? 0
    }
    let sum = 0
    for (let k = -r; k <= r; k++) {
      sum += line[Math.min(last, Math.max(0, k))] ?? 0
    }
    for (let i = 0; i < length; i++) {
      dst[base + i * step] = Math.round(sum / window)
      sum +=
        (line[Math.min(last, i + r + 1)] ?? 0) - (line[Math.max(0, i - r)] ?? 0)
    }
  }
}

/**
 * Three passes of a box blur of half-width `r` in each direction, which
 * approximate a Gaussian. An output pixel depends on inputs up to 3r away.
 */
export function blur(source: GrayPage, r: number): GrayPage {
  const { width, height } = source
  const a = new Uint8ClampedArray(source.data)
  const b = new Uint8ClampedArray(a.length)
  const line = new Uint8ClampedArray(Math.max(width, height))
  for (let pass = 0; pass < 3; pass++) {
    boxPass(a, b, height, width, width, 1, r, line)
    boxPass(b, a, width, height, 1, width, r, line)
  }
  return { channels: 1, width, height, data: a }
}

/**
 * R2's illumination flattening: each pixel divided by a blurred copy of the
 * page, mapped by the fixed rule `min(255, 255 × pixel / blurred)`, so the
 * background becomes white. No page statistic is used, so a strip
 * flattened with a margin of 3r gives exactly the whole page's pixels.
 */
export function flatten(source: GrayPage, r: number): GrayPage {
  return divideBy(source, blur(source, r))
}

/** `min(255, 255 × pixel / blurred)`, pixel by pixel (R2's mapping). */
function divideBy(source: GrayPage, background: GrayPage): GrayPage {
  const blurred = background.data
  const out = gray(source.width, source.height)
  const src = source.data
  for (let i = 0; i < src.length; i++) {
    out.data[i] = Math.min(
      WHITE,
      Math.round((WHITE * (src[i] ?? 0)) / Math.max(1, blurred[i] ?? 0)),
    )
  }
  return out
}

/** Otsu's threshold over a 256-bin histogram. */
function otsu(histogram: Float64Array, total: number): number {
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
 * An area-averaged grayscale copy of `source`, at most
 * {@link WORKING_PIXELS} in area (a smaller page is left as is, so a
 * screenshot's 5-px text isn't shrunk away).
 */
function workingGrayscale(source: ReceiptPage): {
  copy: GrayPage
  scale: number
} {
  const area = source.width * source.height
  const scale = area > WORKING_PIXELS ? Math.sqrt(WORKING_PIXELS / area) : 1
  if (scale === 1) {
    return { copy: toGrayscale(source), scale }
  }
  const width = Math.max(1, Math.round(source.width * scale))
  const height = Math.max(1, Math.round(source.height * scale))
  const sums = new Float64Array(width * height)
  const counts = new Float64Array(width * height)
  for (let y = 0; y < source.height; y++) {
    const ty = Math.min(height - 1, Math.floor((y * height) / source.height))
    for (let x = 0; x < source.width; x++) {
      const tx = Math.min(width - 1, Math.floor((x * width) / source.width))
      const t = ty * width + tx
      sums[t] = (sums[t] ?? 0) + luma(source.data, (y * source.width + x) * 4)
      counts[t] = (counts[t] ?? 0) + 1
    }
  }
  const copy = gray(width, height)
  for (let i = 0; i < copy.data.length; i++) {
    copy.data[i] = Math.round((sums[i] ?? 0) / Math.max(1, counts[i] ?? 0))
  }
  return { copy, scale }
}

/**
 * A page whose blurred background has a median under this is uneven
 * (grey paper, a table, shading) and is flattened; a brighter one isn't.
 * Measured in CP1: the two real photos 157–173, every screenshot and
 * corpus sample 219 or more.
 */
export const UNEVEN_BACKGROUND = 200

function median(data: Uint8ClampedArray): number {
  const histogram = new Float64Array(256)
  for (const v of data) histogram[v] = (histogram[v] ?? 0) + 1
  return percentile(histogram, data.length, 0.5)
}

/**
 * R1's working copy: the page shrunk to at most an 800 × 800 area, in
 * grayscale, coarsely flattened (a radius of 1/20 of its width). Both the
 * text-height estimate and the skew estimate read it. `uneven` says
 * whether the page's background needs flattening (R2, as decided in CP1):
 * its coarse blur's median is under {@link UNEVEN_BACKGROUND}.
 */
export function workingCopy(source: ReceiptPage): {
  copy: GrayPage
  scale: number
  uneven: boolean
} {
  const { copy, scale } = workingGrayscale(source)
  const background = blur(copy, Math.max(1, Math.round(copy.width / 20)))
  return {
    copy: divideBy(copy, background),
    scale,
    uneven: median(background.data) < UNEVEN_BACKGROUND,
  }
}

/**
 * The median height of the connected dark components (8-connected, after
 * Otsu) that look like characters: 3–200 px tall, at most 3× as wide as
 * tall, not touching the border. Fewer than 20 give no estimate.
 */
export function characterHeight(page: GrayPage): number | undefined {
  const { width, height, data } = page
  const threshold = otsu(histogramOf(page), data.length)
  const dark = new Uint8Array(data.length)
  for (let i = 0; i < data.length; i++) {
    dark[i] = (data[i] ?? WHITE) <= threshold ? 1 : 0
  }
  const heights: number[] = []
  const stack = new Int32Array(data.length)
  for (let start = 0; start < data.length; start++) {
    if (dark[start] !== 1) continue
    dark[start] = 2
    let top = 0
    stack[top++] = start
    let minX = width
    let maxX = -1
    let minY = height
    let maxY = -1
    while (top > 0) {
      const i = stack[--top] ?? 0
      const x = i % width
      const y = (i - x) / width
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy
        if (ny < 0 || ny >= height) continue
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx
          if (nx < 0 || nx >= width) continue
          const n = ny * width + nx
          if (dark[n] === 1) {
            dark[n] = 2
            stack[top++] = n
          }
        }
      }
    }
    const h = maxY - minY + 1
    const w = maxX - minX + 1
    const touches =
      minX === 0 || minY === 0 || maxX === width - 1 || maxY === height - 1
    if (
      !touches &&
      h >= MIN_CHAR_HEIGHT &&
      h <= MAX_CHAR_HEIGHT &&
      w <= 3 * h
    ) {
      heights.push(h)
    }
  }
  if (heights.length < MIN_COMPONENTS) {
    return undefined
  }
  heights.sort((p, q) => p - q)
  const mid = heights.length >> 1
  return heights.length % 2 === 1
    ? heights[mid]
    : ((heights[mid - 1] ?? 0) + (heights[mid] ?? 0)) / 2
}

/** R1's text-height estimate for a page, in the page's own pixels. */
export function estimateTextHeight(source: ReceiptPage): number | undefined {
  const { copy, scale } = workingCopy(source)
  const h = characterHeight(copy)
  return h === undefined ? undefined : h / scale
}

/**
 * D10's skew estimate, in degrees (see {@link rotate} for the sign): on a
 * copy of at most 800 px, binarized by Otsu, the angle in −15°…+15° (0.5°
 * steps) whose projection profile of the dark pixels is the sharpest.
 */
export function estimateSkew(source: GrayPage): number {
  const long = Math.max(source.width, source.height)
  const scale = long > 800 ? 800 / long : 1
  const width = Math.max(1, Math.round(source.width * scale))
  const height = Math.max(1, Math.round(source.height * scale))

  // Nearest-neighbour luma of the small copy.
  const small = gray(width, height)
  for (let y = 0; y < height; y++) {
    const sy = Math.min(source.height - 1, Math.floor(y / scale))
    for (let x = 0; x < width; x++) {
      const sx = Math.min(source.width - 1, Math.floor(x / scale))
      small.data[y * width + x] = source.data[sy * source.width + sx] ?? WHITE
    }
  }
  const threshold = otsu(histogramOf(small), width * height)
  const darkX: number[] = []
  const darkY: number[] = []
  const cx = width / 2
  const cy = height / 2
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if ((small.data[y * width + x] ?? WHITE) <= threshold) {
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
export function straighten(
  source: GrayPage,
  skew = estimateSkew(source),
): GrayPage {
  return Math.abs(skew) >= 0.5 ? rotate(source, -skew) : source
}

/** One cleaned-up strip of a page, ready for the OCR (R20). */
export interface CleanStrip {
  image: GrayPage
  /** The strip's first row in the scaled page. */
  top: number
  /** The rows of the scaled page this strip's lines are kept from. */
  ownTop: number
  ownBottom: number
  index: number
  count: number
}

export interface PreprocessOptions {
  signal?: AbortSignal | undefined
  /** Lowers the strip budget (R2), never below the minimum strip. */
  stripPixels?: number
}

/** Yields to the event loop, then stops if the read was cancelled. */
function pause(signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (signal?.aborted) {
        reject(
          signal.reason instanceof Error ? signal.reason : new Error('Aborted'),
        )
      } else {
        resolve()
      }
    }, 0)
  })
}

/** The page after the page-level steps, before it's cut into strips. */
export interface PreparedPage {
  /** Grayscale and straightened; at the source's size unless shrunk. */
  plane: GrayPage
  /** The scaled page's size. */
  width: number
  height: number
  /** The scaled page's text height, if it could be estimated. */
  textHeight: number | undefined
  /** Whether the strips are flattened: only an uneven page's are. */
  flatten: boolean
}

/**
 * The page's one-channel plane (R2): shrunk and grayed in one pass,
 * straight to `size`, when the page is shrunk; otherwise grayed at the
 * source's size, the enlarging happening per strip. Either way it never
 * has more pixels than the smaller of the source and the scaled page.
 */
export function grayPlane(
  source: ReceiptPage,
  size: { width: number; height: number },
): GrayPage {
  return size.width < source.width
    ? resizeToGrayscale(source, size.width, size.height)
    : toGrayscale(source)
}

/**
 * The page-level steps (R1, R2): analyse the working copy, then either
 * shrink and grayscale in one pass (factor under 1) or grayscale at the
 * source's size (the scaling then happens per strip), then straighten by
 * the working copy's skew.
 */
export async function preparePage(
  source: ReceiptPage,
  signal?: AbortSignal,
): Promise<PreparedPage> {
  const { copy, scale, uneven } = workingCopy(source)
  const h = characterHeight(copy)
  const textHeight = h === undefined ? undefined : h / scale
  const skew = estimateSkew(copy)
  await pause(signal)
  const size = fitSize(source.width, source.height, textHeight)
  const plane = grayPlane(source, size)
  await pause(signal)
  const straight = straighten(plane, skew)
  await pause(signal)
  return {
    plane: straight,
    ...size,
    textHeight:
      textHeight === undefined
        ? undefined
        : (textHeight * size.height) / source.height,
    flatten: uneven,
  }
}

/**
 * One strip (R20): its rows and margins cut from the plane, scaled on the
 * page's grid, flattened (an uneven page only), trimmed to its core and
 * contrast-stretched on its own histogram.
 */
export async function cleanStrip(
  page: PreparedPage,
  strip: Strip,
  signal?: AbortSignal,
): Promise<GrayPage> {
  const rows = resizeRows(
    page.plane,
    page.width,
    page.height,
    strip.top - strip.marginTop,
    strip.bottom + strip.marginBottom,
  )
  await pause(signal)
  const flat = page.flatten
    ? flatten(rows, flattenRadius(page.width, page.textHeight))
    : rows
  await pause(signal)
  const core: GrayPage = {
    channels: 1,
    width: page.width,
    height: strip.bottom - strip.top,
    data: flat.data.subarray(
      strip.marginTop * page.width,
      (strip.marginTop + strip.bottom - strip.top) * page.width,
    ),
  }
  return stretchContrast(core)
}

/**
 * The whole clean-up of one page, strip by strip: the page-level steps,
 * then each strip in turn, top to bottom. It yields to the event loop
 * between steps and stops there if `signal` aborts.
 */
export async function* preprocessPage(
  source: ReceiptPage,
  { signal, stripPixels = STRIP_BUDGET }: PreprocessOptions = {},
): AsyncGenerator<CleanStrip> {
  const page = await preparePage(source, signal)
  const strips = planStrips(page.width, page.height, page.textHeight, {
    budget: stripPixels,
  })
  for (const [index, strip] of strips.entries()) {
    const image = await cleanStrip(page, strip, signal)
    await pause(signal)
    yield {
      image,
      top: strip.top,
      ownTop: strip.ownTop,
      ownBottom: strip.ownBottom,
      index,
      count: strips.length,
    }
  }
}
