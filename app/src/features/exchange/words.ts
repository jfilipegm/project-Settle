/**
 * The import preview's words (M6 plan, E2, E8): a refused file's problems,
 * records described as the history describes them, what differs in a
 * conflict, and the changes Apply makes. Pure: the translator, the
 * region and the date locale come in.
 */
import type { Region } from '../../app/region.ts'
import type { Translate } from '../../i18n/t.ts'
import { cents, formatAmount } from '../../lib/money.ts'
import type { RecordKind } from '../../data/versions.ts'
import { formatDate } from '../household/format.ts'
import { expenseAmount } from '../household/shares.ts'
import type {
  Expense,
  Household,
  Member,
  Settlement,
} from '../household/model.ts'
import { canonical } from './format.ts'
import type { HouseholdCounts, HouseholdResolution, Side } from './merge.ts'
import type { FileProblem, RecordRef } from './readFile.ts'
import type { LeftOut } from '../../data/exchange.ts'

export interface Words {
  t: Translate
  region: Region
  /** The locale for dates with month names (`dateLocale`). */
  locale: string
  /** A member's name, from this phone or the file. */
  nameOf: (memberId: string) => string
}

function shortDate(date: string, words: Words): string {
  return formatDate(date, words.locale, { day: 'numeric', month: 'short' })
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** "The expense “Groceries” on 3 Oct", or the like, for a problem. */
export function recordWords(ref: RecordRef, words: Words): string {
  const { t } = words
  const date =
    ref.date !== undefined && ISO_DATE.test(ref.date)
      ? shortDate(ref.date, words)
      : undefined
  const label = ref.label ?? ''
  switch (ref.kind) {
    case 'expense':
      return date === undefined
        ? t('exchange.record.expenseNoDate', { label })
        : t('exchange.record.expense', { label, date })
    case 'settlement':
      return date === undefined
        ? t('exchange.record.settlementNoDate')
        : t('exchange.record.settlement', { date })
    case 'member':
      return label === ''
        ? t('exchange.record.unnamed')
        : t('exchange.record.member', { label })
    case 'household':
      return label === ''
        ? t('exchange.record.unnamed')
        : t('exchange.record.household', { label })
  }
}

/** One problem of a refused file, in words (E2). */
export function problemText(problem: FileProblem, words: Words): string {
  const { t } = words
  switch (problem.code) {
    case 'tooLarge':
    case 'notJson':
    case 'notSettle':
    case 'newerVersion':
    case 'migrationFailed':
    case 'badShape':
    case 'unknownKind':
    case 'householdCount':
      return t(`exchange.problem.${problem.code}`)
    case 'unknownKey':
      return t('exchange.problem.unknownKey', { key: problem.key })
    case 'badTimestamp':
      return problem.record === undefined
        ? t('exchange.problem.badTimestamp')
        : t('exchange.problem.badTimestampOf', {
            record: recordWords(problem.record, words),
          })
    case 'unreadable':
    case 'badId':
    case 'badPosition':
    case 'wrongHousehold':
    case 'missingMember':
    case 'duplicateId':
    case 'tooManyMembers':
    case 'missingVersion':
    case 'duplicateVersion':
      return t(`exchange.problem.${problem.code}`, {
        record: recordWords(problem.record, words),
      })
    case 'tooManyActive':
      return t('exchange.problem.tooManyActive', {
        record: recordWords(problem.record, words),
        date: ISO_DATE.test(problem.date)
          ? formatDate(problem.date, words.locale)
          : problem.date,
      })
    case 'badVersion':
    case 'orphanVersion':
    case 'deletedHousehold':
    case 'deletedAndPresent':
    case 'badClock':
      return t('exchange.problem.versions')
  }
}

type AnyRecord = Household | Member | Expense | Settlement

/** A record as the history and the conflict pair describe it (E8). */
export function describeRecord(
  kind: RecordKind,
  record: AnyRecord,
  words: Words,
): string {
  const { t, region } = words
  switch (kind) {
    case 'expense': {
      const expense = record as Expense
      return t('exchange.describe.expense', {
        description: expense.description,
        amount: formatAmount(total(expense), region),
        date: shortDate(expense.date, words),
        payer: words.nameOf(expense.payerId),
      })
    }
    case 'settlement': {
      const payment = record as Settlement
      return t('exchange.describe.payment', {
        paid: t('history.paid', {
          from: words.nameOf(payment.fromId),
          to: words.nameOf(payment.toId),
        }),
        amount: formatAmount(payment.amount, region),
        date: shortDate(payment.date, words),
      })
    }
    case 'member': {
      const member = record as Member
      return member.leftOn === undefined
        ? member.name
        : t('exchange.describe.memberLeft', {
            name: member.name,
            date: shortDate(member.leftOn, words),
          })
    }
    case 'household': {
      const household = record as Household
      return household.archivedAt === undefined
        ? household.name
        : t('exchange.describe.householdArchived', { name: household.name })
    }
  }
}

/** An expense's amount: an itemised bill's total, a quick one's amount. */
function total(expense: Expense) {
  return expenseAmount(expense) ?? cents(0)
}

/** One side of a conflict in words: its record, or "Deleted". */
export function describeSide(
  kind: RecordKind,
  side: Side,
  words: Words,
): string {
  if (side.type === 'record') return describeRecord(kind, side.record, words)
  return words.t('exchange.preview.deleted')
}

type Field =
  | 'description'
  | 'amount'
  | 'date'
  | 'category'
  | 'payer'
  | 'split'
  | 'name'
  | 'left'
  | 'joined'
  | 'from'
  | 'to'
  | 'note'
  | 'archived'
  | 'other'

/** Which fields differ between two records of one kind (E8). */
export function differingFields(
  kind: RecordKind,
  mine: AnyRecord,
  theirs: AnyRecord,
): Field[] {
  const a = mine as unknown as Record<string, unknown>
  const b = theirs as unknown as Record<string, unknown>
  const differs = (key: string) => canonical(a[key]) !== canonical(b[key])
  const fields: Field[] = []
  const check = (field: Field, ...keys: string[]) => {
    if (keys.some(differs)) fields.push(field)
  }
  switch (kind) {
    case 'expense': {
      const x = mine as Expense
      const y = theirs as Expense
      check('description', 'description')
      if (total(x) !== total(y)) fields.push('amount')
      check('date', 'date')
      check('category', 'category')
      check('payer', 'payerId')
      const withoutAmount = (split: Expense['split']) =>
        canonical({ ...split, amount: 0 })
      if (withoutAmount(x.split) !== withoutAmount(y.split)) {
        fields.push('split')
      }
      check('other', 'receipt', 'receiptKey')
      break
    }
    case 'settlement':
      check('from', 'fromId')
      check('to', 'toId')
      check('amount', 'amount')
      check('date', 'date')
      check('note', 'note')
      break
    case 'member':
      check('name', 'name')
      check('joined', 'joinedOn')
      check('left', 'leftOn')
      check('other', 'position')
      break
    case 'household':
      check('name', 'name')
      check('archived', 'archivedAt')
      break
  }
  return fields.length === 0 ? ['other'] : fields
}

/** "What differs: the amount, the date." */
export function differsLine(fields: readonly Field[], t: Translate): string {
  return t('exchange.preview.differs', {
    fields: fields
      .map((field) => t(`exchange.preview.field.${field}`))
      .join(', '),
  })
}

/** "3 new expenses, 1 changed, 1 deleted, 2 new payments", or `null`. */
export function countsLine(
  counts: HouseholdCounts,
  t: Translate,
): string | null {
  const parts: string[] = []
  const add = (count: number, key: Parameters<Translate>[0]) => {
    if (count > 0) parts.push(t(key, { count }))
  }
  add(counts.newRecords.expense, 'exchange.preview.count.newExpense')
  add(counts.newRecords.member, 'exchange.preview.count.newMember')
  const changed =
    counts.changed.expense +
    counts.changed.settlement +
    counts.changed.member +
    counts.changed.household
  add(changed, 'exchange.preview.count.changed')
  const deleted =
    counts.deleted.expense + counts.deleted.settlement + counts.deleted.member
  add(deleted, 'exchange.preview.count.deleted')
  add(counts.newRecords.settlement, 'exchange.preview.count.newPayment')
  return parts.length === 0 ? null : parts.join(', ')
}

/** The changes Apply makes to a household, in words (E8). */
export function changeLines(
  resolution: HouseholdResolution,
  words: Words,
): string[] {
  const { t } = words
  const lines: string[] = []
  const before = new Map(resolution.plan.items.map((item) => [item.id, item]))
  for (const item of resolution.items) {
    if (!item.writesRecord) continue
    const mine = before.get(item.id)?.mine
    if (item.result.type === 'record') {
      const what = describeRecord(item.kind, item.result.record, words)
      lines.push(
        mine?.type === 'record'
          ? t('exchange.preview.change.changed', { what })
          : t('exchange.preview.change.new', { what }),
      )
    } else if (mine?.type === 'record') {
      lines.push(
        t('exchange.preview.change.deleted', {
          what: describeRecord(item.kind, mine.record, words),
        }),
      )
    }
  }
  return lines
}

/** "3 records aren't in the file: 1 couldn't be read, and 2 name it." */
export function leftOutLine(leftOut: LeftOut, t: Translate): string {
  const reasons: string[] = []
  if (leftOut.unreadable > 0) {
    reasons.push(
      t('exchange.leftOut.unreadable', { count: leftOut.unreadable }),
    )
  }
  if (leftOut.invalid > 0) {
    reasons.push(t('exchange.leftOut.invalid', { count: leftOut.invalid }))
  }
  if (leftOut.namesLeftOut > 0) {
    reasons.push(
      t('exchange.leftOut.namesLeftOut', { count: leftOut.namesLeftOut }),
    )
  }
  const count = leftOut.unreadable + leftOut.invalid + leftOut.namesLeftOut
  return t('exchange.leftOut.intro', { count, reasons: reasons.join(', ') })
}
