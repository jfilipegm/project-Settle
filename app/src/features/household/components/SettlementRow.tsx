import { IconArrowsExchange } from '@tabler/icons-react'
import { Link, useLocation } from 'react-router'
import type { Region } from '../../../app/region.ts'
import type { Translate } from '../../../i18n/t.ts'
import { Amount } from '../../../ui/Amount.tsx'
import { Icon } from '../../../ui/Icon.tsx'
import { signedAmount } from '../../../ui/signedAmount.ts'
import { paidWords } from '../balanceWords.ts'
import { formatDate } from '../format.ts'
import type { Member, Settlement } from '../model.ts'
import styles from './ExpenseRow.module.css'

/** The URL parameter that opens a payment over a household page (B8). */
export const SETTLEMENT_PARAM = 'settlement'

/** Set on the history entry a payment row pushes, so closing can go Back. */
export interface SettlementOpenedState {
  settlementOpened: true
}

/**
 * One payment in the history (M5 plan, B8), among the expenses but styled
 * apart: an exchange icon, "Tiago paid Ana", the date and the amount. The
 * row is a link that opens the payment in a dialog over this page
 * (`?settlement=`), as an expense row does.
 */
export function SettlementRow({
  settlement,
  members,
  region,
  locale,
  t,
}: {
  settlement: Settlement
  members: ReadonlyMap<string, Member>
  region: Region
  locale: string
  t: Translate
}) {
  const location = useLocation()
  const search = new URLSearchParams(location.search)
  search.set(SETTLEMENT_PARAM, settlement.id)
  const date = formatDate(settlement.date, locale, {
    day: 'numeric',
    month: 'short',
  })
  const words = paidWords(t, settlement, members)
  const name = t('history.paymentRow', {
    date,
    paid: words,
    amount: signedAmount(settlement.amount, region),
  })
  const state: SettlementOpenedState = { settlementOpened: true }
  return (
    <li className={`${styles.row} ${styles.payment}`}>
      <Link
        className={styles.link}
        aria-label={name}
        to={{ search: `?${search.toString()}` }}
        state={state}
      >
        <span className={styles.date}>
          <time dateTime={settlement.date}>{date}</time>
        </span>
        <span className={styles.what}>
          <Icon icon={IconArrowsExchange} size={16} />
          <span className={styles.description}>{words}</span>
        </span>
        <span className={styles.category}>{settlement.note ?? ''}</span>
        <span className={styles.amount}>
          <Amount value={settlement.amount} region={region} />
        </span>
      </Link>
    </li>
  )
}
