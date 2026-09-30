/**
 * D2's page encoder, browser version: a decoded page, or a cleaned-up
 * one-channel strip (R2), as a PNG `Blob`, which Tesseract.js (and any
 * later reader) accepts where raw pixels aren't. It sits outside the reader
 * and is injected into it.
 */
import type { ReceiptPage } from './model.ts'
import type { GrayPage } from './preprocess.ts'

/** A page's pixels as RGBA; a one-channel page is expanded only here. */
export function rgbaOf(
  page: ReceiptPage | GrayPage,
): Uint8ClampedArray<ArrayBuffer> {
  if (!('channels' in page)) {
    return new Uint8ClampedArray(page.data)
  }
  const rgba = new Uint8ClampedArray(page.width * page.height * 4)
  for (let i = 0, o = 0; i < page.data.length; i++, o += 4) {
    const v = page.data[i] ?? 0
    rgba[o] = v
    rgba[o + 1] = v
    rgba[o + 2] = v
    rgba[o + 3] = 255
  }
  return rgba
}

export async function encodePage(page: ReceiptPage | GrayPage): Promise<Blob> {
  const image = new ImageData(rgbaOf(page), page.width, page.height)
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(page.width, page.height)
    const context = canvas.getContext('2d')
    if (context !== null) {
      context.putImageData(image, 0, 0)
      return canvas.convertToBlob({ type: 'image/png' })
    }
  }
  const canvas = document.createElement('canvas')
  canvas.width = page.width
  canvas.height = page.height
  const context = canvas.getContext('2d')
  if (context === null) {
    throw new Error('No 2D canvas to encode the page')
  }
  context.putImageData(image, 0, 0)
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob === null) {
        reject(new Error('The page could not be encoded'))
      } else {
        resolve(blob)
      }
    }, 'image/png')
  })
}
