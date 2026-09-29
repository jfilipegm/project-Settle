/**
 * The bill being edited, as a pure reducer. Ids are made once, by whoever
 * dispatches (see {@link newId}), and never change, so actions stay pure
 * and tests stay deterministic.
 */
import { cents, type Cents, type Ratio } from '../../lib/money.ts'
import {
  LIMITS,
  type Adjustment,
  type AdjustmentName,
  type Bill,
  type Item,
  type Person,
  type SplitMode,
} from './model.ts'

export type BillAction =
  | { type: 'addItem'; id: string }
  | {
      type: 'updateItem'
      itemId: string
      changes: Partial<{ name: string; quantity: Ratio; unitPrice: Cents }>
    }
  | { type: 'removeItem'; itemId: string }
  /** `ids` names the people to add, if the count grows. */
  | { type: 'setPeopleCount'; count: number; ids: readonly string[] }
  | { type: 'renamePerson'; personId: string; name: string }
  | { type: 'removePerson'; personId: string }
  | { type: 'toggleAssignee'; itemId: string; personId: string }
  | { type: 'setShare'; itemId: string; personId: string; weight: number }
  | { type: 'setAdjustment'; name: AdjustmentName; adjustment: Adjustment }
  | { type: 'setAdjustmentMode'; name: 'tax' | 'tip'; mode: SplitMode }
  | { type: 'setPayer'; personId: string }
  /** A fresh bill: `ids` supplies the new people's and item's ids. */
  | { type: 'newBill'; ids: readonly string[] }
  /** A whole bill from elsewhere: a scanned receipt's (M2, D13). */
  | { type: 'replaceBill'; bill: Bill }

/**
 * A new, unique id for a person or item: a random (v4) UUID.
 * `crypto.randomUUID` exists only in a secure context (HTTPS or
 * localhost); over plain HTTP, such as a build previewed on the local
 * network, the UUID is built from `crypto.getRandomValues`, which exists
 * everywhere.
 */
export function newId(): string {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40 // version 4
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80 // RFC 4122 variant
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

const NO_ADJUSTMENT: Adjustment = { kind: 'amount', value: cents(0) }

/** An item worth nothing yet, assigned equally to everyone. */
function emptyItem(id: string, people: readonly Person[]): Item {
  return {
    id,
    name: '',
    quantity: { numerator: 1, denominator: 1 },
    unitPrice: cents(0),
    assignees: people.map((person) => ({ personId: person.id, weight: 1 })),
  }
}

/** How many ids {@link createBill} (and `newBill`) needs. */
export const NEW_BILL_ID_COUNT = 3

/**
 * A fresh bill: two unnamed people ("Person 1", "Person 2") and one empty
 * item assigned to both. It's valid from the start, so the result shows
 * zeros instead of an error before anything is typed. Needs
 * {@link NEW_BILL_ID_COUNT} ids.
 */
export function createBill(ids: readonly string[]): Bill {
  const [first = 'p1', second = 'p2', itemId = 'i1'] = ids
  const people: Person[] = [
    { id: first, name: '' },
    { id: second, name: '' },
  ]
  return {
    people,
    items: [emptyItem(itemId, people)],
    tax: NO_ADJUSTMENT,
    taxMode: 'proportional',
    tip: NO_ADJUSTMENT,
    tipMode: 'proportional',
    discount: NO_ADJUSTMENT,
    payerId: first,
  }
}

function mapItem(
  bill: Bill,
  itemId: string,
  change: (item: Item) => Item,
): Bill {
  return {
    ...bill,
    items: bill.items.map((item) => (item.id === itemId ? change(item) : item)),
  }
}

/** Drops people, their assignments, and moves the payer if they left. */
function withoutPeople(bill: Bill, removed: ReadonlySet<string>): Bill {
  const people = bill.people.filter((person) => !removed.has(person.id))
  return {
    ...bill,
    people,
    items: bill.items.map((item) => ({
      ...item,
      assignees: item.assignees.filter((a) => !removed.has(a.personId)),
    })),
    payerId: removed.has(bill.payerId) ? (people[0]?.id ?? '') : bill.payerId,
  }
}

export function billReducer(bill: Bill, action: BillAction): Bill {
  switch (action.type) {
    case 'addItem':
      if (bill.items.length >= LIMITS.maxItems) {
        return bill
      }
      return {
        ...bill,
        items: [...bill.items, emptyItem(action.id, bill.people)],
      }

    case 'updateItem':
      return mapItem(bill, action.itemId, (item) => ({
        ...item,
        ...action.changes,
      }))

    case 'removeItem':
      return {
        ...bill,
        items: bill.items.filter((item) => item.id !== action.itemId),
      }

    case 'setPeopleCount': {
      const count = Math.min(
        LIMITS.maxPeople,
        Math.max(LIMITS.minPeople, Math.trunc(action.count)),
      )
      if (count < bill.people.length) {
        return withoutPeople(
          bill,
          new Set(bill.people.slice(count).map((person) => person.id)),
        )
      }
      const added = action.ids
        .slice(0, count - bill.people.length)
        .map((id) => ({ id, name: '' }))
      return { ...bill, people: [...bill.people, ...added] }
    }

    case 'renamePerson':
      return {
        ...bill,
        people: bill.people.map((person) =>
          person.id === action.personId
            ? { ...person, name: action.name }
            : person,
        ),
      }

    case 'removePerson':
      if (bill.people.length <= LIMITS.minPeople) {
        return bill
      }
      return withoutPeople(bill, new Set([action.personId]))

    case 'toggleAssignee':
      return mapItem(bill, action.itemId, (item) => {
        const assigned = item.assignees.some(
          (a) => a.personId === action.personId,
        )
        if (assigned) {
          return {
            ...item,
            assignees: item.assignees.filter(
              (a) => a.personId !== action.personId,
            ),
          }
        }
        // Keep assignees in people order, so chips and breakdowns match.
        const order = bill.people.map((person) => person.id)
        const assignees = [
          ...item.assignees,
          { personId: action.personId, weight: 1 },
        ]
        assignees.sort(
          (a, b) => order.indexOf(a.personId) - order.indexOf(b.personId),
        )
        return { ...item, assignees }
      })

    case 'setShare':
      return mapItem(bill, action.itemId, (item) => ({
        ...item,
        assignees: item.assignees.map((a) =>
          a.personId === action.personId ? { ...a, weight: action.weight } : a,
        ),
      }))

    case 'setAdjustment':
      return { ...bill, [action.name]: action.adjustment }

    case 'setAdjustmentMode':
      return action.name === 'tax'
        ? { ...bill, taxMode: action.mode }
        : { ...bill, tipMode: action.mode }

    case 'setPayer':
      return bill.people.some((person) => person.id === action.personId)
        ? { ...bill, payerId: action.personId }
        : bill

    case 'newBill':
      return createBill(action.ids)

    case 'replaceBill':
      return action.bill
  }
}
