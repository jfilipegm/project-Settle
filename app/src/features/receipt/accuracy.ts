/**
 * P2's accuracy measure (M2.5 plan): how well one import read a real
 * receipt, and the totals over the local test set. Pure.
 *
 * An image needs **no edit** when (a) its read rows and the expected rows
 * pair one to one, each pair at the same line total and a recognisable
 * product ({@link nameMatches}); (b) the bill's discount, tip and tax equal
 * the expected ones as amounts (split modes aren't compared: the import
 * keeps the current bill's, D12); and (c) the trusted total equals the
 * expected total and the check says "match". A **false match** is a check
 * saying "match" while the money is wrong: (a) fails with rows paired by
 * line total alone, or (b) or (c) fails. Names never make a false match.
 *
 * R19's local coverage (M2R1) is kept as `amountCoverage`, so M2's
 * numbers stay comparable.
 */
import type { Cents } from '../../lib/money.ts'
import { adjustmentAmount, lineTotal, type Bill } from '../split/model.ts'
import { NOT_READ_ITEM_NAME } from './messages.ts'
import type { ReceiptSummary } from './model.ts'
import { checkReceipt, type ReceiptCheck } from './reconcile.ts'

/** One expected row: the name as printed, and the price the row carries. */
export interface ExpectedRow {
  name: string
  price: Cents
}

/** What a correct import of one image holds (P1, in cents). */
export interface ExpectedBill {
  total: Cents
  items: readonly ExpectedRow[]
  discount?: Cents
  tip?: Cents
  tax?: Cents
}

/** A read row: one bill item, by name and line total. */
export interface ReadRow {
  name: string
  amount: Cents
}

// --- Names ----------------------------------------------------------------

/** Lower case, no accents, alphanumerics and single spaces. */
export function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const LOOK_ALIKES: Readonly<Record<string, string>> = {
  '0': 'o',
  '1': 'l',
  '5': 's',
  '8': 'b',
}

/** OCR's look-alike characters folded, on a normalised name. */
function foldLookAlikes(normalized: string): string {
  return normalized.replace(/[0158]/g, (digit) => LOOK_ALIKES[digit] ?? digit)
}

/**
 * P2's stop list: common words and units that never make a word
 * distinctive. Only words of 4+ letters can be distinctive, so the shorter
 * ones here only document the list.
 */
const STOP_WORDS: ReadonlySet<string> = new Set([
  'com',
  'sem',
  'para',
  'emb',
  'uni',
  'und',
])

