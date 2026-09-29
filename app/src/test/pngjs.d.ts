// The part of pngjs (a dev dependency) the Node tests use: synchronous
// PNG encoding and decoding to RGBA.
declare module 'pngjs' {
  interface PngImage {
    width: number
    height: number
    data: Uint8Array
  }

  export const PNG: {
    sync: {
      read(buffer: Uint8Array): PngImage
      write(png: PngImage): Uint8Array
    }
  }
}
