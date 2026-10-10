import type { Region } from '../../../app/region.ts'
import type { Translate } from '../../../i18n/t.ts'
import { formatAmount, type Cents } from '../../../lib/money.ts'
import { Amount } from '../../../ui/Amount.tsx'
import { Bars, Donut } from '../../../ui/Charts.tsx'
import { Icon } from '../../../ui/Icon.tsx'
import { CATEGORY_ICONS } from '../categories.ts'
import {
  CATEGORY_CHART_COLOURS,
  categorySlices,
  dailyTotals,
  inOwnSlice,
  monthlyTotals,
  percentages,
  REST_CHART_COLOUR,
} from '../charts.ts'
import { formatDate, formatMonth } from '../format.ts'
import type { CategoryId, Expense } from '../model.ts'
import styles from './MonthCharts.module.css'

/*
 * The overview's charts (M4, review finding M-7), each beside the figures
 * it draws: the figures stay, and stay the accessible source.
 */

/**
 * "Where it went": a donut of the month's category totals (six slices at
 * most), with the list of every category, its total and its percentage
 * as the legend.
 */
export function WhereItWent({
  categories,
  total,
  region,
  t,
}: {
  categories: readonly { category: CategoryId; total: Cents }[]
  total: Cents
  region: Region
  t: Translate
}) {
  const slices = categorySlices(categories)
  const name = (category: CategoryId | null) =>
    category === null ? t('overview.theRest') : t(`categories.${category}`)
  const sliceShares = percentages(slices.map((s) => s.total))
  const rowShares = percentages(categories.map((c) => c.total))
  const described = slices
    .map(
      (slice, i) =>
        `${name(slice.category)} ${formatAmount(slice.total, region)} (${t('overview.percent', { percent: sliceShares[i] ?? 0 })})`,
    )
    .join(', ')
  return (
    <div className={styles.whereItWent}>
      <Donut
        label={t('overview.whereItWentChart', { slices: described })}
        slices={slices.map((slice, i) => ({
          id: slice.category ?? 'rest',
          value: slice.total,
          colour:
            slice.category === null
              ? REST_CHART_COLOUR
              : CATEGORY_CHART_COLOURS[slice.category],
          label: `${name(slice.category)}: ${formatAmount(slice.total, region)}, ${t('overview.percent', { percent: sliceShares[i] ?? 0 })}`,
        }))}
      >
        <span className={styles.holeAmount}>
          <Amount value={total} region={region} />
        </span>
      </Donut>
      <ul className={styles.legend}>
        {categories.map(({ category, total: categoryTotal }, i) => (
          <li key={category} className={styles.legendRow}>
            <span
              className={styles.swatch}
              aria-hidden="true"
              style={{
                background: inOwnSlice(slices, category)
                  ? CATEGORY_CHART_COLOURS[category]
                  : REST_CHART_COLOUR,
              }}
            />
            <span className={styles.legendName}>
              <Icon icon={CATEGORY_ICONS[category]} size={20} />
              {t(`categories.${category}`)}
            </span>
            <span className={styles.percent}>
              {t('overview.percent', { percent: rowShares[i] ?? 0 })}
            </span>
            <Amount value={categoryTotal} region={region} />
          </li>
        ))}
      </ul>
    </div>
  )
}

/** The days the axis names: the 1st, 8th, 15th, 22nd and 29th. */
const TICK_DAYS = new Set([1, 8, 15, 22, 29])

/** "Day by day": the month's spending on each day, as bars. */
export function DayByDay({
  expenses,
  month,
  region,
  locale,
  t,
}: {
  expenses: readonly Expense[]
  month: string
  region: Region
  locale: string
  t: Translate
}) {
  const days = dailyTotals(expenses, month)
  const max = days.reduce((a, d) => Math.max(a, d.total), 0)
  const short = (date: string) =>
    formatDate(date, locale, { day: 'numeric', month: 'short' })
  const spent = days.filter((d) => d.total > 0)
  const label =
    spent.length === 0
      ? t('overview.byDayNone', { month: formatMonth(month, locale) })
      : t('overview.byDayChart', {
          month: formatMonth(month, locale),
          days: spent
            .map((d) => `${short(d.date)} ${formatAmount(d.total, region)}`)
            .join(', '),
        })
  return (
    <Bars
      label={label}
      scale={t('overview.upTo', {
        amount: formatAmount(max as Cents, region),
      })}
      bars={days.map((d) => {
        const day = Number(d.date.slice(8))
        return {
          id: d.date,
          value: d.total,
          label: `${short(d.date)}: ${formatAmount(d.total, region)}`,
          tick: TICK_DAYS.has(day) ? String(day) : undefined,
        }
      })}
    />
  )
}

/**
 * "The last six months": each month's total as a bar, this one in the
 * series colour and the others neutral; each bar opens its month.
 */
export function LastMonths({
  expenses,
  month,
  region,
  locale,
  t,
}: {
  expenses: readonly Expense[]
  month: string
  region: Region
  locale: string
  t: Translate
}) {
  const months = monthlyTotals(expenses, month)
  const max = months.reduce((a, m) => Math.max(a, m.total), 0)
  return (
    <Bars
      emphasis
      label={t('overview.lastMonths')}
      scale={t('overview.upTo', {
        amount: formatAmount(max as Cents, region),
      })}
      bars={months.map((m) => ({
        id: m.month,
        value: m.total,
        current: m.month === month,
        to: `?month=${m.month}`,
        tick: formatDate(`${m.month}-01`, locale, { month: 'short' }),
        label: t('overview.monthBar', {
          month: formatMonth(m.month, locale),
          amount: formatAmount(m.total, region),
        }),
      }))}
    />
  )
}
