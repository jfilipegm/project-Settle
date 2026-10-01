/**
 * PaddleOCR's text boxes as D3's `TextLine`s (M2.5 plan, P7). Pure.
 *
 * Boxes are grouped into lines by vertical overlap, the lines read top to
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
  top: number
  bottom: number
}

const centre = (box: PaddleBox) => box.box.y + box.box.height / 2

/** The share of the shorter extent that two vertical extents share. */
function overlap(
  top: number,
  bottom: number,
  otherTop: number,
  otherBottom: number,
): number {
  const shared = Math.min(bottom, otherBottom) - Math.max(top, otherTop)
  const shorter = Math.min(bottom - top, otherBottom - otherTop)
  return shorter <= 0 ? 0 : shared / shorter
}

/** Removes the spaces OCR leaves around a number's separator. */
export function repairNumbers(text: string): string {
  return text.replace(/(\d)\s*([,.])\s*(\d)/g, '$1$2$3')
}

/**
 * Groups boxes into rows: a box joins the row its vertical extent overlaps
 * most, by at least half of the shorter one; boxes are taken from the top.
 */
function rowsOf(boxes: readonly PaddleBox[]): Row[] {
  const rows: Row[] = []
  const sorted = [...boxes].sort((a, b) => centre(a) - centre(b))
  for (const box of sorted) {
    const top = box.box.y
    const bottom = box.box.y + box.box.height
    let best: Row | undefined
    let bestOverlap = 0.5
    for (const row of rows) {
      const shared = overlap(top, bottom, row.top, row.bottom)
      if (shared >= bestOverlap) {
        best = row
        bestOverlap = shared
      }
    }
    if (best === undefined) {
      rows.push({ boxes: [box], top, bottom })
    } else {
      best.boxes.push(box)
      best.top = Math.min(best.top, top)
      best.bottom = Math.max(best.bottom, bottom)
    }
  }
  return rows.sort((a, b) => a.top - b.top)
}

/** One row's boxes, left to right, as a line. */
function lineOf(row: Row, options: AssembleOptions): TextLine {
  const boxes = [...row.boxes].sort((a, b) => a.box.x - b.box.x)
  const height = row.bottom - row.top
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
