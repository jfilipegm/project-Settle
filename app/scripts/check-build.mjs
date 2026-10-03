/**
 * The build's reader check (M2.5 plan, P4, P10): `dist/` holds exactly one
 * ONNX Runtime wasm, the plain SIMD build under `vendor/ort/`, Vite emitted
 * no second copy (WebGPU, JSPI, asyncify or any other) into
 * `dist/assets/`, and no Tesseract file is left (retired in CP4). Runs
 * after `npm run build` (in CI too).
 *
 *   node scripts/check-build.mjs [<dist>]
 *
 * Exit code 0 is a pass, 1 a failure.
 */
import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const EXPECTED_ORT_WASM = 'vendor/ort/ort-wasm-simd-threaded.wasm'

/** Every file under `dir`, relative to it, with `/` separators. */
async function filesUnder(dir) {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true })
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) =>
      path
        .relative(dir, path.join(entry.parentPath, entry.name))
        .split(path.sep)
        .join('/'),
    )
    .sort()
}

/** The problems with `dist`'s reader files; none is a pass. */
export async function checkBuild(dist) {
  const all = await filesUnder(dist)
  const wasm = all.filter((file) => /(^|\/)ort-wasm[^/]*\.wasm$/.test(file))
  const problems = []
  if (!wasm.includes(EXPECTED_ORT_WASM)) {
    problems.push(`missing ${EXPECTED_ORT_WASM}`)
  }
  for (const file of wasm) {
    if (file !== EXPECTED_ORT_WASM) problems.push(`unexpected ${file}`)
  }
  for (const file of all) {
    if (/tesseract|traineddata/i.test(file)) {
      problems.push(`a Tesseract file: ${file}`)
    }
  }
  return problems
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dist =
    process.argv[2] ??
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist')
  const problems = await checkBuild(dist)
  if (problems.length > 0) {
    console.error(`check-build: ${problems.join('; ')}`)
    process.exit(1)
  }
  console.log(
    `check-build: one ONNX Runtime wasm, ${EXPECTED_ORT_WASM}; no Tesseract file`,
  )
}
