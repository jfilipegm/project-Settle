/**
 * The real-browser privacy check (M2 plan, D9, M-I-4). It serves the
 * production build with `vite preview`, starts headless Brave with a fresh
 * temporary profile, and drives it over the DevTools protocol with Node's
 * built-in WebSocket (no dependency). It records every request, from the
 * document and from each dedicated worker (auto-attached, paused until its
 * Network domain is on), with its URL, method, headers as sent and body,
 * and every CSP violation. Then it checks:
 *
 * - structure: each request is a same-origin GET with no body and no query
 *   string, for a file in the build output (`blob:`/`data:` are local and
 *   listed apart);
 * - header names: only the browser's standard set (HEADER_NAMES), compared
 *   case-insensitively;
 * - values: no value from the receipt (VALUE SET below) appears in any
 *   request's URL, method, headers or body;
 * - no CSP violation in the console.
 *
 * Every run first proves the check can fail: it has the page send one
 * tagged same-origin GET carrying a receipt value in a custom header. That
 * planted request is checked on its own and must fail both the value search
 * and the header-name rule; it is left out of the clean log, and every
 * other request is the clean log, which must pass.
 *
 * Modes:
 *   node scripts/check-requests.mjs page-load [--values <expected.json>]
 *   node scripts/check-requests.mjs scan --file <receipt> --values <expected.json>
 *       [--qr <payload>] [--expect <url part>]... [--input <selector>]
 *       [--wait <selector>]
 * Common: [--out <log.json>] [--brave <path>] [--path <route>] [--port <n>]
 *   [--probe-csp yes] (triggers one CSP violation, so the run must fail)
 *
 * Run `npm run build` first. Exit code 0 is a pass, 1 a failure.
 */
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIST = path.join(APP_DIR, 'dist')

/**
 * The standard browser request headers (R8-O-2, R9-I-1), compared
 * case-insensitively, plus any `Sec-*`. Widening this list is a reviewed
 * plan change.
 */
export const HEADER_NAMES = [
  'accept',
  'accept-encoding',
  'accept-language',
  'cache-control',
  'connection',
  'cookie',
  'host',
  'if-modified-since',
  'if-none-match',
  'origin',
  'pragma',
  'range',
  'referer',
  'upgrade-insecure-requests',
  'user-agent',
]

export function isAllowedHeaderName(name) {
  const lower = name.toLowerCase()
  return HEADER_NAMES.includes(lower) || lower.startsWith('sec-')
}

const PLANTED_PATH = '/__settle_planted_leak__'

function fold(text) {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

function safeDecode(text) {
  try {
    return decodeURIComponent(text)
  } catch {
    return text
  }
}

/** `"3.20"` or cents → both separators: `3.20`, `3,20`. */
function amountForms(value) {
  const text =
    typeof value === 'number'
      ? `${Math.trunc(value / 100)}.${String(Math.abs(value) % 100).padStart(2, '0')}`
      : String(value)
  return [text, text.replace('.', ',')]
}

function dateForms(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '')
  if (!match) return []
  const [, y, m, d] = match
  return [
    iso,
    `${y}${m}${d}`,
    `${d}-${m}-${y}`,
    `${d}/${m}/${y}`,
    `${d}.${m}.${y}`,
    `${d}.${m}.${y.slice(2)}`,
  ]
}

/**
 * The value set (M-I-4): from the receipt's `.expected.json` and QR
 * payload, and (R8-O-1) from what the app actually read.
 */
