// Types for vendor-paddle.mjs, so the tests can import it.

export interface PaddleModel {
  path: string
  to: string
  sha256: string
}

export const PADDLE_MIRROR: string
export const PADDLE_REVISION: string
export const PADDLE_MODELS: PaddleModel[]
export const ORT_FILES: { from: string; to: string }[]
export const PADDLE_NOTICES: { to: string; text: string }[]

export function sha256(bytes: Uint8Array): string
export function modelUrl(file: string): string

export function vendorPaddle(options: {
  nodeModules: string
  cacheDir: string
  outDir: string
  models?: PaddleModel[]
  fetchFile?: (url: string) => Promise<Response>
}): Promise<{ written: string[]; downloaded: string[] }>
