import { IconCash, IconPlus } from '@tabler/icons-react'
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useRegion } from '../../app/region.ts'
import {
  balances,
  suggestSettlements,
  type SuggestedPayment,
} from '../../features/household/balances.ts'
import {
  balanceDate,
  balanceWord,
  futureDatedLine,
  hasLeft,
} from '../../features/household/balanceWords.ts'
import { SettlementForm } from '../../features/household/components/SettlementForm.tsx'
import { dateLocale, formatDate } from '../../features/household/format.ts'
import { isoDate } from '../../features/household/model.ts'
import { useLedger } from '../../features/household/useLedger.ts'
import { displayName } from '../../features/split/model.ts'
import { useLanguage } from '../../i18n/language.ts'
import { formatAmount } from '../../lib/money.ts'
import { Amount } from '../../ui/Amount.tsx'
import { Button } from '../../ui/Button.tsx'
import { Card } from '../../ui/Card.tsx'
import { Dialog } from '../../ui/Dialog.tsx'
import { TextField } from '../../ui/Field.tsx'
import { PersonBadge } from '../../ui/PersonBadge.tsx'
import { useHouseholdContext } from './householdContext.ts'
import styles from './households.module.css'

/**
 * A household's balances (M5 plan, B5): each member's balance, the
 * fewest payments that settle everyone with Mark as paid, Record a
 * payment, and the balances on a past date (`?on=`). Incomplete balances
 * (an unreadable record, M-I-1) show as figures only: no suggestion, no
 * Mark as paid and never "Everyone is settled up".
 */
