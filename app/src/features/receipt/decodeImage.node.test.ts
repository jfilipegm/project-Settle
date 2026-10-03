// @vitest-environment node
/**
 * The Node JPEG decoder (M2.5 plan, CP1), on invented images: each EXIF
 * orientation comes out upright, and a camera-sized photo decodes within
 * the intake limits.
 */
import jpeg from 'jpeg-js'
import { describe, expect, it } from 'vitest'
import {
  applyOrientation,
  decodeImageNode,
  decodeJpegNode,
  readJpegOrientation,
} from './decodeImage.node.ts'
import { encodePageNode } from './encodePage.node.ts'
import { checkPixels } from './intake.ts'

// The upright picture: four solid quadrants, so every turn and flip shows.
const W = 64
const H = 32
const COLORS = {
  topLeft: [255, 0, 0],
  topRight: [0, 255, 0],
  bottomLeft: [0, 0, 255],
  bottomRight: [255, 255, 255],
} as const

function uprightColor(x: number, y: number): readonly number[] {
  if (y < H / 2) return x < W / 2 ? COLORS.topLeft : COLORS.topRight
  return x < W / 2 ? COLORS.bottomLeft : COLORS.bottomRight
}

/**
 * Where stored pixel (column c, row r) sits in the upright picture, by the
 * EXIF definition of each orientation (what row 0 and column 0 show).
 */
function uprightOf(
  orientation: number,
  c: number,
  r: number,
): [number, number] {
  switch (orientation) {
    case 2: // row 0 top, column 0 right
      return [W - 1 - c, r]
    case 3: // row 0 bottom, column 0 right
      return [W - 1 - c, H - 1 - r]
    case 4: // row 0 bottom, column 0 left
      return [c, H - 1 - r]
    case 5: // row 0 left, column 0 top
      return [r, c]
    case 6: // row 0 right, column 0 top
      return [W - 1 - r, c]
    case 7: // row 0 right, column 0 bottom
      return [W - 1 - r, H - 1 - c]
    case 8: // row 0 left, column 0 bottom
      return [r, H - 1 - c]
    default:
      return [c, r]
  }
}

/** An APP1 segment holding only the orientation tag. */
function exifSegment(orientation: number, little: boolean): Uint8Array {
  const tiff = new DataView(new ArrayBuffer(26))
  tiff.setUint16(0, little ? 0x4949 : 0x4d4d)
  tiff.setUint16(2, 42, little)
  tiff.setUint32(4, 8, little)
  tiff.setUint16(8, 1, little) // one entry
  tiff.setUint16(10, 0x0112, little) // Orientation
  tiff.setUint16(12, 3, little) // SHORT
  tiff.setUint32(14, 1, little)
  tiff.setUint16(18, orientation, little)
  tiff.setUint32(22, 0, little) // no next IFD
  const body = new Uint8Array([
    0x45,
    0x78,
    0x69,
    0x66,
    0,
    0,
    ...new Uint8Array(tiff.buffer),
  ])
  const length = body.length + 2
  return new Uint8Array([0xff, 0xe1, length >> 8, length & 0xff, ...body])
}

/** A JPEG of the picture stored for `orientation`, with its EXIF tag. */
function storedJpeg(orientation: number, little = false): Uint8Array {
  const swap = orientation >= 5
  const width = swap ? H : W
  const height = swap ? W : H
  const data = new Uint8Array(width * height * 4)
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const [x, y] = uprightOf(orientation, c, r)
      const [red, green, blue] = uprightColor(x, y)
      data.set([red ?? 0, green ?? 0, blue ?? 0, 255], (r * width + c) * 4)
    }
  }
  const encoded = jpeg.encode({ width, height, data }, 100).data
  const exif = exifSegment(orientation, little)
  // The EXIF segment goes right after the start-of-image marker.
  return new Uint8Array([
    ...encoded.subarray(0, 2),
    ...exif,
    ...encoded.subarray(2),
  ])
}

/** The colour at each quadrant's centre. */
function quadrants(page: {
  width: number
  height: number
  data: Uint8ClampedArray
}) {
  const at = (x: number, y: number) => {
    const i = (y * page.width + x) * 4
    return [page.data[i], page.data[i + 1], page.data[i + 2]].map(
      (value) => Math.round((value ?? 0) / 255) * 255,
    )
  }
  return {
    topLeft: at(W / 4, H / 4),
    topRight: at((3 * W) / 4, H / 4),
    bottomLeft: at(W / 4, (3 * H) / 4),
    bottomRight: at((3 * W) / 4, (3 * H) / 4),
  }
}

describe('decodeJpegNode (EXIF orientation applied)', () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8])(
    'turns orientation %i upright',
    (orientation) => {
      const bytes = storedJpeg(orientation)
      expect(readJpegOrientation(bytes)).toBe(orientation)
      const page = decodeJpegNode(bytes)
      expect([page.width, page.height]).toEqual([W, H])
      expect(quadrants(page)).toEqual(COLORS)
    },
  )

  it('reads a little-endian EXIF block too', () => {
    const bytes = storedJpeg(6, true)
    expect(readJpegOrientation(bytes)).toBe(6)
    expect(quadrants(decodeJpegNode(bytes))).toEqual(COLORS)
  })

  it('treats a JPEG with no EXIF as upright', () => {
    const data = new Uint8Array(W * H * 4).fill(200)
    const bytes = jpeg.encode({ width: W, height: H, data }, 90).data
    expect(readJpegOrientation(bytes)).toBe(1)
    expect(readJpegOrientation(new Uint8Array([1, 2, 3]))).toBe(1)
  })

  it('leaves orientation 1 and unknown values unchanged', () => {
    const page = { width: 1, height: 1, data: new Uint8ClampedArray(4) }
    expect(applyOrientation(page, 1)).toBe(page)
    expect(applyOrientation(page, 9)).toBe(page)
  })

  it('decodes a camera-sized photo (4000 × 3000) within the intake limits', () => {
    const width = 4000
    const height = 3000
    const data = new Uint8Array(width * height * 4)
    for (let i = 0; i < data.length; i += 4) {
      data[i] = (i >> 2) % 251
      data[i + 3] = 255
    }
    const encoded = jpeg.encode({ width, height, data }, 80).data
    const exif = exifSegment(6, false)
    const bytes = new Uint8Array(encoded.length + exif.length)
    bytes.set(encoded.subarray(0, 2))
    bytes.set(exif, 2)
    bytes.set(encoded.subarray(2), 2 + exif.length)
    const page = decodeJpegNode(bytes)
    expect([page.width, page.height]).toEqual([height, width])
    expect(page.data.length).toBe(width * height * 4)
    expect(checkPixels(page)).toBeUndefined()
  }, 120_000)
})

describe('decodeImageNode', () => {
  it('picks the decoder by the file name', async () => {
    const page = {
      width: 2,
      height: 1,
      data: new Uint8ClampedArray(8).fill(255),
    }
    const png = new Uint8Array(await encodePageNode(page))
    expect(decodeImageNode(png, 'receipt.png')).toMatchObject({
      width: 2,
      height: 1,
    })
    const jpg = jpeg.encode({
      width: 2,
      height: 1,
      data: new Uint8Array(8).fill(255),
    }).data
    expect(decodeImageNode(jpg, 'receipt.JPEG')).toMatchObject({
      width: 2,
      height: 1,
    })
  })
})
