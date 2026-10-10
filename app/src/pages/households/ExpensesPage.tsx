import { IconPlus } from '@tabler/icons-react'
import { useCallback, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useRegion } from '../../app/region.ts'
import { listExpenses, listSettlements } from '../../data/repository.ts'
import {
  ExpenseColumns,
  ExpenseRow,
} from '../../features/household/components/ExpenseRow.tsx'
import { dateLocale, formatMonth } from '../../features/household/format.ts'
import { useLoaded } from '../../features/household/householdData.ts'
import { CATEGORY_IDS, isCategoryId } from '../../features/household/model.ts'
import { SettlementRow } from '../../features/household/components/SettlementRow.tsx'
import {
  groupEntriesByMonth,
  matchesFilter,
  newestEntryFirst,
  settlementMatches,
  type HistoryEntry,
} from '../../features/household/search.ts'
import { totalOf } from '../../features/household/totals.ts'
import { displayName } from '../../features/split/model.ts'
import { useLanguage } from '../../i18n/language.ts'
import { Amount } from '../../ui/Amount.tsx'
import { Card } from '../../ui/Card.tsx'
import { SelectField, TextField } from '../../ui/Field.tsx'
import { Icon } from '../../ui/Icon.tsx'
import { useHouseholdContext } from './householdContext.ts'
import styles from './households.module.css'

/**
 * A household's history (M4 plan, H12): every expense, newest first by
 * month, filtered by member and category, with a search. The filters live
 * in the URL (`?member=&category=&q=`), so Back and a reload keep them.
 * Payments are listed among the expenses, styled apart, and never count
 * in a month's total or the count (M5 plan, B8).
 */
export function ExpensesPage() {
  const { t, language } = useLanguage()
  const { region } = useRegion()
  const { household, members } = useHouseholdContext()
  const [params, setParams] = useSearchParams()
  const locale = dateLocale(language, region.locale)
  const base = `/households/${household.id}`
  const loaded = useLoaded(
    useCallback(
      async (db: IDBDatabase) => ({
        expenses: await listExpenses(db, household.id),
        settlements: await listSettlements(db, household.id),
      }),
      [household.id],
    ),
  )

  const memberParam = params.get('member')
  const memberId =
    memberParam !== null && members.some((m) => m.id === memberParam)
      ? memberParam
      : undefined
  const categoryParam = params.get('category')
  const category = isCategoryId(categoryParam) ? categoryParam : undefined
  const query = params.get('q') ?? ''

  const setParam = (name: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value === '') next.delete(name)
    else next.set(name, value)
    setParams(next, { replace: true })
  }

  const byId = useMemo(() => new Map(members.map((m) => [m.id, m])), [members])
  const all = useMemo(
    () => (loaded.state === 'ready' ? loaded.value.expenses.items : []),
    [loaded],
  )
  const payments = useMemo(
    () => (loaded.state === 'ready' ? loaded.value.settlements.items : []),
    [loaded],
  )
  const shown = useMemo(() => {
    const filter = { memberId, category, query }
    const nameOf = (id: string) => {
      const member = byId.get(id)
      return member === undefined ? '' : displayName(t, member, member.position)
    }
    const entries: HistoryEntry[] = [
      ...all
        .filter((expense) => matchesFilter(expense, filter, t))
        .map((expense) => ({ kind: 'expense' as const, expense })),
      ...payments
        .filter((settlement) => settlementMatches(settlement, filter, nameOf))
        .map((settlement) => ({ kind: 'settlement' as const, settlement })),
    ]
    return entries.sort(newestEntryFirst)
  }, [all, payments, memberId, category, query, t, byId])
  const shownExpenses = shown.filter((entry) => entry.kind === 'expense')
  const filtered =
    memberId !== undefined || category !== undefined || query.trim() !== ''

  return (
    <>
      <h1>{t('expenses.title')}</h1>
      <Card title={t('expenses.filters')}>
        <div className={styles.filters}>
          <SelectField
            label={t('expenses.member')}
            value={memberId ?? ''}
            onChange={(event) => setParam('member', event.target.value)}
          >
            <option value="">{t('expenses.allMembers')}</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </SelectField>
          <SelectField
            label={t('expenses.category')}
            value={category ?? ''}
            onChange={(event) => setParam('category', event.target.value)}
          >
            <option value="">{t('expenses.allCategories')}</option>
            {CATEGORY_IDS.map((id) => (
              <option key={id} value={id}>
                {t(`categories.${id}`)}
              </option>
            ))}
          </SelectField>
          <TextField
            type="search"
            label={t('expenses.search')}
            hint={t('expenses.searchHint')}
            value={query}
            onChange={(event) => setParam('q', event.target.value)}
          />
        </div>
      </Card>

      {loaded.state === 'ready' && (
        <>
          <p className={styles.summary} role="status">
            {t('expenses.count', { count: shownExpenses.length })}
          </p>
          {all.length === 0 && payments.length === 0 ? (
            <Card>
              <p className={styles.hint}>{t('overview.firstExpense')}</p>
              <p>
                <Link to={base} className={styles.inline}>
                  <Icon icon={IconPlus} size={16} />
                  {t('expenses.add')}
                </Link>
              </p>
            </Card>
          ) : shown.length === 0 ? (
            <Card>
              <p>{t('expenses.nothingMatches')}</p>
              {filtered && (
                <p>
                  <Link to={`${base}/expenses`} replace>
                    {t('expenses.clear')}
                  </Link>
                </p>
              )}
            </Card>
          ) : (
            groupEntriesByMonth(shown).map((group) => (
              <section
                key={group.month}
                className={styles.monthGroup}
                aria-labelledby={`month-${group.month}`}
              >
                <h2 id={`month-${group.month}`} className={styles.monthHeading}>
                  <span>{formatMonth(group.month, locale)}</span>
                  <Amount
                    value={totalOf(
                      group.entries.flatMap((entry) =>
                        entry.kind === 'expense' ? [entry.expense] : [],
                      ),
                    )}
                    region={region}
                  />
                </h2>
                <Card>
                  <ExpenseColumns t={t} />
                  <ul className={styles.list}>
                    {group.entries.map((entry) =>
                      entry.kind === 'expense' ? (
                        <ExpenseRow
                          key={entry.expense.id}
                          expense={entry.expense}
                          members={byId}
                          region={region}
                          locale={locale}
                          t={t}
                        />
                      ) : (
                        <SettlementRow
                          key={entry.settlement.id}
                          settlement={entry.settlement}
                          members={byId}
                          region={region}
                          locale={locale}
                          t={t}
                        />
                      ),
                    )}
                  </ul>
                </Card>
              </section>
            ))
          )}
          {loaded.value.expenses.unreadable > 0 && (
            <p className={styles.hint}>
              {t('expenses.unreadable', {
                count: loaded.value.expenses.unreadable,
              })}
            </p>
          )}
          {loaded.value.settlements.unreadable > 0 && (
            <p className={styles.hint}>
              {t('expenses.unreadablePayments', {
                count: loaded.value.settlements.unreadable,
              })}
            </p>
          )}
        </>
      )}
    </>
  )
}
