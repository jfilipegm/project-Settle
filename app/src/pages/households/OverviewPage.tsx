import {
  IconChevronLeft,
  IconChevronRight,
  IconPlus,
} from '@tabler/icons-react'
import { useCallback, useId, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useRegion } from '../../app/region.ts'
import { listExpenses } from '../../data/repository.ts'
import { monthlyTotals } from '../../features/household/charts.ts'
import {
  ExpenseColumns,
  ExpenseRow,
} from '../../features/household/components/ExpenseRow.tsx'
import {
  DayByDay,
  LastMonths,
  WhereItWent,
} from '../../features/household/components/MonthCharts.tsx'
import { dateLocale, formatMonth } from '../../features/household/format.ts'
import { useLedger, useLoaded } from '../../features/household/householdData.ts'
import { activeMembers, isoDate } from '../../features/household/model.ts'
import {
  categoryTotals,
  inMonth,
  isMonth,
  monthOf,
  newestFirst,
  shiftMonth,
  totalOf,
} from '../../features/household/totals.ts'
import { useLanguage } from '../../i18n/language.ts'
import { formatAmount } from '../../lib/money.ts'
import { Button } from '../../ui/Button.tsx'
import { Card } from '../../ui/Card.tsx'
import { Dialog } from '../../ui/Dialog.tsx'
import { Icon } from '../../ui/Icon.tsx'
import { BalancesCard } from './BalancesCard.tsx'
import { useHouseholdContext } from './householdContext.ts'
import styles from './households.module.css'

const LATEST = 6

/**
 * A household's overview (M4 plan, H13): one month at a time
 * (`?month=YYYY-MM`), its total and count, "Add expense", the latest
 * expenses and where the money went, and the balances card (M5, B5).
 */
export function OverviewPage() {
  const { t, language } = useLanguage()
  const { region } = useRegion()
  const { household, members, unreadableMembers } = useHouseholdContext()
  const [params] = useSearchParams()
  const [adding, setAdding] = useState(false)
  const noMembersId = useId()
  const byDayId = useId()
  const lastMonthsId = useId()
  const today = isoDate(new Date())
  const requested = params.get('month')
  const month = isMonth(requested) ? requested : monthOf(today)
  const locale = dateLocale(language, region.locale)
  const base = `/households/${household.id}`
  const loaded = useLoaded(
    useCallback((db) => listExpenses(db, household.id), [household.id]),
  )
  const ledger = useLedger(household.id, members, unreadableMembers)
  const active = activeMembers(members, today)
  const byId = new Map(members.map((m) => [m.id, m]))

  if (active.length === 0 && members.length === 0) {
    return (
      <>
        <h1>{formatMonth(month, locale)}</h1>
        <Card title={t('overview.noMembers')}>
          <p className={styles.hint}>{t('overview.noMembersHint')}</p>
          <p>
            <Link to={`${base}/members`}>{t('overview.toMembers')}</Link>
          </p>
        </Card>
      </>
    )
  }

  const all = loaded.state === 'ready' ? loaded.value.items : []
  const monthly = inMonth(all, month).sort(newestFirst)
  const total = totalOf(monthly)
  const categories = categoryTotals(monthly)
  // The trend shows once any of its six months has spending.
  const trend = monthlyTotals(all, month).some((m) => m.total > 0)

  return (
    <>
      <div className={styles.monthNav}>
        <h1>{formatMonth(month, locale)}</h1>
        <nav aria-label={t('overview.monthNav')} className={styles.actions}>
          <Link
            to={`?month=${shiftMonth(month, -1)}`}
            aria-label={t('overview.previousMonth')}
            className={styles.switcher}
          >
            <Icon icon={IconChevronLeft} size={20} />
          </Link>
          <Link
            to={`?month=${shiftMonth(month, 1)}`}
            aria-label={t('overview.nextMonth')}
            className={styles.switcher}
          >
            <Icon icon={IconChevronRight} size={20} />
          </Link>
        </nav>
      </div>
      {loaded.state === 'ready' && (
        <p className={styles.summary}>
          {t('overview.shared', {
            amount: formatAmount(total, region),
            count: monthly.length,
          })}
        </p>
      )}
      <p>
        <Button
          variant="primary"
          size={52}
          icon={IconPlus}
          disabled={active.length === 0}
          aria-describedby={active.length === 0 ? noMembersId : undefined}
          onClick={() => setAdding(true)}
        >
          {t('overview.addExpense')}
        </Button>
      </p>
      {active.length === 0 && (
        <p id={noMembersId} className={styles.hint}>
          {t('overview.noMembersHint')}{' '}
          <Link to={`${base}/members`}>{t('overview.toMembers')}</Link>
        </p>
      )}

      {ledger.state === 'ready' &&
        (ledger.value.expenses.length > 0 ||
          ledger.value.settlements.length > 0 ||
          ledger.value.unreadable.expenses > 0 ||
          ledger.value.unreadable.settlements > 0) && (
          <BalancesCard ledger={ledger.value} base={base} today={today} />
        )}

      {monthly.length > 0 && (
        <Card title={t('overview.byDay')} titleId={byDayId}>
          <DayByDay
            labelledBy={byDayId}
            expenses={monthly}
            month={month}
            region={region}
            locale={locale}
            t={t}
          />
        </Card>
      )}

      <Card title={t('overview.latest')}>
        {monthly.length === 0 ? (
          <p className={styles.hint}>
            {all.length === 0
              ? t('overview.firstExpense')
              : t('overview.noExpensesMonth')}
          </p>
        ) : (
          <>
            <ExpenseColumns t={t} />
            <ul className={styles.list}>
              {monthly.slice(0, LATEST).map((expense) => (
                <ExpenseRow
                  key={expense.id}
                  expense={expense}
                  members={byId}
                  region={region}
                  locale={locale}
                  t={t}
                />
              ))}
            </ul>
          </>
        )}
        <p>
          <Link to={`${base}/expenses`}>{t('overview.allExpenses')}</Link>
        </p>
      </Card>

      {categories.length > 0 && (
        <Card title={t('overview.whereItWent')}>
          <WhereItWent
            categories={categories}
            total={total}
            region={region}
            t={t}
          />
        </Card>
      )}

      {trend && (
        <Card title={t('overview.lastMonths')} titleId={lastMonthsId}>
          <LastMonths
            labelledBy={lastMonthsId}
            expenses={all}
            month={month}
            region={region}
            locale={locale}
            t={t}
          />
        </Card>
      )}

      <Dialog
        open={adding}
        title={t('overview.addExpense')}
        onClose={() => setAdding(false)}
      >
        <div className={styles.addChoices}>
          <Link className={styles.choice} to={`${base}/expenses/new`}>
            <span className={styles.choiceTitle}>
              {t('overview.quickExpense')}
            </span>
            <span className={styles.hint}>
              {t('overview.quickExpenseHint')}
            </span>
          </Link>
          <Link
            className={styles.choice}
            to={`/split?household=${household.id}`}
          >
            <span className={styles.choiceTitle}>
              {t('itemised.splitBill')}
            </span>
            <span className={styles.hint}>{t('itemised.splitBillHint')}</span>
          </Link>
        </div>
      </Dialog>
    </>
  )
}
