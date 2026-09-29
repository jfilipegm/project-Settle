/**
 * D2's page encoder, browser version: a decoded page as a PNG `Blob`,
 * which Tesseract.js (and any later reader) accepts where raw RGBA isn't.
 * It sits outside the reader and is injected into it.
 */
import type { ReceiptPage } from './model.ts'

export async function encodePage(page: ReceiptPage): Promise<Blob> {
  const image = new ImageData(
    new Uint8ClampedArray(page.data),
    page.width,
    page.height,
  )
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
