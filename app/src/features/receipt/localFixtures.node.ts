/**
 * Test support: R17's guard on the local real-receipt fixtures. The user's
 * real receipts carry personal data, so they live only in a git-ignored
 * folder on the user's machine. `.gitignore` stops an ordinary `git add`;
 * these checks detect what it can't stop (a `git add -f`, a file tracked
 * before the rule, one committed and then deleted). They detect; they
 * can't prevent: a check runs after the commit exists.
 *
 * Also format v2 of the fixtures (M2.5 plan, P1): loading and checking each
 * `<case>.expected.json`, and counting distinct receipts.
 */
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { cents, type Cents } from '../../lib/money.ts'
import type { ExpectedBill } from './accuracy.ts'
import type { TotalSource } from './model.ts'

/** The folder, relative to the repository root. */
export const LOCAL_FIXTURES = 'app/src/features/receipt/fixtures/local/'

export class ShallowRepositoryError extends Error {
  constructor() {
    super(
      'The history check needs a full clone, and this one is shallow: run `git fetch --unshallow`',
    )
  }
}

function git(repo: string, args: string[]): string {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim()
}

function lines(output: string): string[] {
  return output.split('\n').filter((line) => line !== '')
}

/** The repository root containing `dir`. */
export function repositoryRoot(dir: string): string {
  return git(dir, ['rev-parse', '--show-toplevel'])
}

/** Whether `path` (relative to the root) is git-ignored. */
export function isIgnored(repo: string, path: string): boolean {
  try {
    execFileSync('git', ['check-ignore', '-q', path], { cwd: repo })
    return true
  } catch {
    return false
  }
}

/**
 * Every path under `folder` that is tracked or staged: in the index, or in
 * the tree `HEAD` points to.
 */
export function trackedPaths(repo: string, folder = LOCAL_FIXTURES): string[] {
  const indexed = lines(git(repo, ['ls-files', '--', folder]))
  let committed: string[] = []
  try {
    committed = lines(
      git(repo, ['ls-tree', '-r', '--name-only', 'HEAD', '--', folder]),
    )
  } catch {
    // No commit yet: nothing is in a tree.
  }
  return [...new Set([...indexed, ...committed])].sort()
}

/**
 * Every commit reachable from any ref that touches `folder`, so a file
 * committed and then deleted is still found. A shallow repository sees
 * only the commits it fetched, so there the check refuses to pass.
 */
export function commitsTouching(
  repo: string,
  folder = LOCAL_FIXTURES,
): string[] {
  if (git(repo, ['rev-parse', '--is-shallow-repository']) === 'true') {
    throw new ShallowRepositoryError()
  }
  return lines(git(repo, ['log', '--all', '--format=%H', '--', folder]))
}

// --- Format v2 (M2.5 plan, P1) ------------------------------------------

/** How the image was made (P1). */
export type Capture = 'camera' | 'shared' | 'screenshot' | 'scan'

/**
 * P14: a tuning case, or one held out until CP6's measurement; or `extra`,
 * a receipt from elsewhere (freely licensed photos, e.g. Wikimedia
 * Commons), measured and reported beside the set but never counted in its
 * totals, its 94 % or its 30 receipts (the user's decision, 2026-10-01).
 */
export type Part = 'tuning' | 'heldOut' | 'extra'

export type LocalImageType = 'jpeg' | 'png' | 'heic' | 'pdf'

/** One local case: an image and what a correct import of it holds. */
export interface LocalCase {
  /** The expected file's name without `.expected.json`. */
  name: string
  /** The image's file name, next to the expected file. */
  image: string
  imageType: LocalImageType
  expected: ExpectedBill
  totalSource: TotalSource
  capture: Capture
  part: Part
  /** The distinct receipt: the case's own name, or `sameReceiptAs`'s. */
  receipt: string
  /** The per-case floor: the share of expected rows paired. */
  minRowAccuracy?: number
}

/** A bad expected file: the message names the case. */
export class LocalCaseError extends Error {
  readonly caseName: string
  constructor(caseName: string, problem: string) {
    super(`${caseName}.expected.json: ${problem}`)
    this.caseName = caseName
  }
}

const CAPTURES: readonly Capture[] = ['camera', 'shared', 'screenshot', 'scan']
const PARTS: readonly Part[] = ['tuning', 'heldOut', 'extra']
const FIELDS = [
  'image',
  'total',
  'totalSource',
  'items',
  'discount',
  'tip',
  'tax',
  'sameReceiptAs',
  'part',
  'capture',
  'minRowAccuracy',
  'note',
]

/** `"51.25"` → 5125 cents; anything else is `undefined`. */
export function decimalToCents(value: unknown): Cents | undefined {
  if (typeof value !== 'string') return undefined
  const match = /^(\d{1,7})(?:\.(\d{1,2}))?$/.exec(value)
  if (!match) return undefined
  const whole = Number(match[1])
  const fraction = Number((match[2] ?? '').padEnd(2, '0'))
  return cents(whole * 100 + fraction)
}

function imageTypeOf(file: string): LocalImageType | undefined {
  const extension = path.extname(file).toLowerCase()
  if (extension === '.jpg' || extension === '.jpeg') return 'jpeg'
  if (extension === '.png') return 'png'
  if (extension === '.heic' || extension === '.heif') return 'heic'
  // A receipt a store's app exports, read from its text layer (D6).
  if (extension === '.pdf') return 'pdf'
  return undefined
}

type Parsed = Omit<LocalCase, 'receipt'> & { sameReceiptAs?: string }

