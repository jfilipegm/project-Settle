/**
 * The saved draft (D11): the bill being edited, kept in `localStorage` so a
 * refresh doesn't lose it. One draft, no history. It's scratch data, so
 * anything that can't be trusted is dropped for a fresh bill.
 */
import type { Cents, Ratio } from '../../lib/money.ts'
import {
  validateBill,
  type Adjustment,
  type Assignment,
  type Bill,
  type Item,
  type Person,
  type SplitMode,
} from './model.ts'

export const DRAFT_STORAGE_KEY = 'settle.bill'
export const DRAFT_VERSION = 1

type Json = unknown

function isObject(value: Json): value is Record<string, Json> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readRatio(value: Json): Ratio | null {
  if (
    !isObject(value) ||
    typeof value.numerator !== 'number' ||
    typeof value.denominator !== 'number'
  ) {
    return null
  }
  return { numerator: value.numerator, denominator: value.denominator }
}

function readAdjustment(value: Json): Adjustment | null {
  if (!isObject(value)) {
    return null
  }
  if (value.kind === 'amount' && typeof value.value === 'number') {
    return { kind: 'amount', value: value.value as Cents }
  }
  if (value.kind === 'percent') {
    const ratio = readRatio(value.ratio)
    return ratio ? { kind: 'percent', ratio } : null
  }
  return null
}

function readMode(value: Json): SplitMode | null {
  return value === 'proportional' || value === 'equal' ? value : null
}

function readPerson(value: Json): Person | null {
  return isObject(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string'
    ? { id: value.id, name: value.name }
    : null
}

function readAssignment(value: Json): Assignment | null {
  return isObject(value) &&
    typeof value.personId === 'string' &&
    typeof value.weight === 'number'
    ? { personId: value.personId, weight: value.weight }
    : null
}

function readList<T>(value: Json, read: (entry: Json) => T | null): T[] | null {
  if (!Array.isArray(value)) {
    return null
  }
  const list: T[] = []
  for (const entry of value) {
    const parsed = read(entry)
    if (parsed === null) {
      return null
    }
    list.push(parsed)
  }
  return list
}

function readItem(value: Json): Item | null {
  if (
    !isObject(value) ||
    typeof value.id !== 'string' ||
    typeof value.name !== 'string' ||
    typeof value.unitPrice !== 'number'
  ) {
    return null
  }
  const quantity = readRatio(value.quantity)
  const assignees = readList(value.assignees, readAssignment)
  if (!quantity || !assignees) {
    return null
  }
  return {
    id: value.id,
    name: value.name,
    quantity,
    unitPrice: value.unitPrice as Cents,
    assignees,
  }
}

/**
 * The bill's shape: every field present with the right JSON type, rebuilt
 * from known fields only. Numbers aren't range-checked here.
 */
function readBill(value: Json): Bill | null {
  if (!isObject(value) || typeof value.payerId !== 'string') {
    return null
  }
  const people = readList(value.people, readPerson)
  const items = readList(value.items, readItem)
  const tax = readAdjustment(value.tax)
  const tip = readAdjustment(value.tip)
  const discount = readAdjustment(value.discount)
  const taxMode = readMode(value.taxMode)
  const tipMode = readMode(value.tipMode)
  if (!people || !items || !tax || !tip || !discount || !taxMode || !tipMode) {
    return null
  }
  return {
    people,
    items,
    tax,
    taxMode,
    tip,
    tipMode,
    discount,
    payerId: value.payerId,
  }
}

/**
 * The saved bill, or `null` for "start a fresh bill": nothing saved, an
 * unknown version, a bad shape, bad references (unknown or duplicate ids,
 * a person assigned twice, a payer who isn't a person: the reducer relies
 * on stable, unique ids), or storage that can't be read. Out-of-range
 * values load as they are: `validateBill` reports them in the editor.
 */
export function loadDraft(): Bill | null {
  try {
    const stored = window.localStorage.getItem(DRAFT_STORAGE_KEY)
    if (stored === null) {
      return null
    }
    const draft: Json = JSON.parse(stored)
    if (!isObject(draft) || draft.version !== DRAFT_VERSION) {
      return null
    }
    const bill = readBill(draft.bill)
    if (
      !bill ||
      validateBill(bill).some((error) => error.code === 'invalidReference')
    ) {
      return null
    }
    return bill
  } catch {
    return null
  }
}

/**
 * Saves the bill, replacing any earlier draft ("New bill" saves the fresh
 * bill over it). A storage error is ignored: the bill stays in memory.
 */
export function saveDraft(bill: Bill): void {
  try {
    window.localStorage.setItem(
      DRAFT_STORAGE_KEY,
      JSON.stringify({ version: DRAFT_VERSION, bill }),
    )
  } catch {
    // Storage is full, disabled or blocked.
  }
}
