/**
 * The ledger's repository (M4 plan, H1): every user action is one
 * `readwrite` transaction. The referential-integrity contract lives here,
 * inside each write's own transaction (M-I-3): IndexedDB has no foreign
 * keys, and `BroadcastChannel` refreshes are not concurrency control.
 */
import {
  HOUSEHOLD_LIMITS,
  RECORD_VERSION,
  peakActiveWith,
  referencedMemberIds,
  type Expense,
  type Household,
  type Member,
} from '../features/household/model.ts'
import {
  INDEX,
  STORE,
  getAll,
  result,
  transaction,
  type StoreName,
} from './db.ts'
import { readExpense, readHousehold, readMember } from './records.ts'

/** Records that read, and how many didn't (kept, never deleted, H1). */
export interface Listed<T> {
  items: T[]
  unreadable: number
}

/** The household doesn't exist (or can't be read). */
export class HouseholdNotFoundError extends Error {}

/** The member doesn't exist in this household (or can't be read). */
export class MemberNotFoundError extends Error {}

/**
 * An expense names a member that isn't in its household any more,
 * typically deleted in another tab (M-I-3). Nothing was written.
 */
export class MissingReferenceError extends Error {
  readonly memberIds: readonly string[]
  constructor(memberIds: readonly string[]) {
    super(memberIds.join(', '))
    this.memberIds = memberIds
  }
}

/**
 * A member delete refused (H7, M-I-4): an expense names the member, or an
 * expense that can't be read might. Nothing was written.
 */
export class MemberInUseError extends Error {
  readonly reason: 'referenced' | 'unreadable'
  constructor(reason: 'referenced' | 'unreadable') {
    super(reason)
    this.reason = reason
  }
}

/** An edit's expense is gone, typically deleted in another tab. */
export class ExpenseNotFoundError extends Error {}

/** Too many members: 20 active on any one day, 50 in all (H4). */
export class MemberLimitError extends Error {}

function readAll<T>(
  raws: unknown[],
  read: (raw: unknown) => T | null,
): Listed<T> {
  const items: T[] = []
  let unreadable = 0
  for (const raw of raws) {
    const item = read(raw)
    if (item === null) unreadable++
    else items.push(item)
  }
  return { items, unreadable }
}

/** Visits every raw value of a store with a cursor (never the readers). */
function eachRaw(
  store: IDBObjectStore,
  visit: (raw: unknown) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = store.openCursor()
    request.onsuccess = () => {
      const cursor = request.result
      if (cursor === null) {
        resolve()
        return
      }
      try {
        visit(cursor.value)
        cursor.continue()
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    }
    // A cursor that can't read fails closed: the caller writes nothing.
    request.onerror = () => reject(request.error ?? new Error('cursor failed'))
  })
}

async function requireHousehold(
  tx: IDBTransaction,
  householdId: string,
): Promise<Household> {
  const household = readHousehold(
    await result(tx.objectStore(STORE.households).get(householdId)),
  )
  if (household === null) throw new HouseholdNotFoundError(householdId)
  return household
}

async function householdMembers(
  tx: IDBTransaction,
  householdId: string,
): Promise<Listed<Member>> {
  const raws = await getAll(
    tx.objectStore(STORE.members).index(INDEX.byHousehold),
    householdId,
  )
  return readAll(raws, readMember)
}

// Households

export async function listHouseholds(
  db: IDBDatabase,
): Promise<Listed<Household>> {
  return transaction(db, [STORE.households], 'readonly', async (tx) =>
    readAll(await getAll(tx.objectStore(STORE.households)), readHousehold),
  )
}

export async function getHousehold(
  db: IDBDatabase,
  id: string,
): Promise<Household | null> {
  return transaction(db, [STORE.households], 'readonly', async (tx) =>
    readHousehold(await result(tx.objectStore(STORE.households).get(id))),
  )
}

/** A new household with its first members, in one transaction. */
export async function createHousehold(
  db: IDBDatabase,
  household: Household,
  members: readonly Member[],
): Promise<void> {
  if (members.length > HOUSEHOLD_LIMITS.maxActiveMembers) {
    throw new MemberLimitError(String(members.length))
  }
  await transaction(
    db,
    [STORE.households, STORE.members],
    'readwrite',
    async (tx) => {
      await result(tx.objectStore(STORE.households).add(household))
      for (const member of members) {
        await result(tx.objectStore(STORE.members).add(member))
      }
    },
  )
}

async function updateHousehold(
  db: IDBDatabase,
  id: string,
  change: (household: Household) => Household,
): Promise<Household> {
  return transaction(db, [STORE.households], 'readwrite', async (tx) => {
    const next = change(await requireHousehold(tx, id))
    await result(tx.objectStore(STORE.households).put(next))
    return next
  })
}

export function renameHousehold(
  db: IDBDatabase,
  id: string,
  name: string,
  now: string,
): Promise<Household> {
  return updateHousehold(db, id, (household) => ({
    ...household,
    name,
    updatedAt: now,
  }))
}

