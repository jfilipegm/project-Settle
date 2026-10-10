import { IconCalendar } from '@tabler/icons-react'
import { Link } from 'react-router'
import type { Region } from '../../../app/region.ts'
import type { Translate } from '../../../i18n/t.ts'
import { Amount } from '../../../ui/Amount.tsx'
import { signedAmount } from '../../../ui/signedAmount.ts'
import { Icon } from '../../../ui/Icon.tsx'
import { PersonBadge } from '../../../ui/PersonBadge.tsx'
import { displayName } from '../../split/model.ts'
import { CATEGORY_ICONS } from '../categories.ts'
import { formatDate } from '../format.ts'
import type { Expense, Member } from '../model.ts'
import { expenseAmount } from '../shares.ts'
import styles from './ExpenseRow.module.css'

/**
 * The column headings above a list of {@link ExpenseRow}s, shown from
 * 640 px where the rows are one line of columns. Hidden from screen
 * readers: each row's link name already pairs its values with these
 * labels.
 */
export function ExpenseColumns({ t }: { t: Translate }) {
  return (
    <div
      className={styles.columns}
      aria-hidden="true"
      data-testid="expense-columns"
    >
      <span className={styles.date}>{t('expenses.columns.date')}</span>
      <span className={styles.what}>{t('expenses.columns.description')}</span>
      <span className={styles.category}>{t('expenses.columns.category')}</span>
      <span className={styles.payer}>{t('expenses.columns.paidBy')}</span>
      <span className={styles.amount}>{t('expenses.columns.amount')}</span>
    </div>
  )
}

/**
 * One expense in a list (M4 plan, H12, H13): the date, what it was (with
 * its item count when itemised), the category with its icon, who paid
 * and the amount. The whole row is a link to the expense, whose name pairs
 * each value with its label. At phone width, where there are no column
 * headings, the date has its calendar and the payer a visible "Paid by".
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
  const date = formatDate(expense.date, locale, {
    day: 'numeric',
    month: 'short',
  })
  // The link's name pairs each value with its label, as the headings do.
  const name = [
    `${t('expenses.columns.date')} ${date}`,
    `${t('expenses.columns.description')} ${expense.description}`,
    items !== null ? t('expenses.itemCount', { count: items }) : null,
    `${t('expenses.columns.category')} ${t(`categories.${expense.category}`)}`,
    payer !== undefined
      ? `${t('expenses.columns.paidBy')} ${displayName(t, payer, payer.position)}`
      : null,
    amount !== null
      ? `${t('expenses.columns.amount')} ${signedAmount(amount, region, 'negative')}`
      : null,
  ]
    .filter((part) => part !== null)
    .join(', ')
  return (
    <li className={styles.row}>
      <Link
        className={styles.link}
        aria-label={name}
        to={`/households/${expense.householdId}/expenses/${expense.id}`}
      >
        <span className={styles.date}>
          <Icon className={styles.phoneOnly} icon={IconCalendar} size={16} />
          <time dateTime={expense.date}>{date}</time>
        </span>
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
            <>
              <span className={styles.paidBy}>
                {t('expenses.columns.paidBy')}{' '}
              </span>
              <PersonBadge person={payer} index={payer.position} size="small" />
            </>
          )}
        </span>
        <span className={styles.amount}>
          {amount !== null && (
            <>
              <Amount value={amount} region={region} />
            </>
          )}
        </span>
      </Link>
    </li>
  )
}
