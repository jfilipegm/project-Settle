/**
 * File intake (M2 plan, CP2 and D16): what kind of file it is, by its
 * bytes; the 20 MB limit; and the pixel size from the header, so a page
 * over 40 megapixels is refused before anything is decoded.
 */
import type { ReadError } from './model.ts'

export type ReceiptFileType = 'jpeg' | 'png' | 'heic' | 'pdf'

/** D16: 20 MB. */
export const MAX_FILE_BYTES = 20 * 1024 * 1024

/**
 * D16: 40 megapixels. An RGBA bitmap of a 48-MP photo is about 190 MB,
 * too much for a phone (manual review M-O-3).
 */
export const MAX_PIXELS = 40_000_000

/** How much of the file the header checks read. */
export const HEADER_BYTES = 256 * 1024

const HEIC_BRANDS = ['heic', 'heix', 'heim', 'heis', 'mif1', 'msf1']
const AVIF_BRANDS = ['avif', 'avis']

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(start, start + length))
}

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  return signature.every((byte, i) => bytes[i] === byte)
}

function u32(bytes: Uint8Array, at: number): number {
  return (
    (bytes[at] ?? 0) * 2 ** 24 +
    (((bytes[at + 1] ?? 0) << 16) |
      ((bytes[at + 2] ?? 0) << 8) |
      (bytes[at + 3] ?? 0))
  )
}

function u16(bytes: Uint8Array, at: number): number {
  return ((bytes[at] ?? 0) << 8) | (bytes[at + 1] ?? 0)
}

/** An ISO BMFF `ftyp` box's major and compatible brands. */
function ftypBrands(
  bytes: Uint8Array,
): { major: string; compatible: string[] } | undefined {
  if (bytes.length < 16 || ascii(bytes, 4, 4) !== 'ftyp') {
    return undefined
  }
  const size = Math.min(u32(bytes, 0), bytes.length)
  const compatible: string[] = []
  for (let at = 16; at + 4 <= size; at += 4) {
    compatible.push(ascii(bytes, at, 4))
  }
  return { major: ascii(bytes, 8, 4), compatible }
}

function typeFromHint(hint: {
  type?: string
  name?: string
}): ReceiptFileType | undefined {
  const mime = (hint.type ?? '').toLowerCase()
  const extension = /\.([a-z0-9]+)$/i.exec(hint.name ?? '')?.[1]?.toLowerCase()
  if (mime === 'image/jpeg' || extension === 'jpg' || extension === 'jpeg') {
    return 'jpeg'
  }
  if (mime === 'image/png' || extension === 'png') {
    return 'png'
  }
  if (
    mime === 'image/heic' ||
    mime === 'image/heif' ||
    extension === 'heic' ||
    extension === 'heif'
  ) {
    return 'heic'
  }
  if (mime === 'application/pdf' || extension === 'pdf') {
    return 'pdf'
  }
  return undefined
}

/**
 * The file's type by its magic number: JPEG `FF D8 FF`, PNG
 * `89 50 4E 47`, PDF `%PDF-`, and HEIC/HEIF by the `ftyp` major brand. A
 * file whose major or compatible brands include `avif` is AVIF, which is
 * unsupported. Only when the bytes are inconclusive (too short to tell, or
 * an `ftyp` box whose brands are HEIF-family but not a known major brand)
 * does the MIME type or extension decide.
 */
export function sniffType(
  bytes: Uint8Array,
  hint: { type?: string; name?: string } = {},
): ReceiptFileType | 'unsupported' {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return 'jpeg'
  }
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47])) {
    return 'png'
  }
  if (ascii(bytes, 0, 5) === '%PDF-') {
    return 'pdf'
  }
  const brands = ftypBrands(bytes)
  if (brands !== undefined) {
    const all = [brands.major, ...brands.compatible]
    if (all.some((brand) => AVIF_BRANDS.includes(brand))) {
      return 'unsupported'
    }
    if (HEIC_BRANDS.includes(brands.major)) {
      return 'heic'
    }
    if (brands.compatible.some((brand) => HEIC_BRANDS.includes(brand))) {
      return typeFromHint(hint) === 'heic' ? 'heic' : 'unsupported'
    }
    return 'unsupported'
  }
  if (bytes.length < 12) {
    return typeFromHint(hint) ?? 'unsupported'
  }
  return 'unsupported'
}

