/**
 * The PaddleOCR reader's runtime files (M2.5 plan, P4, P5), served from the
 * app's own origin like the rest of `vendor/` (D8):
 *
 * - ONNX Runtime Web's plain SIMD build only (its `.mjs` loader and its
 *   wasm), from node_modules into `public/vendor/ort/`. No WebGPU, JSPI or
 *   asyncify build is copied;
 * - the PP-OCRv5 mobile detection model, the PP-OCRv5 Latin recognition
 *   model and its dictionary, into `public/vendor/paddle/`. They're
 *   downloaded from the `ppu-paddle-ocr` model mirror on Hugging Face,
 *   pinned to one commit revision in the URL and to a SHA-256 per file; a
 *   mismatch fails the script, and with it the build. Downloads are cached
 *   in the git-ignored `.paddle-models/` (and in CI by `actions/cache`), so
 *   a cached, correct file is never fetched again. Never committed.
 *
 * Runs after vendor-assets.mjs (which empties public/vendor/ first), as
 * predev, prebuild and prepreview, and as pretest, since the Node tests
 * read the models from public/vendor/paddle/.
 */
import { createHash } from 'node:crypto'
import {
  copyFile,
  mkdir,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** The mirror, at one pinned commit (2026-08-25). */
export const PADDLE_MIRROR =
  'https://huggingface.co/snowfluke/ppu-paddle-ocr-models'
export const PADDLE_REVISION = 'bf1d5edb0335d3262be7caf13f766ba274b4cadd'

/** Each downloaded file: its path in the mirror, where it goes, its hash. */
export const PADDLE_MODELS = [
  {
    path: 'detection/PP-OCRv5_mobile_det_infer.onnx',
    to: 'paddle/det.onnx',
    sha256: 'd7fe3ea74652890722c0f4d02458b7261d9f5ae6c92904d05707c9eb155c7924',
  },
  {
    path: 'recognition/multi/latin/v5/latin_PP-OCRv5_mobile_rec_infer.onnx',
    to: 'paddle/rec.onnx',
    sha256: '497dbed20b7fd86334c9deb5082c2958982a316bb16e3589ebc6502cd85cae79',
  },
  {
    path: 'recognition/multi/latin/v5/ppocrv5_latin_dict.txt',
    to: 'paddle/dict.txt',
    sha256: '7274e68c7675355e45dd75c360c83faa0d0624de33a704c799a7da8897662201',
  },
  // The mirror's licence (Apache-2.0), which the models are served under.
  {
    path: 'LICENSE',
    to: 'licenses/ppu-paddle-ocr-models-LICENSE.txt',
    sha256: 'c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4',
  },
]

/** ONNX Runtime Web's plain SIMD build: the only runtime files copied. */
export const ORT_FILES = [
  {
    from: 'onnxruntime-web/dist/ort-wasm-simd-threaded.mjs',
    to: 'ort/ort-wasm-simd-threaded.mjs',
  },
  {
    from: 'onnxruntime-web/dist/ort-wasm-simd-threaded.wasm',
    to: 'ort/ort-wasm-simd-threaded.wasm',
  },
]

/** Licence notes for what ships no licence file. */
export const PADDLE_NOTICES = [
  {
    to: 'licenses/onnxruntime-web-NOTICE.txt',
    text: `onnxruntime-web (ONNX Runtime Web), MIT licence

The plain SIMD WebAssembly build (vendor/ort/ort-wasm-simd-threaded.mjs and
.wasm), served unmodified. Copyright (c) Microsoft Corporation. The package
declares the MIT licence in package.json and ships no licence file.
Source: https://github.com/microsoft/onnxruntime
`,
  },
  {
    to: 'licenses/paddleocr-models-NOTICE.txt',
    text: `PaddleOCR models (PP-OCRv5 mobile text detection, PP-OCRv5 Latin text
recognition and its dictionary), Apache-2.0

From PaddleOCR (https://github.com/PaddlePaddle/PaddleOCR), converted to
ONNX by the ppu-paddle-ocr project and served from its mirror
(${PADDLE_MIRROR}, revision ${PADDLE_REVISION}), whose licence is
ppu-paddle-ocr-models-LICENSE.txt. Served unmodified, as vendor/paddle/.
`,
  },
]

export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

/** The pinned download URL of a mirror file. */
export function modelUrl(file) {
  return `${PADDLE_MIRROR}/resolve/${PADDLE_REVISION}/${file}`
}

async function readIfPresent(file) {
  try {
    return await readFile(file)
  } catch {
    return undefined
  }
}

async function isFile(file) {
  try {
    return (await stat(file)).isFile()
  } catch {
    return false
  }
}

/**
 * The model file's bytes: from the cache when its hash is right, otherwise
 * downloaded, checked and cached. A wrong hash is never cached.
 */
async function modelBytes(model, cacheDir, fetchFile) {
  const cached = path.join(cacheDir, model.path)
  const hit = await readIfPresent(cached)
  if (hit !== undefined && sha256(hit) === model.sha256) {
    return { bytes: hit, downloaded: false }
  }
  const url = modelUrl(model.path)
  const response = await fetchFile(url)
  if (!response.ok) {
    throw new Error(`vendor-paddle: ${url} gave HTTP ${response.status}`)
  }
  const bytes = Buffer.from(await response.arrayBuffer())
  const actual = sha256(bytes)
  if (actual !== model.sha256) {
    throw new Error(
      `vendor-paddle: checksum mismatch for ${model.path}: expected ${model.sha256}, got ${actual}`,
    )
  }
  await mkdir(path.dirname(cached), { recursive: true })
  await writeFile(cached, bytes)
  return { bytes, downloaded: true }
}

/**
 * Fills `outDir`'s `ort/` and `paddle/` (each emptied first) and the
 * licences. Throws, naming the file, on a missing runtime file, a failed
 * download or a checksum mismatch. Returns what was written and which
 * models were downloaded.
 */
export async function vendorPaddle({
  nodeModules,
  cacheDir,
  outDir,
  models = PADDLE_MODELS,
  fetchFile = (url) => fetch(url),
}) {
  const missing = []
  for (const { from } of ORT_FILES) {
    if (!(await isFile(path.join(nodeModules, from)))) missing.push(from)
  }
  if (missing.length > 0) {
    throw new Error(
      `vendor-paddle: missing source files:\n  ${missing.join('\n  ')}`,
    )
  }
  // Every model is fetched and checked before anything is replaced.
  const fetched = []
  for (const model of models) {
    fetched.push({ model, ...(await modelBytes(model, cacheDir, fetchFile)) })
  }

  await rm(path.join(outDir, 'ort'), { recursive: true, force: true })
  await rm(path.join(outDir, 'paddle'), { recursive: true, force: true })
  const written = []
  for (const { from, to } of ORT_FILES) {
    const target = path.join(outDir, to)
    await mkdir(path.dirname(target), { recursive: true })
    await copyFile(path.join(nodeModules, from), target)
    written.push(to)
  }
  for (const { model, bytes } of fetched) {
    const target = path.join(outDir, model.to)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, bytes)
    written.push(model.to)
  }
  for (const { to, text } of PADDLE_NOTICES) {
    const target = path.join(outDir, to)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, text)
    written.push(to)
  }
  return {
    written,
    downloaded: fetched
      .filter((entry) => entry.downloaded)
      .map((entry) => entry.model.path),
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const appDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
  )
  const { written, downloaded } = await vendorPaddle({
    nodeModules: path.join(appDir, 'node_modules'),
    cacheDir: path.join(appDir, '.paddle-models'),
    outDir: path.join(appDir, 'public', 'vendor'),
  })
  console.log(
    `vendor-paddle: ${written.length} files into public/vendor/` +
      (downloaded.length > 0 ? ` (downloaded ${downloaded.join(', ')})` : ''),
  )
}
