/**
 * Copies the receipt import's runtime files from node_modules into
 * public/vendor/ (PaddleOCR's are `vendor-paddle.mjs`'s), so every worker, wasm, model and font is served from the
 * app's own origin and never from a CDN (M2 plan, D8). heic-to's CSP build
 * is copied unmodified, as its own file (D7, LGPL-3.0). Every source must
 * exist, or the script fails, and with it `npm run build`.
 *
 * Runs as predev, prebuild and prepreview. public/vendor/ is git-ignored.
 */
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** One file, from `node_modules/<from>` to `public/vendor/<to>`. */
export const VENDOR_FILES = [
  // zxing-wasm's reader (D5).
  {
    from: 'zxing-wasm/dist/reader/zxing_reader.wasm',
    to: 'zxing/zxing_reader.wasm',
  },
  // pdf.js's worker (D6).
  {
    from: 'pdfjs-dist/build/pdf.worker.min.mjs',
    to: 'pdfjs/pdf.worker.min.mjs',
  },
  // heic-to's CSP build, unmodified (D7).
  { from: 'heic-to/dist/csp/heic-to.js', to: 'heic-to/heic-to.js' },
]

/** Whole directories, file by file (each must hold at least one file). */
export const VENDOR_DIRECTORIES = [
  { from: 'pdfjs-dist/wasm', to: 'pdfjs/wasm' },
  { from: 'pdfjs-dist/standard_fonts', to: 'pdfjs/standard_fonts' },
]

/** Every vendored package, with its licence file(s) (M-I-3). */
export const VENDOR_PACKAGES = [
  {
    name: 'zxing-wasm',
    license: 'MIT',
    source: 'https://github.com/Sec-ant/zxing-wasm',
    licenseFiles: [
      { from: 'zxing-wasm/LICENSE', to: 'zxing-wasm-LICENSE.txt' },
    ],
  },
  {
    name: 'pdfjs-dist',
    license: 'Apache-2.0',
    source: 'https://github.com/mozilla/pdf.js',
    licenseFiles: [
      { from: 'pdfjs-dist/LICENSE', to: 'pdfjs-dist-LICENSE.txt' },
      {
        from: 'pdfjs-dist/standard_fonts/LICENSE_FOXIT',
        to: 'pdfjs-dist-standard_fonts-LICENSE_FOXIT.txt',
      },
      {
        from: 'pdfjs-dist/standard_fonts/LICENSE_LIBERATION',
        to: 'pdfjs-dist-standard_fonts-LICENSE_LIBERATION.txt',
      },
      {
        from: 'pdfjs-dist/wasm/LICENSE_JBIG2',
        to: 'pdfjs-dist-wasm-LICENSE_JBIG2.txt',
      },
      {
        from: 'pdfjs-dist/wasm/LICENSE_OPENJPEG',
        to: 'pdfjs-dist-wasm-LICENSE_OPENJPEG.txt',
      },
      {
        from: 'pdfjs-dist/wasm/LICENSE_QCMS',
        to: 'pdfjs-dist-wasm-LICENSE_QCMS.txt',
      },
    ],
  },
  {
    name: 'heic-to',
    license: 'LGPL-3.0',
    source: 'https://github.com/hoppergee/heic-to',
    // The full LGPL-3.0 text. libheif and libde265, which heic-to bundles,
    // are LGPL-3.0 too and ship no separate licence file in the package.
    licenseFiles: [{ from: 'heic-to/LICENSE', to: 'heic-to-LICENSE.txt' }],
  },
]

/**
 * Licence notes the script writes itself, for what the packages don't
 * ship as a file.
 */
export const GENERATED_NOTICES = [
  {
    to: 'heic-to-bundled-libraries-NOTICE.txt',
    text: `Libraries bundled inside heic-to's CSP build (vendor/heic-to/heic-to.js)

- libheif (https://github.com/strukturag/libheif), LGPL-3.0
- libde265 (https://github.com/strukturag/libde265), LGPL-3.0

The heic-to package ships no separate licence file for them; both are
under the LGPL-3.0, whose full text is in heic-to-LICENSE.txt. The LGPL-3.0
supplements the GNU GPL version 3: https://www.gnu.org/licenses/gpl-3.0.txt

vendor/heic-to/heic-to.js is heic-to's dist/csp/heic-to.js, copied byte
for byte and loaded as its own file, so it can be replaced with another
build of the same interface.
`,
  },
]

async function isFile(file) {
  try {
    return (await stat(file)).isFile()
  } catch {
    return false
  }
}

/** Reads a vendored package's installed version. */
export async function packageVersion(nodeModules, name) {
  const manifest = JSON.parse(
    await readFile(path.join(nodeModules, name, 'package.json'), 'utf8'),
  )
  return manifest.version
}

/**
 * Copies everything into `outDir` (emptied first). Throws, naming every
 * missing source, before copying anything if one is missing.
 */
export async function vendorAssets({ nodeModules, outDir }) {
  const copies = VENDOR_FILES.map(({ from, to }) => ({ from, to }))
  for (const directory of VENDOR_DIRECTORIES) {
    const entries = await readdir(path.join(nodeModules, directory.from), {
      withFileTypes: true,
    }).catch(() => [])
    const files = entries.filter((entry) => entry.isFile())
    if (files.length === 0) {
      copies.push({ from: directory.from, to: directory.to })
    }
    for (const file of files) {
      copies.push({
        from: `${directory.from}/${file.name}`,
        to: `${directory.to}/${file.name}`,
      })
    }
  }
  for (const pkg of VENDOR_PACKAGES) {
    for (const { from, to } of pkg.licenseFiles) {
      copies.push({ from, to: `licenses/${to}` })
    }
  }

  const missing = []
  for (const { from } of copies) {
    if (!(await isFile(path.join(nodeModules, from)))) {
      missing.push(from)
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `vendor-assets: missing source files:\n  ${missing.join('\n  ')}`,
    )
  }

  await rm(outDir, { recursive: true, force: true })
  for (const { from, to } of copies) {
    const target = path.join(outDir, to)
    await mkdir(path.dirname(target), { recursive: true })
    await copyFile(path.join(nodeModules, from), target)
  }
  for (const { to, text } of GENERATED_NOTICES) {
    const target = path.join(outDir, 'licenses', to)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, text)
  }
  return copies.map(({ to }) => to)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const appDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
  )
  const copied = await vendorAssets({
    nodeModules: path.join(appDir, 'node_modules'),
    outDir: path.join(appDir, 'public', 'vendor'),
  })
  console.log(`vendor-assets: ${copied.length} files into public/vendor/`)
}