/** Archives (or, with `null`, restores) a household. */
export function setHouseholdArchived(
  db: IDBDatabase,
  id: string,
  archivedAt: string | null,
  now: string,
): Promise<Household> {
  return updateHousehold(db, id, (household) => {
    const next: Household = { ...household, updatedAt: now }
    if (archivedAt === null) delete next.archivedAt
    else next.archivedAt = archivedAt
    return next
  })
}

// Members

export async function listMembers(
  db: IDBDatabase,
  householdId: string,
): Promise<Listed<Member>> {
  return transaction(db, [STORE.members], 'readonly', (tx) =>
    householdMembers(tx, householdId),
  )
}

/**
 * Adds a member after the household's last position, within the limits
 * (20 active on any day of their membership, 50 in all), in one
 * transaction.
 */
export async function addMember(
  db: IDBDatabase,
  member: Omit<Member, 'position'>,
): Promise<Member> {
  return transaction(
    db,
    [STORE.households, STORE.members],
    'readwrite',
    async (tx) => {
      await requireHousehold(tx, member.householdId)
      const { items, unreadable } = await householdMembers(
        tx,
        member.householdId,
      )
      const position = Math.max(-1, ...items.map((m) => m.position)) + 1
      const added: Member = { ...member, v: RECORD_VERSION, position }
      if (
        peakActiveWith(items, added) > HOUSEHOLD_LIMITS.maxActiveMembers ||
        items.length + unreadable >= HOUSEHOLD_LIMITS.maxMembers
      ) {
        throw new MemberLimitError(member.householdId)
      }
      await result(tx.objectStore(STORE.members).add(added))
      return added
    },
  )
}

async function updateMember(
  db: IDBDatabase,
  householdId: string,
  memberId: string,
  change: (member: Member) => Member,
): Promise<Member> {
  return transaction(db, [STORE.members], 'readwrite', async (tx) => {
    const member = readMember(
      await result(tx.objectStore(STORE.members).get(memberId)),
    )
    if (member === null || member.householdId !== householdId) {
      throw new MemberNotFoundError(memberId)
    }
    const next = change(member)
    await result(tx.objectStore(STORE.members).put(next))
    return next
  })
}

export function renameMember(
  db: IDBDatabase,
  householdId: string,
  memberId: string,
  name: string,
): Promise<Member> {
  return updateMember(db, householdId, memberId, (m) => ({ ...m, name }))
}

/**
 * Marks a member as left on a date, or (with `null`) undoes it (H7). A
 * change that lengthens the membership keeps the limit of 20 active
 * members on every day (H4); an earlier leaving date is always allowed.
 */
export function setMemberLeft(
  db: IDBDatabase,
  householdId: string,
  memberId: string,
  leftOn: string | null,
): Promise<Member> {
  return transaction(db, [STORE.members], 'readwrite', async (tx) => {
    const { items } = await householdMembers(tx, householdId)
    const member = items.find((m) => m.id === memberId)
    if (member === undefined) throw new MemberNotFoundError(memberId)
    const next: Member = { ...member }
    if (leftOn === null) delete next.leftOn
    else next.leftOn = leftOn
    const lengthens =
      member.leftOn !== undefined &&
      (next.leftOn === undefined || next.leftOn > member.leftOn)
    if (
      lengthens &&
      peakActiveWith(items, next) > HOUSEHOLD_LIMITS.maxActiveMembers
    ) {
      throw new MemberLimitError(householdId)
    }
    await result(tx.objectStore(STORE.members).put(next))
    return next
  })
}

/**
 * Deletes a member only when it can prove no expense names them (H1, H7,
 * M-I-4). One transaction over members and expenses: the scan reads every
 * raw expense with a cursor. A record is cleared only if it reads and
 * names no such member, or its raw `householdId` is a string naming a
 * different household; anything else (unreadable, an unknown record
 * version, no readable household) refuses. A cursor that fails rejects the
 * transaction. A refusal writes nothing.
 */
export async function deleteMember(
  db: IDBDatabase,
  householdId: string,
  memberId: string,
): Promise<void> {
  await transaction(
    db,
    [STORE.members, STORE.expenses],
    'readwrite',
    async (tx) => {
      const member = readMember(
        await result(tx.objectStore(STORE.members).get(memberId)),
      )
      if (member === null || member.householdId !== householdId) {
        throw new MemberNotFoundError(memberId)
      }
      let refusal: 'referenced' | 'unreadable' | undefined
      await eachRaw(tx.objectStore(STORE.expenses), (raw) => {
        if (refusal === 'referenced') return
        const rawHousehold =
          typeof raw === 'object' && raw !== null && 'householdId' in raw
            ? raw.householdId
            : undefined
        if (typeof rawHousehold === 'string' && rawHousehold !== householdId) {
          return
        }
        const expense = readExpense(raw)
        if (expense === null) {
          refusal = 'unreadable'
        } else if (referencedMemberIds(expense).includes(memberId)) {
          refusal = 'referenced'
        }
      })
      if (refusal !== undefined) throw new MemberInUseError(refusal)
      await result(tx.objectStore(STORE.members).delete(memberId))
    },
  )
}

