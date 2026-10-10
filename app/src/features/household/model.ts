/**
 * The household model (M4 plan, H4): households, members and expenses, and
 * their validation. Pure and framework-free: the data layer (`data/`) stores
 * these records, and the pages show them.
 */
import type { Cents, Ratio } from '../../lib/money.ts'
import { LIMITS, isBillRatio, validateBill, type Bill } from '../split/model.ts'

/** Every record's own format version (H1). */
export const RECORD_VERSION = 1

/** The fixed categories (H8), stored as ids and named by the catalogue. */
export const CATEGORY_IDS = [
  'groceries',
  'eatingOut',
  'rent',
  'utilities',
  'internet',
  'household',
  'transport',
  'leisure',
  'other',
] as const

export type CategoryId = (typeof CATEGORY_IDS)[number]

export function isCategoryId(value: unknown): value is CategoryId {
  return CATEGORY_IDS.some((id) => id === value)
}

export const HOUSEHOLD_LIMITS = {
  maxNameLength: 60,
  maxDescriptionLength: 80,
  /** The bill's own limit on people (H4). */
  maxActiveMembers: LIMITS.maxPeople,
  maxMembers: 50,
  /** The earliest expense date; the latest is a year after today (L1-O3). */
  minDate: '2000-01-01',
  /** 0,01 to 1 000 000,00 for a quick expense's amount. */
  maxAmount: LIMITS.maxAmount,
  maxShare: LIMITS.maxShare,
} as const

export interface Household {
  v: typeof RECORD_VERSION
  id: string
  name: string
  /** ISO timestamps. */
  createdAt: string
  updatedAt: string
  /** Set while archived: hidden from the switcher, restorable. */
  archivedAt?: string
}

export interface Member {
  v: typeof RECORD_VERSION
  id: string
  householdId: string
  name: string
  /** The order members were added: fixes the member's colour (H4). */
  position: number
  /** `YYYY-MM-DD`. */
  joinedOn: string
  /** `YYYY-MM-DD`, while the member has left. */
  leftOn?: string
}

export type QuickSplit =
  | { kind: 'equal'; amount: Cents; memberIds: string[] }
  | {
      kind: 'shares'
      amount: Cents
      shares: { memberId: string; weight: number }[]
    }
  | {
      kind: 'exact'
      amount: Cents
      amounts: { memberId: string; amount: Cents }[]
    }
  | {
      kind: 'percent'
      amount: Cents
      percents: { memberId: string; ratio: Ratio }[]
    }

export type QuickSplitKind = QuickSplit['kind']

/** The split, saved into a household: each bill person is one member. */
export interface ItemisedSplit {
  kind: 'itemised'
  bill: Bill
  members: { personId: string; memberId: string }[]
}

/** What an itemised expense keeps of its receipt, for display (H11). */
export interface ExpenseReceipt {
  merchant?: string
  merchantTaxId?: string
  date?: string
  total?: Cents
  totalSource?: 'qr' | 'printed'
}

