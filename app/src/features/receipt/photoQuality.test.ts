import { describe, expect, it } from 'vitest'
import type { PhotoMeasures, ReceiptPage } from './model.ts'
import {
  MAX_EDGE_SHARE,
  MAX_GLARE,
  MIN_BRIGHTNESS,
  MIN_CONTRAST,
  MIN_COVERAGE,
  MIN_SHARPNESS,
  MIN_TEXT_HEIGHT,
  assessPhoto,
  combineIssues,
  issuesOf,
  type TextBox,
} from './photoQuality.ts'

// Invented images only (never a real receipt): a white "receipt" with
// lines of dark bars standing in for characters, and the boxes where the
// lines were drawn, as detection would give them.

interface Drawn {
  page: ReceiptPage
  boxes: TextBox[]
}

function blank(width: number, height: number, value = 255): ReceiptPage {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < data.length; i += 4) {
    data[i] = data[i + 1] = data[i + 2] = value
    data[i + 3] = 255
  }
  return { width, height, data }
}

function setPixel(page: ReceiptPage, x: number, y: number, value: number) {
  const i = (y * page.width + x) * 4
  page.data[i] = page.data[i + 1] = page.data[i + 2] = value
}

/**
 * A receipt `width` × `height` px at (`left`, `top`) on a `pageWidth` ×
 * `pageHeight` dark background, with lines of text `textHeight` px high.
 */
function receipt({
  textHeight = 24,
  pageWidth = 600,
  pageHeight = 900,
  left = 40,
  top = 40,
  width = pageWidth - 80,
  height = pageHeight - 80,
  background = 255,
}: Partial<{
  textHeight: number
  pageWidth: number
  pageHeight: number
  left: number
  top: number
  width: number
  height: number
  background: number
}> = {}): Drawn {
  const page = blank(pageWidth, pageHeight, 60)
  for (let y = top; y < Math.min(pageHeight, top + height); y++) {
    for (let x = left; x < Math.min(pageWidth, left + width); x++) {
      setPixel(page, x, y, background)
    }
  }
  const boxes: TextBox[] = []
  const stroke = Math.max(1, Math.round(textHeight / 8))
  const charWidth = Math.round(textHeight * 0.6)
  for (
    let lineTop = top + textHeight;
    lineTop + textHeight <= top + height - textHeight;
    lineTop += textHeight * 2
  ) {
    const lineLeft = left + textHeight
    const lineRight = left + width - textHeight
    const characters = Math.floor((lineRight - lineLeft) / charWidth)
    for (let c = 0; c < characters; c++) {
      const x0 = lineLeft + c * charWidth
      // A vertical bar and, every other character, a horizontal one.
      for (let y = lineTop; y < lineTop + textHeight; y++) {
        for (let x = x0; x < x0 + stroke; x++) setPixel(page, x, y, 20)
      }
      if (c % 2 === 0) {
        const y0 = lineTop + Math.round(textHeight / 2)
        for (let y = y0; y < y0 + stroke; y++) {
          for (let x = x0; x < x0 + charWidth - stroke; x++) {
            setPixel(page, x, y, 20)
          }
        }
      }
    }
    boxes.push({
      x: lineLeft - 2,
      y: lineTop - 2,
      width: characters * charWidth + 4,
      height: textHeight + 4,
    })
  }
  return { page, boxes }
}

/**
 * A blur of radius `r`, as an out-of-focus photo: a box blur run twice,
 * close to a Gaussian.
 */
function blurred(drawn: Drawn, r: number): Drawn {
  return boxBlur(boxBlur(drawn, r), r)
}

function boxBlur({ page, boxes }: Drawn, r: number): Drawn {
  const out = blank(page.width, page.height)
  for (let y = 0; y < page.height; y++) {
    for (let x = 0; x < page.width; x++) {
      let sum = 0
      let n = 0
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const xx = Math.min(page.width - 1, Math.max(0, x + dx))
          const yy = Math.min(page.height - 1, Math.max(0, y + dy))
          sum += page.data[(yy * page.width + xx) * 4] ?? 0
          n++
        }
      }
      setPixel(out, x, y, sum / n)
    }
  }
  return { page: out, boxes }
}

/** Every pixel mapped through `f`, as a darker or overexposed photo. */
function mapped({ page, boxes }: Drawn, f: (value: number) => number): Drawn {
  const out = blank(page.width, page.height)
  for (let i = 0; i < page.data.length; i += 4) {
    const value = f(page.data[i] ?? 0)
    out.data[i] = out.data[i + 1] = out.data[i + 2] = value
  }
  return { page: out, boxes }
}

const issuesFor = ({ page, boxes }: Drawn) => assessPhoto(page, boxes).issues