// Expenses

/**
 * The household's expenses that read and whose members all exist in the
 * household; the rest are counted as unreadable (and kept).
 */
export async function listExpenses(
  db: IDBDatabase,
  householdId: string,
): Promise<Listed<Expense>> {
  return transaction(
    db,
    [STORE.members, STORE.expenses],
    'readonly',
    async (tx) => {
      const members = await householdMembers(tx, householdId)
      const known = new Set(members.items.map((member) => member.id))
      const raws = await getAll(
        tx.objectStore(STORE.expenses).index(INDEX.byHousehold),
        householdId,
      )
      return readAll(raws, (raw) => {
        const expense = readExpense(raw)
        return expense !== null &&
          referencedMemberIds(expense).every((id) => known.has(id))
          ? expense
          : null
      })
    },
  )
}

export async function getExpense(
  db: IDBDatabase,
  id: string,
): Promise<Expense | null> {
  return transaction(db, [STORE.expenses], 'readonly', async (tx) =>
    readExpense(await result(tx.objectStore(STORE.expenses).get(id))),
  )
}

/**
 * Saves (adds or replaces) an expense, together with any members the save
 * dialog added (R3-O1), in one transaction over households, members and
 * expenses (H1, M-I-3). Inside it, the household must exist and every
 * member the expense names must be a member of it; otherwise the
 * transaction is aborted, nothing is written, and it rejects with
 * {@link MissingReferenceError}. New members keep the limits of H4: 20
 * active on any one day, 50 in all ({@link MemberLimitError}). An edit
 * (`replacing`) only replaces an expense of this household that still
 * exists, so one deleted in another tab is never brought back
 * ({@link ExpenseNotFoundError}).
 */
export async function saveExpense(
  db: IDBDatabase,
  expense: Expense,
  newMembers: readonly Omit<Member, 'position'>[] = [],
  { replacing = false }: { replacing?: boolean } = {},
): Promise<Member[]> {
  const stores: StoreName[] = [STORE.households, STORE.members, STORE.expenses]
  return transaction(db, stores, 'readwrite', async (tx) => {
    await requireHousehold(tx, expense.householdId)
    if (replacing) {
      const stored: unknown = await result(
        tx.objectStore(STORE.expenses).get(expense.id),
      )
      const storedHousehold =
        typeof stored === 'object' && stored !== null && 'householdId' in stored
          ? stored.householdId
          : undefined
      if (storedHousehold !== expense.householdId) {
        throw new ExpenseNotFoundError(expense.id)
      }
    }
    const added: Member[] = []
    if (newMembers.length > 0) {
      const { items, unreadable } = await householdMembers(
        tx,
        expense.householdId,
      )
      if (
        items.length + unreadable + newMembers.length >
        HOUSEHOLD_LIMITS.maxMembers
      ) {
        throw new MemberLimitError(expense.householdId)
      }
      const all = [...items]
      let position = Math.max(-1, ...items.map((m) => m.position))
      for (const member of newMembers) {
        if (member.householdId !== expense.householdId) {
          throw new MissingReferenceError([member.id])
        }
        position++
        const next: Member = { ...member, v: RECORD_VERSION, position }
        if (peakActiveWith(all, next) > HOUSEHOLD_LIMITS.maxActiveMembers) {
          throw new MemberLimitError(expense.householdId)
        }
        all.push(next)
        await result(tx.objectStore(STORE.members).add(next))
        added.push(next)
      }
    }
    const missing: string[] = []
    for (const memberId of referencedMemberIds(expense)) {
      const member = readMember(
        await result(tx.objectStore(STORE.members).get(memberId)),
      )
      if (member === null || member.householdId !== expense.householdId) {
        missing.push(memberId)
      }
    }
    if (missing.length > 0) throw new MissingReferenceError(missing)
    await result(tx.objectStore(STORE.expenses).put(expense))
    return added
  })
}

export async function deleteExpense(
  db: IDBDatabase,
  id: string,
): Promise<void> {
  await transaction(db, [STORE.expenses], 'readwrite', async (tx) => {
    await result(tx.objectStore(STORE.expenses).delete(id))
  })
}

/** The household's readable expenses with this receipt key (H11). */
export async function expensesWithReceiptKey(
  db: IDBDatabase,
  householdId: string,
  receiptKey: string,
): Promise<Expense[]> {
  return transaction(db, [STORE.expenses], 'readonly', async (tx) => {
    const raws = await getAll(
      tx.objectStore(STORE.expenses).index(INDEX.byReceiptKey),
      [householdId, receiptKey],
    )
    return readAll(raws, readExpense).items
  })
}
