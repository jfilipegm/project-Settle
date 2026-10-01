/**
 * The real-browser privacy check (M2 plan, D9, M-I-4). It serves the
 * production build with `vite preview`, starts headless Brave with a fresh
 * temporary profile, and drives it over the DevTools protocol with Node's
 * built-in WebSocket (no dependency). It records every request, from the
 * document and from each dedicated worker (auto-attached, paused until its
 * Network domain is on), with its URL, method, headers as sent and body,
 * and every CSP violation. The app is served through a small logging
 * proxy in front of `vite preview`, which records every request that
 * reaches the origin with its headers exactly as received (raw, in order)
 * and its body. That is the ground truth for what left the browser, and it
 * covers worker requests too, for which Chromium sends no
 * `requestWillBeSentExtraInfo` (so the protocol log only has the headers
 * `requestWillBeSent` reports). Then it checks:
 *
 * - structure: each request is a same-origin GET with no body and no query
 *   string, for a file in the build output (`blob:`/`data:` are local and
 *   listed apart);
 * - header names: only the browser's standard set (HEADER_NAMES), compared
 *   case-insensitively;
 * - values: no value from the receipt (VALUE SET below) appears in any
 *   request's URL, method, headers or body;
 * - no CSP violation in the console;
 * - the same header-name, method, body and value checks over every request
 *   the proxy received, and that each one was also seen in the protocol log
 *   (a request the protocol missed fails the run).
 *
 * Every run first proves the check can fail: it has the page send one
 * tagged same-origin GET carrying a receipt value in a custom header. That
 * planted request is checked on its own, in the protocol log and as the
 * proxy received it, and must fail both the value search and the
 * header-name rule in each; it is left out of the clean log, and every
 * other request is the clean log, which must pass.
 *
 * The saved log (--out) keeps every header value, the value set searched,
 * and the proxy's log, so the result can be re-checked offline:
 *   node scripts/check-requests.mjs audit --log <log.json>
 * re-runs the header-name rule and the value search over the saved
 * requests and exits 1 on a failure or any difference from the saved
 * verdict on the requests (the CSP and worker expectations aren't
 * re-checked: they're in the log as recorded). (The
 * browser profile is a fresh temporary one, so its headers hold nothing
 * private: no cookie is ever set.)
 *
 * Modes:
 *   node scripts/check-requests.mjs page-load [--values <expected.json>]
 *   node scripts/check-requests.mjs scan --file <receipt> --values <expected.json>
 *       [--qr <payload>] [--expect <url part>]... [--input <selector>]
 *       (--qr defaults to the `.expected.json`'s own `qr`)
 *       [--wait <selector>]
 * Common: [--out <log.json>] [--brave <path>] [--path <route>] [--port <n>]
 *   [--probe-csp yes] (triggers one CSP violation, so the run must fail)
 *   (the proxy listens on --port, default 4179; vite preview on the next)
 *
 * Run `npm run build` first. Exit code 0 is a pass, 1 a failure.
 */
import http from 'node:http'
import { readFile, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  APP_DIR,
  Cdp,
  sleep,
  startBrave,
  startPreview,
  waitFor,
} from './browser.mjs'

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

/**
 * A request as the proxy received it, in the shape the checks read:
 * `rawHeaders` (name/value pairs, repeats kept) folded into `headers`.
 */
export function receivedAsRequest(received) {
  const headers = {}
  for (const [name, value] of received.rawHeaders) {
    headers[name] =
      headers[name] === undefined ? value : `${headers[name]}\n${value}`
  }
  return {
    url: received.url,
    method: received.method,
    headers,
    body: received.body || undefined,
    hasBody: received.bodyBytes > 0,
  }
}

/** The checks that need no build or browser: header names and values. */
export function contentFailures(request, values) {
  return [
    ...headerFailures(request),
    ...findValues(requestText(request), values).map(
      (value) => `receipt value ${JSON.stringify(value)}`,
    ),
  ]
}

