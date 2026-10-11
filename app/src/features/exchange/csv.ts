/**
 * CSV export (M6 plan, E11): one spreadsheet file of a household's
 * expenses and payments, with each member's share. Pure. Export only: the
 * Settle file is the exchange format.
 */
import type { Region } from '../../app/region.ts'
import type { Translate } from '../../i18n/t.ts'
import type { Cents } from '../../lib/money.ts'
import { byMemberOrder } from '../household/balances.ts'
import type { Expense, Member, Settlement } from '../household/model.ts'
import { expenseAmount, expenseShares } from '../household/shares.ts'

/** Spreadsheets otherwise misread accents (E11). */
const BOM = '﻿'
const CRLF = '\r\n'

/**
 * The region's separators, so a spreadsheet there reads the amounts as
 * numbers: a decimal comma takes `;` between cells, a point takes `,`.
 */
export function csvSeparators(region: Region): {
  cell: string
  decimal: string
} {
  return region.locale === 'pt-PT'
    ? { cell: ';', decimal: ',' }
    : { cell: ',', decimal: '.' }
}

/** An amount as a number, with no symbol or grouping: `23,40` or `23.40`. */
export function csvAmount(value: Cents, decimal: string): string {
  const sign = value < 0 ? '-' : ''
  const magnitude = Math.abs(value)
  const units = Math.floor(magnitude / 100)
  const hundredths = String(magnitude % 100).padStart(2, '0')
  return `${sign}${String(units)}${decimal}${hundredths}`
}

/**
 * User text made safe for a spreadsheet: a cell starting with `=`, `+`,
 * `-`, `@`, a tab or a carriage return gets a leading `'`, so it is never
 * run as a formula (CSV injection).
 */
export function safeText(text: string): string {
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
}

/** A cell quoted per RFC 4180 when it holds a separator, a quote or a line end. */
function cell(value: string, separator: string): string {
  return value.includes(separator) || /["\r\n]/.test(value)
    ? `"${value.replaceAll('"', '""')}"`
    : value
}

function byDate<T extends { date: string; createdAt: string; id: string }>(
  a: T,
  b: T,
): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/**
 * The household's CSV: a header, then every expense and payment, oldest
 * first. Columns: Type, Date (`YYYY-MM-DD` everywhere), Description,
 * Category, Paid by, To, Amount, then each member's share, in member
 * order. A payment fills Paid by, To and Amount and leaves the shares
 * empty: payments are not spending (M5).
 */
export function householdCsv({
  t,
  region,
  members,
  expenses,
  settlements,
}: {
  t: Translate
  region: Region
  members: readonly Member[]
  expenses: readonly Expense[]
  settlements: readonly Settlement[]
}): string {
  const { cell: separator, decimal } = csvSeparators(region)
  const ordered = [...members].sort(byMemberOrder)
  const names = new Map(members.map((member) => [member.id, member.name]))
  const name = (id: string) => safeText(names.get(id) ?? '')
  const row = (values: readonly string[]) =>
    values.map((value) => cell(value, separator)).join(separator)

  const header = row([
    t('exchange.csv.type'),
    t('exchange.csv.date'),
    t('exchange.csv.description'),
    t('exchange.csv.category'),
    t('exchange.csv.paidBy'),
    t('exchange.csv.to'),
    t('exchange.csv.amount', { currency: region.currency }),
    ...ordered.map((member) => safeText(member.name)),
  ])

  type Line =
    | { kind: 'expense'; record: Expense }
    | { kind: 'payment'; record: Settlement }
  const lines: Line[] = [
    ...expenses.map((record): Line => ({ kind: 'expense', record })),
    ...settlements.map((record): Line => ({ kind: 'payment', record })),
  ].sort((a, b) => byDate(a.record, b.record))

  const rows = lines.map((line) => {
    if (line.kind === 'payment') {
      const payment = line.record
      return row([
        t('exchange.csv.payment'),
        payment.date,
        safeText(payment.note ?? ''),
        '',
        name(payment.fromId),
        name(payment.toId),
        csvAmount(payment.amount, decimal),
        ...ordered.map(() => ''),
      ])
    }
    const expense = line.record
    const shares = expenseShares(expense) ?? new Map<string, Cents>()
    return row([
      t('exchange.csv.expense'),
      expense.date,
      safeText(expense.description),
      t(`categories.${expense.category}`),
      name(expense.payerId),
      '',
      csvAmount(expenseAmount(expense) ?? (0 as Cents), decimal),
      ...ordered.map((member) => {
        const share = shares.get(member.id)
        return share === undefined ? '' : csvAmount(share, decimal)
      }),
    ])
  })
  return `${BOM}${[header, ...rows].join(CRLF)}${CRLF}`
}