export function BalancesPage() {
  const { t, language } = useLanguage()
  const { region } = useRegion()
  const { household, members, unreadableMembers } = useHouseholdContext()
  const [params, setParams] = useSearchParams()
  // Today, fixed for the page's life, so the derived values can be kept.
  const [today] = useState(() => isoDate(new Date()))
  const locale = dateLocale(language, region.locale)
  const base = `/households/${household.id}`
  const on = balanceDate(params.get('on'), today)
  const ledger = useLedger(household.id, members, unreadableMembers)
  const [recording, setRecording] = useState<{
    prefill?: SuggestedPayment
  } | null>(null)
  const [announced, setAnnounced] = useState('')

  const result = useMemo(
    () =>
      ledger.state === 'ready'
        ? balances(ledger.value, { asOf: on, today })
        : null,
    [ledger, on, today],
  )
  const payments = useMemo(
    () =>
      result !== null && result.complete && on === undefined
        ? suggestSettlements(result.members)
        : [],
    [result, on],
  )

  const setOn = (value: string) => {
    const next = new URLSearchParams(params)
    if (value === '') next.delete('on')
    else next.set('on', value)
    setParams(next, { replace: true })
  }

  const byId = new Map(members.map((m) => [m.id, m]))
  const nameOf = (id: string) => {
    const member = byId.get(id)
    return member === undefined ? '' : displayName(t, member, member.position)
  }
  const short = (date: string) =>
    formatDate(date, locale, { day: 'numeric', month: 'short' })

  const live = (
    <p className={styles.srOnly} role="status">
      {announced}
    </p>
  )

  if (members.length === 0) {
    return (
      <>
        <h1>{t('balances.title')}</h1>
        <Card title={t('overview.noMembers')}>
          <p className={styles.hint}>{t('overview.noMembersHint')}</p>
          <p>
            <Link to={`${base}/members`}>{t('overview.toMembers')}</Link>
          </p>
        </Card>
      </>
    )
  }
  if (ledger.state !== 'ready' || result === null) return live

  const input = ledger.value
  const empty =
    input.expenses.length === 0 &&
    input.settlements.length === 0 &&
    result.unreadable.total === 0
  const anyBalance = result.members.some((row) => row.balance !== 0)
  const rows = result.members.filter((row) => {
    const member = byId.get(row.memberId)
    return (
      member !== undefined && (row.balance !== 0 || !hasLeft(member, today))
    )
  })
  const headline =
    on !== undefined
      ? null
      : !result.complete
        ? t('balances.incompleteHeading')
        : payments.length > 0
          ? t('balances.settleIn', { count: payments.length })
          : t('balances.settled')
  const future =
    on === undefined ? futureDatedLine(t, result.futureDated) : null

  return (
    <>
      <h1>{t('balances.title')}</h1>
      {live}
      {empty ? (
        <Card>
          <p>{t('balances.noRecords')}</p>
          <p>
            <Link to={base} className={styles.inline}>
              {t('balances.addExpense')}
            </Link>
          </p>
        </Card>
      ) : (
        <>
          {headline !== null && <p className={styles.summary}>{headline}</p>}
          {on !== undefined && (
            <p className={styles.summary}>
              {t('balances.onNotice', {
                date: formatDate(on, locale, {
                  day: 'numeric',
                  month: 'short',
                }),
              })}{' '}
              <Link to={`${base}/balances`} replace>
                {t('balances.showAll')}
              </Link>
            </p>
          )}
          {!result.complete && (
            <Card className={styles.notice}>
              <p>
                {t('balances.incomplete', { count: result.unreadable.total })}
              </p>
            </Card>
          )}
          {future !== null && <p className={styles.hint}>{future}</p>}

          <Card>
            {!result.complete && !anyBalance ? (
              <p>{t('balances.noBalanceIncomplete')}</p>
            ) : (
              <ul className={styles.list}>
                {rows.map((row) => {
                  const member = byId.get(row.memberId)
                  if (member === undefined) return null
                  const query = on === undefined ? '' : `?on=${on}`
                  return (
                    <li key={row.memberId} className={styles.balanceRow}>
                      <span className={styles.balanceWho}>
                        <Link
                          className={styles.rowLink}
                          to={`${base}/balances/${member.id}${query}`}
                        >
                          <PersonBadge
                            person={member}
                            index={member.position}
                          />
                        </Link>
                        <span className={styles.rowMeta}>
                          {t('balances.paid', {
                            amount: formatAmount(row.paid, region),
                          })}
                          {hasLeft(member, today) &&
                            member.leftOn !== undefined &&
                            ` · ${t('balances.leftOn', { date: short(member.leftOn) })}`}
                        </span>
                      </span>
                      <span className={styles.balanceWord}>
                        {balanceWord(t, row.balance, result.complete)}
                      </span>
                      <Amount
                        className={styles.balanceAmount}
                        value={row.balance}
                        region={region}
                        sign="always"
                      />
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>

          {payments.length > 0 && (
            <Card title={t('balances.settleUp')}>
              <p className={styles.hint}>
                {t('balances.settleUpHint', { count: payments.length })}
              </p>
              <ul className={styles.list}>
                {payments.map((payment) => {
                  const words = {
                    from: nameOf(payment.fromId),
                    to: nameOf(payment.toId),
                    amount: formatAmount(payment.amount, region),
                  }
                  return (
                    <li
                      key={`${payment.fromId}>${payment.toId}`}
                      className={styles.row}
                    >
                      <span className={styles.rowMain}>
                        {t('balances.pays', words)}
                      </span>
                      <Amount value={payment.amount} region={region} />
                      <Button
                        icon={IconCash}
                        aria-label={t('balances.markAsPaidFor', words)}
                        onClick={() => setRecording({ prefill: payment })}
                      >
                        {t('balances.markAsPaid')}
                      </Button>
                    </li>
                  )
                })}
              </ul>
            </Card>
          )}
        </>
      )}

      {on === undefined && (
        <p>
          <Button icon={IconPlus} onClick={() => setRecording({})}>
            {t('balances.record')}
          </Button>
        </p>
      )}

      {!empty && (
        <TextField
          type="date"
          label={t('balances.on')}
          hint={t('balances.onHint')}
          value={on ?? ''}
          max={today}
          onChange={(event) => setOn(event.target.value)}
        />
      )}

      <Dialog
        open={recording !== null}
        title={t('payment.title')}
        onClose={() => setRecording(null)}
      >
        {recording !== null && (
          <SettlementForm
            householdId={household.id}
            members={members}
            ledger={input}
            today={today}
            prefill={recording.prefill}
            onSaved={() => {
              setRecording(null)
              setAnnounced(t('balances.recorded'))
            }}
            onCancel={() => setRecording(null)}
          />
        )}
      </Dialog>
    </>
  )
}
