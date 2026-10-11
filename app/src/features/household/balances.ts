/**
 * The balances engine (M5 plan, B4): who owes whom, derived from the
 * ledger each time and never stored (M4, H5). Pure and framework-free.
 *
 * A member's balance is what they paid, less their shares, plus what they
 * sent, less what they received, in integer cents. Positive: they get
 * money back; negative: they owe. Balances sum to exactly zero.
 */
import type { Cents } from '../../lib/money.ts'
import type { Expense, Member, Settlement } from './model.ts'
import { expenseShares } from './shares.ts'

/** How many records of each kind couldn't be read (kept, never guessed). */
export interface UnreadableCounts {
  members: number
  expenses: number
  settlements: number
}

/** What the engine reads: the household's readable records, and the rest counted. */
export interface LedgerInput {
  members: readonly Member[]
  expenses: readonly Expense[]
  settlements: readonly Settlement[]
  unreadable: UnreadableCounts
}

export interface MemberBalance {
  memberId: string
  /** The amounts of the expenses they paid. */
  paid: Cents
  /** Their shares of every expense. */
  share: Cents
  /** The payments they made. */
  sent: Cents
  /** The payments they received. */
  received: Cents
  /** paid − share + sent − received. */
  balance: Cents
}

export interface Balances {
  /** Every readable member, in member order (position, then id). */
  members: MemberBalance[]
  /**
   * True only when every member, expense and payment record of the
   * household could be read (M-I-1). Incomplete balances are figures from
   * the readable records only: no surface turns them into a
   * recommendation.
   */
  complete: boolean
  /** The unreadable records, by kind, and in all. */
  unreadable: UnreadableCounts & { total: number }
  /** The records counted that are dated after `today` (L1-I1). */
  futureDated: { expenses: number; settlements: number }
}

export interface BalanceOptions {
  /** Only records dated on or before this day count. */
  asOf?: string
  /** Today, to count the records dated after it. */
  today?: string
}

