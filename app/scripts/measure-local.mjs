/**
 * The local real-receipt set, measured in a real browser (M2.5 plan, P3:
 * the authoritative numbers). It serves the production build with `vite
 * preview`, scans every case of the git-ignored `fixtures/local/` set in
 * headless Brave through the page's own file input, reads the imported
 * bill and summary back from `localStorage` (`settle.bill`,
 * `settle.receipt`, the data the Node test scores), and scores them with
 * P2's measure (`accuracy.ts`).
 *
 * It prints numbers and case names only, never receipt text, and writes
 * its full report under the git-ignored `.ai-review/local-measure/`.
 *
 *   node scripts/measure-local.mjs [--held-out] [--warm] [--case <name>]...
 *       [--brave <path>] [--port <n>]
 *   node scripts/measure-local.mjs --time <image>...
 *
 * `--held-out` also scores the held-out cases (P14): CP6's measurement
 * only. `--warm` scans each case a second time with the reader loaded and
 * reports that time too (P13). `--time` only times the named images, cold
 * and warm, with no scoring. Run `npm run build` first. Exit code 0 when every case was
 * scanned (whatever its score), 1 on a failure to run.
 */
import { stat } from 'node:fs/promises'
import path from 'node:path'
import {
  readRows,
  scoreFailedImport,
  scoreImage,
} from '../src/features/receipt/accuracy.ts'
import {
  countedCases,
  distinctReceipts,
  loadLocalCases,
  repositoryRoot,
  selectCases,
} from '../src/features/receipt/localFixtures.node.ts'
import {
  caseNumbers,
  rightPriceRows,
  partNumbers,
  writeReport,
} from '../src/features/receipt/localReport.node.ts'
import { APP_DIR } from './browser.mjs'
import { scan, withBrowser } from './local-scan.mjs'

const LOCAL = path.join(APP_DIR, 'src/features/receipt/fixtures/local')

function parseArgs(argv) {
  const options = { heldOut: false, warm: false, cases: [], time: [] }
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i]
    if (key === '--held-out') options.heldOut = true
    else if (key === '--warm') options.warm = true
    else if (key === '--case') options.cases.push(argv[++i])
    else if (key === '--time') options.time.push(argv[++i])
    else if (key === '--brave') options.brave = argv[++i]
    else if (key === '--port') options.port = Number(argv[++i])
    else throw new Error(`Unknown option ${key}`)
  }
  return options
}

async function measure(options) {
  try {
    await stat(path.join(APP_DIR, 'dist', 'index.html'))
  } catch {
    throw new Error('No build: run `npm run build` first')
  }
  const all = await loadLocalCases(LOCAL)
  if (all.length === 0) {
    throw new Error(`No local cases in ${LOCAL}: see app/README.md`)
  }
  const selected = selectCases(all, { heldOut: options.heldOut })
  const scored =
    options.cases.length === 0
      ? selected.scored
      : selected.scored.filter((entry) => options.cases.includes(entry.name))
  console.log(
    JSON.stringify({
      cases: all.length,
      distinctReceipts: distinctReceipts(countedCases(all)),
      extraCases: all.length - countedCases(all).length,
      scored: scored.length,
      heldOutSkipped: selected.skipped.length,
    }),
  )

  const images = []
  const caseReports = []
  const rows = {}
  const read = {}
  await withBrowser(options, async (cdp, origin) => {
    for (const entry of scored) {
      const result = await scan(cdp, origin, path.join(LOCAL, entry.image), {
        warm: options.warm,
      })
      const score =
        result.error === undefined
          ? scoreImage(result.bill, result.summary, entry.expected)
          : scoreFailedImport(entry.expected)
      images.push({ name: entry.name, receipt: entry.receipt, score })
      rows[entry.name] =
        result.error === undefined ? rightPriceRows(result.bill, entry) : []
      read[entry.name] = result.error === undefined ? readRows(result.bill) : []
      const numbers = {
        ...caseNumbers(entry, score),
        seconds: result.seconds,
        ...(result.warmSeconds !== undefined && {
          warmSeconds: result.warmSeconds,
        }),
        ...(result.error !== undefined && { importFailed: true }),
      }
      caseReports.push({ ...numbers, importError: result.error })
      console.log(JSON.stringify(numbers))
    }
  })

  const { totals, extra } = partNumbers(images, scored)
  console.log(JSON.stringify({ totals }))
  if (extra !== undefined) console.log(JSON.stringify({ extra }))
  const file = await writeReport(repositoryRoot(LOCAL), 'browser', {
    when: new Date().toISOString(),
    heldOut: options.heldOut,
    heldOutSkipped: selected.skipped.map((entry) => entry.name),
    totals,
    extra,
    cases: caseReports,
    rightPriceRows: rows,
    readRows: read,
  })
  console.log(`Report (local, git-ignored): ${file}`)
  return { totals, cases: caseReports }
}

/**
 * P13's timing on named images, scored against nothing: each is scanned
 * on a fresh page (the first load included) and again with the reader
 * loaded. Prints the file's size and the two times only.
 */
async function time(options) {
  await withBrowser(options, async (cdp, origin) => {
    for (const file of options.time) {
      const result = await scan(cdp, origin, path.resolve(file), {
        warm: true,
      })
      console.log(
        JSON.stringify({
          file: path.basename(file),
          bytes: (await stat(file)).size,
          firstSeconds: result.seconds,
          warmSeconds: result.warmSeconds ?? null,
          failed: result.error !== undefined,
        }),
      )
    }
  })
}

const options = parseArgs(process.argv.slice(2))
if (options.time.length > 0) await time(options)
else await measure(options)
