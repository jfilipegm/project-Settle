/**
 * A PDF page's text layer as lines (M2 plan, D6, R2-O-1). pdf.js's
 * `getTextContent` gives positioned fragments, not lines: fragments whose
 * baselines are within half a fragment's height form one line, sorted by
 * `x` and joined with single spaces. Pure.
 */
import type { TextLine } from './model.ts'

/** A text fragment in PDF coordinates (`y` grows upwards). */
export interface TextFragment {
  str: string
  x: number
  y: number
  height: number
}

/** pdf.js's `TextItem`, as far as this module needs it. */
export interface PdfTextItem {
  str: string
  transform: number[]
  height: number
}

export function toFragments(items: readonly unknown[]): TextFragment[] {
  return items
    .filter(
      (item): item is PdfTextItem =>
        typeof item === 'object' &&
        item !== null &&
        'str' in item &&
        'transform' in item,
    )
    .map((item) => ({
      str: item.str,
      x: item.transform[4] ?? 0,
      y: item.transform[5] ?? 0,
      height: item.height || Math.abs(item.transform[3] ?? 0),
    }))
}

/** Groups fragments into lines, top to bottom (D6). */
export function fragmentsToLines(
  fragments: readonly TextFragment[],
): TextLine[] {
  const sorted = fragments
    .filter((fragment) => fragment.str.trim() !== '')
    .toSorted((a, b) => b.y - a.y)
  const lines: { y: number; height: number; parts: TextFragment[] }[] = []
  for (const fragment of sorted) {
    const line = lines.at(-1)
    // Against the line's mean baseline, so the result doesn't depend on
    // which fragment happened to come first.
    if (
      line !== undefined &&
      Math.abs(line.y - fragment.y) <=
        Math.max(line.height, fragment.height) / 2
    ) {
      line.parts.push(fragment)
      line.y += (fragment.y - line.y) / line.parts.length
      line.height = Math.max(line.height, fragment.height)
    } else {
      lines.push({ y: fragment.y, height: fragment.height, parts: [fragment] })
    }
  }
  return lines.map((line) => ({
    text: line.parts
      .toSorted((a, b) => a.x - b.x)
      .map((part) => part.str.trim())
      .join(' ')
      .replace(/\s+/g, ' '),
    confidence: 100,
  }))
}

/** D6: a page "has a text layer" with at least 20 non-space characters. */
export function hasTextLayer(lines: readonly TextLine[]): boolean {
  return (
    lines
      .map((line) => line.text)
      .join('')
      .replace(/\s/g, '').length >= 20
  )
}
