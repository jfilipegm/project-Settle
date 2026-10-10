/**
 * The design evidence (M3 plan, S13, CP6): every screen of the production
 * build in headless Brave, at 360, 390, 1024 and 1440 px, light and dark.
 *
 * - A screenshot of each screen at 390, 1024 and 1440 px, both themes.
 * - Each screen's rendered DOM (`document.documentElement.outerHTML`),
 *   with the built CSS linked as `app.css`, for the design checkers: the
 *   built index.html is only the app shell with an empty #root (L1-I4).
 * - The 360 px check: no horizontal scroll (`scrollWidth <= clientWidth`).
 * - The keyboard pass: Tab through each screen; every stop must be a
 *   control with a visible focus indicator.
 * - The chart tips (M5, B1): at 360 px, a tip shown on the overview's
 *   first and last bars stays inside its card.
 *
 * Only invented names and amounts appear. The bill is seeded in storage,
 * like a saved draft, and the household ledger (M4) in IndexedDB; no
 * receipt is read.
 *
 *   node scripts/screens.mjs --out <dir> [--brave <path>] [--port <n>]
 *
 * Writes `<dir>/<screen>-<width>-<theme>.webp` and `.html`, `app.css`, and
 * `report.json`. Exit code 0 is a pass, 1 a failure.
 */
import { copyFile, mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { APP_DIR, Cdp, sleep, startBrave, startPreview } from './browser.mjs'

const WIDTHS = { shot: [390, 1024, 1440], scroll: 360 }
const THEMES = ['light', 'dark']

/** An invented bill: three people, four items, a tip. */
const BILL = {
  people: [
    { id: 'p1', name: 'Ana' },
    { id: 'p2', name: 'Bruno' },
    { id: 'p3', name: 'Carla' },
  ],
  items: [
    item('i1', 'Pizza margherita', 1450, ['p1', 'p2']),
    item('i2', 'Bitoque', 1290, ['p2']),
    item('i3', 'Salada mista', 650, ['p1', 'p2', 'p3']),
    item('i4', 'Vinho da casa', 1200, ['p1', 'p3']),
  ],
  tax: { kind: 'amount', value: 0 },
  taxMode: 'proportional',
  tip: { kind: 'percent', ratio: { numerator: 5, denominator: 1 } },
  tipMode: 'proportional',
  discount: { kind: 'amount', value: 0 },
  payerId: 'p1',
}

/** A receipt check for the invented bill (45,90 € and a 5 % tip). */
const RECEIPT = {
  merchant: 'Café Central',
  date: '2026-10-08',
  total: 4820,
  totalSource: 'qr',
  ivaTotal: 858,
  warnings: [],
  flaggedItemIds: ['i4'],
}

function item(id, name, unitPrice, people) {
  return {
    id,
    name,
    quantity: { numerator: 1, denominator: 1 },
    unitPrice,
    assignees: people.map((personId) => ({ personId, weight: 1 })),
  }
}

/** This month and day, so the overview shows the seeded expenses. */
const now = new Date()
const MONTH = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
const day = (n) =>
  `${MONTH}-${String(Math.min(n, now.getDate())).padStart(2, '0')}`
/** A day `back` months before this one, for the six-month trend (M-7). */
const earlier = (back, n) => {
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth() - back, n))
  return d.toISOString().slice(0, 10)
}

/**
 * An invented household (M4): four members and one who left, quick
 * expenses of each method, one itemised expense with its receipt, and a
 * payment (M5).
 */
