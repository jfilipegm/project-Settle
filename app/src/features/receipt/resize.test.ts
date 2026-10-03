import { describe, expect, it } from 'vitest'
import { resize } from './resize.ts'

describe('resize', () => {
  const page = {
    width: 2,
    height: 1,
    data: new Uint8ClampedArray([0, 0, 0, 255, 200, 200, 200, 255]),
  }

  it('returns the page itself at its own size', () => {
    expect(resize(page, 2, 1)).toBe(page)
  })

  it('resamples bilinearly', () => {
    const wider = resize(page, 4, 1)
    expect(wider.width).toBe(4)
    expect(Array.from(wider.data.filter((_, i) => i % 4 === 0))).toEqual([
      0, 50, 150, 200,
    ])
  })
})