export type CheckFileResult =
  | { ok: true; type: ReceiptFileType; header: Uint8Array }
  | { ok: false; error: ReadError }

/** D16: the 20 MB limit, then the supported types. */
export async function checkFile(
  file: Blob & { name?: string },
): Promise<CheckFileResult> {
  if (file.size > MAX_FILE_BYTES) {
    return { ok: false, error: { code: 'tooLarge' } }
  }
  const header = new Uint8Array(await file.slice(0, HEADER_BYTES).arrayBuffer())
  const type = sniffType(header, { type: file.type, name: file.name })
  return type === 'unsupported'
    ? { ok: false, error: { code: 'unsupportedType' } }
    : { ok: true, type, header }
}

export interface Dimensions {
  width: number
  height: number
}

function pngDimensions(bytes: Uint8Array): Dimensions | undefined {
  if (bytes.length < 24 || ascii(bytes, 12, 4) !== 'IHDR') {
    return undefined
  }
  return { width: u32(bytes, 16), height: u32(bytes, 20) }
}

// Start-of-frame markers: C0–CF, except DHT (C4), JPG (C8) and DAC (CC).
function isStartOfFrame(marker: number): boolean {
  return (
    marker >= 0xc0 &&
    marker <= 0xcf &&
    marker !== 0xc4 &&
    marker !== 0xc8 &&
    marker !== 0xcc
  )
}

function jpegDimensions(bytes: Uint8Array): Dimensions | undefined {
  let at = 2
  while (at + 4 <= bytes.length) {
    if (bytes[at] !== 0xff) {
      return undefined
    }
    let marker = bytes[at + 1] ?? 0
    while (marker === 0xff && at + 2 < bytes.length) {
      at += 1
      marker = bytes[at + 1] ?? 0
    }
    // Markers with no length.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      at += 2
      continue
    }
    if (marker === 0xda || marker === 0xd9) {
      return undefined // scan data before any frame header
    }
    const length = u16(bytes, at + 2)
    if (isStartOfFrame(marker)) {
      if (at + 9 > bytes.length) {
        return undefined
      }
      return { width: u16(bytes, at + 7), height: u16(bytes, at + 5) }
    }
    at += 2 + length
  }
  return undefined
}

/**
 * HEIC's `ispe` boxes. A photo is often a grid of tiles, each with its own
 * `ispe`, so the largest is the image's size.
 */
function heicDimensions(bytes: Uint8Array): Dimensions | undefined {
  let best: Dimensions | undefined
  for (let at = 4; at + 16 <= bytes.length; at++) {
    if (
      bytes[at] === 0x69 && // i
      bytes[at + 1] === 0x73 && // s
      bytes[at + 2] === 0x70 && // p
      bytes[at + 3] === 0x65 && // e
      u32(bytes, at - 4) === 20
    ) {
      const size = { width: u32(bytes, at + 8), height: u32(bytes, at + 12) }
      if (
        best === undefined ||
        size.width * size.height > best.width * best.height
      ) {
        best = size
      }
    }
  }
  return best
}

/**
 * The pixel size from the header, without decoding: PNG `IHDR`, JPEG's
 * first start-of-frame marker, HEIC's `ispe`. `undefined` when the header
 * can't say (truncated, or a HEIC with no `ispe`): the size is then checked
 * right after decoding.
 */
export function readDimensions(
  bytes: Uint8Array,
  type: ReceiptFileType,
): Dimensions | undefined {
  switch (type) {
    case 'png':
      return pngDimensions(bytes)
    case 'jpeg':
      return jpegDimensions(bytes)
    case 'heic':
      return heicDimensions(bytes)
    case 'pdf':
      return undefined
  }
}

/** D16: `tooManyPixels` for a page over 40 megapixels. */
export function checkPixels(size: Dimensions): ReadError | undefined {
  return size.width * size.height > MAX_PIXELS
    ? { code: 'tooManyPixels' }
    : undefined
}
