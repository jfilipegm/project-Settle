/**
 * History's filters and search (M4 plan, H12): pure, over the expenses
 * read once for the household.
 */
import type { Translate } from '../../i18n/t.ts'
import { foldText } from '../receipt/receiptKey.ts'
import {
  referencedMemberIds,
  type CategoryId,
  type Expense,
  type Settlement,
} from './model.ts'

export interface HistoryFilter {
  /** Paid by them, or sharing in it. */
  memberId?: string | undefined
  category?: CategoryId | undefined
  /** Free text; case- and accent-insensitive. */
  query?: string | undefined
}

/** Everything an expense can be found by, folded: what, the shop, items, the category. */
export function searchText(expense: Expense, t: Translate): string {
  const parts = [
    expense.description,
    expense.receipt?.merchant ?? '',
    t(`categories.${expense.category}`),
  ]
  if (expense.split.kind === 'itemised') {
    parts.push(...expense.split.bill.items.map((item) => item.name))
  }
  return foldText(parts.join('\n'))
}

/** Whether the expense passes every filter that is set. */
export function matchesFilter(
  expense: Expense,
  filter: HistoryFilter,
  t: Translate,
): boolean {
  if (
    filter.memberId !== undefined &&
    !referencedMemberIds(expense).includes(filter.memberId)
  ) {
    return false
  }
  if (filter.category !== undefined && expense.category !== filter.category) {
    return false
  }
  const query = foldText(filter.query ?? '')
  if (query === '') return true
  const text = searchText(expense, t)
  // Every word of the query, anywhere.
  return query.split(' ').every((word) => text.includes(word))
}

/** Expenses grouped by `YYYY-MM`, in the order given (newest first). */
export function groupByMonth(
  expenses: readonly Expense[],
): { month: string; expenses: Expense[] }[] {
  const groups: { month: string; expenses: Expense[] }[] = []
  for (const expense of expenses) {
    const month = expense.date.slice(0, 7)
    const last = groups.at(-1)
    if (last?.month === month) last.expenses.push(expense)
    else groups.push({ month, expenses: [expense] })
  }
  return groups
}

/** A line of the history: an expense or a payment (M5 plan, B8). */
export type HistoryEntry =
  | { kind: 'expense'; expense: Expense }
  | { kind: 'settlement'; settlement: Settlement }

/** The record behind an entry. */
export function entryRecord(entry: HistoryEntry): Expense | Settlement {
  return entry.kind === 'expense' ? entry.expense : entry.settlement
}

/**
 * Whether a payment passes every filter that is set (B8): a member filter
 * keeps the payments they sent or received; a category filter hides
 * payments, which have none; the search matches the two names and the
 * note.
 */
export function settlementMatches(
  settlement: Settlement,
  filter: HistoryFilter,
  nameOf: (memberId: string) => string,
): boolean {
  if (
    filter.memberId !== undefined &&
    settlement.fromId !== filter.memberId &&
    settlement.toId !== filter.memberId
  ) {
    return false
  }
  if (filter.category !== undefined) return false
  const query = foldText(filter.query ?? '')
  if (query === '') return true
  const text = foldText(
    [
      nameOf(settlement.fromId),
      nameOf(settlement.toId),
      settlement.note ?? '',
    ].join('\n'),
  )
  return query.split(' ').every((word) => text.includes(word))
}

/** Newest first, expenses and payments alike: by date, then created, then id. */
export function newestEntryFirst(a: HistoryEntry, b: HistoryEntry): number {
  const x = entryRecord(a)
  const y = entryRecord(b)
  if (x.date !== y.date) return x.date < y.date ? 1 : -1
  if (x.createdAt !== y.createdAt) return x.createdAt < y.createdAt ? 1 : -1
  return x.id < y.id ? 1 : x.id > y.id ? -1 : 0
}

/** Entries grouped by `YYYY-MM`, in the order given (newest first). */
export function groupEntriesByMonth(
  entries: readonly HistoryEntry[],
): { month: string; entries: HistoryEntry[] }[] {
  const groups: { month: string; entries: HistoryEntry[] }[] = []
  for (const entry of entries) {
    const month = entryRecord(entry).date.slice(0, 7)
    const last = groups.at(-1)
    if (last?.month === month) last.entries.push(entry)
    else groups.push({ month, entries: [entry] })
  }
  return groups
}
