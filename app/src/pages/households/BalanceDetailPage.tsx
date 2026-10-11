import { IconArrowLeft, IconArrowsExchange } from '@tabler/icons-react'
import { useMemo } from 'react'
import { Link, useLocation, useParams, useSearchParams } from 'react-router'
import { useRegion } from '../../app/region.ts'
import {
  balances,
  explainBalance,
  type Balances,
  type ExplanationLine,
} from '../../features/household/balances.ts'
import {
  balanceDate,
  balanceWord,
} from '../../features/household/balanceWords.ts'
import { EXPENSE_PARAM } from '../../features/household/components/ExpenseRow.tsx'
import { SETTLEMENT_PARAM } from '../../features/household/components/SettlementRow.tsx'
import {
  dateLocale,
  formatDate,
  formatMonth,
} from '../../features/household/format.ts'
import { useLedger } from '../../features/household/householdData.ts'
import { isoDate } from '../../features/household/model.ts'
import { monthOf } from '../../features/household/totals.ts'
import { displayName } from '../../features/split/model.ts'
import { useLanguage } from '../../i18n/language.ts'
import { formatAmount } from '../../lib/money.ts'
import { Amount } from '../../ui/Amount.tsx'
import { Card } from '../../ui/Card.tsx'
import { Icon } from '../../ui/Icon.tsx'
import { NotFoundPage } from '../NotFoundPage.tsx'
import { useHouseholdContext } from './householdContext.ts'
import styles from './households.module.css'

/** Whether the default balances are complete, and how many records didn't read. */
function completeness(result: Balances) {
  return { complete: result.complete, unreadable: result.unreadable.total }
}

function recordOf(line: ExplanationLine): { id: string; date: string } {
  return line.kind === 'expense' ? line.expense : line.settlement
}

/**
 * Why a member's balance is what it is (M5 plan, B7): the balance, the
 * sums that make it, then every expense and payment in month groups,
 * newest first, each with its effect, ending on the balance. It respects
 * `?on=`. Any member of the household has one, one who has left with a
 * zero balance included (L2-O4); only a non-member id is Not found.
 */
export function BalanceDetailPage() {
  const { t, language } = useLanguage()
  const { region } = useRegion()
  const { household, members, unreadableMembers } = useHouseholdContext()
  const { mid = '' } = useParams()
  const [params] = useSearchParams()
  const location = useLocation()
  const today = isoDate(new Date())
  const locale = dateLocale(language, region.locale)
  const base = `/households/${household.id}`
  const on = balanceDate(params.get('on'), today)
  const ledger = useLedger(household.id, members, unreadableMembers)
  const member = members.find((m) => m.id === mid)

  const explained = useMemo(
    () =>
      ledger.state === 'ready' && member !== undefined
        ? {
            explanation: explainBalance(ledger.value, member.id, { asOf: on }),
            ...completeness(balances(ledger.value)),
          }
        : null,
    [ledger, member, on],
  )

  if (member === undefined) return <NotFoundPage />
  if (explained === null || explained.explanation === null) return null
  const { explanation, complete, unreadable } = explained
  const { balance, lines } = explanation
  const name = displayName(t, member, member.position)
  const byId = new Map(members.map((m) => [m.id, m]))
  const nameOf = (id: string) => {
    const other = byId.get(id)
    return other === undefined ? '' : displayName(t, other, other.position)
  }
  const query = on === undefined ? '' : `?on=${on}`
  const months: { month: string; lines: ExplanationLine[] }[] = []
  for (const line of lines) {
    const month = monthOf(recordOf(line).date)
    const group = months.at(-1)
    if (group !== undefined && group.month === month) group.lines.push(line)
    else months.push({ month, lines: [line] })
  }
  const opener = (param: string, id: string) => {
    const search = new URLSearchParams(location.search)
    search.set(param, id)
    return `?${search.toString()}`
  }

  return (
    <>
      <p>
        <Link to={`${base}/balances${query}`} className={styles.inline}>
          <Icon icon={IconArrowLeft} size={16} />
          {t('explain.back')}
        </Link>
      </p>
      <h1>{t('explain.title', { name })}</h1>
      <p className={styles.bigAmount}>
        <Amount value={balance.balance} region={region} sign="always" />{' '}
        <span className={styles.balanceWord}>
          {balanceWord(t, balance.balance, complete)}
        </span>
      </p>
      <p className={styles.summary}>
        {t('explain.sums', {
          paid: formatAmount(balance.paid, region),
          share: formatAmount(balance.share, region),
          sent: formatAmount(balance.sent, region),
          received: formatAmount(balance.received, region),
        })}
      </p>
      {on !== undefined && (
        <p className={styles.hint}>
          {t('balances.onNotice', {
            date: formatDate(on, locale, { day: 'numeric', month: 'short' }),
          })}
        </p>
      )}
      {!complete && (
        <Card className={styles.notice}>
          <p>{t('balances.incomplete', { count: unreadable })}</p>
        </Card>
      )}

      {lines.length === 0 ? (
        <Card>
          <p>{t('explain.nothing', { name })}</p>
        </Card>
      ) : (
        months.map((group) => (
          <section
            key={group.month}
            className={styles.monthGroup}
            aria-labelledby={`explain-${group.month}`}
          >
            <h2 id={`explain-${group.month}`} className={styles.monthHeading}>
              {formatMonth(group.month, locale)}
            </h2>
            <Card>
              <ul className={styles.list}>
                {group.lines.map((line) => {
                  const record = recordOf(line)
                  const date = (
                    <time dateTime={record.date} className={styles.rowMeta}>
                      {formatDate(record.date, locale, {
                        day: 'numeric',
                        month: 'short',
                      })}
                    </time>
                  )
                  return (
                    <li key={record.id} className={styles.row}>
                      {line.kind === 'expense' ? (
                        <span className={styles.rowMain}>
                          <Link
                            className={styles.rowLink}
                            to={{ search: opener(EXPENSE_PARAM, record.id) }}
                            state={{ expenseOpened: true }}
                          >
                            {line.expense.description}
                          </Link>
                          <span className={styles.rowMeta}>
                            {date}
                            {' · '}
                            {t('explain.expenseLine', {
                              paid: formatAmount(line.paid, region),
                              share: formatAmount(line.share, region),
                            })}
                          </span>
                        </span>
                      ) : (
                        <span className={styles.rowMain}>
                          <span className={styles.inline}>
                            <Icon icon={IconArrowsExchange} size={16} />
                            <Link
                              className={styles.rowLink}
                              to={{
                                search: opener(SETTLEMENT_PARAM, record.id),
                              }}
                              state={{ settlementOpened: true }}
                            >
                              {line.settlement.fromId === member.id
                                ? t('explain.paidTo', {
                                    name: nameOf(line.settlement.toId),
                                  })
                                : t('explain.from', {
                                    name: nameOf(line.settlement.fromId),
                                  })}
                            </Link>
                          </span>
                          <span className={styles.rowMeta}>{date}</span>
                        </span>
                      )}
                      <Amount
                        value={line.effect}
                        region={region}
                        sign="always"
                      />
                    </li>
                  )
                })}
              </ul>
            </Card>
          </section>
        ))
      )}
      <p className={styles.balanceTotal}>
        <span>{t('explain.total')}</span>
        <Amount value={balance.balance} region={region} sign="always" />
      </p>
    </>
  )
}
