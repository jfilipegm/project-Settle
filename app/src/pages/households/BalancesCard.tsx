import { useMemo } from 'react'
import { Link } from 'react-router'
import { useRegion } from '../../app/region.ts'
import {
  balances,
  suggestSettlements,
  type LedgerInput,
} from '../../features/household/balances.ts'
import {
  balanceWord,
  futureDatedLine,
  hasLeft,
} from '../../features/household/balanceWords.ts'
import { useT } from '../../i18n/language.ts'
import { Amount } from '../../ui/Amount.tsx'
import { Card } from '../../ui/Card.tsx'
import { PersonBadge } from '../../ui/PersonBadge.tsx'
import styles from './households.module.css'

/**
 * The overview's balances card (M5 plan, B5, as on the canvas): the
 * members' balances, compact, then the settle-up line and Details. It
 * shows the default balances (every record) whichever month the overview
 * shows, and says so; never "today" (L2-I2). Incomplete balances (M-I-1)
 * get the short notice and no settle-up line.
 */
export function BalancesCard({
  ledger,
  base,
  today,
}: {
  ledger: LedgerInput
  base: string
  today: string
}) {
  const t = useT()
  const { region } = useRegion()
  const result = useMemo(() => balances(ledger, { today }), [ledger, today])
  const payments = useMemo(
    () => (result.complete ? suggestSettlements(result.members) : []),
    [result],
  )
  const byId = new Map(ledger.members.map((m) => [m.id, m]))
  const rows = result.members.filter((row) => {
    const member = byId.get(row.memberId)
    return (
      member !== undefined && (row.balance !== 0 || !hasLeft(member, today))
    )
  })
  const future = futureDatedLine(t, result.futureDated)

  return (
    <Card title={t('balances.title')}>
      <p className={styles.hint}>
        {t('balances.across')}
        {future !== null && ` ${future}`}
      </p>
      <ul className={styles.list}>
        {rows.map((row) => {
          const member = byId.get(row.memberId)
          if (member === undefined) return null
          return (
            <li key={row.memberId} className={styles.balanceRow}>
              <span className={styles.balanceWho}>
                <PersonBadge person={member} index={member.position} />
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
      <p className={styles.cardFoot}>
        <span>
          {!result.complete
            ? t('balances.overviewIncomplete', {
                count: result.unreadable.total,
              })
            : payments.length > 0
              ? t('balances.settleIn', { count: payments.length })
              : t('balances.settled')}
        </span>
        <Link to={`${base}/balances`}>{t('balances.details')}</Link>
      </p>
    </Card>
  )
}
