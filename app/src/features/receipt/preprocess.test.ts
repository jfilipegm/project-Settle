import { describe, expect, it } from 'vitest'
import type { ReceiptPage } from './model.ts'
import {
  MAX_PAGE_PIXELS,
  MAX_PAGE_WIDTH,
  blur,
  cleanStrip,
  estimateSkew,
  estimateTextHeight,
  fitSize,
  flatten,
  grayPlane,
  preparePage,
  preprocessPage,
  resize,
  resizeRows,
  resizeToGrayscale,
  rotate,
  scaleFactor,
  straighten,
  stretchContrast,
  toGrayscale,
  workingCopy,
  type GrayPage,
} from './preprocess.ts'
import { STRIP_BUDGET, flattenRadius, planStrips } from './strips.ts'

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

function grayOf(width: number, height: number, values: number[]): GrayPage {
  return { channels: 1, width, height, data: Uint8ClampedArray.from(values) }
}

/** Sets an RGBA pixel to `v` in all three channels. */
function set(page: ReceiptPage, x: number, y: number, v: number) {
  if (x < 0 || y < 0 || x >= page.width || y >= page.height) return
  const i = (Math.round(y) * page.width + Math.round(x)) * 4
  page.data[i] = v
  page.data[i + 1] = v
  page.data[i + 2] = v
}

/**
 * A page of character-like glyphs `size` px tall (outlined boxes, 0.6×
 * as wide, strokes of about size/7), in lines `spacing` × their height
 * apart (1.8 by default),
 * each line tilted by `degrees` (the sign of `rotate`).
 */
function glyphPage(
  size: number,
  {
    width = 1200,
    height = 1600,
    degrees = 0,
    background = 255,
    spacing = 1.8,
  } = {},
): ReceiptPage {
  const page = solid(width, height, [background, background, background])
  const tan = Math.tan((degrees * Math.PI) / 180)
  const glyphWidth = Math.max(2, Math.round(size * 0.6))
  const stroke = Math.max(1, Math.round(size / 7))
  const margin = Math.max(20, size)
  for (let y0 = margin; y0 + size < height - margin; y0 += size * spacing) {
    for (
      let x0 = margin;
      x0 + glyphWidth < width - margin;
      x0 += glyphWidth + Math.max(2, size / 3)
    ) {
      const shift = (x0 - width / 2) * tan
      for (let dy = 0; dy < size; dy++) {
        for (let dx = 0; dx < glyphWidth; dx++) {
          const edge =
            dy < stroke ||
            dy >= size - stroke ||
            dx < stroke ||
            dx >= glyphWidth - stroke
          if (edge) set(page, x0 + dx, y0 + dy + shift + dx * tan, 30)
        }
      }
    }
  }
  return page
}

/** A dark grey table with a left-to-right shading gradient, under a page. */
function onTable(page: ReceiptPage): ReceiptPage {
  const width = page.width + 400
  const height = page.height + 400
  const out = solid(width, height, [0, 0, 0])
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const shade = 0.6 + (0.4 * x) / width
      const inside =
        x >= 200 && y >= 200 && x < page.width + 200 && y < page.height + 200
      const v = inside
        ? (page.data[((y - 200) * page.width + x - 200) * 4] ?? 0)
        : 110
      set(out, x, y, Math.round(v * shade))
    }
  }
  return out
}

/** A white page with a horizontal shading gradient and dark dashes. */
function shadedPage(width = 600, height = 400): GrayPage {
  const page = grayOf(width, height, [])
  page.data = new Uint8ClampedArray(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const background = 250 - (150 * x) / width
      const text = y % 40 >= 15 && y % 40 < 22 && x % 30 < 20
      page.data[y * width + x] = text ? background * 0.2 : background
    }
  }
  return page
}

// ---------------------------------------------------------------------------
// The old RGBA steps (D10), as references for the one-channel ones.

function rgbaToGrayscale(source: ReceiptPage): ReceiptPage {
  const out = solid(source.width, source.height, [0, 0, 0])
  for (let i = 0; i < source.data.length; i += 4) {
    const y = Math.round(
      (299 * (source.data[i] ?? 0) +
        587 * (source.data[i + 1] ?? 0) +
        114 * (source.data[i + 2] ?? 0)) /
        1000,
    )
    out.data[i] = y
    out.data[i + 1] = y
    out.data[i + 2] = y
  }
  return out
}