const LEDGER = (() => {
  const v = 1
  const stamp = new Date().toISOString()
  const people = [
    ['ana', 'Ana'],
    ['marta', 'Marta'],
    ['joao', 'João'],
    ['tiago', 'Tiago'],
  ]
  const members = people.map(([id, name], position) => ({
    v,
    id,
    householdId: 'h1',
    name,
    position,
    joinedOn: '2026-01-01',
  }))
  members.push({
    v,
    id: 'rui',
    householdId: 'h1',
    name: 'Rui',
    position: 4,
    joinedOn: '2026-01-01',
    leftOn: '2026-06-30',
  })
  const all = ['ana', 'marta', 'joao', 'tiago']
  const quick = (id, description, category, payerId, date, split) => ({
    v,
    id,
    householdId: 'h1',
    description,
    date,
    category,
    payerId,
    split,
    createdAt: stamp,
    updatedAt: stamp,
  })
  // Earlier months, so the overview's six-month trend has a shape.
  const history = [
    [1, 21430],
    [2, 18760],
    [3, 25290],
    [4, 16120],
    [5, 19980],
  ].map(([back, amount]) =>
    quick(
      `m${back}`,
      'Groceries, the month',
      'groceries',
      'ana',
      earlier(back, 12),
      {
        kind: 'equal',
        amount,
        memberIds: all,
      },
    ),
  )
  const expenses = [
    ...history,
    quick('e1', 'Electricity, September', 'utilities', 'marta', day(2), {
      kind: 'equal',
      amount: 8640,
      memberIds: all,
    }),
    quick('e2', 'Takeaway, Friday night', 'eatingOut', 'joao', day(3), {
      kind: 'shares',
      amount: 4290,
      shares: [
        { memberId: 'ana', weight: 1 },
        { memberId: 'joao', weight: 2 },
      ],
    }),
    quick('e3', 'Internet', 'internet', 'tiago', day(4), {
      kind: 'percent',
      amount: 3854,
      percents: all.map((memberId) => ({
        memberId,
        ratio: { numerator: 25, denominator: 1 },
      })),
    }),
    quick('e4', 'Kitchen shelves', 'household', 'joao', day(5), {
      kind: 'exact',
      amount: 6999,
      amounts: [
        { memberId: 'ana', amount: 3000 },
        { memberId: 'joao', amount: 3999 },
      ],
    }),
    {
      ...quick('it1', 'Continente', 'groceries', 'ana', day(6), null),
      split: {
        kind: 'itemised',
        bill: BILL,
        members: [
          { personId: 'p1', memberId: 'ana' },
          { personId: 'p2', memberId: 'marta' },
          { personId: 'p3', memberId: 'tiago' },
        ],
      },
      receipt: {
        merchant: 'Continente',
        date: day(6),
        total: 3847,
        totalSource: 'qr',
      },
      receiptKey: 'qr:500000000:INVENTED-1',
    },
  ]
  const settlements = [
    {
      v,
      id: 's1',
      householdId: 'h1',
      fromId: 'tiago',
      toId: 'marta',
      amount: 2000,
      date: day(7),
      note: 'Electricity share',
      createdAt: stamp,
      updatedAt: stamp,
    },
  ]
  return {
    households: [
      {
        v,
        id: 'h1',
        name: 'Rua das Flores 12',
        createdAt: stamp,
        updatedAt: stamp,
      },
    ],
    members,
    expenses,
    settlements,
  }
})()

const SCREENS = [
  { name: 'home', path: '/' },
  { name: 'receipt', path: '/split?step=receipt', bill: false },
  { name: 'who-had-what', path: '/split?step=items', bill: true },
  { name: 'the-split', path: '/split?step=split', bill: true },
  {
    name: 'save-to-household',
    path: '/split?step=split',
    bill: true,
    ledger: true,
    click: 'Save to a household',
  },
  { name: 'households-empty', path: '/households', ledger: 'empty' },
  { name: 'households', path: '/households', ledger: true },
  { name: 'household-overview', path: '/households/h1', ledger: true },
  { name: 'household-expenses', path: '/households/h1/expenses', ledger: true },
  { name: 'household-members', path: '/households/h1/members', ledger: true },
  { name: 'new-expense', path: '/households/h1/expenses/new', ledger: true },
  {
    name: 'itemised-expense',
    path: '/households/h1/expenses/it1',
    ledger: true,
  },
  {
    name: 'expense-dialog',
    path: '/households/h1/expenses?expense=e2',
    ledger: true,
  },
  // M5: balances, the payment dialog, a payment in the history.
  { name: 'household-balances', path: '/households/h1/balances', ledger: true },
  {
    name: 'balance-explanation',
    path: '/households/h1/balances/ana',
    ledger: true,
  },
  {
    name: 'payment-dialog-empty',
    path: '/households/h1/balances',
    ledger: true,
    click: 'Record a payment',
  },
  {
    name: 'payment-dialog-filled',
    path: '/households/h1/balances',
    ledger: true,
    click: 'Mark as paid',
  },
  {
    name: 'payment-dialog',
    path: '/households/h1/expenses?settlement=s1',
    ledger: true,
  },
  { name: 'settings', path: '/settings' },
  { name: 'not-found', path: '/no/such/page' },
]

