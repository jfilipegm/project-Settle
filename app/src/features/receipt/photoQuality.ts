/**
 * The photo quality check (M2.5 plan, P11). Pure: from one page's pixels
 * and PaddleOCR's detection boxes (detection only, before the slow
 * recognition), four measurements of the photo, each against a threshold:
 *
 * 1. **Text size**: the boxes' median height, in the page's pixels.
 * 2. **Blur**: the sharpness inside the boxes, the spread (standard
 *    deviation) of a Laplacian, taken at a scale relative to the text size
 *    (the page averaged down so text is about
 *    {@link SHARPNESS_TEXT_HEIGHT} pixels high), so a large, soft photo of
 *    big text and a small, crisp screenshot are judged alike.
 * 3. **Lighting**: the brightness and contrast inside the boxes, and the
 *    share of boxes washed out by glare (nearly every pixel clipped white).
 * 4. **Framing**: the share of boxes touching an edge of the image (the
 *    receipt is cut off), and how much of the image the text covers (taken
 *    from too far away).
 *
 * It only measures and warns: the reading never depends on it, and nothing
 * here is stored. The thresholds are set from measurements on the local
 * set (`scripts/measure-quality.mjs`), recorded in `docs/ACTIVE_MILESTONE.md`.
 */
import type {
  PhotoIssue,
  PhotoMeasures,
  PhotoQuality,
  ReceiptPage,
} from './model.ts'

/** A detection box, in the page's pixels. */
export interface TextBox {
  x: number
  y: number
  width: number
  height: number
}

/** Under this median box height (pixels), digits are misread. */
export const MIN_TEXT_HEIGHT = 17
/** Under this sharpness, the text is blurred. */
export const MIN_SHARPNESS = 25
/** Under this mean brightness (0–255) inside the boxes, it's too dark. */
export const MIN_BRIGHTNESS = 125
/** Under this contrast (standard deviation, 0–255), the text is faint. */
export const MIN_CONTRAST = 25
/** Over this share of boxes washed out by glare, there's glare. */
export const MAX_GLARE = 0.1
/** Over this share of boxes touching an edge, the receipt is cut off. */
export const MAX_EDGE_SHARE = 0.25
/** Under this share of the image covered by text, it's too far away. */
export const MIN_COVERAGE = 0.2

/** The text height the sharpness is measured at (pixels). */
export const SHARPNESS_TEXT_HEIGHT = 16
/** A pixel at or over this brightness is clipped white. */
const CLIPPED = 250
/** A box with at least this share of clipped pixels is washed out. */
const WASHED_OUT_BOX = 0.97
/** How close to an edge (share of the shorter side) a box touches it. */
const EDGE_MARGIN = 0.005
/** At most about this many pixels are sampled for the lighting. */
const MAX_SAMPLES = 1_000_000

/** Rec. 601 luma of pixel `i` (its byte offset). */
function luma(data: Uint8ClampedArray, i: number): number {
  return (
    0.299 * (data[i] ?? 0) +
    0.587 * (data[i + 1] ?? 0) +
    0.114 * (data[i + 2] ?? 0)
  )
}

/** The box clipped to the page, in whole pixels; undefined if empty. */
function clip(
  box: TextBox,
  page: ReceiptPage,
): { x0: number; y0: number; x1: number; y1: number } | undefined {
  const x0 = Math.max(0, Math.floor(box.x))
  const y0 = Math.max(0, Math.floor(box.y))
  const x1 = Math.min(page.width, Math.ceil(box.x + box.width))
  const y1 = Math.min(page.height, Math.ceil(box.y + box.height))
  return x1 > x0 && y1 > y0 ? { x0, y0, x1, y1 } : undefined
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1
    ? (sorted[middle] ?? 0)
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
}

/** Running sums for a mean and a standard deviation. */
class Spread {
  n = 0
  sum = 0
  squares = 0
  add(value: number) {
    this.n++
    this.sum += value
    this.squares += value * value
  }
  get mean(): number {
    return this.n === 0 ? 0 : this.sum / this.n
  }
  get deviation(): number {
    if (this.n === 0) return 0
    const mean = this.mean
    return Math.sqrt(Math.max(0, this.squares / this.n - mean * mean))
  }
}

/**
 * Brightness, contrast and glare inside the boxes, at full resolution,
 * sampled every `step` pixels when the boxes are large.
 */
function lighting(
  page: ReceiptPage,
  boxes: readonly TextBox[],
): { brightness: number; contrast: number; glare: number } {
  const area = boxes.reduce((sum, box) => {
    const rect = clip(box, page)
    return rect === undefined
      ? sum
      : sum + (rect.x1 - rect.x0) * (rect.y1 - rect.y0)
  }, 0)
  const step = Math.max(1, Math.ceil(Math.sqrt(area / MAX_SAMPLES)))
  const all = new Spread()
  let washedOut = 0
  let counted = 0
  for (const box of boxes) {
    const rect = clip(box, page)
    if (rect === undefined) continue
    let pixels = 0
    let clipped = 0
    for (let y = rect.y0; y < rect.y1; y += step) {
      for (let x = rect.x0; x < rect.x1; x += step) {
        const value = luma(page.data, (y * page.width + x) * 4)
        all.add(value)
        pixels++
        if (value >= CLIPPED) clipped++
      }
    }
    counted++
    if (pixels > 0 && clipped / pixels >= WASHED_OUT_BOX) washedOut++
  }
  return {
    brightness: all.mean,
    contrast: all.deviation,
    glare: counted === 0 ? 0 : washedOut / counted,
  }
}

