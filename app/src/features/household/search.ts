/**
 * History's filters and search (M4 plan, H12): pure, over the expenses
 * read once for the household.
 */
import type { Translate } from '../../i18n/t.ts'
import { foldText } from '../receipt/receiptKey.ts'
import { referencedMemberIds, type CategoryId, type Expense } from './model.ts'

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