/**
 * The page script that rebuilds the ledger's database (M4): deleted, then
 * created at version 2 with its stores, as `data/db.ts` does (M5 added the
 * payments' store), and filled.
 */
function ledgerScript(ledger) {
  const records = JSON.stringify({ settlements: [], ...ledger })
  return `new Promise((resolve, reject) => {
    const del = indexedDB.deleteDatabase('settle')
    del.onerror = () => reject(del.error)
    del.onsuccess = () => {
      const open = indexedDB.open('settle', 2)
      open.onupgradeneeded = () => {
        const db = open.result
        db.createObjectStore('households', { keyPath: 'id' })
        db.createObjectStore('members', { keyPath: 'id' }).createIndex('byHousehold', 'householdId')
        const e = db.createObjectStore('expenses', { keyPath: 'id' })
        e.createIndex('byHousehold', 'householdId')
        e.createIndex('byReceiptKey', ['householdId', 'receiptKey'])
        db.createObjectStore('meta', { keyPath: 'key' })
          .put({ key: 'schema', version: 2, migratedAt: new Date().toISOString() })
        db.createObjectStore('settlements', { keyPath: 'id' }).createIndex('byHousehold', 'householdId')
      }
      open.onerror = () => reject(open.error)
      open.onsuccess = () => {
        const db = open.result
        const data = ${records}
        const tx = db.transaction(['households', 'members', 'expenses', 'settlements'], 'readwrite')
        for (const h of data.households) tx.objectStore('households').put(h)
        for (const m of data.members) tx.objectStore('members').put(m)
        for (const x of data.expenses) tx.objectStore('expenses').put(x)
        for (const p of data.settlements) tx.objectStore('settlements').put(p)
        tx.oncomplete = () => { db.close(); resolve(true) }
        tx.onerror = () => reject(tx.error)
      }
    }
  })`
}

/**
 * At 360 px (M5, B1): hovers a chart's first and last bars on the
 * overview and returns any tip that leaves its card.
 */
const TIP_CHECK = `(async () => {
  const out = []
  const slots = [...document.querySelectorAll('[role="group"] [tabindex]')]
  const groups = new Set(slots.map((s) => s.closest('[role="group"]')))
  for (const group of groups) {
    const marks = [...group.querySelectorAll('[tabindex]')]
    for (const mark of [marks[0], marks.at(-1)]) {
      if (!mark) continue
      mark.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' }))
      await new Promise((r) => requestAnimationFrame(() => r(true)))
      const tip = group.querySelector('[data-testid="chart-tip"]')
      const card = group.closest('section') ?? group
      if (!tip) { out.push('no tip on ' + (mark.getAttribute('aria-label') ?? '?')); continue }
      const t = tip.getBoundingClientRect()
      const c = card.getBoundingClientRect()
      if (t.left < c.left - 0.5 || t.right > c.right + 0.5) {
        out.push('tip outside its card: ' + tip.textContent + ' ' + Math.round(t.left) + '-' + Math.round(t.right) + ' in ' + Math.round(c.left) + '-' + Math.round(c.right))
      }
      mark.dispatchEvent(new PointerEvent('pointerout', { bubbles: true, pointerType: 'mouse' }))
    }
  }
  return { checked: groups.size, problems: out }
})()`

function storageFor(screen, theme) {
  const entries = {
    'settle.theme': theme,
    'settle.language': 'en',
  }
  if (screen.ledger === true) entries['settle.household'] = 'h1'
  if (screen.bill) {
    entries['settle.bill'] = JSON.stringify({ version: 1, bill: BILL })
    entries['settle.receipt'] = JSON.stringify({
      version: 1,
      receipt: RECEIPT,
    })
  }
  return entries
}

