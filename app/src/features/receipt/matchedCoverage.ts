/**
 * R19's local coverage (remediation plan): how much of a real receipt the
 * import read correctly, for the local-only acceptance targets. Pure.
 *
 * Each read item is matched to an expected item with the same price (its
 * line total), one to one: an expected item is used at most once, so a
 * price read twice counts once. Local coverage is the matched items' sum
 * over the trusted total, so junk the parser took for items (an un-cut
 * tax-table row, a garbled payment line) can never raise it; their sum is
 * reported beside it instead.
 */
import type { Cents } from '../../lib/money.ts'
import { NOT_READ_ITEM_NAME } from './messages.ts'

export interface Coverage {
  /** The matched items' sum over the total, 0–1. */
  coverage: number
  matchedSum: Cents
  /** What was read that matches no expected item. */
  unmatchedSum: Cents
}

export function matchedCoverage(
  read: readonly { name: string; amount: Cents }[],
  expected: readonly Cents[],
  total: Cents,
): Coverage {
  const pool = [...expected]
  let matched = 0
  let unmatched = 0
  for (const item of read) {
    // R13's and R14's stand-in item is never a read item.
    if (item.name === NOT_READ_ITEM_NAME) continue
    const at = pool.indexOf(item.amount)
    if (at === -1) {
      unmatched += item.amount
    } else {
      pool.splice(at, 1)
      matched += item.amount
    }
  }
  return {
    coverage: total > 0 ? Math.min(1, matched / total) : 0,
    matchedSum: matched as Cents,
    unmatchedSum: unmatched as Cents,
  }
}