/** Member order (B4): the order members were added, then id. */
export function byMemberOrder(a: Member, b: Member): number {
  if (a.position !== b.position) return a.position - b.position
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

function counted<T extends { date: string }>(
  records: readonly T[],
  asOf: string | undefined,
): T[] {
  return asOf === undefined
    ? [...records]
    : records.filter((record) => record.date <= asOf)
}

/**
 * Each member's balance (B4), over every record or, with `asOf`, over the
 * records dated on or before it. With no date, records dated after today
 * count too: a rent entered early for next month is owed.
 */
export function balances(
  input: LedgerInput,
  options: BalanceOptions = {},
): Balances {
  const ordered = [...input.members].sort(byMemberOrder)
  const rows = new Map<string, MemberBalance>(
    ordered.map((member) => [
      member.id,
      {
        memberId: member.id,
        paid: 0 as Cents,
        share: 0 as Cents,
        sent: 0 as Cents,
        received: 0 as Cents,
        balance: 0 as Cents,
      },
    ]),
  )
  let unreadableExpenses = input.unreadable.expenses
  const expenses = counted(input.expenses, options.asOf)
  const settlements = counted(input.settlements, options.asOf)
  for (const expense of expenses) {
    const shares = expenseShares(expense)
    // A reader never lets such an expense through; if one ever did, it
    // counts as unreadable rather than unbalancing the household.
    if (shares === null) {
      unreadableExpenses++
      continue
    }
    add(rows, expense.payerId, 'paid', amountOf(shares))
    for (const [memberId, share] of shares) add(rows, memberId, 'share', share)
  }
  for (const settlement of settlements) {
    add(rows, settlement.fromId, 'sent', settlement.amount)
    add(rows, settlement.toId, 'received', settlement.amount)
  }
  const members = [...rows.values()].map((row) => ({
    ...row,
    balance: (row.paid - row.share + row.sent - row.received) as Cents,
  }))
  const today = options.today
  const after = (record: { date: string }) =>
    today !== undefined && record.date > today
  const unreadable = {
    members: input.unreadable.members,
    expenses: unreadableExpenses,
    settlements: input.unreadable.settlements,
  }
  const total =
    unreadable.members + unreadable.expenses + unreadable.settlements
  return {
    members,
    complete: total === 0,
    unreadable: { ...unreadable, total },
    futureDated: {
      expenses: expenses.filter(after).length,
      settlements: settlements.filter(after).length,
    },
  }
}

/**
 * An expense's amount: its shares sum to it exactly (`expenseShares`,
 * M4's H5), so it needs no second validation.
 */
function amountOf(shares: ReadonlyMap<string, Cents>): Cents {
  let total = 0
  for (const share of shares.values()) total += share
  return total as Cents
}

function add(
  rows: Map<string, MemberBalance>,
  memberId: string,
  field: 'paid' | 'share' | 'sent' | 'received',
  amount: Cents,
) {
  const row = rows.get(memberId)
  // The repository only lists records whose members all read.
  if (row !== undefined) row[field] = (row[field] + amount) as Cents
}

/** One suggested payment. */
export interface SuggestedPayment {
  fromId: string
  toId: string
  amount: Cents
}

/** The programme's reach: 2¹⁶ subsets (B4, O-EXT-1). */
export const MAX_EXACT = 16

/**
 * The fewest payments that bring every balance to zero (B4), always the
 * same for the same balances. `members` must be in member order (as
 * {@link balances} returns them); members with a zero balance are left
 * out.
 *
 * The non-zero balances are split into the most groups that each sum to
 * zero, and each group settles inside itself greedily, largest debtor to
 * largest creditor, in (size − 1) payments: (non-zero balances − groups)
 * payments in all, the minimum. Up to 16 non-zero balances the grouping
 * is exact; above that, opposite pairs are taken out first, then the
 * programme runs on what's left if it can, else the rest is one group (at
 * most n − 1 payments, not always the minimum).
 */
export function suggestSettlements(
  members: readonly Pick<MemberBalance, 'memberId' | 'balance'>[],
): SuggestedPayment[] {
  const nonZero = members
    .map((member, rank) => ({ ...member, rank }))
    .filter((member) => member.balance !== 0)
  if (nonZero.length === 0) return []
  const groups: (typeof nonZero)[] = []
  let rest = nonZero
  if (rest.length > MAX_EXACT) {
    const paired = new Set<number>()
    for (let i = 0; i < rest.length; i++) {
      if (paired.has(i)) continue
      const balance = rest[i]?.balance ?? 0
      for (let j = i + 1; j < rest.length; j++) {
        if (!paired.has(j) && rest[j]?.balance === 0 - balance) {
          paired.add(i)
          paired.add(j)
          groups.push([rest[i]!, rest[j]!])
          break
        }
      }
    }
    rest = rest.filter((_, i) => !paired.has(i))
  }
  if (rest.length > MAX_EXACT) {
    groups.push(rest)
  } else if (rest.length > 0) {
    for (const group of zeroSumGroups(rest.map((member) => member.balance))) {
      groups.push(group.map((i) => rest[i]!))
    }
  }
  const payments = groups.flatMap(settleGroup)
  const rank = new Map(nonZero.map((member) => [member.memberId, member.rank]))
  return payments.sort(
    (a, b) =>
      b.amount - a.amount ||
      (rank.get(a.fromId) ?? 0) - (rank.get(b.fromId) ?? 0) ||
      (rank.get(a.toId) ?? 0) - (rank.get(b.toId) ?? 0),
  )
}

/**
 * The most zero-sum groups the balances split into (B4, "The
 * programme"), as lists of indexes into `values`, which must sum to zero.
 *
 * - Sums: `sum[S]`, one addition per subset, from S without its lowest
 *   member (a `Float64Array`, exact for integer cents).
 * - Most groups: `f[∅] = 0`, `f[S] = max over i in S of f[S∖{i}]`, plus
 *   one when `sum[S] = 0`. For a zero-sum S, `f[S]` is the most zero-sum
 *   groups it splits into. O(2ⁿ·n) time, O(2ⁿ) memory, no submask
 *   enumeration.
 * - The grouping (L1-O1): take the first remaining member; among the
 *   zero-sum subsets of the remaining set R that contain them and keep the
 *   maximum (`f[R∖S] = f[R] − 1`), the fewest members, then the first in
 *   member order. Under 2ⁿ checks in all, each two table reads.
 */
export function zeroSumGroups(values: readonly number[]): number[][] {
  const n = values.length
  if (n === 0) return []
  if (n > MAX_EXACT) throw new RangeError(`too many balances: ${String(n)}`)
  const size = 1 << n
  const sums = new Float64Array(size)
  const most = new Uint8Array(size)
  for (let set = 1; set < size; set++) {
    const lowest = 31 - Math.clz32(set & -set)
    sums[set] = (sums[set ^ (1 << lowest)] ?? 0) + (values[lowest] ?? 0)
    let best = 0
    for (let rest = set; rest !== 0; rest &= rest - 1) {
      const bit = rest & -rest
      const value = most[set ^ bit] ?? 0
      if (value > best) best = value
    }
    most[set] = best + (sums[set] === 0 ? 1 : 0)
  }
  const groups: number[][] = []
  let remaining = size - 1
  while (remaining !== 0) {
    const first = remaining & -remaining
    const others = remaining ^ first
    const target = (most[remaining] ?? 0) - 1
    let chosen = remaining
    let chosenList = members(remaining)
    // Every subset of the others, with the first member added.
    for (let sub = others; ; sub = (sub - 1) & others) {
      const candidate = sub | first
      if (sums[candidate] === 0 && most[remaining ^ candidate] === target) {
        const list = members(candidate)
        if (earlier(list, chosenList)) {
          chosen = candidate
          chosenList = list
        }
      }
      if (sub === 0) break
    }
    groups.push(chosenList)
    remaining ^= chosen
  }
  return groups
}

/** The indexes in a set, ascending. */
function members(set: number): number[] {
  const list: number[] = []
  for (let rest = set; rest !== 0; rest &= rest - 1) {
    list.push(31 - Math.clz32(rest & -rest))
  }
  return list
}

/** Fewer members first, then the first in member order. */
function earlier(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return a.length < b.length
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return (a[i] ?? 0) < (b[i] ?? 0)
  }
  return false
}