async function openPage(cdp) {
  const { targetId } = await cdp.send('Target.createTarget', {
    url: 'about:blank',
  })
  const { sessionId } = await cdp.send('Target.attachToTarget', {
    targetId,
    flatten: true,
  })
  await cdp.send('Page.enable', {}, sessionId)
  await cdp.send('Runtime.enable', {}, sessionId)
  return { targetId, sessionId }
}

async function evaluate(cdp, session, expression) {
  const { result, exceptionDetails } = await cdp.send(
    'Runtime.evaluate',
    { expression, awaitPromise: true, returnByValue: true },
    session,
  )
  if (exceptionDetails) {
    throw new Error(exceptionDetails.exception?.description ?? 'evaluate')
  }
  return result.value
}

/** Loads a screen with its storage, at a width, and waits for the fonts. */
async function load(cdp, session, origin, screen, theme, width) {
  await cdp.send(
    'Emulation.setDeviceMetricsOverride',
    { width, height: 900, deviceScaleFactor: 1, mobile: width < 640 },
    session,
  )
  await cdp.send(
    'Emulation.setEmulatedMedia',
    {
      features: [
        { name: 'prefers-color-scheme', value: theme },
        { name: 'prefers-reduced-motion', value: 'reduce' },
      ],
    },
    session,
  )
  // Storage is per origin: set it on a page of the app, then load.
  await cdp.send('Page.navigate', { url: `${origin}/` }, session)
  await sleep(300)
  const storage = JSON.stringify(storageFor(screen, theme))
  await evaluate(
    cdp,
    session,
    `localStorage.clear(); for (const [k, v] of Object.entries(${storage})) localStorage.setItem(k, v)`,
  )
  // The ledger (M4): rebuilt for each load, empty or seeded.
  await evaluate(
    cdp,
    session,
    ledgerScript(
      screen.ledger === true
        ? LEDGER
        : { households: [], members: [], expenses: [], settlements: [] },
    ),
  )
  await cdp.send('Page.navigate', { url: `${origin}${screen.path}` }, session)
  await sleep(400)
  await evaluate(
    cdp,
    session,
    `document.fonts.ready.then(() => new Promise((r) => requestAnimationFrame(() => r(true))))`,
  )
  await sleep(200)
  if (screen.click !== undefined) {
    // A dialog's screen: open it from its (first) button, by its words.
    await evaluate(
      cdp,
      session,
      `[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === ${JSON.stringify(screen.click)})?.click() ?? true`,
    )
    await sleep(500)
  }
}

/**
 * The whole page in one image. The viewport grows to the page's height
 * first, so the fixed tab bar sits at the bottom of the image, as it does
 * on a phone, instead of across the middle.
 */
async function screenshot(cdp, session, file, width) {
  const height = await evaluate(
    cdp,
    session,
    'Math.ceil(document.documentElement.scrollHeight)',
  )
  await cdp.send(
    'Emulation.setDeviceMetricsOverride',
    { width, height, deviceScaleFactor: 1, mobile: width < 640 },
    session,
  )
  await sleep(200)
  const { data } = await cdp.send(
    'Page.captureScreenshot',
    { format: 'webp', quality: 85 },
    session,
  )
  await writeFile(file, Buffer.from(data, 'base64'))
  await cdp.send(
    'Emulation.setDeviceMetricsOverride',
    { width, height: 900, deviceScaleFactor: 1, mobile: width < 640 },
    session,
  )
}

/** The rendered DOM, with the built CSS linked as app.css next to it. */
async function saveDom(cdp, session, file) {
  const html = await evaluate(
    cdp,
    session,
    'document.documentElement.outerHTML',
  )
  const linked = html
    .replace(/<link rel="stylesheet"[^>]*>/g, '')
    .replace('</head>', '<link rel="stylesheet" href="app.css"></head>')
  await writeFile(file, `<!doctype html>\n${linked}\n`)
}

