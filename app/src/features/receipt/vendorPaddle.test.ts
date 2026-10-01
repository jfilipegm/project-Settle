// @vitest-environment node
/**
 * vendor-paddle.mjs (M2.5 plan, P4, P5), with invented model files and a
 * fake download: pinned URLs, checksums, the cache, and only ONNX Runtime's
 * plain SIMD build copied.
 */
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  ORT_FILES,
  PADDLE_MODELS,
  PADDLE_REVISION,
  modelUrl,
  sha256,
  vendorPaddle,
} from '../../../scripts/vendor-paddle.mjs'

const nodeModules = path.resolve('node_modules')
const encoder = new TextEncoder()

const MODEL_BYTES = encoder.encode('an invented model')
const MODELS = [
  {
    path: 'models/det.onnx',
    to: 'paddle/det.onnx',
    sha256: sha256(MODEL_BYTES),
  },
]

let scratch = ''
let fetched: string[] = []

/** A fake mirror serving `body` for every URL. */
const mirror =
  (body: Uint8Array, status = 200) =>
  (url: string) => {
    fetched.push(url)
    return Promise.resolve(
      new Response(new Blob([body as Uint8Array<ArrayBuffer>]), { status }),
    )
  }

beforeEach(async () => {
  scratch = await mkdtemp(path.join(tmpdir(), 'settle-paddle-'))
  fetched = []
})

afterEach(async () => {
  await rm(scratch, { recursive: true, force: true })
})

const run = (fetchFile: (url: string) => Promise<Response>) =>
  vendorPaddle({
    nodeModules,
    cacheDir: path.join(scratch, 'cache'),
    outDir: path.join(scratch, 'out'),
    models: MODELS,
    fetchFile,
  })

describe('vendor-paddle.mjs', () => {
  it('pins every model to one commit revision and a SHA-256', () => {
    expect(PADDLE_REVISION).toMatch(/^[0-9a-f]{40}$/)
    for (const model of PADDLE_MODELS) {
      expect(model.sha256).toMatch(/^[0-9a-f]{64}$/)
      expect(modelUrl(model.path)).toContain(`/resolve/${PADDLE_REVISION}/`)
    }
    expect(PADDLE_MODELS.map((model) => model.to)).toEqual([
      'paddle/det.onnx',
      'paddle/rec.onnx',
      'paddle/dict.txt',
      'licenses/ppu-paddle-ocr-models-LICENSE.txt',
    ])
  })

  it('downloads a model, checks it, caches it and copies it', async () => {
    const { written, downloaded } = await run(mirror(MODEL_BYTES))
    expect(fetched).toEqual([modelUrl('models/det.onnx')])
    expect(downloaded).toEqual(['models/det.onnx'])
    expect(written).toContain('paddle/det.onnx')
    expect(
      await readFile(path.join(scratch, 'out/paddle/det.onnx'), 'utf8'),
    ).toBe('an invented model')
    expect(
      await readFile(path.join(scratch, 'cache/models/det.onnx'), 'utf8'),
    ).toBe('an invented model')
  })

  it('never downloads a cached, correct file again', async () => {
    await run(mirror(MODEL_BYTES))
    fetched = []
    const { downloaded } = await run(() => Promise.reject(new Error('offline')))
    expect(fetched).toEqual([])
    expect(downloaded).toEqual([])
  })

  it('fails a checksum mismatch, and caches nothing', async () => {
    await expect(run(mirror(encoder.encode('tampered')))).rejects.toThrow(
      /checksum mismatch for models\/det\.onnx/,
    )
    await expect(
      readdir(path.join(scratch, 'cache')).catch(() => []),
    ).resolves.toEqual([])
  })

  it('replaces a cached file whose hash is wrong', async () => {
    await mkdir(path.join(scratch, 'cache/models'), { recursive: true })
    await writeFile(path.join(scratch, 'cache/models/det.onnx'), 'stale')
    const { downloaded } = await run(mirror(MODEL_BYTES))
    expect(downloaded).toEqual(['models/det.onnx'])
  })

  it('fails a failed download, naming the URL', async () => {
    await expect(run(mirror(new Uint8Array(), 404))).rejects.toThrow(
      /models\/det\.onnx gave HTTP 404/,
    )
  })

  it('copies only ONNX Runtime’s plain SIMD build', async () => {
    await run(mirror(MODEL_BYTES))
    expect((await readdir(path.join(scratch, 'out/ort'))).sort()).toEqual([
      'ort-wasm-simd-threaded.mjs',
      'ort-wasm-simd-threaded.wasm',
    ])
    expect(ORT_FILES.map((file) => file.to)).toEqual([
      'ort/ort-wasm-simd-threaded.mjs',
      'ort/ort-wasm-simd-threaded.wasm',
    ])
  })

  it('fails, naming the file, when the runtime isn’t installed', async () => {
    await expect(
      vendorPaddle({
        nodeModules: scratch,
        cacheDir: path.join(scratch, 'cache'),
        outDir: path.join(scratch, 'out'),
        models: MODELS,
        fetchFile: mirror(MODEL_BYTES),
      }),
    ).rejects.toThrow(/onnxruntime-web\/dist\/ort-wasm-simd-threaded\.wasm/)
  })

  it('writes the licence notices', async () => {
    await run(mirror(MODEL_BYTES))
    const notice = await readFile(
      path.join(scratch, 'out/licenses/paddleocr-models-NOTICE.txt'),
      'utf8',
    )
    expect(notice).toContain('Apache-2.0')
    expect(notice).toContain(PADDLE_REVISION)
  })
})
