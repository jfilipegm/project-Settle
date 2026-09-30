// The part of pngjs (a dev dependency) the Node tests use: synchronous
// PNG encoding (from RGBA, or from one gray channel) and decoding to RGBA.
declare module 'pngjs' {
  interface PngImage {
    width: number
    height: number
    data: Uint8Array
  }

  /** PNG color types: 0 is grayscale, 6 (the default) RGBA. */
  interface PackerOptions {
    colorType?: 0 | 6
    inputColorType?: 0 | 6
  }

  export const PNG: {
    sync: {
      read(buffer: Uint8Array): PngImage
      write(png: PngImage, options?: PackerOptions): Uint8Array
    }
  }
}