function channel(page: ReceiptPage): number[] {
  const values: number[] = []
  for (let i = 0; i < page.data.length; i += 4) values.push(page.data[i] ?? 0)
  return values
}

function maxDifference(a: ArrayLike<number>, b: ArrayLike<number>): number {
  expect(a.length).toBe(b.length)
  let most = 0
  for (let i = 0; i < a.length; i++) {
    most = Math.max(most, Math.abs((a[i] ?? 0) - (b[i] ?? 0)))
  }
  return most
}

describe('fitSize and scaleFactor (R1)', () => {
  const pixels = (s: { width: number; height: number }) => s.width * s.height

  it('enlarges a 223 × 1600 screenshot with 6-px text ×4', () => {
    expect(fitSize(223, 1600, 6)).toEqual({ width: 892, height: 6400 })
  })

  it('enlarges a 1536 × 2048 photo with 16-px text ×2, 12.6 MP', () => {
    expect(fitSize(1536, 2048, 16)).toEqual({ width: 3072, height: 4096 })
  })

  it('limits a page to 14 MP, even when it would enlarge', () => {
    expect(pixels(fitSize(1536, 2048, 10))).toBeLessThanOrEqual(MAX_PAGE_PIXELS)
    expect(pixels(fitSize(1536, 2048, 10))).toBeGreaterThan(13_990_000)
    // A 40-MP page with 40-px text, and one with 16-px text.
    for (const t of [40, 16]) {
      const size = fitSize(5000, 8000, t)
      expect(pixels(size)).toBeLessThanOrEqual(MAX_PAGE_PIXELS)
      expect(pixels(size)).toBeGreaterThan(13_990_000)
    }
  })

  it('leaves text of 24–64 px alone on a page read in one strip', () => {
    expect(fitSize(1000, 1400, 30)).toEqual({ width: 1000, height: 1400 })
  })

  it('halves a 2000 × 3000 page with 120-px text', () => {
    expect(fitSize(2000, 3000, 120)).toEqual({ width: 1000, height: 1500 })
  })

  it('leaves a 3000 × 4000 page with 40-px text as it is (12 MP)', () => {
    expect(fitSize(3000, 4000, 40)).toEqual({ width: 3000, height: 4000 })
  })

  it('shrinks the same page with 64-px text to 32-px text', () => {
    expect(fitSize(3000, 4000, 64)).toEqual({ width: 1500, height: 2000 })
  })

  it('keeps a page within 4000 px wide', () => {
    expect(fitSize(4000, 3000, 20)).toEqual({ width: 4000, height: 3000 })
    expect(fitSize(6000, 2000, 30)).toEqual({ width: 4000, height: 1333 })
  })

  it('falls back to D10 with no estimate, or under a factor of 0.2', () => {
    expect(fitSize(4000, 3000)).toEqual({ width: 2400, height: 1800 })
    expect(fitSize(3000, 4000)).toEqual({ width: 1800, height: 2400 })
    expect(fitSize(1000, 600)).toEqual({ width: 2000, height: 1200 })
    expect(fitSize(2000, 700)).toEqual({ width: 2000, height: 700 })
    expect(fitSize(1200, 1600)).toEqual({ width: 1200, height: 1600 })
    // 40 MP with 200-px text: 32 / 200 = 0.16.
    expect(fitSize(4000, 10_000, 200)).toEqual(fitSize(4000, 10_000))
  })

  it('gives t ≤ 40 and W ≤ 4000 to every page read in strips', () => {
    for (const [w, h] of [
      [223, 1600],
      [1536, 2048],
      [3000, 4000],
      [4000, 3000],
      [6000, 2000],
      [5000, 8000],
      [2000, 20_000],
      [800, 12_000],
    ] as const) {
      for (let t = 3; t <= 150; t += 1) {
        const size = fitSize(w, h, t)
        if (pixels(size) <= STRIP_BUDGET) continue
        const factor = scaleFactor(w, h, t)
        expect(t * factor, `${w}×${h}, t ${t}`).toBeLessThanOrEqual(40.0001)
        expect(size.width).toBeLessThanOrEqual(MAX_PAGE_WIDTH)
        expect(pixels(size)).toBeLessThanOrEqual(MAX_PAGE_PIXELS)
      }
    }
  })
})