/**
 * The sharpness: inside each box, the page averaged down by `scale` (so
 * text is about {@link SHARPNESS_TEXT_HEIGHT} pixels high), then the
 * standard deviation of its 4-neighbour Laplacian. Crisp text is a sharp
 * step from paper to ink, so the Laplacian is large at every stroke; blur
 * spreads the step and the Laplacian falls. Faint text lowers it too.
 */
function sharpness(
  page: ReceiptPage,
  boxes: readonly TextBox[],
  textHeight: number,
): number {
  const scale = Math.max(1, Math.round(textHeight / SHARPNESS_TEXT_HEIGHT))
  const laplacian = new Spread()
  for (const box of boxes) {
    const rect = clip(box, page)
    if (rect === undefined) continue
    const columns = Math.floor((rect.x1 - rect.x0) / scale)
    const rows = Math.floor((rect.y1 - rect.y0) / scale)
    if (columns < 3 || rows < 3) continue
    const grid = new Float32Array(columns * rows)
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        let sum = 0
        for (let dy = 0; dy < scale; dy++) {
          const y = rect.y0 + row * scale + dy
          for (let dx = 0; dx < scale; dx++) {
            sum += luma(
              page.data,
              (y * page.width + rect.x0 + column * scale + dx) * 4,
            )
          }
        }
        grid[row * columns + column] = sum / (scale * scale)
      }
    }
    for (let row = 1; row < rows - 1; row++) {
      for (let column = 1; column < columns - 1; column++) {
        const at = row * columns + column
        laplacian.add(
          4 * (grid[at] ?? 0) -
            (grid[at - 1] ?? 0) -
            (grid[at + 1] ?? 0) -
            (grid[at - columns] ?? 0) -
            (grid[at + columns] ?? 0),
        )
      }
    }
  }
  return laplacian.deviation
}

/** The share of boxes touching an edge of the page. */
function edgeShare(page: ReceiptPage, boxes: readonly TextBox[]): number {
  const margin = Math.max(2, EDGE_MARGIN * Math.min(page.width, page.height))
  const touching = boxes.filter(
    (box) =>
      box.x <= margin ||
      box.y <= margin ||
      box.x + box.width >= page.width - margin ||
      box.y + box.height >= page.height - margin,
  ).length
  return touching / boxes.length
}

/** The share of the page inside the rectangle around all the boxes. */
function coverage(page: ReceiptPage, boxes: readonly TextBox[]): number {
  const left = Math.max(0, Math.min(...boxes.map((box) => box.x)))
  const top = Math.max(0, Math.min(...boxes.map((box) => box.y)))
  const right = Math.min(
    page.width,
    Math.max(...boxes.map((box) => box.x + box.width)),
  )
  const bottom = Math.min(
    page.height,
    Math.max(...boxes.map((box) => box.y + box.height)),
  )
  const area = Math.max(0, right - left) * Math.max(0, bottom - top)
  return area / (page.width * page.height)
}

/** P11: the page's measurements and the issues past their thresholds. */
export function assessPhoto(
  page: ReceiptPage,
  boxes: readonly TextBox[],
): PhotoQuality {
  const usable = boxes.filter((box) => box.width > 0 && box.height > 0)
  if (usable.length === 0) {
    return { issues: ['noText'], measures: { boxes: 0 } }
  }
  const textHeight = median(usable.map((box) => box.height))
  const light = lighting(page, usable)
  const measures: PhotoMeasures = {
    boxes: usable.length,
    textHeight,
    sharpness: sharpness(page, usable, textHeight),
    brightness: light.brightness,
    contrast: light.contrast,
    glare: light.glare,
    edgeShare: edgeShare(page, usable),
    coverage: coverage(page, usable),
  }
  return { issues: issuesOf(measures), measures }
}

/** The issues past their thresholds, in the order the advice is given. */
export function issuesOf(measures: PhotoMeasures): PhotoIssue[] {
  const issues: PhotoIssue[] = []
  const below = (value: number | undefined, threshold: number) =>
    value !== undefined && value < threshold
  const above = (value: number | undefined, threshold: number) =>
    value !== undefined && value > threshold
  if (measures.boxes === 0) return ['noText']
  if (below(measures.textHeight, MIN_TEXT_HEIGHT)) issues.push('smallText')
  // The Laplacian falls with the contrast too: a dark or faint photo's
  // blur can't be judged, and that advice comes first.
  const dark = below(measures.brightness, MIN_BRIGHTNESS)
  const faint = !dark && below(measures.contrast, MIN_CONTRAST)
  if (!dark && !faint && below(measures.sharpness, MIN_SHARPNESS)) {
    issues.push('blurred')
  }
  if (dark) issues.push('dark')
  if (faint) issues.push('faint')
  if (above(measures.glare, MAX_GLARE)) issues.push('glare')
  if (above(measures.edgeShare, MAX_EDGE_SHARE)) issues.push('cutOff')
  if (below(measures.coverage, MIN_COVERAGE)) issues.push('farAway')
  return issues
}

/** Several pages' issues as one list, each once, in the advice's order. */
export function combineIssues(
  qualities: readonly PhotoQuality[],
): PhotoIssue[] {
  const all = new Set(qualities.flatMap((quality) => quality.issues))
  return PHOTO_ISSUES.filter((issue) => all.has(issue))
}

/** Every issue, in the order the advice is given. */
export const PHOTO_ISSUES: readonly PhotoIssue[] = [
  'noText',
  'smallText',
  'blurred',
  'dark',
  'faint',
  'glare',
  'cutOff',
  'farAway',
]
