import { describe, expect, it } from 'vitest'
import { TALL_SCALE, fromCrop } from './paddleEngine.ts'

describe('fromCrop: a re-read tall box’s parts on the page (P15)', () => {
  it('maps a part of an enlarged crop back to the decoded page’s pixels', () => {
    // A crop at (100, 400) on the page, enlarged twice: a part found at
    // (20, 60), 180 × 40 on the crop is at (110, 430), 90 × 20 on the page.
    expect(
      fromCrop({ x: 20, y: 60, width: 180, height: 40 }, { x: 100, y: 400 }, 2),
    ).toEqual({ x: 110, y: 430, width: 90, height: 20 })
  })

  it('is the scale the engine enlarges by', () => {
    expect(TALL_SCALE).toBe(2)
    const part = { x: 0, y: 0, width: 2, height: 2 }
    expect(fromCrop(part, { x: 5, y: 7 }, TALL_SCALE)).toEqual({
      x: 5,
      y: 7,
      width: 1,
      height: 1,
    })
  })
})
