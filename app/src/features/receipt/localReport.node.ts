/**
 * Test support: the local measurements' reports (M2.5 plan, P2, P3), shared
 * by the Node test and `scripts/measure-local.mjs`. What they print is
 * numbers and case names only; the full report, which holds receipt text,
 * goes to the git-ignored `.ai-review/local-measure/` and nowhere else.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { Bill } from '../split/model.ts'
import {
  nameMatches,
  normalizeName,
  readRows,
  rowAccuracy,
  scoreSet,
  type ImageScore,
  type ScoredImage,
  type SetScore,
} from './accuracy.ts'
import type { LocalCase } from './localFixtures.node.ts'

/** The report folder, relative to the repository root (git-ignored). */
export const REPORT_DIR = '.ai-review/local-measure'

const round = (value: number) => Number(value.toFixed(3))

/** One case's printed line: its name and numbers, no receipt text. */
export function caseNumbers(entry: LocalCase, score: ImageScore) {
  return {
    case: entry.name,
    part: entry.part,
    capture: entry.capture,
    noEditNeeded: score.noEditNeeded,
    rows: score.rowsRight,
    adjustments: score.adjustmentsRight,
    total: score.totalRight,
    rowAccuracy: round(rowAccuracy(score)),
    expectedRows: score.expectedRows,
    pairedRows: score.pairedRows,
    extraRows: score.extraRows,
    exactNames: score.exactNames,
    pricePairedRows: score.pricePairedRows,
    check: score.check,
    falseMatch: score.falseMatch,
    amountCoverage: round(score.amountCoverage),
  }
}

/** The set's totals, rounded for printing. */
export function setNumbers(images: readonly ScoredImage[]): SetScore {
  const totals = scoreSet(images)
  return {
    ...totals,
    receiptAccuracy: round(totals.receiptAccuracy),
    distinctReceiptAccuracy: round(totals.distinctReceiptAccuracy),
    rowAccuracy: round(totals.rowAccuracy),
    priceRowAccuracy: round(totals.priceRowAccuracy),
    rowPrecision: round(totals.rowPrecision),
    checkMatches: round(totals.checkMatches),
    nameAccuracy: round(totals.nameAccuracy),
  }
}

/**
 * The set's totals, and the `extra` cases' apart: they never count in the
 * set's (the user's decision, 2026-10-01).
 */
export function partNumbers(
  images: readonly ScoredImage[],
  cases: readonly LocalCase[],
): { totals: SetScore; extra?: SetScore } {
  const extra = new Set(
    cases.filter((entry) => entry.part === 'extra').map((entry) => entry.name),
  )
  const counted = images.filter((image) => !extra.has(image.name))
  const others = images.filter((image) => extra.has(image.name))
  return {
    totals: setNumbers(counted),
    ...(others.length > 0 && { extra: setNumbers(others) }),
  }
}

export interface RightPriceRow {
  read: string
  expected: string
  pairs: boolean
}

/**
 * Every read row whose line total is an expected row's price, with whether
 * the name rule pairs it (CP1's check that the rule doesn't reject
 * ordinary OCR noise). Report-only: it holds receipt text.
 */
export function rightPriceRows(bill: Bill, entry: LocalCase): RightPriceRow[] {
  return readRows(bill).flatMap((row) => {
    const same = entry.expected.items.filter(
      (item) => item.price === row.amount,
    )
    if (same.length === 0) return []
    const match = same.find((item) => nameMatches(row.name, item.name))
    return [
      {
        read: row.name,
        expected: (match ?? same[0])?.name ?? '',
        pairs: match !== undefined,
      },
    ]
  })
}

export interface NameCheck {
  /** Pairs of different expected names the rule would pair: must be none. */
  collisions: [string, string][]
  /** The same product on different receipts: listed, not counted. */
  identical: [string, string][]
  /**
   * Pairs the rule pairs where one name is the other cut short, as a
   * printer truncates a name to its column: most likely the same product,
   * so listed (for the user to confirm), not counted.
   */
  truncated: [string, string][]
  pairsCompared: number
}

/**
 * CP1's check of the name rule on the set's own names: every pair of
 * expected names from different rows; none may be recognisable as the
 * other unless they're the same product (equal once normalised, or one
 * cut short).
 */
export function checkSetNames(cases: readonly LocalCase[]): NameCheck {
  const names = cases.flatMap((entry) =>
    entry.expected.items.map((item) => item.name),
  )
  const result: NameCheck = {
    collisions: [],
    identical: [],
    truncated: [],
    pairsCompared: 0,
  }
  for (let a = 0; a < names.length; a++) {
    for (let b = a + 1; b < names.length; b++) {
      const first = names[a] ?? ''
      const second = names[b] ?? ''
      if (normalizeName(first) === normalizeName(second)) {
        result.identical.push([first, second])
        continue
      }
      result.pairsCompared++
      if (nameMatches(first, second) || nameMatches(second, first)) {
        const [short, long] = [first, second]
          .map(normalizeName)
          .sort((x, y) => x.length - y.length)
        if (long?.startsWith(short ?? ''))
          result.truncated.push([first, second])
        else result.collisions.push([first, second])
      }
    }
  }
  return result
}

/** Writes `report` under the repository's report folder; its path. */
export async function writeReport(
  repoRoot: string,
  kind: string,
  report: unknown,
): Promise<string> {
  const dir = path.join(repoRoot, REPORT_DIR)
  await mkdir(dir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const file = path.join(dir, `${kind}-${stamp}.json`)
  await writeFile(file, `${JSON.stringify(report, null, 2)}\n`)
  return file
}