export interface Expense {
  v: typeof RECORD_VERSION
  id: string
  householdId: string
  description: string
  /** `YYYY-MM-DD`. */
  date: string
  category: CategoryId
  /** The member who paid: any member, in the split or not (H6). */
  payerId: string
  split: QuickSplit | ItemisedSplit
  receipt?: ExpenseReceipt
  /** The duplicate-receipt key (H11), indexed with the household. */
  receiptKey?: string
  createdAt: string
  updatedAt: string
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/** A real calendar date written `YYYY-MM-DD`. */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const match = ISO_DATE.exec(value)
  if (match === null) return false
  const [year, month, day] = [
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
  ]
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

/** A local date as `YYYY-MM-DD`: how pages turn "now" into "today". */
export function isoDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** The latest date an expense may have: a year after `today` (L1-O3). */
export function maxExpenseDate(today: string): string {
  const year = Number(today.slice(0, 4)) + 1
  const rest = today.slice(4)
  // 29 February a year on is 28 February.
  return rest === '-02-29' ? `${year}-02-28` : `${year}${rest}`
}

/** Whether a member belongs to the household on a date (H4). */
export function isActiveOn(member: Member, date: string): boolean {
  return (
    member.joinedOn <= date &&
    (member.leftOn === undefined || date <= member.leftOn)
  )
}

/**
 * The most members active on any one day while `member` is, `member`
 * included (H4). Others only become active on their `joinedOn`, so the
 * peak falls on `member`'s own first day or on another's first day inside
 * `member`'s membership.
 */
export function peakActiveWith(
  members: readonly Member[],
  member: Member,
): number {
  const others = members.filter((other) => other.id !== member.id)
  const days = [member.joinedOn, ...others.map((other) => other.joinedOn)]
  return Math.max(
    0,
    ...days
      .filter((day) => isActiveOn(member, day))
      .map(
        (day) => 1 + others.filter((other) => isActiveOn(other, day)).length,
      ),
  )
}

/** The members active on a date, in position order. */
export function activeMembers(
  members: readonly Member[],
  date: string,
): Member[] {
  return sortByPosition(members.filter((member) => isActiveOn(member, date)))
}

export function sortByPosition(members: readonly Member[]): Member[] {
  return [...members].sort((a, b) => a.position - b.position)
}

/** A name as the model keeps it: trimmed, 1 to 60 characters. */
export function isValidName(name: string): boolean {
  const trimmed = name.trim()
  return (
    trimmed.length > 0 &&
    trimmed === name &&
    name.length <= HOUSEHOLD_LIMITS.maxNameLength
  )
}

/** The member ids a split names, in its own order. */
export function splitMemberIds(split: QuickSplit | ItemisedSplit): string[] {
  switch (split.kind) {
    case 'equal':
      return [...split.memberIds]
    case 'shares':
      return split.shares.map((share) => share.memberId)
    case 'exact':
      return split.amounts.map((entry) => entry.memberId)
    case 'percent':
      return split.percents.map((entry) => entry.memberId)
    case 'itemised':
      return split.members.map((entry) => entry.memberId)
  }
}

/** Every member an expense names: its payer and its split (H1, M-I-3). */
export function referencedMemberIds(expense: Expense): string[] {
  return [...new Set([expense.payerId, ...splitMemberIds(expense.split)])]
}

/** Where an expense error belongs, so a form can show it by its field. */
export type ExpenseField =
  | { kind: 'description' }
  | { kind: 'date' }
  | { kind: 'category' }
  | { kind: 'amount' }
  | { kind: 'payer' }
  | { kind: 'split' }
  | { kind: 'member'; memberId: string }

export type ExpenseErrorCode =
  /** Empty, or longer than 80 characters. */
  | 'descriptionInvalid'
  /** Not a real date. */
  | 'dateInvalid'
  /** Before 2000-01-01 or more than a year after today. */
  | 'dateOutOfRange'
  | 'categoryUnknown'
  /** Not a whole number of cents in 0,01–1 000 000,00. */
  | 'amountOutOfRange'
  /** The payer or a split member isn't a member of this household. */
  | 'unknownMember'
  /** A split with nobody in it. */
  | 'noMembers'
  /** The same member twice in a split. */
  | 'duplicateMember'
  /** A share weight outside 1–99. */
  | 'shareOutOfRange'
  /** An exact amount below 0 or above the expense. */
  | 'exactOutOfRange'
  /** The exact amounts don't add up to the expense's amount. */
  | 'exactSumMismatch'
  /** A percentage that isn't a bill ratio in 0–100. */
  | 'percentOutOfRange'
  /** The percentages don't add up to exactly 100. */
  | 'percentSumMismatch'
  /** The itemised bill doesn't pass `validateBill`. */
  | 'billInvalid'
  /** The itemised bill's people and members don't match one to one. */
  | 'mappingInvalid'

export interface ExpenseError {
  code: ExpenseErrorCode
  field: ExpenseField
}

function isAmount(value: number, min: number): boolean {
  return (
    Number.isSafeInteger(value) &&
    value >= min &&
    value <= HOUSEHOLD_LIMITS.maxAmount
  )
}

/** A percentage as hundredths of a thousandth: 100 % is 100 000. */
function percentUnits(ratio: Ratio): number {
  return ratio.numerator * (1000 / ratio.denominator)
}

function quickSplitErrors(split: QuickSplit): ExpenseError[] {
  const errors: ExpenseError[] = []
  const at = { kind: 'split' } as const
  if (!isAmount(split.amount, 1)) {
    errors.push({ code: 'amountOutOfRange', field: { kind: 'amount' } })
  }
  const ids = splitMemberIds(split)
  if (ids.length === 0) errors.push({ code: 'noMembers', field: at })
  if (new Set(ids).size !== ids.length) {
    errors.push({ code: 'duplicateMember', field: at })
  }
  switch (split.kind) {
    case 'equal':
      break
    case 'shares':
      for (const { memberId, weight } of split.shares) {
        if (
          !Number.isInteger(weight) ||
          weight < 1 ||
          weight > HOUSEHOLD_LIMITS.maxShare
        ) {
          errors.push({
            code: 'shareOutOfRange',
            field: { kind: 'member', memberId },
          })
        }
      }
      break
    case 'exact': {
      let total = 0
      for (const { memberId, amount } of split.amounts) {
        if (!isAmount(amount, 0) || amount > split.amount) {
          errors.push({
            code: 'exactOutOfRange',
            field: { kind: 'member', memberId },
          })
        }
        total += amount
      }
      if (errors.length === 0 && total !== split.amount) {
        errors.push({ code: 'exactSumMismatch', field: at })
      }
      break
    }
    case 'percent': {
      let total = 0
      for (const { memberId, ratio } of split.percents) {
        if (!isBillRatio(ratio) || percentUnits(ratio) > 100_000) {
          errors.push({
            code: 'percentOutOfRange',
            field: { kind: 'member', memberId },
          })
        } else {
          total += percentUnits(ratio)
        }
      }
      if (errors.length === 0 && total !== 100_000) {
        errors.push({ code: 'percentSumMismatch', field: at })
      }
      break
    }
  }
  return errors
}

function itemisedSplitErrors(split: ItemisedSplit): ExpenseError[] {
  const at = { kind: 'split' } as const
  if (validateBill(split.bill).length > 0) {
    return [{ code: 'billInvalid', field: at }]
  }
  const personIds = split.bill.people.map((person) => person.id)
  const mappedPeople = split.members.map((entry) => entry.personId)
  const memberIds = split.members.map((entry) => entry.memberId)
  const samePeople =
    mappedPeople.length === personIds.length &&
    new Set(mappedPeople).size === mappedPeople.length &&
    personIds.every((id) => mappedPeople.includes(id))
  if (!samePeople) return [{ code: 'mappingInvalid', field: at }]
  if (new Set(memberIds).size !== memberIds.length) {
    return [{ code: 'duplicateMember', field: at }]
  }
  return []
}

/**
 * The checks that need no other record: lengths, the date's shape, the
 * category, and the split adding up. A stored expense is read only if it
 * passes these (`data/records.ts`).
 */
export function expenseContentErrors(expense: Expense): ExpenseError[] {
  const errors: ExpenseError[] = []
  const description = expense.description
  if (
    description.trim().length === 0 ||
    description.trim() !== description ||
    description.length > HOUSEHOLD_LIMITS.maxDescriptionLength
  ) {
    errors.push({ code: 'descriptionInvalid', field: { kind: 'description' } })
  }
  if (!isIsoDate(expense.date)) {
    errors.push({ code: 'dateInvalid', field: { kind: 'date' } })
  } else if (expense.date < HOUSEHOLD_LIMITS.minDate) {
    errors.push({ code: 'dateOutOfRange', field: { kind: 'date' } })
  }
  if (!isCategoryId(expense.category)) {
    errors.push({ code: 'categoryUnknown', field: { kind: 'category' } })
  }
  errors.push(
    ...(expense.split.kind === 'itemised'
      ? itemisedSplitErrors(expense.split)
      : quickSplitErrors(expense.split)),
  )
  return errors
}

/**
 * Every problem that stops an expense from being saved: its content, the
 * date's upper bound (a year after `today`, passed in, R2-O2), and that
 * the payer and every split member are members of this household, in any
 * state (H4). The form uses it for the user's feedback; the repository's
 * transaction re-checks the references as the guarantee (H1, M-I-3).
 */
export function validateExpense(
  expense: Expense,
  members: readonly Member[],
  today: string,
): ExpenseError[] {
  const errors = expenseContentErrors(expense)
  if (isIsoDate(expense.date) && expense.date > maxExpenseDate(today)) {
    errors.push({ code: 'dateOutOfRange', field: { kind: 'date' } })
  }
  const known = new Set(
    members
      .filter((member) => member.householdId === expense.householdId)
      .map((member) => member.id),
  )
  if (!known.has(expense.payerId)) {
    errors.push({ code: 'unknownMember', field: { kind: 'payer' } })
  }
  for (const memberId of splitMemberIds(expense.split)) {
    if (!known.has(memberId)) {
      errors.push({
        code: 'unknownMember',
        field: { kind: 'member', memberId },
      })
    }
  }
  return errors
}
