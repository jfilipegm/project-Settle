import { describe, expect, it } from 'vitest'
import {
  MAX_FILE_BYTES,
  checkFile,
  checkPixels,
  readDimensions,
  sniffType,
} from './intake.ts'
import { readErrorMessage } from './messages.ts'
import { translator } from '../../i18n/t.ts'

const en = translator('en')

const bytes = (...values: number[]) => new Uint8Array(values)
const text = (value: string) => new TextEncoder().encode(value)

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, part) => n + part.length, 0))
  let at = 0
  for (const part of parts) {
    out.set(part, at)
    at += part.length
  }
  return out
}

function u32(value: number): Uint8Array {
  return bytes(
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  )
}

function u16(value: number): Uint8Array {
  return bytes((value >>> 8) & 0xff, value & 0xff)
}

function png(width: number, height: number): Uint8Array {
  return concat(
    bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a),
    u32(13),
    text('IHDR'),
    u32(width),
    u32(height),
    bytes(8, 6, 0, 0, 0),
  )
}

/** A JPEG header: SOI, JFIF APP0, an EXIF-sized APP1, then a frame. */
function jpeg(width: number, height: number, frame = 0xc0): Uint8Array {
  const app1 = new Uint8Array(1000).fill(0x41)
  return concat(
    bytes(0xff, 0xd8),
    bytes(0xff, 0xe0),
    u16(16),
    text('JFIF\0'),
    bytes(1, 1, 0, 0, 1, 0, 1, 0, 0),
    bytes(0xff, 0xe1),
    u16(app1.length + 2),
    app1,
    bytes(0xff, 0xdb),
    u16(4),
    bytes(0, 0),
    bytes(0xff, frame),
    u16(17),
    bytes(8),
    u16(height),
    u16(width),
    bytes(3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1),
    bytes(0xff, 0xda),
  )
}

function ftyp(major: string, ...compatible: string[]): Uint8Array {
  return concat(
    u32(16 + 4 * compatible.length),
    text('ftyp'),
    text(major),
    u32(0),
    ...compatible.map(text),
  )
}

function ispe(width: number, height: number): Uint8Array {
  return concat(u32(20), text('ispe'), u32(0), u32(width), u32(height))
}

function heic(...sizes: [number, number][]): Uint8Array {
  return concat(
    ftyp('heic', 'mif1', 'heic'),
    u32(0),
    text('meta'),
    u32(0),
    ...sizes.map(([width, height]) => ispe(width, height)),
  )
}

describe('sniffType', () => {
  it('reads each supported magic number', () => {
    expect(sniffType(jpeg(10, 10))).toBe('jpeg')
    expect(sniffType(png(10, 10))).toBe('png')
    expect(sniffType(text('%PDF-1.7\n%âãÏÓ'))).toBe('pdf')
    for (const brand of ['heic', 'heix', 'heim', 'heis', 'mif1', 'msf1']) {
      expect(sniffType(ftyp(brand, 'mif1'))).toBe('heic')
    }
  })

  it('believes the bytes over the name: a .jpg that is really a PDF is a PDF', () => {
    expect(
      sniffType(text('%PDF-1.4\n1 0 obj'), {
        name: 'receipt.jpg',
        type: 'image/jpeg',
      }),
    ).toBe('pdf')
  })

  it('refuses a GIF, and a text file named .png', () => {
    expect(sniffType(text('GIF89a\x01\x00\x01\x00'), { name: 'a.gif' })).toBe(
      'unsupported',
    )
    expect(
      sniffType(text('this is a text file, not an image'), {
        name: 'receipt.png',
        type: 'image/png',
      }),
    ).toBe('unsupported')
  })

  it('refuses AVIF (major brand avif, compatible mif1)', () => {
    expect(sniffType(ftyp('avif', 'mif1', 'miaf'))).toBe('unsupported')
    expect(sniffType(ftyp('mif1', 'avif'))).toBe('unsupported')
  })

  it('falls back to the MIME type or extension only when the bytes are inconclusive', () => {
    expect(sniffType(bytes(1, 2, 3), { name: 'scan.PDF' })).toBe('pdf')
    expect(sniffType(new Uint8Array(0), { type: 'image/heic' })).toBe('heic')
    // An ftyp box with HEIF-family compatible brands but an unknown major.
    expect(sniffType(ftyp('xyzw', 'mif1'), { name: 'IMG_0001.HEIC' })).toBe(
      'heic',
    )
    expect(sniffType(ftyp('xyzw', 'mif1'), { name: 'video.mp4' })).toBe(
      'unsupported',
    )
    expect(sniffType(ftyp('isom', 'mp41'), { name: 'photo.heic' })).toBe(
      'unsupported',
    )
  })
})

