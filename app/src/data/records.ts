/**
 * The stored records' readers (M4 plan, H1): each rebuilds a record from
 * known fields only and returns it, or `null` for anything it can't trust.
 * A reader never throws and never touches the database: a record it
 * rejects stays stored as it is, and is only counted.
 */
import type { Cents, Ratio } from '../lib/money.ts'
import {
  RECORD_VERSION,
  expenseContentErrors,
  isCategoryId,
  isIsoDate,
  isValidName,
  type Expense,
  type ExpenseReceipt,
  type Household,
  type ItemisedSplit,
  type Member,
  type QuickSplit,
  type Settlement,
  settlementContentErrors,
} from '../features/household/model.ts'
import { readBill } from '../features/split/draft.ts'

type Json = unknown

function isObject(value: Json): value is Record<string, Json> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isString(value: Json): value is string {
  return typeof value === 'string'
}

function isCents(value: Json): value is Cents {
  return typeof value === 'number' && Number.isSafeInteger(value)
}

function optionalString(value: Json): value is string | undefined {
  return value === undefined || typeof value === 'string'
}

function readList<T>(value: Json, read: (entry: Json) => T | null): T[] | null {
  if (!Array.isArray(value)) return null
  const list: T[] = []
  for (const entry of value) {
    const parsed = read(entry)
    if (parsed === null) return null
    list.push(parsed)
  }
  return list
}

function readRatio(value: Json): Ratio | null {
  return isObject(value) &&
    typeof value.numerator === 'number' &&
    typeof value.denominator === 'number'
    ? { numerator: value.numerator, denominator: value.denominator }
    : null
}

export function readHousehold(value: Json): Household | null {
  if (
    !isObject(value) ||
    value.v !== RECORD_VERSION ||
    !isString(value.id) ||
    !isString(value.name) ||
    !isValidName(value.name) ||
    !isString(value.createdAt) ||
    !isString(value.updatedAt) ||
    !optionalString(value.archivedAt)
  ) {
    return null
  }
  const household: Household = {
    v: RECORD_VERSION,
    id: value.id,
    name: value.name,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  }
  if (value.archivedAt !== undefined) household.archivedAt = value.archivedAt
  return household
}

export function readMember(value: Json): Member | null {
  if (
    !isObject(value) ||
    value.v !== RECORD_VERSION ||
    !isString(value.id) ||
    !isString(value.householdId) ||
    !isString(value.name) ||
    !isValidName(value.name) ||
    typeof value.position !== 'number' ||
    !Number.isSafeInteger(value.position) ||
    !isIsoDate(value.joinedOn) ||
    !(value.leftOn === undefined || isIsoDate(value.leftOn))
  ) {
    return null
  }
  const member: Member = {
    v: RECORD_VERSION,
    id: value.id,
    householdId: value.householdId,
    name: value.name,
    position: value.position,
    joinedOn: value.joinedOn,
  }
  if (value.leftOn !== undefined) member.leftOn = value.leftOn
  return member
}

function readQuickSplit(value: Record<string, Json>): QuickSplit | null {
  if (!isCents(value.amount)) return null
  const amount = value.amount
  switch (value.kind) {
    case 'equal': {
      const memberIds = readList(value.memberIds, (id) =>
        isString(id) ? id : null,
      )
      return memberIds && { kind: 'equal', amount, memberIds }
    }
    case 'shares': {
      const shares = readList(value.shares, (entry) =>
        isObject(entry) &&
        isString(entry.memberId) &&
        typeof entry.weight === 'number'
          ? { memberId: entry.memberId, weight: entry.weight }
          : null,
      )
      return shares && { kind: 'shares', amount, shares }
    }
    case 'exact': {
      const amounts = readList(value.amounts, (entry) =>
        isObject(entry) && isString(entry.memberId) && isCents(entry.amount)
          ? { memberId: entry.memberId, amount: entry.amount }
          : null,
      )
      return amounts && { kind: 'exact', amount, amounts }
    }
    case 'percent': {
      const percents = readList(value.percents, (entry) => {
        if (!isObject(entry) || !isString(entry.memberId)) return null
        const ratio = readRatio(entry.ratio)
        return ratio && { memberId: entry.memberId, ratio }
      })
      return percents && { kind: 'percent', amount, percents }
    }
    default:
      return null
  }
}

function readItemisedSplit(value: Record<string, Json>): ItemisedSplit | null {
  const bill = readBill(value.bill)
  const members = readList(value.members, (entry) =>
    isObject(entry) && isString(entry.personId) && isString(entry.memberId)
      ? { personId: entry.personId, memberId: entry.memberId }
      : null,
  )
  return bill && members && { kind: 'itemised', bill, members }
}

function readReceipt(value: Json): ExpenseReceipt | null {
  if (!isObject(value)) return null
  const receipt: ExpenseReceipt = {}
  for (const key of ['merchant', 'merchantTaxId', 'date'] as const) {
    const field = value[key]
    if (field === undefined) continue
    if (!isString(field)) return null
    receipt[key] = field
  }
  if (value.total !== undefined) {
    if (!isCents(value.total)) return null
    receipt.total = value.total
  }
  if (value.totalSource !== undefined) {
    if (value.totalSource !== 'qr' && value.totalSource !== 'printed') {
      return null
    }
    receipt.totalSource = value.totalSource
  }
  return receipt
}

/**
 * An expense, or `null`: a wrong shape or record version, or content that
 * doesn't validate on its own (`expenseContentErrors`). References to
 * members are checked by the repository, against the household's members.
 */
export function readExpense(value: Json): Expense | null {
  if (
    !isObject(value) ||
    value.v !== RECORD_VERSION ||
    !isString(value.id) ||
    !isString(value.householdId) ||
    !isString(value.description) ||
    !isString(value.date) ||
    !isCategoryId(value.category) ||
    !isString(value.payerId) ||
    !isObject(value.split) ||
    !isString(value.createdAt) ||
    !isString(value.updatedAt) ||
    !optionalString(value.receiptKey)
  ) {
    return null
  }
  const split =
    value.split.kind === 'itemised'
      ? readItemisedSplit(value.split)
      : readQuickSplit(value.split)
  if (split === null) return null
  const expense: Expense = {
    v: RECORD_VERSION,
    id: value.id,
    householdId: value.householdId,
    description: value.description,
    date: value.date,
    category: value.category,
    payerId: value.payerId,
    split,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  }
  if (value.receipt !== undefined) {
    const receipt = readReceipt(value.receipt)
    if (receipt === null) return null
    expense.receipt = receipt
  }
  if (value.receiptKey !== undefined) expense.receiptKey = value.receiptKey
  return expenseContentErrors(expense).length === 0 ? expense : null
}

/** A payment (M5, B2), from known fields only, or `null`. */
export function readSettlement(value: Json): Settlement | null {
  if (
    !isObject(value) ||
    value.v !== RECORD_VERSION ||
    !isString(value.id) ||
    !isString(value.householdId) ||
    !isString(value.fromId) ||
    !isString(value.toId) ||
    !isCents(value.amount) ||
    !isString(value.date) ||
    !optionalString(value.note) ||
    !isString(value.createdAt) ||
    !isString(value.updatedAt)
  ) {
    return null
  }
  const settlement: Settlement = {
    v: RECORD_VERSION,
    id: value.id,
    householdId: value.householdId,
    fromId: value.fromId,
    toId: value.toId,
    amount: value.amount,
    date: value.date,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  }
  if (value.note !== undefined) settlement.note = value.note
  return settlementContentErrors(settlement).length === 0 ? settlement : null
}
