import { describe, expect, it } from 'vitest'
import type { ReceiptPage } from './model.ts'
import {
  estimateSkew,
  fitSize,
  preprocessPage,
  resize,
  rotate,
  straighten,
  stretchContrast,
  toGrayscale,
} from './preprocess.ts'

function solid(
  width: number,
  height: number,
  rgb: [number, number, number],
): ReceiptPage {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < data.length; i += 4) {
    data[i] = rgb[0]
    data[i + 1] = rgb[1]
    data[i + 2] = rgb[2]
    data[i + 3] = 255
  }
  return { width, height, data }
}

/**
 * A white page with lines of dark "words" (dashes 30 px long, 6 px thick,
 * with 12 px gaps), each line tilted by `degrees` (the sign of `rotate`).
 */
function textPage(degrees: number, width = 1200, height = 1600): ReceiptPage {
  const page = solid(width, height, [255, 255, 255])
  const tan = Math.tan((degrees * Math.PI) / 180)
  const cx = width / 2
  for (let line = 0; line < 30; line++) {
    const y0 = 150 + line * 45
    for (let x = 150; x < width - 150; x++) {
      if ((x - 150) % 42 >= 30) continue
      const yc = y0 + (x - cx) * tan
      for (let dy = -3; dy < 3; dy++) {
        const y = Math.round(yc + dy)
        if (y < 0 || y >= height) continue
        const i = (y * width + x) * 4
        page.data[i] = 20
        page.data[i + 1] = 20
        page.data[i + 2] = 20
      }
    }
  }
  return page
}

describe('fitSize (D10)', () => {
  it('caps the long side at 2400 px', () => {
    expect(fitSize(4000, 3000)).toEqual({ width: 2400, height: 1800 })
    expect(fitSize(3000, 4000)).toEqual({ width: 1800, height: 2400 })
  })

  it('doubles a short side under 800 px', () => {
    expect(fitSize(1000, 600)).toEqual({ width: 2000, height: 1200 })
  })

  it('never doubles past the cap', () => {
    expect(fitSize(2000, 700)).toEqual({ width: 2000, height: 700 })
  })

  it('leaves an ordinary size alone', () => {
    expect(fitSize(1200, 1600)).toEqual({ width: 1200, height: 1600 })
  })
})

describe('resize', () => {
  it('keeps a solid colour solid', () => {
    const out = resize(solid(10, 10, [30, 60, 90]), 25, 7)
    expect(out.width).toBe(25)
    expect(out.height).toBe(7)
    expect(Array.from(out.data.subarray(0, 4))).toEqual([30, 60, 90, 255])
    expect(Array.from(out.data.subarray(-4))).toEqual([30, 60, 90, 255])
  })
})

describe('toGrayscale (Rec. 601)', () => {
  it('weights red, green and blue 0.299, 0.587 and 0.114', () => {
    expect(toGrayscale(solid(1, 1, [255, 0, 0])).data[0]).toBe(76)
    expect(toGrayscale(solid(1, 1, [0, 255, 0])).data[0]).toBe(150)
    expect(toGrayscale(solid(1, 1, [0, 0, 255])).data[0]).toBe(29)
    expect(Array.from(toGrayscale(solid(1, 1, [100, 150, 200])).data)).toEqual([
      141, 141, 141, 255,
    ])
  })
})

describe('stretchContrast', () => {
  it('maps the 1st and 99th percentiles to black and white', () => {
    // 100 pixels: values 100..199.
    const data = new Uint8ClampedArray(400)
    for (let i = 0; i < 100; i++) {
      data.fill(100 + i, i * 4, i * 4 + 3)
      data[i * 4 + 3] = 255
    }
    const out = stretchContrast({ width: 100, height: 1, data })
    expect(out.data[0]).toBe(0) // 100 is the 1st percentile
    expect(out.data[98 * 4]).toBe(255) // 198 is the 99th
    expect(out.data[99 * 4]).toBe(255) // clamped above it
    // 149 is 49 steps above the 1st percentile, of 98.
    expect(out.data[49 * 4]).toBe(Math.round((49 * 255) / 98))
  })

  it('leaves a flat page flat', () => {
    const flat = solid(20, 20, [128, 128, 128])
    expect(stretchContrast(flat).data).toEqual(flat.data)
  })
})

describe('estimateSkew (D10)', () => {
  it.each([-7, -2, 0, 3, 12])('recovers %i° within 0.5°', (degrees) => {
    expect(
      Math.abs(estimateSkew(textPage(degrees)) - degrees),
    ).toBeLessThanOrEqual(0.5)
  })

  it('reads a blank page as straight', () => {
    expect(estimateSkew(solid(400, 600, [255, 255, 255]))).toBe(0)
  })
})

describe('rotate and straighten', () => {
  it('rotates in the sign estimateSkew measures', () => {
    const tilted = rotate(textPage(0), 4)
    expect(Math.abs(estimateSkew(tilted) - 4)).toBeLessThanOrEqual(0.5)
  })

  it('straightens a tilted page', () => {
    expect(Math.abs(estimateSkew(straighten(textPage(6))))).toBeLessThanOrEqual(
      0.5,
    )
  })

  it('leaves a page with less than 0.5° of skew alone', () => {
    const page = textPage(0)
    expect(straighten(page)).toBe(page)
  })
})

describe('preprocessPage', () => {
  it('scales, grays, stretches and straightens', () => {
    const out = preprocessPage(textPage(5, 700, 1000))
    // A short side under 800 px is doubled.
    expect(out.width).toBe(1400)
    expect(out.height).toBe(2000)
    expect(out.data[0]).toBe(out.data[1])
    expect(Math.abs(estimateSkew(out))).toBeLessThanOrEqual(0.5)
  })
})