/** Tabs through the screen: each stop a control with a visible focus ring. */
async function keyboardPass(cdp, session) {
  const stops = []
  for (let i = 0; i < 60; i++) {
    await cdp.send(
      'Input.dispatchKeyEvent',
      { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 },
      session,
    )
    await cdp.send(
      'Input.dispatchKeyEvent',
      { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 },
      session,
    )
    const stop = await evaluate(
      cdp,
      session,
      `(() => {
        const el = document.activeElement
        if (!el || el === document.body) return null
        const style = getComputedStyle(el)
        const ring = style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0
        const label = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('name') || '').trim().slice(0, 40)
        return { tag: el.tagName.toLowerCase(), type: el.getAttribute('type') ?? undefined, label, ring, focusVisible: el.matches(':focus-visible'), outline: style.outlineStyle + ' ' + style.outlineWidth }
      })()`,
    )
    if (stop === null) break
    const last = stops.at(-1)
    if (
      stops.length > 2 &&
      last &&
      stops[0].label === stop.label &&
      stops[0].tag === stop.tag
    )
      break
    stops.push(stop)
  }
  return stops
}

async function main() {
  const args = process.argv.slice(2)
  const flag = (name, fallback) => {
    const index = args.indexOf(name)
    return index === -1 ? fallback : args[index + 1]
  }
  const out = path.resolve(flag('--out', 'screens'))
  const port = Number(flag('--port', '4191'))
  await rm(out, { recursive: true, force: true })
  await mkdir(out, { recursive: true })
  const css = (await readdir(path.join(APP_DIR, 'dist', 'assets'))).find(
    (file) => /^index-.*\.css$/.test(file),
  )
  await copyFile(
    path.join(APP_DIR, 'dist', 'assets', css),
    path.join(out, 'app.css'),
  )

  const preview = await startPreview(port)
  const brave = await startBrave(flag('--brave', '/usr/bin/brave'))
  const cdp = await Cdp.connect(brave.ws)
  const report = { when: new Date().toISOString(), screens: [], problems: [] }
  try {
    const { sessionId } = await openPage(cdp)
    for (const screen of SCREENS) {
      for (const theme of THEMES) {
        for (const width of WIDTHS.shot) {
          await load(cdp, sessionId, preview.origin, screen, theme, width)
          const base = path.join(out, `${screen.name}-${width}-${theme}`)
          await screenshot(cdp, sessionId, `${base}.webp`, width)
          await saveDom(cdp, sessionId, `${base}.html`)
          const entry = { screen: screen.name, width, theme }
          if (width === 1440 && theme === 'light') {
            entry.keyboard = await keyboardPass(cdp, sessionId)
            for (const stop of entry.keyboard) {
              if (!stop.ring) {
                report.problems.push(
                  `${screen.name}: no focus ring on ${stop.tag} "${stop.label}"`,
                )
              }
            }
          }
          report.screens.push(entry)
        }
        await load(cdp, sessionId, preview.origin, screen, theme, WIDTHS.scroll)
        const scroll = await evaluate(
          cdp,
          sessionId,
          '({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth })',
        )
        report.screens.push({
          screen: screen.name,
          width: 360,
          theme,
          ...scroll,
        })
        if (scroll.scrollWidth > scroll.clientWidth) {
          report.problems.push(
            `${screen.name} (${theme}) scrolls sideways at 360 px: ${scroll.scrollWidth} > ${scroll.clientWidth}`,
          )
        }
        if (screen.name === 'household-overview') {
          const tips = await evaluate(cdp, sessionId, TIP_CHECK)
          report.screens.push({
            screen: 'chart-tips',
            width: 360,
            theme,
            ...tips,
          })
          if (tips.checked === 0) {
            report.problems.push(
              `chart tips (${theme}): no bar chart found at 360 px`,
            )
          }
          for (const problem of tips.problems) {
            report.problems.push(`chart tips (${theme}) at 360 px: ${problem}`)
          }
        }
      }
    }
  } finally {
    cdp.close()
    brave.child.kill()
    preview.child.kill()
    await rm(brave.profile, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 200,
    })
  }
  await writeFile(
    path.join(out, 'report.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  )
  console.log(
    `screens: ${SCREENS.length} screens, ${report.screens.length} checks, ${report.problems.length} problems`,
  )
  for (const problem of report.problems) console.log(`  ${problem}`)
  process.exit(report.problems.length === 0 ? 0 : 1)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main()
}
