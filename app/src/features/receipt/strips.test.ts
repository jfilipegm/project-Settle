import { describe, expect, it } from 'vitest'
import {
  STRIP_BUDGET,
  StripBudgetTooSmallError,
  flattenRadius,
  minimumStripRows,
  ownLines,
  planStrips,
  stripOverlap,
  type OcrLine,
  type Strip,
} from './strips.ts'

/** R20's invariants, for any plan of a `width` × `height` page. */
function checkPlan(
  strips: Strip[],
  width: number,
  height: number,
  textHeight: number,
  budget = STRIP_BUDGET,
) {
  const overlap = stripOverlap(textHeight)
  const margin = 3 * flattenRadius(width, textHeight)
  // The own zones tile the page: every row in exactly one.
  expect(strips[0]?.ownTop).toBe(0)
  expect(strips.at(-1)?.ownBottom).toBe(height)
  for (const [i, strip] of strips.entries()) {
    const rows = strip.bottom - strip.top + strip.marginTop + strip.marginBottom
    // Every strip, margin included, is within the budget and the page.
    expect(rows * width).toBeLessThanOrEqual(budget)
    expect(rows).toBeLessThanOrEqual(height)
    expect(strip.top - strip.marginTop).toBeGreaterThanOrEqual(0)
    expect(strip.bottom + strip.marginBottom).toBeLessThanOrEqual(height)
    // The margin is 3r, except where the page ends.
    expect(strip.marginTop).toBe(Math.min(margin, strip.top))
    expect(strip.marginBottom).toBe(Math.min(margin, height - strip.bottom))
    // The core is at least 2× the overlap; the own zone is inside it.
    expect(strip.bottom - strip.top).toBeGreaterThanOrEqual(2 * overlap)
    expect(strip.ownTop).toBeGreaterThanOrEqual(strip.top)
    expect(strip.ownBottom).toBeLessThanOrEqual(strip.bottom)
    const next = strips[i + 1]
    if (next !== undefined) {
      expect(next.ownTop).toBe(strip.ownBottom)
      // Overlap of at least 8t, with the boundary in its middle, at least
      // 4t from both strips' edges.
      expect(strip.bottom - next.top).toBeGreaterThanOrEqual(overlap)
      expect(overlap).toBeGreaterThanOrEqual(8 * textHeight)
      expect(strip.ownBottom - next.top).toBeGreaterThanOrEqual(4 * textHeight)
      expect(strip.bottom - strip.ownBottom).toBeGreaterThanOrEqual(
        4 * textHeight,
      )
      expect(
        Math.abs(strip.ownBottom - next.top - (strip.bottom - strip.ownBottom)),
      ).toBeLessThanOrEqual(1)
    }
  }
}

describe('planStrips (R20)', () => {
  it('reads a page of 6 MP or less as one strip with no margin', () => {
    expect(planStrips(2000, 3000, 32)).toEqual([
      {
        top: 0,
        bottom: 3000,
        marginTop: 0,
        marginBottom: 0,
        ownTop: 0,
        ownBottom: 3000,
      },
    ])
  })

  it.each([
    [3072, 4096, 32],
    [3167, 4223, 32],
    [892, 7000, 22],
    [1044, 6396, 20],
    [3000, 4000, 40],
    [4000, 3500, 24],
    [2500, 5600, 64],
  ])('cuts a %i × %i page with %i-px text into valid strips', (w, h, t) => {
    const strips = planStrips(w, h, t)
    expect(strips.length).toBeGreaterThan(1)
    checkPlan(strips, w, h, t)
  })

  it('keeps every strip within 6 MP over R1’s whole range', () => {
    for (let width = 500; width <= 4000; width += 250) {
      const most = Math.floor(14_000_000 / width)
      for (const height of [6_000_000 / width + 1, most / 2, most]) {
        const h = Math.floor(height)
        for (let t = 8; t <= 40; t += 4) {
          if (width * h <= STRIP_BUDGET) continue
          checkPlan(planStrips(width, h, t), width, h, t)
        }
      }
    }
    // The landscape extreme: 4000 px wide, 3500 tall.
    checkPlan(planStrips(4000, 3500, 40), 4000, 3500, 40)
  })

  it('gives strips of exactly the minimum when the budget is the minimum', () => {
    for (const [width, t] of [
      [4000, 40],
      [3000, 30],
      [2000, 25],
      [2000, 16],
      [1000, 8],
    ] as const) {
      const rows = minimumStripRows(width, t)
      expect(rows).toBe(t >= 25 ? 34 * t : 400 + 18 * t)
      const height = rows * 5
      const budget = rows * width
      const strips = planStrips(width, height, t, { budget })
      checkPlan(strips, width, height, t, budget)
      const margin = 3 * flattenRadius(width, t)
      const full = strips.filter(
        (strip) => strip.marginTop === margin && strip.marginBottom === margin,
      )
      expect(full.length).toBeGreaterThan(0)
      for (const strip of full) {
        expect(
          strip.bottom - strip.top + strip.marginTop + strip.marginBottom,
        ).toBe(rows)
      }
    }
  })

  it('refuses a budget below the minimum strip', () => {
    expect(() => planStrips(4000, 3500, 40, { budget: 1359 * 4000 })).toThrow(
      StripBudgetTooSmallError,
    )
  })
})

describe('ownLines (R20)', () => {
  const strip = { top: 1000, ownTop: 1100, ownBottom: 2000 }
  const line = (text: string, y0: number, y1: number): OcrLine => ({
    text,
    confidence: 90,
    bbox: { y0, y1 },
  })

  it('keeps the lines whose centre is in the own zone, in their order', () => {
    expect(
      ownLines(
        [
          line('above the zone', 40, 90), // centre 1065
          line('first', 100, 140), // centre 1120
          line('second', 950, 1010), // centre 1980
          line('the next strip’s', 980, 1030), // centre 2005
        ],
        strip,
      ),
    ).toEqual([
      { text: 'first', confidence: 90 },
      { text: 'second', confidence: 90 },
    ])
  })

  it('keeps a line with no box', () => {
    expect(ownLines([{ text: 'A 1,00', confidence: 80 }], strip)).toEqual([
      { text: 'A 1,00', confidence: 80 },
    ])
  })

  it('takes a line in an overlap once, from the strip owning its centre', () => {
    const [first, second] = planStrips(3000, 4000, 32)
    if (first === undefined || second === undefined) throw new Error()
    // A line straddling the boundary between the two strips' own zones.
    const y = first.ownBottom - 10
    const inFirst = line('Total 76,11', y - first.top - 15, y - first.top + 15)
    const inSecond = line(
      'Total 76,11',
      y - second.top - 15,
      y - second.top + 15,
    )
    expect(ownLines([inFirst], first)).toHaveLength(1)
    expect(ownLines([inSecond], second)).toHaveLength(0)
  })
})
