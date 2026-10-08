/**
 * The build's reader check (M2.5 plan, P4, P10): `dist/` holds exactly one
 * ONNX Runtime wasm, the plain SIMD build under `vendor/ort/`, Vite emitted
 * no second copy (WebGPU, JSPI, asyncify or any other) into
 * `dist/assets/`, and no Tesseract file is left (retired in CP4).
 *
 * And the font check (M3 plan, S4): every face in `src/styles/fonts.css`
 * is a woff2 file in `dist/assets/`, the built CSS points only at Settle's
 * own files (no `http:`, `https:` or `//` URL), and the woff2 files stay
 * within budget: all of them under 400 kB, and the latin ones, which are
 * all a first view can download, under 250 kB. Runs after `npm run build`
 * (in CI too).
 *
 *   node scripts/check-build.mjs [<dist>]
 *
 * Exit code 0 is a pass, 1 a failure.
 */
import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const EXPECTED_ORT_WASM = 'vendor/ort/ort-wasm-simd-threaded.wasm'

/** Each bundled face, as `<package>-<subset>-<weight>-normal` (S3, S4). */
export const EXPECTED_FONTS = [
  ['unbounded', [500, 600]],
  ['jetbrains-mono', [400, 500]],
  ['source-sans-3', [400, 600, 700]],
].flatMap(([family, weights]) =>
  weights.flatMap((weight) =>
    ['latin', 'latin-ext'].map(
      (subset) => `${family}-${subset}-${weight}-normal`,
    ),
  ),
)

/** Budgets in bytes (kB as Vite reports them, 1000 bytes). */
export const FONT_BUDGET = { all: 400_000, firstView: 250_000 }

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

/** A built woff2's face, without Vite's content hash. */
function fontStem(file) {
  return /([^/]+)-[\w-]{8}\.woff2$/.exec(file)?.[1] ?? null
}

/** The problems with `dist`'s fonts and their URLs; none is a pass. */
export async function checkFonts(dist) {
  const all = await filesUnder(dist)
  const problems = []
  const woff2 = all.filter((file) => file.endsWith('.woff2'))
  const stems = new Map(woff2.map((file) => [fontStem(file), file]))
  for (const face of EXPECTED_FONTS) {
    const file = stems.get(face)
    if (file === undefined) problems.push(`missing font ${face}`)
    else if (!file.startsWith('assets/')) {
      problems.push(`font outside assets/: ${file}`)
    }
  }
  for (const file of woff2) {
    if (!EXPECTED_FONTS.includes(fontStem(file))) {
      problems.push(`unexpected font ${file}`)
    }
  }

  for (const file of all.filter((name) => name.endsWith('.css'))) {
    const css = await readFile(path.join(dist, file), 'utf8')
    for (const [, raw] of css.matchAll(/url\(([^)]*)\)/g)) {
      const url = raw.trim().replace(/^['"]|['"]$/g, '')
      if (/^(https?:)?\/\//i.test(url)) {
        problems.push(`${file} loads ${url} from another origin`)
      } else if (url.endsWith('.woff2')) {
        const target = url.startsWith('/')
          ? url.slice(1)
          : path.posix.join(path.posix.dirname(file), url)
        if (!all.includes(target)) {
          problems.push(`${file} points at a missing ${url}`)
        }
      }
    }
  }

  const { all: allBytes, firstView } = await fontSizes(dist)
  if (allBytes > FONT_BUDGET.all) {
    problems.push(`fonts total ${allBytes} bytes, over ${FONT_BUDGET.all}`)
  }
  if (firstView > FONT_BUDGET.firstView) {
    problems.push(
      `first-view fonts total ${firstView} bytes, over ${FONT_BUDGET.firstView}`,
    )
  }
  return problems
}

/** The woff2 totals, for the report: all files and the latin ones. */
export async function fontSizes(dist) {
  const woff2 = (await filesUnder(dist)).filter((f) => f.endsWith('.woff2'))
  let all = 0
  let firstView = 0
  for (const file of woff2) {
    const { size } = await stat(path.join(dist, file))
    all += size
    if (!/latin-ext/.test(file)) firstView += size
  }
  return { all, firstView }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dist =
    process.argv[2] ??
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist')
  const problems = [...(await checkBuild(dist)), ...(await checkFonts(dist))]
  if (problems.length > 0) {
    console.error(`check-build: ${problems.join('; ')}`)
    process.exit(1)
  }
  const fonts = await fontSizes(dist)
  console.log(
    `check-build: one ONNX Runtime wasm, ${EXPECTED_ORT_WASM}; no Tesseract file; ` +
      `${EXPECTED_FONTS.length} same-origin woff2 fonts, ${fonts.all} bytes ` +
      `(${fonts.firstView} for a first view)`,
  )
}