/** One expected file, checked; `imageExists` looks next to it. */
export function parseLocalCase(
  name: string,
  json: unknown,
  imageExists: (file: string) => boolean,
): Parsed {
  const fail = (problem: string): never => {
    throw new LocalCaseError(name, problem)
  }
  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    return fail('not a JSON object')
  }
  const raw = json as Record<string, unknown>
  for (const key of Object.keys(raw)) {
    if (!FIELDS.includes(key)) fail(`unknown field "${key}"`)
  }
  const image = raw.image
  if (typeof image !== 'string' || image === '' || image.includes('/')) {
    return fail('"image" must be a file name')
  }
  const imageType =
    imageTypeOf(image) ?? fail(`"${image}" isn't JPEG, PNG or HEIC`)
  if (!imageExists(image)) fail(`the image "${image}" is missing`)
  const amount = (key: string, value: unknown): Cents =>
    decimalToCents(value) ??
    fail(`"${key}" must be a decimal string, like "12.30"`)
  const total = amount('total', raw.total)
  if (raw.totalSource !== 'qr' && raw.totalSource !== 'printed') {
    fail('"totalSource" must be "qr" or "printed"')
  }
  if (!Array.isArray(raw.items) || raw.items.length === 0) {
    fail('"items" must be a non-empty list')
  }
  const items = (raw.items as unknown[]).map((item, index) => {
    const row = item as Record<string, unknown> | null
    if (typeof row?.name !== 'string' || row.name.trim() === '') {
      return fail(`items[${index}] needs a name`)
    }
    return { name: row.name, price: amount(`items[${index}].price`, row.price) }
  })
  const expected: ExpectedBill = { total, items }
  for (const key of ['discount', 'tip', 'tax'] as const) {
    if (raw[key] !== undefined) expected[key] = amount(key, raw[key])
  }
  if (!CAPTURES.includes(raw.capture as Capture)) {
    fail(`"capture" must be one of ${CAPTURES.join(', ')}`)
  }
  if (!PARTS.includes(raw.part as Part)) {
    fail('"part" must be "tuning", "heldOut" or "extra"')
  }
  if (
    raw.sameReceiptAs !== undefined &&
    typeof raw.sameReceiptAs !== 'string'
  ) {
    fail('"sameReceiptAs" must be a case name')
  }
  const floor = raw.minRowAccuracy
  if (
    floor !== undefined &&
    (typeof floor !== 'number' || !(floor >= 0 && floor <= 1))
  ) {
    fail('"minRowAccuracy" must be a number from 0 to 1')
  }
  return {
    name,
    image,
    imageType,
    expected,
    totalSource: raw.totalSource as TotalSource,
    capture: raw.capture as Capture,
    part: raw.part as Part,
    ...(raw.sameReceiptAs !== undefined && {
      sameReceiptAs: raw.sameReceiptAs as string,
    }),
    ...(floor !== undefined && { minRowAccuracy: floor as number }),
  }
}

/**
 * Links each case to its distinct receipt by following `sameReceiptAs`;
 * an unknown name, or a loop, fails with the case's name.
 */
export function linkReceipts(parsed: readonly Parsed[]): LocalCase[] {
  const byName = new Map(parsed.map((entry) => [entry.name, entry]))
  return parsed.map(({ sameReceiptAs, ...entry }) => {
    let receipt = entry.name
    let next = sameReceiptAs
    const seen = new Set([entry.name])
    while (next !== undefined) {
      const target = byName.get(next)
      if (target === undefined) {
        throw new LocalCaseError(
          entry.name,
          `"sameReceiptAs" names an unknown case "${next}"`,
        )
      }
      if (seen.has(next)) {
        throw new LocalCaseError(entry.name, '"sameReceiptAs" loops')
      }
      seen.add(next)
      receipt = next
      next = target.sameReceiptAs
    }
    return { ...entry, receipt }
  })
}

/** Every case in `dir` (none if it's missing), sorted by name. */
export async function loadLocalCases(dir: string): Promise<LocalCase[]> {
  if (!existsSync(dir)) return []
  const names = (await readdir(dir))
    .filter((file) => file.endsWith('.expected.json'))
    .map((file) => file.replace(/\.expected\.json$/, ''))
    .sort()
  const parsed: Parsed[] = []
  for (const name of names) {
    const text = await readFile(path.join(dir, `${name}.expected.json`), 'utf8')
    let json: unknown
    try {
      json = JSON.parse(text)
    } catch {
      throw new LocalCaseError(name, 'not valid JSON')
    }
    parsed.push(
      parseLocalCase(name, json, (file) => existsSync(path.join(dir, file))),
    )
  }
  return linkReceipts(parsed)
}

/** P14: held-out cases are scored only when asked for. */
export function selectCases(
  cases: readonly LocalCase[],
  { heldOut }: { heldOut: boolean },
): { scored: LocalCase[]; skipped: LocalCase[] } {
  return {
    scored: cases.filter((entry) => heldOut || entry.part !== 'heldOut'),
    skipped: cases.filter((entry) => !heldOut && entry.part === 'heldOut'),
  }
}

/** The cases that count in the set's totals: every part but `extra`. */
export function countedCases(cases: readonly LocalCase[]): LocalCase[] {
  return cases.filter((entry) => entry.part !== 'extra')
}

/** The number of distinct receipts among `cases`. */
export function distinctReceipts(cases: readonly LocalCase[]): number {
  return new Set(cases.map((entry) => entry.receipt)).size
}
