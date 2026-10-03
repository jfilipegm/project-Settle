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
import { rm, stat } from 'node:fs/promises'
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

/** Chooses `file` in the page's file input and waits for the import. */
async function importFile(cdp, page, file) {
  // The previous import's summary goes, so only a new one counts.
  await evaluate(cdp, page, "localStorage.removeItem('settle.receipt')")
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
  // The bill and the summary are saved separately: read them until two
  // reads agree, so a bill saved a moment after the summary isn't missed.
  let saved = outcome
  for (let attempt = 0; attempt < 20; attempt++) {
    await sleep(250)
    const again = await evaluate(
      cdp,
      page,
      `({ bill: localStorage.getItem('settle.bill'), receipt: localStorage.getItem('settle.receipt') })`,
    )
    const stable = again.bill === saved.bill && again.receipt === saved.receipt
    saved = again
    if (stable) break
  }
  return {
    bill: JSON.parse(saved.bill).bill,
    summary: JSON.parse(saved.receipt).receipt,
    seconds,
  }
}

/**
 * Scans one file on a fresh page (empty `localStorage`, so the starting
 * bill is the app's new bill) and returns what the page saved, or the
 * error it showed, with the time from choosing the file to the check
 * panel. With `warm`, the same file is scanned again on the same page, the
 * reader already loaded (P13), and that time is `warmSeconds`; the
 * replace prompt is accepted.
 */
async function scan(cdp, origin, file, { warm = false } = {}) {
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
    cdp.on((message) => {
      if (
        message.sessionId === page &&
        message.method === 'Page.javascriptDialogOpening'
      ) {
        void cdp
          .send('Page.handleJavaScriptDialog', { accept: true }, page)
          .catch(() => undefined)
      }
    })
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

    const first = await importFile(cdp, page, file)
    if (!warm || first.error !== undefined) return first
    const again = await importFile(cdp, page, file)
    return { ...first, warmSeconds: again.seconds }
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
      distinctReceipts: distinctReceipts(countedCases(all)),
      extraCases: all.length - countedCases(all).length,
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
  const read = {}
  try {
    for (const entry of scored) {
      const result = await scan(
        cdp,
        preview.origin,
        path.join(LOCAL, entry.image),
        { warm: options.warm },
      )
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
  } finally {
    cdp.close()
    brave.child.kill('SIGKILL')
    preview.child.kill('SIGTERM')
    await sleep(300)
    await rm(brave.profile, { recursive: true, force: true }).catch(
      () => undefined,
    )
  }

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
  const preview = await startPreview(options.port ?? 4189)
  const brave = await startBrave(options.brave ?? '/usr/bin/brave')
  const cdp = await Cdp.connect(brave.ws)
  try {
    for (const file of options.time) {
      const result = await scan(cdp, preview.origin, path.resolve(file), {
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
  } finally {
    cdp.close()
    brave.child.kill('SIGKILL')
    preview.child.kill('SIGTERM')
    await sleep(300)
    await rm(brave.profile, { recursive: true, force: true }).catch(
      () => undefined,
    )
  }
}

const options = parseArgs(process.argv.slice(2))
if (options.time.length > 0) await time(options)
else await measure(options)