export function valueSet({ expected = {}, qr, read = {} }) {
  const values = new Set()
  const add = (value) => {
    if (typeof value === 'string' && value.trim().length >= 3)
      values.add(value.trim())
  }
  add(expected.merchant)
  add(expected.merchantTaxId)
  dateForms(expected.date).forEach(add)
  for (const item of expected.items ?? []) {
    add(item.name)
    amountForms(item.unitPrice).forEach(add)
    amountForms(item.lineTotal).forEach(add)
  }
  for (const key of ['subtotal', 'tax', 'tip', 'discount', 'total']) {
    if (expected[key] !== undefined) amountForms(expected[key]).forEach(add)
  }
  if (qr) {
    add(qr)
    for (const part of qr.split('*')) {
      const [key, ...rest] = part.split(':')
      if (['A', 'F', 'H', 'N', 'O'].includes(key)) add(rest.join(':'))
    }
  }
  // What the app read: settle.bill and settle.receipt.
  for (const item of read.bill?.bill?.items ?? read.bill?.items ?? []) {
    add(item.name)
    if (typeof item.unitPrice === 'number')
      amountForms(item.unitPrice).forEach(add)
  }
  const summary = read.receipt?.receipt ?? read.receipt ?? {}
  add(summary.merchant)
  add(summary.merchantTaxId)
  dateForms(summary.date).forEach(add)
  for (const key of ['total', 'ivaTotal']) {
    if (typeof summary[key] === 'number') amountForms(summary[key]).forEach(add)
  }
  return [...values]
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Whole-token, case- and accent-insensitive search (M-I-4). */
export function findValues(haystack, values) {
  const text = fold(safeDecode(haystack))
  return values.filter((value) => {
    const pattern = new RegExp(
      `(?<![\\p{L}\\p{N}.,])${escapeRegExp(fold(value))}(?![\\p{L}\\p{N}]|[.,]\\d)`,
      'u',
    )
    return pattern.test(text)
  })
}

function requestText(request) {
  return [
    request.url,
    request.method,
    ...Object.entries(request.headers).flatMap(([name, value]) => [
      name,
      String(value),
    ]),
    request.body ?? '',
  ].join('\n')
}

async function isBuildFile(pathname) {
  const relative = safeDecode(pathname).replace(/^\/+/, '')
  if (relative === '' || relative.includes('..')) return false
  try {
    return (await stat(path.join(DIST, relative))).isFile()
  } catch {
    return false
  }
}

/** The structural checks for one request; a list of failures. */
async function structuralFailures(request, origin, pagePath) {
  const failures = []
  const url = new URL(request.url)
  if (url.origin !== origin) failures.push(`cross-origin: ${url.origin}`)
  if (request.method !== 'GET') failures.push(`method ${request.method}`)
  if (request.body || request.hasBody) failures.push('has a body')
  if (url.search !== '') failures.push(`query string ${url.search}`)
  const isPage = url.pathname === pagePath && request.type === 'Document'
  if (!isPage && !(await isBuildFile(url.pathname))) {
    failures.push(`not a build file: ${url.pathname}`)
  }
  return failures
}

function headerFailures(request) {
  return Object.keys(request.headers)
    .filter((name) => !name.startsWith(':') && !isAllowedHeaderName(name))
    .map((name) => `header ${name}`)
}

// --- DevTools protocol -------------------------------------------------

class Cdp {
  constructor(socket) {
    this.socket = socket
    this.nextId = 1
    this.pending = new Map()
    this.listeners = []
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data))
      if (message.id !== undefined) {
        const waiter = this.pending.get(message.id)
        this.pending.delete(message.id)
        if (message.error) waiter?.reject(new Error(`${message.error.message}`))
        else waiter?.resolve(message.result)
      } else {
        for (const listener of this.listeners) listener(message)
      }
    })
  }

  static async connect(url) {
    const socket = new WebSocket(url)
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true })
      socket.addEventListener('error', reject, { once: true })
    })
    return new Cdp(socket)
  }

  send(method, params = {}, sessionId) {
    const id = this.nextId++
    const message = { id, method, params }
    if (sessionId) message.sessionId = sessionId
    this.socket.send(JSON.stringify(message))
    return new Promise((resolve, reject) =>
      this.pending.set(id, { resolve, reject }),
    )
  }

  on(listener) {
    this.listeners.push(listener)
  }

  close() {
    this.socket.close()
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function waitFor(check, timeoutMs, what) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const value = await check()
    if (value) return value
    await sleep(200)
  }
  throw new Error(`Timed out waiting for ${what}`)
}

