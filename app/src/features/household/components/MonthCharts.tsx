import type { Region } from '../../../app/region.ts'
import type { Translate } from '../../../i18n/t.ts'
import { formatAmount, sum, type Cents } from '../../../lib/money.ts'
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
  // One set of percentages (O-13): every category's, worked out once; a
  // slice of its own takes its category's, and the rest what's left.
  const rowShares = percentages(categories.map((c) => c.total))
  const shareOf = (category: CategoryId) =>
    rowShares[categories.findIndex((c) => c.category === category)] ?? 0
  const ownShares = slices.map((slice) =>
    slice.category === null ? 0 : shareOf(slice.category),
  )
  const sliceShares = slices.map((slice, i) =>
    slice.category === null
      ? 100 - ownShares.reduce((a, b) => a + b, 0)
      : (ownShares[i] ?? 0),
  )
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
  labelledBy,
}: {
  expenses: readonly Expense[]
  month: string
  region: Region
  locale: string
  t: Translate
  /** The id of the card heading that names the chart. */
  labelledBy?: string
}) {
  const days = dailyTotals(expenses, month)
  const highest = days.reduce<{ date: string; total: Cents } | undefined>(
    (best, d) => (d.total > (best?.total ?? 0) ? d : best),
    undefined,
  )
  const max = highest?.total ?? 0
  const short = (date: string) =>
    formatDate(date, locale, { day: 'numeric', month: 'short' })
  const summary =
    highest === undefined
      ? t('overview.byDayNone', { month: formatMonth(month, locale) })
      : t('overview.byDaySummary', {
          total: formatAmount(sum(days.map((d) => d.total)), region),
          month: formatMonth(month, locale),
          day: short(highest.date),
          amount: formatAmount(highest.total, region),
        })
  return (
    <Bars
      label={t('overview.byDay')}
      labelledBy={labelledBy}
      summary={summary}
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
 * series colour and the others neutral. Each other month's bar opens it;
 * the month on screen is a plain mark named "this month" (M5, B1).
 */
export function LastMonths({
  expenses,
  month,
  region,
  locale,
  t,
  labelledBy,
}: {
  expenses: readonly Expense[]
  month: string
  region: Region
  locale: string
  t: Translate
  /** The id of the card heading that names the chart (O-14). */
  labelledBy?: string
}) {
  const months = monthlyTotals(expenses, month)
  const highest = months.reduce<{ month: string; total: Cents } | undefined>(
    (best, m) => (m.total > (best?.total ?? 0) ? m : best),
    undefined,
  )
  const max = highest?.total ?? 0
  return (
    <Bars
      emphasis
      label={t('overview.lastMonths')}
      labelledBy={labelledBy}
      summary={
        highest === undefined
          ? undefined
          : t('overview.lastMonthsSummary', {
              total: formatAmount(sum(months.map((m) => m.total)), region),
              month: formatMonth(highest.month, locale),
              amount: formatAmount(highest.total, region),
            })
      }
      scale={t('overview.upTo', {
        amount: formatAmount(max as Cents, region),
      })}
      bars={months.map((m) => {
        const current = m.month === month
        const words = {
          month: formatMonth(m.month, locale),
          amount: formatAmount(m.total, region),
        }
        return {
          id: m.month,
          value: m.total,
          current,
          to: current ? undefined : `?month=${m.month}`,
          tick: formatDate(`${m.month}-01`, locale, { month: 'short' }),
          label: current
            ? t('overview.monthBarCurrent', words)
            : t('overview.monthBar', words),
        }
      })}
    />
  )
}
