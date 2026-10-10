/**
 * Each member's share of an expense (M4 plan, H5): always derived from the
 * stored expense, never stored. The shares sum exactly to the expense's
 * amount.
 */
import { allocate, sum, type Cents } from '../../lib/money.ts'
import { computeSplit } from '../split/split.ts'
import {
  expenseContentErrors,
  type Expense,
  type ItemisedSplit,
  type QuickSplit,
} from './model.ts'

/** FNV-1a over the id's UTF-16 code units: a stable, well-spread hash. */
export function stableHash(id: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash
}

/**
 * `allocate`, with its tie-break (the lowest index) rotated to start at a
 * position chosen by the expense id, so over many equal splits no member
 * systematically absorbs the leftover cents (H5).
 */
export function allocateRotated(
  total: Cents,
  weights: readonly number[],
  expenseId: string,
): Cents[] {
  const n = weights.length
  const start = stableHash(expenseId) % n
  const order = Array.from({ length: n }, (_, k) => (start + k) % n)
  const parts = allocate(
    total,
    order.map((index) => weights[index] ?? 0),
  )
  const result = new Array<Cents>(n)
  order.forEach((index, k) => {
    result[index] = parts[k] as Cents
  })
  return result
}

function quickShares(split: QuickSplit, expenseId: string): Map<string, Cents> {
  switch (split.kind) {
    case 'equal': {
      const parts = allocateRotated(
        split.amount,
        split.memberIds.map(() => 1),
        expenseId,
      )
      return new Map(split.memberIds.map((id, i) => [id, parts[i] as Cents]))
    }
    case 'shares': {
      const parts = allocateRotated(
        split.amount,
        split.shares.map((share) => share.weight),
        expenseId,
      )
      return new Map(
        split.shares.map((share, i) => [share.memberId, parts[i] as Cents]),
      )
    }
    case 'exact':
      return new Map(
        split.amounts.map((entry) => [entry.memberId, entry.amount]),
      )
    case 'percent': {
      // Exact integers over a common denominator of 1000 (bill ratios).
      const parts = allocateRotated(
        split.amount,
        split.percents.map(
          ({ ratio }) => ratio.numerator * (1000 / ratio.denominator),
        ),
        expenseId,
      )
      return new Map(
        split.percents.map((entry, i) => [entry.memberId, parts[i] as Cents]),
      )
    }
  }
}

function itemisedShares(split: ItemisedSplit): Map<string, Cents> | null {
  const outcome = computeSplit(split.bill)
  if (!outcome.ok) return null
  const memberOf = new Map(
    split.members.map((entry) => [entry.personId, entry.memberId]),
  )
  const shares = new Map<string, Cents>()
  for (const person of outcome.result.people) {
    const memberId = memberOf.get(person.personId)
    if (memberId === undefined) return null
    shares.set(memberId, person.total)
  }
  return shares
}

/**
 * Each member's share, in cents, or `null` for an expense whose content
 * doesn't validate (`expenseContentErrors`). The shares sum exactly to
 * {@link expenseAmount}.
 */
export function expenseShares(expense: Expense): Map<string, Cents> | null {
  if (expenseContentErrors(expense).length > 0) return null
  return expense.split.kind === 'itemised'
    ? itemisedShares(expense.split)
    : quickShares(expense.split, expense.id)
}

/**
 * The expense's amount: a quick expense's stored amount, or an itemised
 * bill's total from `computeSplit` (never stored, H4). `null` when the
 * content doesn't validate.
 */
export function expenseAmount(expense: Expense): Cents | null {
  if (expense.split.kind !== 'itemised') {
    return expenseContentErrors(expense).length > 0
      ? null
      : expense.split.amount
  }
  const shares = expenseShares(expense)
  return shares === null ? null : sum([...shares.values()])
}