async function startPreview(port) {
  const child = spawn(
    path.join(APP_DIR, 'node_modules', '.bin', 'vite'),
    ['preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'],
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
    20_000,
    'vite preview',
  )
  return { child, origin }
}

async function startBrave(bravePath) {
  const profile = await mkdtemp(path.join(tmpdir(), 'settle-brave-'))
  const child = spawn(
    bravePath,
    [
      '--headless=new',
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-component-update',
      '--disable-sync',
      'about:blank',
    ],
    { stdio: 'ignore' },
  )
  const portFile = path.join(profile, 'DevToolsActivePort')
  const [port, browserPath] = await waitFor(
    async () => {
      try {
        const lines = (await readFile(portFile, 'utf8')).trim().split('\n')
        return lines.length >= 2 ? lines : undefined
      } catch {
        return undefined
      }
    },
    20_000,
    'Brave to start',
  )
  return { child, profile, ws: `ws://127.0.0.1:${port}${browserPath}` }
}

// --- The run -----------------------------------------------------------

function parseArgs(argv) {
  const [mode = 'page-load', ...rest] = argv
  const options = { mode, expect: [] }
  for (let i = 0; i < rest.length; i++) {
    const key = rest[i]?.replace(/^--/, '')
    const value = rest[i + 1]
    if (key === 'expect') options.expect.push(value)
    else options[key] = value
    i++
  }
  return options
}