describe('checkFile', () => {
  it('refuses a file over 20 MB', async () => {
    const file = new File([new Uint8Array(MAX_FILE_BYTES + 1)], 'big.jpg')
    expect(await checkFile(file)).toEqual({
      ok: false,
      error: { code: 'tooLarge' },
    })
  })

  it('accepts exactly 20 MB', async () => {
    const data = new Uint8Array(MAX_FILE_BYTES)
    data.set(jpeg(10, 10))
    const result = await checkFile(new File([data], 'ok.jpg'))
    expect(result).toMatchObject({ ok: true, type: 'jpeg' })
  })

  it('refuses an unsupported type', async () => {
    const file = new File([text('GIF89a\x01\x00\x01\x00')], 'a.gif')
    expect(await checkFile(file)).toEqual({
      ok: false,
      error: { code: 'unsupportedType' },
    })
  })
})

describe('readDimensions', () => {
  it('reads PNG, baseline and progressive JPEG, and HEIC headers', () => {
    expect(readDimensions(png(1200, 1600), 'png')).toEqual({
      width: 1200,
      height: 1600,
    })
    expect(readDimensions(jpeg(3024, 4032), 'jpeg')).toEqual({
      width: 3024,
      height: 4032,
    })
    expect(readDimensions(jpeg(640, 480, 0xc2), 'jpeg')).toEqual({
      width: 640,
      height: 480,
    })
    // A grid photo: the tiles' ispe and the image's; the largest wins.
    expect(readDimensions(heic([512, 512], [4032, 3024]), 'heic')).toEqual({
      width: 4032,
      height: 3024,
    })
  })

  it('finds 50-MP PNG and JPEG headers too many pixels', () => {
    for (const header of [
      readDimensions(png(10_000, 5_000), 'png'),
      readDimensions(jpeg(10_000, 5_000), 'jpeg'),
    ]) {
      expect(header).toEqual({ width: 10_000, height: 5_000 })
      expect(checkPixels(header ?? { width: 0, height: 0 })).toEqual({
        code: 'tooManyPixels',
      })
    }
    expect(checkPixels({ width: 8000, height: 5000 })).toBeUndefined()
  })

  it('says nothing for a truncated header', () => {
    expect(readDimensions(png(10, 10).subarray(0, 20), 'png')).toBeUndefined()
    expect(
      readDimensions(jpeg(10, 10).subarray(0, 600), 'jpeg'),
    ).toBeUndefined()
    expect(readDimensions(ftyp('heic', 'mif1'), 'heic')).toBeUndefined()
  })
})

describe('read error messages', () => {
  it('tells the user how to fix tooManyPixels (R2-O-6)', () => {
    expect(readErrorMessage(en, 'tooManyPixels')).toBe(
      'This photo is too large to read. Take the photo at normal resolution, or crop it. You can type the items in below.',
    )
  })

  it('points every error at the manual editor', () => {
    for (const code of [
      'unsupportedType',
      'tooLarge',
      'tooManyPixels',
      'decodeFailed',
      'ocrFailed',
      'assetsUnavailable',
      'readerUnsupported',
      'noItems',
      'cancelled',
    ] as const) {
      expect(readErrorMessage(en, code)).toMatch(
        / You can type the items in below\.$/,
      )
    }
  })

  it('says a browser that can’t read images isn’t a connection problem (M2.5, P16)', () => {
    expect(readErrorMessage(en, 'readerUnsupported')).toBe(
      'This file has to be read as an image, and this browser can’t read images. A PDF receipt with selectable text works. You can type the items in below.',
    )
    expect(readErrorMessage(en, 'assetsUnavailable')).toBe(
      'The receipt reader couldn’t load. Check your connection: the first scan downloads it. You can type the items in below.',
    )
  })
})