describe('assessPhoto (M2.5 plan, P11)', () => {
  it('finds nothing wrong with a clear, well-framed receipt', () => {
    const quality = assessPhoto(receipt().page, receipt().boxes)
    expect(quality.issues).toEqual([])
    expect(quality.measures.textHeight).toBe(28)
    expect(quality.measures.boxes).toBeGreaterThan(5)
  })

  it('says "no text found" with no detection box', () => {
    expect(assessPhoto(receipt().page, [])).toEqual({
      issues: ['noText'],
      measures: { boxes: 0 },
    })
  })

  it('finds small text', () => {
    expect(
      issuesFor(receipt({ textHeight: 6, pageWidth: 300, pageHeight: 400 })),
    ).toEqual(['smallText'])
  })

  it('finds a blurred photo, at any text size', () => {
    expect(issuesFor(blurred(receipt(), 3))).toEqual(['blurred'])
    // Large text blurred in proportion: still blurred.
    const large = receipt({ textHeight: 64, pageWidth: 1200, pageHeight: 1400 })
    expect(issuesFor(blurred(large, 8))).toEqual(['blurred'])
    // Large crisp text: not blurred.
    expect(issuesFor(large)).toEqual([])
  })

  it('finds a dark photo', () => {
    expect(issuesFor(mapped(receipt(), (value) => value * 0.25))).toEqual([
      'dark',
    ])
  })

  it('finds faint, washed-out text in an overexposed photo', () => {
    expect(
      issuesFor(mapped(receipt(), (value) => 225 + (value / 255) * 30)),
    ).toEqual(['faint'])
  })

  it('finds glare washing out part of the receipt', () => {
    const drawn = receipt()
    const glare = { page: drawn.page, boxes: drawn.boxes }
    // The upper third of the lines washed out white.
    const cut = drawn.page.height / 3
    for (let y = 0; y < cut; y++) {
      for (let x = 0; x < drawn.page.width; x++) setPixel(glare.page, x, y, 255)
    }
    expect(issuesFor(glare)).toEqual(['glare'])
  })

  it('finds a receipt cut off at the edge of the photo', () => {
    // The receipt runs past the right and bottom edges.
    expect(
      issuesFor(receipt({ left: 120, top: 120, width: 600, height: 900 })),
    ).toEqual(['cutOff'])
  })

  it('finds a receipt taken from too far away', () => {
    expect(
      issuesFor(
        receipt({
          pageWidth: 1600,
          pageHeight: 1800,
          left: 600,
          top: 500,
          width: 300,
          height: 500,
        }),
      ),
    ).toEqual(['farAway'])
  })

  it('ignores empty boxes', () => {
    const { page, boxes } = receipt()
    expect(
      assessPhoto(page, [...boxes, { x: 10, y: 10, width: 0, height: 5 }])
        .measures.boxes,
    ).toBe(boxes.length)
  })
})

describe('issuesOf: each threshold at its edge', () => {
  const clear: PhotoMeasures = {
    boxes: 10,
    textHeight: MIN_TEXT_HEIGHT * 2,
    sharpness: MIN_SHARPNESS * 2,
    brightness: 200,
    contrast: MIN_CONTRAST * 2,
    glare: 0,
    edgeShare: 0,
    coverage: 0.8,
  }
  const cases: [keyof PhotoMeasures, number, number, string][] = [
    ['textHeight', MIN_TEXT_HEIGHT, MIN_TEXT_HEIGHT - 0.01, 'smallText'],
    ['sharpness', MIN_SHARPNESS, MIN_SHARPNESS - 0.001, 'blurred'],
    ['brightness', MIN_BRIGHTNESS, MIN_BRIGHTNESS - 0.01, 'dark'],
    ['contrast', MIN_CONTRAST, MIN_CONTRAST - 0.01, 'faint'],
    ['glare', MAX_GLARE, MAX_GLARE + 0.001, 'glare'],
    ['edgeShare', MAX_EDGE_SHARE, MAX_EDGE_SHARE + 0.001, 'cutOff'],
    ['coverage', MIN_COVERAGE, MIN_COVERAGE - 0.001, 'farAway'],
  ]
  it('a clear photo has no issue', () => {
    expect(issuesOf(clear)).toEqual([])
  })
  it.each(cases)('%s: at %d passes, past it is %s', (key, at, past, issue) => {
    expect(issuesOf({ ...clear, [key]: at })).toEqual([])
    expect(issuesOf({ ...clear, [key]: past })).toEqual([issue])
  })
  it('a dark photo is "dark", not also "faint" or "blurred"', () => {
    expect(
      issuesOf({ ...clear, brightness: 40, contrast: 5, sharpness: 1 }),
    ).toEqual(['dark'])
  })
  it('a faint photo is "faint", not also "blurred"', () => {
    expect(issuesOf({ ...clear, contrast: 5, sharpness: 1 })).toEqual(['faint'])
  })
})

describe('combineIssues', () => {
  it('lists each page’s issues once, in the advice’s order', () => {
    expect(
      combineIssues([
        { issues: ['farAway', 'blurred'], measures: { boxes: 3 } },
        { issues: ['blurred', 'smallText'], measures: { boxes: 3 } },
      ]),
    ).toEqual(['smallText', 'blurred', 'farAway'])
  })
})
