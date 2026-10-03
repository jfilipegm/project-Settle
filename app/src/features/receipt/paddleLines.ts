/**
 * PaddleOCR's text boxes as D3's `TextLine`s (M2.5 plan, P7). Pure.
 *
 * Boxes are grouped into lines by their vertical centres, corrected for
 * the page's slope (a photo taken at an angle), the lines read top to
 * bottom and each line's boxes left to right. A line's confidence is its
 * weakest box's (0–100), and the spaces PaddleOCR leaves inside a number
 * are removed (`1 ,39` → `1,39`). A box far to the right of the previous
 * one can be joined with a wide gap marker instead of a space, so the
 * parser can tell a price column from a name; whether that helps is CP3's
 * question, so it's off unless asked for.
 */
import type { TextLine } from './model.ts'

/** One recognised box, in the page's pixels. */
export interface PaddleBox {
  text: string
  /** 0–1. */
  confidence: number
  box: { x: number; y: number; width: number; height: number }
}

export interface AssembleOptions {
  /**
   * Joins two boxes whose horizontal gap is wider than `gapFactor` times
   * the line's height. Absent: every box is joined with one space.
   */
  gapMarker?: string
  /** @default 2 */
  gapFactor?: number
}

interface Row {
  boxes: PaddleBox[]
  /** The slope-corrected centre of the row's first box. */
  anchor: number
  height: number
  top: number
}

const centreX = (box: PaddleBox) => box.box.x + box.box.width / 2
const centreY = (box: PaddleBox) => box.box.y + box.box.height / 2

/** Removes the spaces OCR leaves around a number's separator. */
export function repairNumbers(text: string): string {
  return text.replace(/(\d)\s*([,.])\s*(\d)/g, '$1$2$3')
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)] ?? 0
}

/** The largest slope considered: about 3.4°, a hand-held photo's tilt. */
const MAX_SLOPE = 0.06
const SLOPE_STEP = 0.001

/**
 * The page's slope (vertical pixels per horizontal pixel), estimated from
 * the boxes: a photo taken at a slight angle puts a price column a few
 * pixels above or below its names, enough to swap lines on a tightly
 * printed receipt. The slope chosen is the one that best lines each box up
 * with some box to its left (an item's price with its name). With fewer
 * than three such boxes there's no evidence: 0.
 */
export function estimateSlope(boxes: readonly PaddleBox[]): number {
  const pairs = boxes
    .map((box) => ({
      box,
      left: boxes.filter((other) => other.box.x + other.box.width <= box.box.x),
    }))
    .filter((entry) => entry.left.length > 0)
  if (pairs.length < 3) return 0
  const cap = median(boxes.map((box) => box.box.height)) / 2
  const cost = (slope: number) =>
    pairs.reduce((total, { box, left }) => {
      const own = centreY(box) - slope * centreX(box)
      const nearest = Math.min(
        ...left.map((other) =>
          Math.abs(own - (centreY(other) - slope * centreX(other))),
        ),
      )
      return total + Math.min(nearest, cap)
    }, 0)
  let best = 0
  let bestCost = cost(0)
  for (let step = 1; step * SLOPE_STEP <= MAX_SLOPE + 1e-9; step++) {
    for (const slope of [step * SLOPE_STEP, -step * SLOPE_STEP]) {
      const value = cost(slope)
      // Strictly better only: ties keep the smaller tilt.
      if (value < bestCost - 1e-9) {
        best = slope
        bestCost = value
      }
    }
  }
  return best
}

/**
 * Groups boxes into rows: after correcting for the page's slope, a box
 * joins the row whose first box's centre is nearest, if within half the
 * smaller height; a row never grows to swallow its neighbours. Boxes are
 * taken from the top.
 */
function rowsOf(boxes: readonly PaddleBox[]): Row[] {
  const slope = estimateSlope(boxes)
  const level = (box: PaddleBox) => centreY(box) - slope * centreX(box)
  const rows: Row[] = []
  for (const box of [...boxes].sort((a, b) => level(a) - level(b))) {
    const centre = level(box)
    let best: Row | undefined
    let bestDistance = Infinity
    for (const row of rows) {
      const distance = Math.abs(centre - row.anchor)
      if (
        distance <= Math.min(box.box.height, row.height) / 2 &&
        distance < bestDistance
      ) {
        best = row
        bestDistance = distance
      }
    }
    if (best === undefined) {
      rows.push({
        boxes: [box],
        anchor: centre,
        height: box.box.height,
        top: centre,
      })
    } else {
      best.boxes.push(box)
    }
  }
  return rows.sort((a, b) => a.top - b.top)
}

/** One row's boxes, left to right, as a line. */
function lineOf(row: Row, options: AssembleOptions): TextLine {
  const boxes = [...row.boxes].sort((a, b) => a.box.x - b.box.x)
  const height = row.height
  const gapFactor = options.gapFactor ?? 2
  let text = ''
  let previousEnd: number | undefined
  for (const box of boxes) {
    const part = box.text.trim()
    if (part === '') continue
    if (previousEnd !== undefined) {
      const gap = box.box.x - previousEnd
      text +=
        options.gapMarker !== undefined && gap > gapFactor * height
          ? options.gapMarker
          : ' '
    }
    text += part
    previousEnd = box.box.x + box.box.width
  }
  const confidence = Math.round(
    100 * Math.min(...boxes.map((box) => box.confidence)),
  )
  return { text: repairNumbers(text).trim(), confidence }
}

/** A page's boxes as lines, in reading order, empty lines dropped. */
export function assembleLines(
  boxes: readonly PaddleBox[],
  options: AssembleOptions = {},
): TextLine[] {
  return rowsOf(boxes.filter((box) => box.text.trim() !== ''))
    .map((row) => lineOf(row, options))
    .filter((line) => line.text !== '')
}
