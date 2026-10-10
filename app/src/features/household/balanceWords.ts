/**
 * The words around balances (M5 plan, B5, B6, B10), shared by the
 * Balances tab, the overview's card, the payment dialog and the text.
 * Pure: the catalogue comes in as `t`.
 */
import type { Region } from '../../app/region.ts'
import type { Translate } from '../../i18n/t.ts'
import { negate, type Cents } from '../../lib/money.ts'
import { formatAmount } from '../../lib/money.ts'
import type { Balances, PaymentOutcome } from './balances.ts'
import { isIsoDate, type Member } from './model.ts'

/**
 * "Gets back", "Owes" or "Settled up". Over incomplete balances a zero
 * isn't a conclusion (M-I-1): it reads "No balance".
 */
export function balanceWord(
  t: Translate,
  balance: Cents,
  complete: boolean,
): string {
  if (balance > 0) return t('balances.getsBack')
  if (balance < 0) return t('balances.owes')
  return complete ? t('balances.settledUp') : t('balances.noBalance')
}

/**
 * The line that says the default balances include records dated after
 * today (L1-I1, L3-O3), counting both kinds, or `null` when there are
 * none.
 */
export function futureDatedLine(
  t: Translate,
  futureDated: Balances['futureDated'],
): string | null {
  const { expenses, settlements } = futureDated
  const expensesText = t('balances.future.expenses', { count: expenses })
  const paymentsText = t('balances.future.payments', { count: settlements })
  if (expenses > 0 && settlements > 0) {
    return t('balances.future.both', {
      expenses: expensesText,
      payments: paymentsText,
    })
  }
  if (expenses > 0) return t('balances.future.one', { what: expensesText })
  if (settlements > 0) return t('balances.future.one', { what: paymentsText })
  return null
}

/**
 * The dialog's "After this, Tiago owes 7,65 and Ana is settled up." line
 * (B6, L1-O3): both members' outcome, the payer first.
 */
export function outcomeLine(
  t: Translate,
  region: Region,
  outcome: PaymentOutcome,
  names: { from: string; to: string },
): string {
  const one = (name: string, balance: Cents) =>
    balance > 0
      ? t('payment.outcome.getsBack', {
          name,
          amount: formatAmount(balance, region),
        })
      : balance < 0
        ? t('payment.outcome.owes', {
            name,
            amount: formatAmount(negate(balance), region),
          })
        : t('payment.outcome.settled', { name })
  return t('payment.after', {
    first: one(names.from, outcome.from.balance),
    second: one(names.to, outcome.to.balance),
  })
}

/**
 * `?on=` (B5): a real date up to today, or `undefined` for anything else
 * (ignored, as an unknown `?month=` is on the overview).
 */
export function balanceDate(
  value: string | null,
  today: string,
): string | undefined {
  return value !== null && isIsoDate(value) && value <= today
    ? value
    : undefined
}

/** A member who had left before today. */
export function hasLeft(member: Member, today: string): boolean {
  return member.leftOn !== undefined && member.leftOn < today
}
