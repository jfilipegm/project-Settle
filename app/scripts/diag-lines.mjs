/**
 * CP3's diagnostic (M2.5 plan, P3): what PaddleOCR reads in a real
 * browser, line by line, for local cases. It serves the app's sources with
 * Vite's dev server, and in headless Brave runs the app's own decoder,
 * engine, line assembly and parser on each case's image, on the page's
 * thread. The output holds receipt text, so it goes only to the git-ignored
 * `.ai-review/local-measure/`; the console gets case names and counts.
 *
 *   node scripts/diag-lines.mjs [--case <name>]... [--options <json>]
 *       [--brave <path>] [--port <n>]
 *
 * `--options` overrides the engine's reading options, as
 * `SETTLE_PADDLE_OPTIONS` does in Node.
 */
import { spawn } from 'node:child_process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  loadLocalCases,
  repositoryRoot,
} from '../src/features/receipt/localFixtures.node.ts'
import { REPORT_DIR } from '../src/features/receipt/localReport.node.ts'
import { APP_DIR, Cdp, sleep, startBrave, waitFor } from './browser.mjs'

const LOCAL = path.join(APP_DIR, 'src/features/receipt/fixtures/local')

function parseArgs(argv) {
  const options = { cases: [], overrides: '{}' }
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i]
    if (key === '--case') options.cases.push(argv[++i])
    else if (key === '--options') options.overrides = argv[++i]
    else if (key === '--brave') options.brave = argv[++i]
    else if (key === '--port') options.port = Number(argv[++i])
    else throw new Error(`Unknown option ${key}`)
  }
  return options
}

async function startDevServer(port) {
  const child = spawn(
    path.join(APP_DIR, 'node_modules', '.bin', 'vite'),
    ['--port', String(port), '--strictPort', '--host', '127.0.0.1'],
    { cwd: APP_DIR, stdio: ['ignore', 'pipe', 'pipe'] },
  )
  const origin = `http://127.0.0.1:${port}`
  await waitFor(
    async () => {
      try {
        return (await fetch(`${origin}/`)).ok
      } catch {
        return false
      }
    },
    30_000,
    'the dev server',
  )
  return { child, origin }
}

/** Runs in the page: one image's lines and parse, with the app's code. */
const READ_IN_PAGE = `async (url, name, type, overrides) => {
  const { decodeReceipt } = await import('/src/features/receipt/decode.ts')
  const { createPaddleEngine } = await import('/src/features/receipt/paddleEngine.ts')
  const { assembleLines } = await import('/src/features/receipt/paddleLines.ts')
  const { parseReceiptText, joinPages } = await import('/src/features/receipt/parse/parseReceiptText.ts')
  const bytes = await (await fetch(url)).arrayBuffer()
  const decoded = await decodeReceipt(new File([bytes], name, { type }), {})
  if (!decoded.ok) return { error: decoded.error.code }
  window.__engine ??= await createPaddleEngine({
    models: {
      detection: '/vendor/paddle/det.onnx',
      recognition: '/vendor/paddle/rec.onnx',
      dictionary: '/vendor/paddle/dict.txt',
    },
    wasmPaths: location.origin + '/vendor/ort/',
    overrides: JSON.parse(overrides),
  })
  const pages = []
  for (const page of decoded.source.pages) {
    pages.push(assembleLines(await window.__engine.read(page)))
  }
  const parsed = parseReceiptText(joinPages(pages))
  return { pages, parsed, size: decoded.source.pages.map((p) => p.width + 'x' + p.height) }
}`

async function main(options) {
  const cases = (await loadLocalCases(LOCAL)).filter(
    (entry) => options.cases.length === 0 || options.cases.includes(entry.name),
  )
  const server = await startDevServer(options.port ?? 4199)
  const brave = await startBrave(options.brave ?? '/usr/bin/brave')
  const cdp = await Cdp.connect(brave.ws)
  let out = ''
  try {
    const { targetId } = await cdp.send('Target.createTarget', {
      url: 'about:blank',
    })
    const { sessionId: page } = await cdp.send('Target.attachToTarget', {
      targetId,
      flatten: true,
    })
    await cdp.send('Runtime.enable', {}, page)
    await cdp.send('Page.enable', {}, page)
    await cdp.send('Page.navigate', { url: `${server.origin}/` }, page)
    await sleep(2000)
    for (const entry of cases) {
      // A PDF is read from its text layer, with no OCR to show.
      if (entry.imageType === 'pdf') continue
      const type =
        entry.imageType === 'png'
          ? 'image/png'
          : entry.imageType === 'heic'
            ? 'image/heic'
            : 'image/jpeg'
      const url = `/@fs${path.join(LOCAL, entry.image)}`
      const evaluate = () =>
        cdp.send(
          'Runtime.evaluate',
          {
            expression: `(${READ_IN_PAGE})(${JSON.stringify(url)}, ${JSON.stringify(entry.image)}, ${JSON.stringify(type)}, ${JSON.stringify(options.overrides)})`,
            awaitPromise: true,
            returnByValue: true,
            timeout: 300_000,
          },
          page,
        )
      let { result, exceptionDetails } = await evaluate()
      // Vite optimises a dependency on first use and reloads: once more.
      if (
        /dynamically imported module/.test(
          exceptionDetails?.exception?.description ?? '',
        )
      ) {
        await cdp.send('Page.reload', {}, page)
        await sleep(5000)
        ;({ result, exceptionDetails } = await evaluate())
      }
      if (exceptionDetails) {
        throw new Error(
          `${entry.name}: ${exceptionDetails.exception?.description ?? exceptionDetails.text}`,
        )
      }
      const read = result.value
      const lines = (read.pages ?? []).flat()
      console.log(
        JSON.stringify({
          case: entry.name,
          lines: lines.length,
          items: read.parsed?.items.length ?? 0,
          error: read.error,
        }),
      )
      out += `\n===== ${entry.name} (${read.size?.join(', ') ?? read.error})\n`
      out += lines
        .map(
          (line, i) =>
            `${String(i).padStart(3)} [${line.confidence}] ${line.text}`,
        )
        .join('\n')
      if (read.parsed !== undefined) {
        out += `\n--- items:\n${read.parsed.items
          .map(
            (item) =>
              `  ${item.name} | ${item.lineTotal}${item.savingsCandidate ? ` sav ${item.savingsCandidate}` : ''}${item.endEvidence ? ` END ${item.endEvidence}` : ''}`,
          )
          .join('\n')}`
        out += `\n--- total ${read.parsed.total} ended ${read.parsed.itemsEndedBy}`
      }
      out += `\n--- expected: ${entry.expected.items
        .map((item) => `${item.name}=${item.price}`)
        .join('; ')} total=${entry.expected.total}\n`
    }
  } finally {
    cdp.close()
    brave.child.kill('SIGKILL')
    server.child.kill('SIGTERM')
    await sleep(300)
    await rm(brave.profile, { recursive: true, force: true }).catch(
      () => undefined,
    )
  }
  const dir = path.join(repositoryRoot(LOCAL), REPORT_DIR)
  await mkdir(dir, { recursive: true })
  const file = path.join(
    dir,
    `lines-browser-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`,
  )
  await writeFile(file, out)
  console.log(`Lines (local, git-ignored): ${file}`)
}

await main(parseArgs(process.argv.slice(2)))