/**
 * Settles one zero-sum group (B4): the largest debtor pays the largest
 * creditor the smaller of the two amounts, until the group is clear. Ties
 * go to the earlier member. Each step clears at least one member, the last
 * two, so a group of m members takes at most m − 1 payments.
 */
function settleGroup(
  group: readonly { memberId: string; balance: Cents; rank: number }[],
): SuggestedPayment[] {
  const left = group.map((member) => ({ ...member, balance: member.balance }))
  const payments: SuggestedPayment[] = []
  for (;;) {
    let debtor: (typeof left)[number] | undefined
    let creditor: (typeof left)[number] | undefined
    for (const member of left) {
      if (
        member.balance < 0 &&
        (debtor === undefined ||
          member.balance < debtor.balance ||
          (member.balance === debtor.balance && member.rank < debtor.rank))
      ) {
        debtor = member
      }
      if (
        member.balance > 0 &&
        (creditor === undefined ||
          member.balance > creditor.balance ||
          (member.balance === creditor.balance && member.rank < creditor.rank))
      ) {
        creditor = member
      }
    }
    if (debtor === undefined || creditor === undefined) return payments
    const amount = Math.min(0 - debtor.balance, creditor.balance) as Cents
    payments.push({ fromId: debtor.memberId, toId: creditor.memberId, amount })
    debtor.balance = (debtor.balance + amount) as Cents
    creditor.balance = (creditor.balance - amount) as Cents
  }
}

