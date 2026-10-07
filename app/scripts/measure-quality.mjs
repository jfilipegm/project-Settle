/**
 * The photo quality check, measured on the local set in a real browser
 * (M2.5 plan, P11): every calibration image (the set's tuning and extra
 * cases and the small copies set aside, never a held-out case) is scanned
 * in the production build, and the check's four measurements, as the
 * browser's worker took them, are reported beside whether the image read
 * with no edit. The thresholds in `photoQuality.ts` are set from this, and
 * recorded in `docs/ACTIVE_MILESTONE.md`.
 *
 * It prints numbers and case names only, never receipt text, and writes
 * its full report under the git-ignored `.ai-review/local-measure/`.
 *
 *   node scripts/measure-quality.mjs [--held-out] [--runs <n>]
 *       [--case <name>]... [--brave <path>] [--port <n>]
 *
 * `--held-out` also checks the held-out cases (P14): CP6's measurement
 * only. `--runs` scans each image that many times (readings of the
 * narrowest images vary from run to run). Run `npm run build` first.
 */
import { stat } from 'node:fs/promises'
import path from 'node:path'
import {
  scoreFailedImport,
  scoreImage,
} from '../src/features/receipt/accuracy.ts'
import {
  loadCalibrationCases,
  repositoryRoot,
} from '../src/features/receipt/localFixtures.node.ts'
import { writeReport } from '../src/features/receipt/localReport.node.ts'
import { APP_DIR } from './browser.mjs'
import { scan, withBrowser } from './local-scan.mjs'

const LOCAL = path.join(APP_DIR, 'src/features/receipt/fixtures/local')

function parseArgs(argv) {
  const options = { heldOut: false, runs: 1, cases: [] }
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i]
    if (key === '--held-out') options.heldOut = true
    else if (key === '--runs') options.runs = Number(argv[++i])
    else if (key === '--case') options.cases.push(argv[++i])
    else if (key === '--brave') options.brave = argv[++i]
    else if (key === '--port') options.port = Number(argv[++i])
    else throw new Error(`Unknown option ${key}`)
  }
  if (!(options.runs >= 1)) throw new Error('--runs must be 1 or more')
  return options
}

const round = (value) =>
  typeof value === 'number' ? Number(value.toFixed(3)) : value

/** One page's check, rounded for printing. */
function pageNumbers(check) {
  return {
    issues: check.issues,
    ...Object.fromEntries(
      Object.entries(check.measures).map(([key, value]) => [key, round(value)]),
    ),
    milliseconds: check.milliseconds,
  }
}

const options = parseArgs(process.argv.slice(2))
try {
  await stat(path.join(APP_DIR, 'dist', 'index.html'))
} catch {
  throw new Error('No build: run `npm run build` first')
}
const { cases, skipped } = await loadCalibrationCases(LOCAL, {
  heldOut: options.heldOut,
})
const selected =
  options.cases.length === 0
    ? cases
    : cases.filter(({ entry }) => options.cases.includes(entry.name))
console.log(
  JSON.stringify({
    calibrationImages: selected.length,
    heldOutSkipped: skipped.length,
    runs: options.runs,
  }),
)

const results = []
await withBrowser(options, async (cdp, origin) => {
  for (let run = 1; run <= options.runs; run++) {
    for (const { entry, group } of selected) {
      const result = await scan(cdp, origin, path.join(LOCAL, entry.image))
      const score =
        result.error === undefined
          ? scoreImage(result.bill, result.summary, entry.expected)
          : scoreFailedImport(entry.expected)
      const line = {
        case: entry.name,
        group,
        capture: entry.capture,
        run,
        noEditNeeded: score.noEditNeeded,
        seconds: result.seconds,
        ...(result.error !== undefined && { importFailed: true }),
        // A PDF read from its text layer isn't checked.
        pages: (result.photoChecks ?? []).map(pageNumbers),
      }
      results.push(line)
      console.log(JSON.stringify(line))
    }
  }
})

const file = await writeReport(repositoryRoot(LOCAL), 'quality', {
  when: new Date().toISOString(),
  heldOut: options.heldOut,
  heldOutSkipped: skipped.map((entry) => entry.name),
  runs: options.runs,
  results,
})
console.log(`Report (local, git-ignored): ${file}`)
