/**
 * Month totals (M4 plan, H13): always computed from the stored expenses,
 * never stored (H5).
 */
import { sum, type Cents } from '../../lib/money.ts'
import type { CategoryId, Expense } from './model.ts'
import { expenseAmount } from './shares.ts'

/** `YYYY-MM` of a `YYYY-MM-DD` date. */
export function monthOf(date: string): string {
  return date.slice(0, 7)
}

/** The month before or after a `YYYY-MM` month. */
export function shiftMonth(month: string, by: number): string {
  const [year, m] = month.split('-').map(Number)
  const index = (year ?? 0) * 12 + (m ?? 1) - 1 + by
  const next = new Date(Date.UTC(Math.floor(index / 12), index % 12, 1))
  return `${String(next.getUTCFullYear())}-${String(next.getUTCMonth() + 1).padStart(2, '0')}`
}

export function isMonth(value: string | null): value is string {
  return value !== null && /^\d{4}-(0[1-9]|1[0-2])$/.test(value)
}

/** Newest first: by date, then the latest created (H12). */
export function newestFirst(a: Expense, b: Expense): number {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1
  return a.id < b.id ? 1 : -1
}

export function inMonth(expenses: readonly Expense[], month: string) {
  return expenses.filter((expense) => monthOf(expense.date) === month)
}

/** The sum of the expenses' amounts; an unreadable amount counts 0. */
export function totalOf(expenses: readonly Expense[]): Cents {
  return sum(expenses.map((expense) => expenseAmount(expense) ?? (0 as Cents)))
}

/** Each category's total, largest first; empty categories left out. */
export function categoryTotals(
  expenses: readonly Expense[],
): { category: CategoryId; total: Cents }[] {
  const totals = new Map<CategoryId, Cents>()
  for (const expense of expenses) {
    const amount = expenseAmount(expense) ?? (0 as Cents)
    totals.set(
      expense.category,
      sum([totals.get(expense.category) ?? (0 as Cents), amount]),
    )
  }
  return [...totals]
    .map(([category, total]) => ({ category, total }))
    .filter(({ total }) => total > 0)
    .sort((a, b) => b.total - a.total)
}