describe('estimateTextHeight (R1)', () => {
  it.each([
    [6, 300],
    [12, 1200],
    [30, 1200],
    [90, 1200],
  ])('measures %i-px characters within 15 %%', (size, width) => {
    const t = estimateTextHeight(glyphPage(size, { width }))
    expect(t).toBeDefined()
    expect(Math.abs((t ?? 0) - size) / size).toBeLessThanOrEqual(0.15)
  })

  it('measures them tilted 2°, and on a shaded dark table', () => {
    for (const page of [
      glyphPage(12, { degrees: 2 }),
      onTable(glyphPage(12, { degrees: 2 })),
      onTable(glyphPage(30, { degrees: 2 })),
    ]) {
      const t = estimateTextHeight(page)
      const size = page.width > 1200 && t !== undefined && t > 20 ? 30 : 12
      expect(Math.abs((t ?? 0) - size) / size).toBeLessThanOrEqual(0.15)
    }
  })

  it('gives no estimate for a blank page or a page of noise', () => {
    expect(
      estimateTextHeight(solid(800, 1000, [255, 255, 255])),
    ).toBeUndefined()
    const noise = solid(800, 1000, [0, 0, 0])
    let seed = 1
    for (let i = 0; i < noise.data.length; i += 4) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      noise.data.fill(seed % 256, i, i + 3)
    }
    expect(estimateTextHeight(noise)).toBeUndefined()
  })
})

describe('estimateSkew and rotate', () => {
  it.each([-7, -2, 0, 3, 12])('recovers %i° within 0.5°', (degrees) => {
    const page = toGrayscale(glyphPage(12, { degrees }))
    expect(Math.abs(estimateSkew(page) - degrees)).toBeLessThanOrEqual(0.5)
  })

  it('reads a blank page as straight', () => {
    expect(estimateSkew(toGrayscale(solid(400, 600, [255, 255, 255])))).toBe(0)
  })

  it('measures the tilt on the coarsely flattened copy of a page on a table', () => {
    const page = onTable(glyphPage(12, { degrees: 2 }))
    expect(
      Math.abs(estimateSkew(workingCopy(page).copy) - 2),
    ).toBeLessThanOrEqual(0.5)
  })

  it('rotates in the sign estimateSkew measures, and straightens', () => {
    const tilted = rotate(toGrayscale(glyphPage(12)), 4)
    expect(Math.abs(estimateSkew(tilted) - 4)).toBeLessThanOrEqual(0.5)
    expect(Math.abs(estimateSkew(straighten(tilted)))).toBeLessThanOrEqual(0.5)
    const straight = toGrayscale(glyphPage(12))
    expect(straighten(straight)).toBe(straight)
  })
})

describe('flatten (R2)', () => {
  it('evens out a shading gradient and keeps the text dark', () => {
    const page = shadedPage()
    const spread = (p: GrayPage, pick: (x: number, y: number) => boolean) => {
      let low = 255
      let high = 0
      for (let y = 40; y < p.height - 40; y++) {
        for (let x = 40; x < p.width - 40; x++) {
          if (!pick(x, y)) continue
          const v = p.data[y * p.width + x] ?? 0
          low = Math.min(low, v)
          high = Math.max(high, v)
        }
      }
      return { low, high }
    }
    const isBackground = (_x: number, y: number) => y % 40 >= 30
    const before = spread(page, isBackground)
    const flat = flatten(page, 45)
    const after = spread(flat, isBackground)
    expect(before.high - before.low).toBeGreaterThan(100)
    expect(after.high - after.low).toBeLessThanOrEqual(10)
    const text = spread(
      flat,
      (x, y) => y % 40 >= 16 && y % 40 < 21 && x % 30 < 19 && x % 30 > 0,
    )
    expect(text.high).toBeLessThan(120)
    expect(flat.width).toBe(page.width)
    expect(flat.height).toBe(page.height)
  })

  it('keeps a white page white', () => {
    const white = grayOf(50, 40, new Array<number>(2000).fill(255))
    expect(Array.from(flatten(white, 15).data)).toEqual(Array.from(white.data))
  })

  it('gives a strip flattened with a 3r margin exactly the whole page’s pixels', () => {
    const page = shadedPage(300, 900)
    const r = 20
    const whole = flatten(page, r)
    const rows = (p: GrayPage, from: number, to: number) =>
      Array.from(p.data.subarray(from * p.width, to * p.width))
    const cut = (from: number, to: number): GrayPage => ({
      channels: 1,
      width: page.width,
      height: to - from,
      data: page.data.slice(from * page.width, to * page.width),
    })
    // Core rows 300–600, with a margin of 3r, then of only r.
    const withMargin = flatten(cut(300 - 3 * r, 600 + 3 * r), r)
    expect(rows(withMargin, 3 * r, 3 * r + 300)).toEqual(rows(whole, 300, 600))
    const thin = flatten(cut(300 - r, 600 + r), r)
    expect(rows(thin, r, r + 300)).not.toEqual(rows(whole, 300, 600))
  })

  it('gives the same rows when a strip is scaled on the page’s grid', () => {
    const page = shadedPage(200, 300)
    const [width, height] = [500, 750]
    const r = 20
    const whole = flatten(resizeRows(page, width, height), r)
    const [top, bottom] = [300, 450]
    const strip = flatten(
      resizeRows(page, width, height, top - 3 * r, bottom + 3 * r),
      r,
    )
    const core = Array.from(
      strip.data.subarray(3 * r * width, (3 * r + bottom - top) * width),
    )
    expect(core).toEqual(
      Array.from(whole.data.subarray(top * width, bottom * width)),
    )
    // Scaling the strip's own crop by its own ratio doesn't line up.
    const crop: GrayPage = {
      channels: 1,
      width: page.width,
      height: 60,
      data: page.data.slice(120 * page.width, 180 * page.width),
    }
    const own = resizeRows(crop, width, 150)
    expect(Array.from(own.data)).not.toEqual(
      Array.from(resizeRows(page, width, height, top, bottom).data),
    )
  })
})

