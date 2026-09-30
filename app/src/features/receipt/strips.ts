/**
 * Reading in strips (remediation plan, R20), as pure functions: how a
 * scaled page is cut into overlapping horizontal strips, and which of a
 * strip's OCR lines are kept.
 */
import type { TextLine } from './model.ts'

/** R20: the most pixels in one strip, margin included. */
export const STRIP_BUDGET = 6_000_000
/** R20: the longest core (a strip without its margins), in rows. */
const MAX_CORE = 1800
/** R20: the overlap is 8× the text height, at least 200 px. */
const MIN_OVERLAP = 200
const OVERLAP_PER_TEXT = 8
/** R2: the blur radius is 3× the text height, at least 15 px. */
const MIN_RADIUS = 15
const RADIUS_PER_TEXT = 3

export interface Strip {
  /** The core's rows of the scaled page: `top` to `bottom`, end excluded. */
  top: number
  bottom: number
  /** Rows above and below the core, read only for flattening (3r). */
  marginTop: number
  marginBottom: number
  /** The rows whose lines this strip owns; the own zones tile the page. */
  ownTop: number
  ownBottom: number
}

/**
 * R2's flattening radius for a scaled page: 3× its text height, at least
 * 15 px, or 1/20 of its width when the text height is unknown.
 */
export function flattenRadius(
  width: number,
  textHeight: number | undefined,
): number {
  return textHeight === undefined
    ? Math.max(MIN_RADIUS, Math.round(width / 20))
    : Math.max(MIN_RADIUS, Math.round(RADIUS_PER_TEXT * textHeight))
}

/** R20: strips overlap by this many rows, rounded up to an even number. */
export function stripOverlap(textHeight: number | undefined): number {
  const rows = Math.max(MIN_OVERLAP, OVERLAP_PER_TEXT * (textHeight ?? 0))
  return 2 * Math.ceil(rows / 2)
}

/**
 * The fewest rows a strip may have, margins included: a core of 2× the
 * overlap and a margin of 3r on each side (34t rows for t ≥ 25).
 */
export function minimumStripRows(
  width: number,
  textHeight: number | undefined,
): number {
  return 2 * stripOverlap(textHeight) + 6 * flattenRadius(width, textHeight)
}

export class StripBudgetTooSmallError extends Error {}

/**
 * R20's strips for a `width` × `height` scaled page whose text is
 * `textHeight` px tall. A page within the budget is one strip with no
 * margin. Otherwise the cores are spread evenly down the page, each
 * overlapping the next by at least the overlap, and each strip's own zone
 * ends in the middle of its overlap with the next.
 */
export function planStrips(
  width: number,
  height: number,
  textHeight: number | undefined,
  { budget = STRIP_BUDGET }: { budget?: number } = {},
): Strip[] {
  if (width * height <= budget) {
    return [
      {
        top: 0,
        bottom: height,
        marginTop: 0,
        marginBottom: 0,
        ownTop: 0,
        ownBottom: height,
      },
    ]
  }
  const minRows = minimumStripRows(width, textHeight)
  if (Math.floor(budget / width) < minRows) {
    throw new StripBudgetTooSmallError(
      `A strip budget of ${budget} px is under the minimum strip (${minRows} rows of ${width} px)`,
    )
  }
  const overlap = stripOverlap(textHeight)
  const margin = 3 * flattenRadius(width, textHeight)
  const maxCore =
    Math.min(Math.floor(budget / width), MAX_CORE + 2 * margin) - 2 * margin
  const count = Math.max(2, Math.ceil((height - overlap) / (maxCore - overlap)))
  const core = Math.min(
    maxCore,
    Math.max(2 * overlap, Math.ceil((height + (count - 1) * overlap) / count)),
  )
  const tops: number[] = []
  for (let i = 0; i < count; i++) {
    tops.push(Math.floor((i * (height - core)) / (count - 1)))
  }
  return tops.map((top, i) => {
    const bottom = top + core
    const previous = tops[i - 1]
    const next = tops[i + 1]
    return {
      top,
      bottom,
      marginTop: Math.min(margin, top),
      marginBottom: Math.min(margin, height - bottom),
      ownTop:
        previous === undefined ? 0 : Math.floor((top + previous + core) / 2),
      ownBottom: next === undefined ? height : Math.floor((next + bottom) / 2),
    }
  })
}

/** A recognised line with its box in the strip's image, when known. */
export interface OcrLine extends TextLine {
  bbox?: { y0: number; y1: number }
}

/**
 * The lines a strip keeps (R20): those whose vertical centre, in page
 * coordinates, is in the strip's own zone. A line with no box is kept.
 * The order is the OCR's own, never re-sorted.
 */
export function ownLines(
  lines: readonly OcrLine[],
  strip: { top: number; ownTop: number; ownBottom: number },
): TextLine[] {
  const kept: TextLine[] = []
  for (const { text, confidence, bbox } of lines) {
    if (bbox !== undefined) {
      const centre = strip.top + (bbox.y0 + bbox.y1) / 2
      if (centre < strip.ownTop || centre >= strip.ownBottom) continue
    }
    kept.push({ text, confidence })
  }
  return kept
}
