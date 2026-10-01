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
 *   node scripts/measure-local.mjs [--held-out] [--case <name>]...
 *       [--brave <path>] [--port <n>]
 *
 * `--held-out` also scores the held-out cases (P14): CP6's measurement
 * only. Run `npm run build` first. Exit code 0 when every case was
 * scanned (whatever its score), 1 on a failure to run.
 */
import { rm, stat } from 'node:fs/promises'
import path from 'node:path'
import {
  scoreFailedImport,
  scoreImage,
} from '../src/features/receipt/accuracy.ts'
import {
  distinctReceipts,
  loadLocalCases,
  repositoryRoot,
  selectCases,
} from '../src/features/receipt/localFixtures.node.ts'
import {
  caseNumbers,
  rightPriceRows,
  setNumbers,
  writeReport,
} from '../src/features/receipt/localReport.node.ts'
import {
  APP_DIR,
  Cdp,
  sleep,
  startBrave,
  startPreview,
  waitFor,
} from './browser.mjs'

const LOCAL = path.join(APP_DIR, 'src/features/receipt/fixtures/local')
const SCAN_TIMEOUT_MS = 180_000

function parseArgs(argv) {
  const options = { heldOut: false, cases: [] }
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i]
    if (key === '--held-out') options.heldOut = true
    else if (key === '--case') options.cases.push(argv[++i])
    else if (key === '--brave') options.brave = argv[++i]
    else if (key === '--port') options.port = Number(argv[++i])
    else throw new Error(`Unknown option ${key}`)
  }
  return options
}

/** Evaluates `expression` in the page and returns its value. */
async function evaluate(cdp, session, expression) {
  const { result, exceptionDetails } = await cdp.send(
    'Runtime.evaluate',
    { expression, returnByValue: true, awaitPromise: true },
    session,
  )
  if (exceptionDetails) throw new Error(exceptionDetails.text)
  return result.value
}

/**
 * Scans one file on a fresh page (empty `localStorage`, so the starting
 * bill is the app's new bill) and returns what the page saved, or the
 * error it showed.
 */
async function scan(cdp, origin, file) {
  const { targetId } = await cdp.send('Target.createTarget', {
    url: 'about:blank',
  })
  try {
    const { sessionId: page } = await cdp.send('Target.attachToTarget', {
      targetId,
      flatten: true,
    })
    for (const domain of ['Runtime', 'Page', 'DOM']) {
      await cdp.send(`${domain}.enable`, {}, page)
    }
    const ready = () =>
      waitFor(
        () =>
          evaluate(
            cdp,
            page,
            `Boolean(document.querySelector('input[type=file]'))`,
          ),
        30_000,
        'the scan section',
      )
    await cdp.send('Page.navigate', { url: `${origin}/split` }, page)
    await ready()
    await evaluate(cdp, page, 'localStorage.clear()')
    await cdp.send('Page.reload', {}, page)
    await sleep(500)
    await ready()

    const { root } = await cdp.send('DOM.getDocument', { depth: -1 }, page)
    const { nodeId } = await cdp.send(
      'DOM.querySelector',
      { nodeId: root.nodeId, selector: 'input[type=file]' },
      page,
    )
    const started = Date.now()
    await cdp.send('DOM.setFileInputFiles', { nodeId, files: [file] }, page)
    const outcome = await waitFor(
      () =>
        evaluate(
          cdp,
          page,
          `(() => {
            const error = document.querySelector('[aria-labelledby="receipt-scan-heading"] [role=alert]')
            if (error) return { error: error.textContent }
            if (!document.querySelector('[data-receipt-check]')) return null
            const bill = localStorage.getItem('settle.bill')
            const receipt = localStorage.getItem('settle.receipt')
            return bill && receipt ? { bill, receipt } : null
          })()`,
        ),
      SCAN_TIMEOUT_MS,
      'the scan to finish',
    )
    const seconds = Number(((Date.now() - started) / 1000).toFixed(1))
    if (outcome.error !== undefined) return { error: outcome.error, seconds }
    return {
      bill: JSON.parse(outcome.bill).bill,
      summary: JSON.parse(outcome.receipt).receipt,
      seconds,
    }
  } finally {
    await cdp.send('Target.closeTarget', { targetId }).catch(() => undefined)
  }
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
      distinctReceipts: distinctReceipts(all),
      scored: scored.length,
      heldOutSkipped: selected.skipped.length,
    }),
  )

  const preview = await startPreview(options.port ?? 4189)
  const brave = await startBrave(options.brave ?? '/usr/bin/brave')
  const cdp = await Cdp.connect(brave.ws)
  const images = []
  const caseReports = []
  const rows = {}
  try {
    for (const entry of scored) {
      const result = await scan(
        cdp,
        preview.origin,
        path.join(LOCAL, entry.image),
      )
      const score =
        result.error === undefined
          ? scoreImage(result.bill, result.summary, entry.expected)
          : scoreFailedImport(entry.expected)
      images.push({ name: entry.name, receipt: entry.receipt, score })
      rows[entry.name] =
        result.error === undefined ? rightPriceRows(result.bill, entry) : []
      const numbers = {
        ...caseNumbers(entry, score),
        seconds: result.seconds,
        ...(result.error !== undefined && { importFailed: true }),
      }
      caseReports.push({ ...numbers, importError: result.error })
      console.log(JSON.stringify(numbers))
    }
  } finally {
    cdp.close()
    brave.child.kill('SIGKILL')
    preview.child.kill('SIGTERM')
    await sleep(300)
    await rm(brave.profile, { recursive: true, force: true }).catch(
      () => undefined,
    )
  }

  const totals = setNumbers(images)
  console.log(JSON.stringify({ totals }))
  const file = await writeReport(repositoryRoot(LOCAL), 'browser', {
    when: new Date().toISOString(),
    heldOut: options.heldOut,
    heldOutSkipped: selected.skipped.map((entry) => entry.name),
    totals,
    cases: caseReports,
    rightPriceRows: rows,
  })
  console.log(`Report (local, git-ignored): ${file}`)
  return { totals, cases: caseReports }
}

await measure(parseArgs(process.argv.slice(2)))
