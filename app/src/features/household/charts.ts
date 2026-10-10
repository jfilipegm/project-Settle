/**
 * The charts' data (M4, review finding M-7): worked out from the same
 * expenses and the same totals as the numbers beside them, never stored
 * (H5), so a chart and its figures always agree.
 */
import { sum, type Cents } from '../../lib/money.ts'
import type { CategoryId, Expense } from './model.ts'
import { inMonth, monthOf, shiftMonth, totalOf } from './totals.ts'

/**
 * Each category's fixed chart colour: a category keeps its colour from
 * month to month, whatever its rank. "Other" wears the neutral, as does
 * the rest a donut folds together.
 */
export const CATEGORY_CHART_COLOURS: Record<CategoryId, string> = {
  groceries: 'var(--chart-1)',
  eatingOut: 'var(--chart-2)',
  rent: 'var(--chart-3)',
  utilities: 'var(--chart-4)',
  household: 'var(--chart-5)',
  transport: 'var(--chart-6)',
  leisure: 'var(--chart-7)',
  internet: 'var(--chart-8)',
  other: 'var(--chart-rest)',
}

export const REST_CHART_COLOUR = 'var(--chart-rest)'

/** A donut shows this many slices at most (the largest first). */
export const MAX_SLICES = 6

export interface CategorySlice {
  /** The category, or `null` for the rest folded together. */
  category: CategoryId | null
  total: Cents
}

/**
 * The donut's slices from `categoryTotals` (largest first): the five
 * largest and, past six, the rest as one slice, so there are never more
 * than six. Every cent is in exactly one slice.
 */
export function categorySlices(
  totals: readonly { category: CategoryId; total: Cents }[],
): CategorySlice[] {
  if (totals.length <= MAX_SLICES) return totals.map((t) => ({ ...t }))
  const kept = totals.slice(0, MAX_SLICES - 1)
  const rest = totals.slice(MAX_SLICES - 1)
  return [
    ...kept.map((t) => ({ ...t })),
    { category: null, total: sum(rest.map((t) => t.total)) },
  ]
}

/** Whether a category is drawn in its own slice or folded into the rest. */
export function inOwnSlice(
  slices: readonly CategorySlice[],
  category: CategoryId,
): boolean {
  return slices.some((slice) => slice.category === category)
}

/**
 * A whole-number percentage of each total, summing to exactly 100
 * (largest remainder), or all zeros when there is nothing.
 */
export function percentages(totals: readonly Cents[]): number[] {
  const all = totals.reduce<number>((a, b) => a + b, 0)
  if (all <= 0) return totals.map(() => 0)
  const raw = totals.map((t) => (t * 100) / all)
  const floors = raw.map(Math.floor)
  let left = 100 - floors.reduce((a, b) => a + b, 0)
  const order = raw
    .map((r, i) => ({ i, rest: r - Math.floor(r) }))
    .sort((a, b) => b.rest - a.rest || a.i - b.i)
  for (const { i } of order) {
    if (left === 0) break
    floors[i] = (floors[i] ?? 0) + 1
    left--
  }
  return floors
}

/** The number of days in a `YYYY-MM` month. */
export function daysIn(month: string): number {
  const [year = 0, m = 1] = month.split('-').map(Number)
  return new Date(Date.UTC(year, m, 0)).getUTCDate()
}

/** Each day of a month with its total, from the 1st to the last day. */
export function dailyTotals(
  expenses: readonly Expense[],
  month: string,
): { date: string; total: Cents }[] {
  const monthly = inMonth(expenses, month)
  return Array.from({ length: daysIn(month) }, (_, i) => {
    const date = `${month}-${String(i + 1).padStart(2, '0')}`
    return {
      date,
      total: totalOf(monthly.filter((expense) => expense.date === date)),
    }
  })
}

/** The `count` months ending with `month`, oldest first, with their totals. */
export function monthlyTotals(
  expenses: readonly Expense[],
  month: string,
  count = 6,
): { month: string; total: Cents }[] {
  return Array.from({ length: count }, (_, i) => {
    const m = shiftMonth(month, i - (count - 1))
    return {
      month: m,
      total: totalOf(expenses.filter((e) => monthOf(e.date) === m)),
    }
  })
}