export async function run(options) {
  const mode = options.mode
  if (mode !== 'page-load' && mode !== 'scan')
    throw new Error(`Unknown mode ${mode}`)
  if (!(await isBuildFile('/index.html')))
    throw new Error('No build: run `npm run build` first')
  const expected = options.values
    ? JSON.parse(await readFile(options.values, 'utf8'))
    : {}
  const pagePath = options.path ?? '/split'

  const preview = await startPreview(Number(options.port ?? 4179))
  const brave = await startBrave(options.brave ?? '/usr/bin/brave')
  const cdp = await Cdp.connect(brave.ws)
  const sessions = new Map() // sessionId → { kind, url }
  const requests = new Map() // `${sessionId}:${requestId}` → record
  const csp = []
  const console_ = []
  let lastActivity = Date.now()

  const record = (sessionId, requestId) => {
    const key = `${sessionId}:${requestId}`
    if (!requests.has(key)) {
      requests.set(key, {
        session: sessions.get(sessionId)?.label ?? sessionId,
        sessionId,
        requestId,
        headers: {},
      })
    }
    return requests.get(key)
  }

  cdp.on((message) => {
    const { method, params = {}, sessionId } = message
    if (method === 'Target.attachedToTarget') {
      const { sessionId: child, targetInfo, waitingForDebugger } = params
      sessions.set(child, {
        label: `${targetInfo.type}:${targetInfo.url}`,
        type: targetInfo.type,
      })
      void (async () => {
        await cdp.send('Network.enable', {}, child)
        await cdp.send('Runtime.enable', {}, child).catch(() => undefined)
        await cdp.send('Log.enable', {}, child).catch(() => undefined)
        await cdp
          .send(
            'Target.setAutoAttach',
            { autoAttach: true, waitForDebuggerOnStart: true, flatten: true },
            child,
          )
          .catch(() => undefined)
        if (waitingForDebugger)
          await cdp.send('Runtime.runIfWaitingForDebugger', {}, child)
      })()
      return
    }
    if (method === 'Network.requestWillBeSent') {
      lastActivity = Date.now()
      const entry = record(sessionId, params.requestId)
      entry.url = params.request.url
      entry.method = params.request.method
      entry.type = params.type
      entry.body = params.request.postData ?? entry.body
      entry.hasBody = Boolean(params.request.hasPostData)
      entry.headers = { ...params.request.headers, ...entry.headers }
      return
    }
    if (method === 'Network.requestWillBeSentExtraInfo') {
      lastActivity = Date.now()
      const entry = record(sessionId, params.requestId)
      // The headers as actually sent, browser-added ones included.
      entry.headers = { ...params.headers }
      entry.extraInfo = true
      return
    }
    if (method === 'Log.entryAdded') {
      const text = params.entry?.text ?? ''
      console_.push({
        session: sessions.get(sessionId)?.label,
        level: params.entry?.level,
        text,
      })
      if (/content security policy/i.test(text)) csp.push(text)
      return
    }
    if (method === 'Runtime.consoleAPICalled') {
      const text = (params.args ?? [])
        .map((arg) => arg.value ?? arg.description ?? '')
        .join(' ')
      if (/content security policy/i.test(text)) csp.push(text)
      return
    }
    if (
      method === 'Audits.issueAdded' &&
      params.issue?.code === 'ContentSecurityPolicyIssue'
    ) {
      csp.push(
        JSON.stringify(
          params.issue.details?.contentSecurityPolicyIssueDetails ?? {},
        ),
      )
    }
  })

  const exitAll = async () => {
    try {
      cdp.close()
    } catch {
      // already closed
    }
    brave.child.kill('SIGKILL')
    preview.child.kill('SIGTERM')
    await sleep(300)
    await rm(brave.profile, { recursive: true, force: true }).catch(
      () => undefined,
    )
  }

  try {
    const { targetId } = await cdp.send('Target.createTarget', {
      url: 'about:blank',
    })
    const { sessionId: page } = await cdp.send('Target.attachToTarget', {
      targetId,
      flatten: true,
    })
    sessions.set(page, { label: 'page', type: 'page' })
    for (const domain of [
      'Network',
      'Runtime',
      'Log',
      'Page',
      'DOM',
      'Audits',
    ]) {
      await cdp.send(`${domain}.enable`, {}, page)
    }
    await cdp.send(
      'Target.setAutoAttach',
      { autoAttach: true, waitForDebuggerOnStart: true, flatten: true },
      page,
    )

    const url = `${preview.origin}${pagePath}`
    await cdp.send('Page.navigate', { url }, page)
    const idle = async (ms) =>
      waitFor(
        async () => Date.now() - lastActivity > ms,
        180_000,
        'network idle',
      )
    await idle(2000)

    let read = {}
    if (mode === 'scan') {
      if (!options.file) throw new Error('scan mode needs --file')
      const { root } = await cdp.send('DOM.getDocument', { depth: -1 }, page)
      const { nodeId } = await cdp.send(
        'DOM.querySelector',
        { nodeId: root.nodeId, selector: options.input ?? 'input[type=file]' },
        page,
      )
      if (!nodeId) throw new Error('No file input on the page')
      await cdp.send(
        'DOM.setFileInputFiles',
        { nodeId, files: [path.resolve(options.file)] },
        page,
      )
      const waitSelector = options.wait ?? '[data-receipt-check]'
      await waitFor(
        async () => {
          const { result } = await cdp.send(
            'Runtime.evaluate',
            {
              expression: `Boolean(document.querySelector(${JSON.stringify(waitSelector)}))`,
              returnByValue: true,
            },
            page,
          )
          return result.value
        },
        180_000,
        `the check panel (${waitSelector})`,
      )
      await idle(2000)
      const { result } = await cdp.send(
        'Runtime.evaluate',
        {
          expression: `JSON.stringify({ bill: localStorage.getItem('settle.bill'), receipt: localStorage.getItem('settle.receipt') })`,
          returnByValue: true,
        },
        page,
      )
      const stored = JSON.parse(result.value)
      read = {
        bill: stored.bill ? JSON.parse(stored.bill) : undefined,
        receipt: stored.receipt ? JSON.parse(stored.receipt) : undefined,
      }
    }

    if (options['probe-csp'] !== undefined) {
      // Proves violations are captured: an inline script is blocked by
      // this policy, so this run must fail on its CSP check. (DevTools'
      // own evaluation bypasses the CSP, so the script goes into the DOM.)
      await cdp.send(
        'Runtime.evaluate',
        {
          expression:
            "{ const s = document.createElement('script'); s.textContent = 'window.__probe = 1'; document.head.append(s) }",
        },
        page,
      )
      await idle(500)
    }

    const values = valueSet({ expected, qr: options.qr, read })
    // The planted leak: one tagged same-origin GET with a receipt value in
    // a custom header, sent through Runtime.evaluate, not app code.
    const plantedValue = values[0] ?? 'Restaurante O Cantinho'
    await cdp.send(
      'Runtime.evaluate',
      {
        expression: `fetch(${JSON.stringify(PLANTED_PATH)}, { headers: { 'X-Settle-Probe': ${JSON.stringify(plantedValue)} } }).catch(() => undefined)`,
        awaitPromise: true,
      },
      page,
    )
    await idle(1000)

    // Request bodies the protocol didn't inline.
    for (const entry of requests.values()) {
      if (entry.hasBody && entry.body === undefined) {
        const data = await cdp
          .send(
            'Network.getRequestPostData',
            { requestId: entry.requestId },
            entry.sessionId,
          )
          .catch(() => undefined)
        entry.body = data?.postData
      }
    }

    const all = [...requests.values()].filter(
      (entry) => entry.url !== undefined,
    )
    const planted = all.filter(
      (entry) => new URL(entry.url, preview.origin).pathname === PLANTED_PATH,
    )
    const network = all.filter(
      (entry) => !/^(blob|data):/.test(entry.url) && !planted.includes(entry),
    )
    const local = all
      .filter((entry) => /^(blob|data):/.test(entry.url))
      .map((entry) => entry.url.slice(0, 80))

    const plantedCheck = {
      found: planted.length === 1,
      valueSearchFails: planted.some(
        (entry) => findValues(requestText(entry), [plantedValue]).length > 0,
      ),
      headerRuleFails: planted.some(
        (entry) => headerFailures(entry).length > 0,
      ),
    }
    const failures = []
    for (const entry of network) {
      const problems = [
        ...(await structuralFailures(entry, preview.origin, pagePath)),
        ...headerFailures(entry),
        ...findValues(requestText(entry), values).map(
          (value) => `receipt value ${JSON.stringify(value)}`,
        ),
      ]
      if (problems.length > 0)
        failures.push({ url: entry.url, session: entry.session, problems })
    }
    const expectations = options.expect.map((part) => ({
      part,
      found: network
        .filter((entry) => entry.url.includes(part))
        .map((entry) => entry.session),
    }))

    const pass =
      plantedCheck.found &&
      plantedCheck.valueSearchFails &&
      plantedCheck.headerRuleFails &&
      failures.length === 0 &&
      csp.length === 0 &&
      expectations.every((expectation) => expectation.found.length > 0)

    const report = {
      mode,
      url,
      when: new Date().toISOString(),
      pass,
      plantedLeak: { value: plantedValue, ...plantedCheck },
      cleanRequests: network.length,
      failures,
      cspViolations: csp,
      workerExpectations: expectations,
      valueSetSize: values.length,
      sessions: [...sessions.values()].map((session) => session.label),
      requests: network.map((entry) => ({
        session: entry.session,
        method: entry.method,
        type: entry.type,
        url: entry.url,
        headerNames: Object.keys(entry.headers).sort(),
        headersAsSent: Boolean(entry.extraInfo),
        body: entry.body ?? null,
      })),
      local,
      console: console_,
    }
    if (options.out)
      await writeFile(options.out, `${JSON.stringify(report, null, 2)}\n`)
    return report
  } finally {
    await exitAll()
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = await run(parseArgs(process.argv.slice(2)))
  const summary = {
    pass: report.pass,
    plantedLeak: report.plantedLeak,
    cleanRequests: report.cleanRequests,
    failures: report.failures,
    cspViolations: report.cspViolations,
    workerExpectations: report.workerExpectations,
    sessions: report.sessions,
  }
  console.log(JSON.stringify(summary, null, 2))
  process.exit(report.pass ? 0 : 1)
}