describe('the one-channel steps', () => {
  const photo = () => {
    const page = glyphPage(12, { width: 200, height: 160, degrees: 3 })
    for (let i = 0; i < page.data.length; i += 4) {
      page.data[i] = ((page.data[i] ?? 0) + (i % 97)) % 256
      page.data[i + 2] = ((page.data[i + 2] ?? 0) + (i % 53)) % 256
    }
    return page
  }

  it('grays as Rec. 601: 0.299, 0.587 and 0.114', () => {
    const one = (rgb: [number, number, number]) =>
      toGrayscale(solid(1, 1, rgb)).data[0]
    expect(one([255, 0, 0])).toBe(76)
    expect(one([0, 255, 0])).toBe(150)
    expect(one([0, 0, 255])).toBe(29)
    expect(one([100, 150, 200])).toBe(141)
    expect(
      maxDifference(
        toGrayscale(photo()).data,
        channel(rgbaToGrayscale(photo())),
      ),
    ).toBe(0)
  })

  it('resizes and grays in one pass like the RGBA steps in turn', () => {
    for (const [w, h] of [
      [120, 96],
      [450, 360],
    ] as const) {
      const old = channel(rgbaToGrayscale(resize(photo(), w, h)))
      expect(
        maxDifference(resizeToGrayscale(photo(), w, h).data, old),
      ).toBeLessThanOrEqual(1)
      const grayFirst = resizeRows(toGrayscale(photo()), w, h)
      expect(maxDifference(grayFirst.data, old)).toBeLessThanOrEqual(1)
    }
  })

  it('stretches the contrast between the 1st and 99th percentiles', () => {
    const page = grayOf(
      100,
      1,
      Array.from({ length: 100 }, (_, i) => 100 + i),
    )
    const out = stretchContrast(page)
    expect(out.data[0]).toBe(0)
    expect(out.data[98]).toBe(255)
    expect(out.data[99]).toBe(255)
    expect(out.data[49]).toBe(Math.round((49 * 255) / 98))
    const flat = grayOf(20, 20, new Array<number>(400).fill(128))
    expect(stretchContrast(flat)).toBe(flat)
  })

  it('blurs a solid page to itself', () => {
    const page = grayOf(30, 20, new Array<number>(600).fill(90))
    expect(Array.from(blur(page, 5).data)).toEqual(Array.from(page.data))
  })
})

