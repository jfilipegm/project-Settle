import { Link } from 'react-router'
import type { Region } from '../../../app/region.ts'
import type { Translate } from '../../../i18n/t.ts'
import { Amount } from '../../../ui/Amount.tsx'
import { Icon } from '../../../ui/Icon.tsx'
import { PersonBadge } from '../../../ui/PersonBadge.tsx'
import { CATEGORY_ICONS } from '../categories.ts'
import { formatDate } from '../format.ts'
import type { Expense, Member } from '../model.ts'
import { expenseAmount } from '../shares.ts'
import styles from './ExpenseRow.module.css'

/**
 * One expense in a list (M4 plan, H12, H13): the date, what it was (with
 * its item count when itemised), the category with its icon, who paid
 * and the amount. The whole row is a link to the expense.
 */
export function ExpenseRow({
  expense,
  members,
  region,
  locale,
  t,
}: {
  expense: Expense
  members: ReadonlyMap<string, Member>
  region: Region
  locale: string
  t: Translate
}) {
  const payer = members.get(expense.payerId)
  const amount = expenseAmount(expense)
  const items =
    expense.split.kind === 'itemised' ? expense.split.bill.items.length : null
  return (
    <li className={styles.row}>
      <Link
        className={styles.link}
        to={`/households/${expense.householdId}/expenses/${expense.id}`}
      >
        <time className={styles.date} dateTime={expense.date}>
          {formatDate(expense.date, locale, { day: 'numeric', month: 'short' })}
        </time>
        <span className={styles.what}>
          <span className={styles.description}>{expense.description}</span>
          {items !== null && (
            <span className={styles.items}>
              {t('expenses.itemCount', { count: items })}
            </span>
          )}
        </span>
        <span className={styles.category}>
          <Icon icon={CATEGORY_ICONS[expense.category]} size={16} />
          {t(`categories.${expense.category}`)}
        </span>
        <span className={styles.payer}>
          {payer !== undefined && (
            <PersonBadge person={payer} index={payer.position} size="small" />
          )}
        </span>
        <span className={styles.amount}>
          {amount !== null && <Amount value={amount} region={region} />}
        </span>
      </Link>
    </li>
  )
}
