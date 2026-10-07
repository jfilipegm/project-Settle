/**
 * Scanning one local receipt in the real app, in headless Brave (M2.5 plan,
 * P3), shared by `measure-local.mjs` (the accuracy) and `measure-quality.mjs`
 * (P11's photo quality check): the production build served by `vite
 * preview`, the file chosen through the page's own input, and what the page
 * saved (`settle.bill`, `settle.receipt`) and showed read back.
 */
import { rm } from 'node:fs/promises'
import { Cdp, sleep, startBrave, startPreview, waitFor } from './browser.mjs'

/** How long one scan may take. */
const SCAN_TIMEOUT_MS = 180_000

/** Evaluates `expression` in the page and returns its value. */
export async function evaluate(cdp, session, expression) {
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
          const panel = document.querySelector('[data-receipt-check]')
          if (!panel) return null
          const bill = localStorage.getItem('settle.bill')
          const receipt = localStorage.getItem('settle.receipt')
          return bill && receipt
            ? { bill, receipt, photoChecks: panel.getAttribute('data-photo-checks') }
            : null
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
    // P11: each page's photo check, as the check panel holds it (none for
    // a PDF read from its text layer).
    photoChecks:
      outcome.photoChecks === null
        ? undefined
        : JSON.parse(outcome.photoChecks),
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
export async function scan(cdp, origin, file, { warm = false } = {}) {
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

/**
 * Starts the preview server and headless Brave, runs `use` with the
 * DevTools connection and the app's origin, then stops both.
 */
export async function withBrowser({ brave, port }, use) {
  const preview = await startPreview(port ?? 4189)
  const browser = await startBrave(brave ?? '/usr/bin/brave')
  const cdp = await Cdp.connect(browser.ws)
  try {
    return await use(cdp, preview.origin)
  } finally {
    cdp.close()
    browser.child.kill('SIGKILL')
    preview.child.kill('SIGTERM')
    await sleep(300)
    await rm(browser.profile, { recursive: true, force: true }).catch(
      () => undefined,
    )
  }
}
