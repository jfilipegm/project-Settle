import { describe, expect, it } from 'vitest'
import {
  VENDOR_DIRECTORIES,
  VENDOR_FILES,
} from '../../../scripts/vendor-assets.mjs'
import { ASSETS, pdfDocumentOptions, zxingLocateFile } from './assets.ts'

const VENDOR = '/vendor/'

describe('assets (D8)', () => {
  it('names only same-origin URLs under /vendor/', () => {
    for (const url of Object.values(ASSETS)) {
      expect(url.startsWith(VENDOR)).toBe(true)
      expect(url).not.toMatch(/^(?:[a-z]+:)?\/\//i)
    }
  })

  it('names only files the vendor script copies', () => {
    const files = VENDOR_FILES.map((file) => file.to)
    const directories = VENDOR_DIRECTORIES.map(
      (directory) => `${directory.to}/`,
    )
    for (const url of Object.values(ASSETS)) {
      const path = url.slice(VENDOR.length)
      const covered =
        files.includes(path) ||
        directories.includes(path) ||
        // A directory the vendor script fills file by file.
        files.some((file) => file.startsWith(`${path.replace(/\/$/, '')}/`))
      expect(covered, `${url} is not vendored`).toBe(true)
    }
  })

  it('vendors no Tesseract file any more (M2.5 plan, P10)', () => {
    for (const file of VENDOR_FILES) {
      expect(file.to).not.toMatch(/tesseract/i)
      expect(file.from).not.toMatch(/tesseract/i)
    }
  })

  it('gives pdf.js same-origin paths with eval off', () => {
    expect(pdfDocumentOptions()).toEqual({
      isEvalSupported: false,
      wasmUrl: '/vendor/pdfjs/wasm/',
      standardFontDataUrl: '/vendor/pdfjs/standard_fonts/',
    })
  })

  it('locates zxing’s wasm in /vendor/', () => {
    expect(zxingLocateFile('zxing_reader.wasm', 'https://cdn.example/')).toBe(
      '/vendor/zxing/zxing_reader.wasm',
    )
  })
})