/** One line of a member's explanation (B7). */
export type ExplanationLine =
  | {
      kind: 'expense'
      expense: Expense
      paid: Cents
      share: Cents
      /** paid − share. */
      effect: Cents
    }
  | {
      kind: 'settlement'
      settlement: Settlement
      /** + the amount sent, − the amount received. */
      effect: Cents
    }

export interface Explanation {
  balance: MemberBalance
  /** Newest first; the effects sum exactly to the balance. */
  lines: ExplanationLine[]
}

/**
 * Why a member's balance is what it is (B4, B7): every expense they paid
 * or share in, and every payment they sent or received, newest first, as
 * of `asOf` when given. `null` for someone who isn't a readable member.
 */
export function explainBalance(
  input: LedgerInput,
  memberId: string,
  options: BalanceOptions = {},
): Explanation | null {
  const balance = balances(input, options).members.find(
    (row) => row.memberId === memberId,
  )
  if (balance === undefined) return null
  const lines: ExplanationLine[] = []
  for (const expense of counted(input.expenses, options.asOf)) {
    const shares = expenseShares(expense)
    if (shares === null) continue
    const paid = (expense.payerId === memberId ? amountOf(shares) : 0) as Cents
    const mine = shares.get(memberId)
    if (paid === 0 && mine === undefined) continue
    const share = (mine ?? 0) as Cents
    lines.push({
      kind: 'expense',
      expense,
      paid,
      share,
      effect: (paid - share) as Cents,
    })
  }
  for (const settlement of counted(input.settlements, options.asOf)) {
    if (settlement.fromId === memberId) {
      lines.push({ kind: 'settlement', settlement, effect: settlement.amount })
    } else if (settlement.toId === memberId) {
      lines.push({
        kind: 'settlement',
        settlement,
        effect: (0 - settlement.amount) as Cents,
      })
    }
  }
  return { balance, lines: lines.sort(newestLineFirst) }
}

function lineRecord(line: ExplanationLine): {
  date: string
  createdAt: string
  id: string
} {
  return line.kind === 'expense' ? line.expense : line.settlement
}

/** Newest first, as in the history: by date, then the latest created, then id. */
function newestLineFirst(a: ExplanationLine, b: ExplanationLine): number {
  const x = lineRecord(a)
  const y = lineRecord(b)
  if (x.date !== y.date) return x.date < y.date ? 1 : -1
  if (x.createdAt !== y.createdAt) return x.createdAt < y.createdAt ? 1 : -1
  return x.id < y.id ? 1 : x.id > y.id ? -1 : 0
}

/** Both members' balances after a payment, for the dialog's "after this" line. */
export interface PaymentOutcome {
  from: MemberBalance
  to: MemberBalance
}

/**
 * The outcome of recording `settlement` (B6), over the default balances
 * (every record). An edit passes `replacing`, the id of the payment being
 * edited, which is left out first, so it isn't counted twice (L2-I1).
 * `null` when the balances aren't complete (M-I-1): no outcome is shown
 * over records known to be missing, or when a member isn't readable.
 */
export function paymentOutcome(
  input: LedgerInput,
  settlement: Pick<Settlement, 'id' | 'fromId' | 'toId' | 'amount' | 'date'>,
  { replacing }: { replacing?: string } = {},
): PaymentOutcome | null {
  const others = input.settlements.filter(
    (s) => s.id !== replacing && s.id !== settlement.id,
  )
  const record = {
    ...settlement,
    v: 1,
    householdId: '',
    createdAt: '',
    updatedAt: '',
  } satisfies Settlement
  const after = balances({ ...input, settlements: [...others, record] })
  if (!after.complete) return null
  const from = after.members.find((row) => row.memberId === settlement.fromId)
  const to = after.members.find((row) => row.memberId === settlement.toId)
  return from === undefined || to === undefined ? null : { from, to }
}