/** Levenshtein distance. */
export function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const current = [i]
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(
        (previous[j] ?? 0) + 1,
        (current[j - 1] ?? 0) + 1,
        (previous[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
    previous = current
  }
  return previous[b.length] ?? 0
}

/**
 * The fewest edits that turn `needle` into some substring of `haystack`
 * (an approximate substring match).
 */
export function substringDistance(needle: string, haystack: string): number {
  // Row j: the best alignment of needle[0..i) ending at haystack[j]; a
  // match may start anywhere, so the first row is all zeros.
  let previous: number[] = new Array<number>(haystack.length + 1).fill(0)
  for (let i = 1; i <= needle.length; i++) {
    const current = [i]
    for (let j = 1; j <= haystack.length; j++) {
      current[j] = Math.min(
        (previous[j] ?? 0) + 1,
        (current[j - 1] ?? 0) + 1,
        (previous[j - 1] ?? 0) + (needle[i - 1] === haystack[j - 1] ? 0 : 1),
      )
    }
    previous = current
  }
  return Math.min(...previous)
}

/**
 * The whole-name allowance: 1 edit up to 5 characters, else ⌊n/4⌋. CP1
 * tightened the plan's ⌊n/3⌋ (P2 allows tightening, never loosening):
 * on the set's own names it paired a product with its longer, different
 * variant (a name and the same name plus a flavour), and no right-price
 * row Tesseract read needed more than ⌊n/4⌋.
 */
function nameAllowance(length: number): number {
  return length <= 5 ? 1 : Math.floor(length / 4)
}

/** A distinctive word's allowance: max(1, ⌊length/4⌋). */
function wordAllowance(length: number): number {
  return Math.max(1, Math.floor(length / 4))
}

/** An expected name's numbers: its words with a digit (`250g`, `0`, `10`). */
export function numberWords(name: string): string[] {
  return normalizeName(name)
    .split(' ')
    .filter((word) => /\d/.test(word))
}

/** The expected name's distinctive words: 4+ letters, not stop words. */
export function distinctiveWords(expected: string): string[] {
  return normalizeName(expected)
    .split(' ')
    .filter((word) => /^[a-z]{4,}$/.test(word) && !STOP_WORDS.has(word))
}

/**
 * P2's recognisable product: a read name is the expected product when (i)
 * the whole name is close and (ii) every distinctive word of the expected
 * name occurs in it, spaces ignored, both after look-alike folding; and
 * (iii) every number that *was* read is one of the expected name's. A number may be missing (`Deposito` for
 * `Deposito 0.10`: the parser never keeps an amount in a name), but a
 * different one fails (`Deposito 0.20`): the user's decision, 2026-10-01,
 * replacing CP1's rule that every number had to be read.
 */
export function nameMatches(read: string, expected: string): boolean {
  const readWords = normalizeName(read).split(' ').filter(Boolean)
  const readFolded = readWords.map(foldLookAlikes)
  const expectedNumbers = new Set(numberWords(expected).map(foldLookAlikes))
  // (iii) A number read (a word starting with a digit) must be expected.
  if (
    readWords.some(
      (word, i) =>
        /^\d/.test(word) && !expectedNumbers.has(readFolded[i] ?? ''),
    )
  ) {
    return false
  }
  // A number the reader left out is left out of the comparison too.
  const expectedName = normalizeName(expected)
    .split(' ')
    .filter(
      (word) =>
        word !== '' &&
        (!/\d/.test(word) || readFolded.includes(foldLookAlikes(word))),
    )
    .map(foldLookAlikes)
    .join(' ')
  const readName = readFolded.join(' ')
  if (readName === '' || expectedName === '') {
    return false
  }
  if (
    editDistance(readName, expectedName) > nameAllowance(expectedName.length)
  ) {
    return false
  }
  const joined = readName.replace(/ /g, '')
  return distinctiveWords(expected).every(
    (word) =>
      substringDistance(foldLookAlikes(word), joined) <=
      wordAllowance(word.length),
  )
}

/** Strict name accuracy (informational): equal once normalised, no folding. */
export function nameExact(read: string, expected: string): boolean {
  return normalizeName(read) === normalizeName(expected)
}

// --- Pairing ---------------------------------------------------------------

/**
 * A maximum one-to-one matching of expected rows to read rows, over the
 * pairs `canPair` allows. Kuhn's augmenting paths, expected rows taken in
 * receipt order and read rows tried in receipt order, so receipt order
 * breaks ties. `result[e]` is the read row paired with expected row `e`.
 */
export function maximumPairing(
  expectedCount: number,
  readCount: number,
  canPair: (expected: number, read: number) => boolean,
): (number | undefined)[] {
  const readOwner: (number | undefined)[] = new Array<number | undefined>(
    readCount,
  ).fill(undefined)
  const tryPair = (e: number, visited: boolean[]): boolean => {
    // A free read row first, so an earlier pair is only moved when needed.
    for (let r = 0; r < readCount; r++) {
      if (!visited[r] && readOwner[r] === undefined && canPair(e, r)) {
        visited[r] = true
        readOwner[r] = e
        return true
      }
    }
    for (let r = 0; r < readCount; r++) {
      if (visited[r] || !canPair(e, r)) continue
      visited[r] = true
      const owner = readOwner[r]
      if (owner === undefined || tryPair(owner, visited)) {
        readOwner[r] = e
        return true
      }
    }
    return false
  }
  for (let e = 0; e < expectedCount; e++) {
    tryPair(e, new Array<boolean>(readCount).fill(false))
  }
  const result: (number | undefined)[] = new Array<number | undefined>(
    expectedCount,
  ).fill(undefined)
  readOwner.forEach((e, r) => {
    if (e !== undefined) result[e] = r
  })
  return result
}

// --- One image -------------------------------------------------------------

export interface ImageScore {
  /** (a) + (b) + (c): the target. */
  noEditNeeded: boolean
  /** (a): every expected row paired, and no extra row. */
  rowsRight: boolean
  /** (b): discount, tip and tax as expected. */
  adjustmentsRight: boolean
  /** (c): the trusted total as expected, and the check says "match". */
  totalRight: boolean
  expectedRows: number
  /** Expected rows paired (price and recognisable product). */
  pairedRows: number
  /** Read rows left unpaired. */
  extraRows: number
  /** Paired rows whose name is exact once normalised. */
  exactNames: number
  /** Expected rows paired by line total alone (no name check). */
  pricePairedRows: number
  /** The check panel's status, or `importFailed` when nothing was imported. */
  check: ReceiptCheck['status'] | 'importFailed'
  falseMatch: boolean
  /** R19's local coverage: amount-matched items' sum over the total. */
  amountCoverage: number
}

/** The bill's items as read rows, without R13/R14's stand-in item. */
export function readRows(bill: Bill): ReadRow[] {
  return bill.items
    .filter((item) => item.name !== NOT_READ_ITEM_NAME)
    .map((item) => ({ name: item.name, amount: lineTotal(item) }))
}

/** The bill's discount, tip and tax, as amounts. */
export function billAdjustments(bill: Bill): {
  discount: Cents
  tip: Cents
  tax: Cents
} {
  const subtotal = bill.items.reduce((acc, item) => acc + lineTotal(item), 0)
  return {
    discount: adjustmentAmount(bill.discount, subtotal as Cents),
    tip: adjustmentAmount(bill.tip, subtotal as Cents),
    tax: adjustmentAmount(bill.tax, subtotal as Cents),
  }
}

/**
 * R19's coverage (M2R1): each read item matched to an expected price, one
 * to one, in order; the matched sum over the total, at most 1.
 */
export function amountCoverage(
  read: readonly ReadRow[],
  expected: readonly Cents[],
  total: Cents,
): number {
  const pool = [...expected]
  let matched = 0
  for (const row of read) {
    const at = pool.indexOf(row.amount)
    if (at !== -1) {
      pool.splice(at, 1)
      matched += row.amount
    }
  }
  return total > 0 ? Math.min(1, matched / total) : 0
}

export function scoreImage(
  bill: Bill,
  summary: ReceiptSummary,
  expected: ExpectedBill,
): ImageScore {
  const read = readRows(bill)
  const rows = expected.items
  const paired = maximumPairing(
    rows.length,
    read.length,
    (e, r) =>
      read[r]?.amount === rows[e]?.price &&
      nameMatches(read[r]?.name ?? '', rows[e]?.name ?? ''),
  )
  const pairedRows = paired.filter((r) => r !== undefined).length
  const exactNames = paired.filter(
    (r, e) =>
      r !== undefined && nameExact(read[r]?.name ?? '', rows[e]?.name ?? ''),
  ).length
  const byPrice = maximumPairing(
    rows.length,
    read.length,
    (e, r) => read[r]?.amount === rows[e]?.price,
  )
  const pricePairedRows = byPrice.filter((r) => r !== undefined).length

  const rowsRight = pairedRows === rows.length && read.length === rows.length
  const rowsRightByPrice =
    pricePairedRows === rows.length && read.length === rows.length

  const adjustments = billAdjustments(bill)
  const adjustmentsRight =
    adjustments.discount === (expected.discount ?? 0) &&
    adjustments.tip === (expected.tip ?? 0) &&
    adjustments.tax === (expected.tax ?? 0)

  const check = checkReceipt(bill, summary).status
  const totalRight = summary.total === expected.total && check === 'match'

  return {
    noEditNeeded: rowsRight && adjustmentsRight && totalRight,
    rowsRight,
    adjustmentsRight,
    totalRight,
    expectedRows: rows.length,
    pairedRows,
    extraRows: read.length - pairedRows,
    exactNames,
    pricePairedRows,
    check,
    falseMatch:
      check === 'match' &&
      !(rowsRightByPrice && adjustmentsRight && totalRight),
    amountCoverage: amountCoverage(
      read,
      rows.map((row) => row.price),
      expected.total,
    ),
  }
}

/**
 * An import that failed (no items, an unreadable file): every expected row
 * is missing, and nothing was imported, so it can't be a false match.
 */
export function scoreFailedImport(expected: ExpectedBill): ImageScore {
  return {
    noEditNeeded: false,
    rowsRight: false,
    adjustmentsRight: false,
    totalRight: false,
    expectedRows: expected.items.length,
    pairedRows: 0,
    extraRows: 0,
    exactNames: 0,
    pricePairedRows: 0,
    check: 'importFailed',
    falseMatch: false,
    amountCoverage: 0,
  }
}

/** The share of expected rows paired (1 when none are expected). */
export function rowAccuracy(score: ImageScore): number {
  return score.expectedRows === 0 ? 1 : score.pairedRows / score.expectedRows
}

// --- The set ---------------------------------------------------------------

export interface ScoredImage {
  /** The case's name. */
  name: string
  /** The distinct receipt it shows: its own name, or `sameReceiptAs`. */
  receipt: string
  score: ImageScore
}

export interface SetScore {
  images: number
  receipts: number
  /** Share of images with no edit needed: the target. */
  receiptAccuracy: number
  /** Share of distinct receipts whose every image needs no edit. */
  distinctReceiptAccuracy: number
  /** Share of expected rows paired, over every image. */
  rowAccuracy: number
  extraRows: number
  /**
   * Share of expected rows whose price was read, names aside: next to
   * `rowAccuracy`, it tells a misread amount from a misread or misplaced
   * name (CP3).
   */
  priceRowAccuracy: number
  /** Share of read rows that pair an expected row: 1 − the false-item rate. */
  rowPrecision: number
  /** Share of images whose check panel says "match" (CP3). */
  checkMatches: number
  /** Share of paired rows whose name is exact. */
  nameAccuracy: number
  falseMatches: number
}

export function scoreSet(images: readonly ScoredImage[]): SetScore {
  const share = (part: number, whole: number) =>
    whole === 0 ? 0 : part / whole
  const byReceipt = new Map<string, boolean>()
  for (const image of images) {
    byReceipt.set(
      image.receipt,
      (byReceipt.get(image.receipt) ?? true) && image.score.noEditNeeded,
    )
  }
  const total = (pick: (score: ImageScore) => number) =>
    images.reduce((acc, image) => acc + pick(image.score), 0)
  return {
    images: images.length,
    receipts: byReceipt.size,
    receiptAccuracy: share(
      images.filter((image) => image.score.noEditNeeded).length,
      images.length,
    ),
    distinctReceiptAccuracy: share(
      [...byReceipt.values()].filter(Boolean).length,
      byReceipt.size,
    ),
    rowAccuracy: share(
      total((score) => score.pairedRows),
      total((score) => score.expectedRows),
    ),
    extraRows: total((score) => score.extraRows),
    priceRowAccuracy: share(
      total((score) => score.pricePairedRows),
      total((score) => score.expectedRows),
    ),
    rowPrecision: share(
      total((score) => score.pairedRows),
      total((score) => score.pairedRows + score.extraRows),
    ),
    checkMatches: share(
      images.filter((image) => image.score.check === 'match').length,
      images.length,
    ),
    nameAccuracy: share(
      total((score) => score.exactNames),
      total((score) => score.pairedRows),
    ),
    falseMatches: images.filter((image) => image.score.falseMatch).length,
  }
}
