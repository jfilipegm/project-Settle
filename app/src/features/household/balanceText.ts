/**
 * The settle-up summary as text (M5 plan, B9), ready to paste into a group
 * chat: the household's balances, then the payments that settle them.
 * Pure, in both languages, in the region's money format.
 */
import type { Region } from '../../app/region.ts'
import type { Translate } from '../../i18n/t.ts'
import { formatAmount, negate } from '../../lib/money.ts'
import type { Balances, MemberBalance, SuggestedPayment } from './balances.ts'
import { futureDatedLine } from './balanceWords.ts'

/** The text was asked for over incomplete balances (M-I-1). */
export class IncompleteBalancesError extends Error {}

/**
 * The text of the default balances (every record). It names no date,
 * since they include records dated after today, and says so when any are
 * (L2-I2). It refuses incomplete balances (throws
 * {@link IncompleteBalancesError}): text known to leave something out
 * never leaves the device, and never says everyone is settled up.
 */
export function balanceText({
  t,
  region,
  householdName,
  result,
  rows,
  payments,
  nameOf,
}: {
  t: Translate
  region: Region
  householdName: string
  result: Balances
  /** The members listed, in member order. */
  rows: readonly MemberBalance[]
  payments: readonly SuggestedPayment[]
  nameOf: (memberId: string) => string
}): string {
  if (!result.complete) {
    throw new IncompleteBalancesError('the balances are incomplete')
  }
  const lines = [t('balanceText.header', { name: householdName })]
  const future = futureDatedLine(t, result.futureDated)
  if (future !== null) lines.push(future)
  for (const row of rows) {
    const name = nameOf(row.memberId)
    lines.push(
      row.balance > 0
        ? t('balanceText.getsBack', {
            name,
            amount: formatAmount(row.balance, region),
          })
        : row.balance < 0
          ? t('balanceText.owes', {
              name,
              amount: formatAmount(negate(row.balance), region),
            })
          : t('balanceText.settled', { name }),
    )
  }
  lines.push('')
  if (payments.length === 0) {
    lines.push(t('balances.settled'))
  } else {
    lines.push(t('balanceText.toSettle', { count: payments.length }))
    for (const payment of payments) {
      lines.push(
        t('balanceText.pays', {
          from: nameOf(payment.fromId),
          to: nameOf(payment.toId),
          amount: formatAmount(payment.amount, region),
        }),
      )
    }
  }
  return lines.join('\n')
}