/**
 * The logging proxy: every request that reaches the origin, with its
 * method, path, raw headers and body, is recorded before it's passed on
 * to `vite preview` unchanged.
 */
async function startProxy(port, target) {
  const received = []
  const server = http.createServer((request, response) => {
    const chunks = []
    request.on('data', (chunk) => chunks.push(chunk))
    request.on('end', () => {
      const body = Buffer.concat(chunks)
      const rawHeaders = []
      for (let i = 0; i < request.rawHeaders.length; i += 2) {
        rawHeaders.push([request.rawHeaders[i], request.rawHeaders[i + 1]])
      }
      received.push({
        method: request.method,
        path: request.url,
        rawHeaders,
        bodyBytes: body.length,
        body: body.length > 0 ? body.toString('utf8') : '',
      })
      const upstream = http.request(
        {
          host: '127.0.0.1',
          port: target,
          method: request.method,
          path: request.url,
          headers: request.headers,
        },
        (reply) => {
          response.writeHead(reply.statusCode ?? 502, reply.headers)
          reply.pipe(response)
        },
      )
      upstream.on('error', () => {
        response.writeHead(502)
        response.end()
      })
      upstream.end(body)
    })
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', resolve)
  })
  return { server, received, origin: `http://127.0.0.1:${port}` }
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

  const port = Number(options.port ?? 4179)
  const preview = await startPreview(port + 1)
  const proxy = await startProxy(port, port + 1)
  // Before the browser starts, so it only holds the browser's requests.
  proxy.received.length = 0
  const origin = proxy.origin
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
    proxy.server.closeAllConnections()
    proxy.server.close()
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

    const url = `${origin}${pagePath}`
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

    // The QR payload: --qr, or the sample's `.expected.json` (CP3).
    const values = valueSet({ expected, qr: options.qr ?? expected.qr, read })
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
      (entry) => new URL(entry.url, origin).pathname === PLANTED_PATH,
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
        ...(await structuralFailures(entry, origin, pagePath)),
        ...contentFailures(entry, values),
      ]
      if (problems.length > 0)
        failures.push({ url: entry.url, session: entry.session, problems })
    }
    // What reached the origin, as the proxy received it.
    const receivedPlanted = proxy.received.filter(
      (entry) => entry.path === PLANTED_PATH,
    )
    const receivedClean = proxy.received.filter(
      (entry) => entry.path !== PLANTED_PATH,
    )
    plantedCheck.receivedByProxy = receivedPlanted.length === 1
    plantedCheck.proxyValueSearchFails = receivedPlanted.some(
      (entry) =>
        findValues(requestText(receivedAsRequest(entry)), [plantedValue])
          .length > 0,
    )
    plantedCheck.proxyHeaderRuleFails = receivedPlanted.some(
      (entry) => headerFailures(receivedAsRequest(entry)).length > 0,
    )
    // Each request the protocol log saw for this origin, by method and path.
    const seen = network
      .filter((entry) => new URL(entry.url).origin === origin)
      .map((entry) => {
        const url = new URL(entry.url)
        return `${entry.method} ${url.pathname}${url.search}`
      })
    const proxyFailures = []
    for (const entry of receivedClean) {
      const request = receivedAsRequest(entry)
      const problems = [
        ...(entry.method !== 'GET' ? [`method ${entry.method}`] : []),
        ...(entry.bodyBytes > 0 ? ['has a body'] : []),
        ...contentFailures(request, values),
      ]
      const index = seen.indexOf(`${entry.method} ${entry.path}`)
      if (index === -1) problems.push('not in the protocol log')
      else seen.splice(index, 1)
      if (problems.length > 0)
        proxyFailures.push({ path: entry.path, problems })
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
      plantedCheck.receivedByProxy &&
      plantedCheck.proxyValueSearchFails &&
      plantedCheck.proxyHeaderRuleFails &&
      failures.length === 0 &&
      proxyFailures.length === 0 &&
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
      receivedByProxy: receivedClean.length,
      proxyFailures,
      cspViolations: csp,
      workerExpectations: expectations,
      valueSetSize: values.length,
      // The exact values searched for, so `audit` can repeat the search.
      valueSet: values,
      // What the scan put in the bill (scan mode): evidence it really ran.
      appRead:
        mode === 'scan'
          ? {
              items: (read.bill?.bill?.items ?? []).length,
              total: read.receipt?.receipt?.total ?? null,
              totalSource: read.receipt?.receipt?.totalSource ?? null,
            }
          : undefined,
      sessions: [...sessions.values()].map((session) => session.label),
      requests: network.map((entry) => ({
        session: entry.session,
        method: entry.method,
        type: entry.type,
        url: entry.url,
        headerNames: Object.keys(entry.headers).sort(),
        headersAsSent: Boolean(entry.extraInfo),
        headers: entry.headers,
        body: entry.body ?? null,
      })),
      // Every request that reached the origin, headers as received.
      proxyReceived: receivedClean,
      plantedReceived: receivedPlanted,
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

/**
 * Re-checks a saved log offline: the header-name rule and the value search
 * over every saved request (protocol log and proxy log), with the saved
 * value set, and the planted leak's two failures. Needs no build or
 * browser. The result must agree with the saved verdict on the requests.
 */
export function audit(report) {
  const values = report.valueSet ?? []
  const problems = []
  if (!Array.isArray(report.valueSet) || !Array.isArray(report.proxyReceived))
    problems.push('the log has no value set or proxy log (an older log)')
  for (const entry of report.requests ?? []) {
    if (entry.headers === undefined) {
      problems.push(`${entry.url}: no saved header values`)
      continue
    }
    for (const failure of contentFailures(entry, values))
      problems.push(`${entry.url}: ${failure}`)
  }
  for (const entry of report.proxyReceived ?? []) {
    const request = receivedAsRequest(entry)
    for (const failure of contentFailures(request, values))
      problems.push(`received ${entry.path}: ${failure}`)
    if (entry.method !== 'GET' || entry.bodyBytes > 0)
      problems.push(`received ${entry.path}: not a GET without a body`)
  }
  const planted = (report.plantedReceived ?? []).map(receivedAsRequest)
  const plantedValue = report.plantedLeak?.value
  const plantedCaught =
    planted.length === 1 &&
    headerFailures(planted[0]).length > 0 &&
    findValues(requestText(planted[0]), [plantedValue]).length > 0
  if (!plantedCaught) problems.push('the planted leak is not caught')
  const pass = problems.length === 0
  // The saved verdict on the requests alone: the CSP and the worker
  // expectations are read from the log as they are, not re-checked here.
  const savedPass =
    (report.failures ?? []).length === 0 &&
    (report.proxyFailures ?? []).length === 0
  return { pass, agrees: pass === savedPass, problems }
}

if (
  process.argv[1] === fileURLToPath(import.meta.url) &&
  process.argv[2] === 'audit'
) {
  const options = parseArgs(process.argv.slice(2))
  if (!options.log) throw new Error('audit needs --log <log.json>')
  const result = audit(JSON.parse(await readFile(options.log, 'utf8')))
  console.log(JSON.stringify(result, null, 2))
  process.exit(result.pass && result.agrees ? 0 : 1)
} else if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = await run(parseArgs(process.argv.slice(2)))
  const summary = {
    pass: report.pass,
    plantedLeak: report.plantedLeak,
    cleanRequests: report.cleanRequests,
    failures: report.failures,
    receivedByProxy: report.receivedByProxy,
    proxyFailures: report.proxyFailures,
    cspViolations: report.cspViolations,
    workerExpectations: report.workerExpectations,
    sessions: report.sessions,
    appRead: report.appRead,
  }
  console.log(JSON.stringify(summary, null, 2))
  process.exit(report.pass ? 0 : 1)
}