describe('which pages are flattened (R2, as decided in CP1)', () => {
  it('flattens a page on a shaded table, and not a clean one', () => {
    // Lines 3× their height apart: about a receipt's density of ink.
    const receipt = (size: number, width = 1200, height = 1600) =>
      glyphPage(size, { width, height, spacing: 3 })
    expect(workingCopy(onTable(receipt(12))).uneven).toBe(true)
    expect(workingCopy(receipt(12)).uneven).toBe(false)
    expect(workingCopy(receipt(30)).uneven).toBe(false)
    expect(workingCopy(receipt(6, 223, 1600)).uneven).toBe(false)
  })

  it('leaves a clean page’s strip unflattened, only stretched', async () => {
    const page = glyphPage(30, { width: 600, height: 800, spacing: 3 })
    const prepared = await preparePage(page)
    expect(prepared.flatten).toBe(false)
    const [strip] = planStrips(
      prepared.width,
      prepared.height,
      prepared.textHeight,
    )
    if (strip === undefined) throw new Error('no strip')
    expect(Array.from((await cleanStrip(prepared, strip)).data)).toEqual(
      Array.from(stretchContrast(prepared.plane).data),
    )
  })
})

describe('preprocessPage (R1, R2, R20)', () => {
  async function strips(page: ReceiptPage, stripPixels?: number) {
    const out = []
    for await (const strip of preprocessPage(page, { stripPixels })) {
      out.push(strip)
    }
    return out
  }

  it('reads a small screenshot as one strip, enlarged ×4', async () => {
    const out = await strips(glyphPage(6, { width: 200, height: 1000 }))
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ top: 0, ownTop: 0, index: 0, count: 1 })
    expect(out[0]?.image).toMatchObject({
      channels: 1,
      width: 800,
      height: 4000,
    })
    expect(out[0]?.ownBottom).toBe(4000)
  })

  it('cuts a large page into strips that tile it, and straightens it', async () => {
    const page = glyphPage(10, { width: 900, height: 1300, degrees: 2 })
    const out = await strips(page)
    const prepared = await preparePage(page)
    expect(prepared.width * prepared.height).toBeGreaterThan(STRIP_BUDGET)
    expect(out.length).toBeGreaterThan(1)
    expect(out[0]?.ownTop).toBe(0)
    expect(out.at(-1)?.ownBottom).toBe(prepared.height)
    for (const [i, strip] of out.entries()) {
      expect(strip.image.width).toBe(prepared.width)
      expect(strip.image.width * strip.image.height).toBeLessThanOrEqual(
        STRIP_BUDGET,
      )
      expect(strip.count).toBe(out.length)
      expect(strip.index).toBe(i)
      if (i > 0) expect(strip.ownTop).toBe(out[i - 1]?.ownBottom)
    }
    expect(Math.abs(estimateSkew(prepared.plane))).toBeLessThanOrEqual(0.5)
  })

  it('gives each strip exactly the rows of the whole page flattened', async () => {
    const page = onTable(glyphPage(10, { width: 700, height: 1000 }))
    const prepared = await preparePage(page)
    expect(prepared.flatten).toBe(true)
    const r = flattenRadius(prepared.width, prepared.textHeight)
    const whole = flatten(
      resizeRows(prepared.plane, prepared.width, prepared.height),
      r,
    )
    for (const strip of planStrips(
      prepared.width,
      prepared.height,
      prepared.textHeight,
    )) {
      const clean = await cleanStrip(prepared, strip)
      const core: GrayPage = {
        channels: 1,
        width: prepared.width,
        height: strip.bottom - strip.top,
        data: whole.data.slice(
          strip.top * prepared.width,
          strip.bottom * prepared.width,
        ),
      }
      expect(maxDifference(clean.data, stretchContrast(core).data)).toBe(0)
    }
  })

  it('shrinks and grays in one pass, never at the source’s size', async () => {
    const page = glyphPage(120, { width: 2000, height: 3000 })
    const prepared = await preparePage(page)
    expect(prepared).toMatchObject({ width: 1000, height: 1500 })
    expect(prepared.plane).toMatchObject({ width: 1000, height: 1500 })
    // Enlarging keeps the source's size: the scaling is per strip.
    const small = glyphPage(6, { width: 200, height: 300 })
    expect(grayPlane(small, { width: 800, height: 1200 })).toMatchObject({
      width: 200,
      height: 300,
    })
  })

  it('stops at the next step when the signal aborts', async () => {
    const controller = new AbortController()
    const page = glyphPage(10, { width: 900, height: 1300 })
    const seen: number[] = []
    const run = (async () => {
      for await (const strip of preprocessPage(page, {
        signal: controller.signal,
      })) {
        seen.push(strip.index)
        controller.abort()
      }
    })()
    await expect(run).rejects.toThrow()
    expect(seen).toEqual([0])
  })
})
