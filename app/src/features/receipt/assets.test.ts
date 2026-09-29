import { describe, expect, it } from 'vitest'
import {
  VENDOR_DIRECTORIES,
  VENDOR_FILES,
} from '../../../scripts/vendor-assets.mjs'
import {
  ASSETS,
  pdfDocumentOptions,
  tesseractWorkerOptions,
  zxingLocateFile,
} from './assets.ts'

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

  it('gives Tesseract same-origin paths and no blob worker (I-5)', () => {
    const options = tesseractWorkerOptions()
    expect(options).toEqual({
      workerPath: '/vendor/tesseract/worker.min.js',
      corePath: '/vendor/tesseract/core',
      langPath: '/vendor/tesseract/lang',
      workerBlobURL: false,
      gzip: true,
    })
    // getCore.js loads one of these three core builds from corePath.
    for (const core of [
      'tesseract-core-lstm.wasm.js',
      'tesseract-core-simd-lstm.wasm.js',
      'tesseract-core-relaxedsimd-lstm.wasm.js',
    ]) {
      expect(VENDOR_FILES.map((file) => file.to)).toContain(
        `tesseract/core/${core}`,
      )
    }
    for (const lang of ['por', 'eng']) {
      expect(VENDOR_FILES.map((file) => file.to)).toContain(
        `tesseract/lang/${lang}.traineddata.gz`,
      )
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
