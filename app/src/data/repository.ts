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
  type Settlement,
} from '../features/household/model.ts'
import {
  INDEX,
  META,
  STORE,
  getAll,
  result,
  transaction,
  type StoreName,
} from './db.ts'
import {
  readExpense,
  readHousehold,
  readMember,
  readSettlement,
  readVersion,
} from './records.ts'
import { bump, type RecordKind, type VersionEntry } from './versions.ts'

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
 * A member delete refused (H7, M-I-4): an expense or a payment names the
 * member, or one that can't be read might (M5, B3). Nothing was written.
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

/** An edit's payment is gone, typically deleted in another tab (M5, B3). */
export class SettlementNotFoundError extends Error {}

/** Too many members: 20 active on any one day, 50 in all (H4). */
export class MemberLimitError extends Error {}

/**
 * A record its own reader would refuse (M6 plan, E12): the forms check
 * first, so only a caller that skips them meets this. Nothing was written.
 */
export class InvalidRecordError extends Error {}

/**
 * A record's version entry is damaged, or names another kind or
 * household (M6, E4). The write is refused rather than starting the
 * record's clock again. Nothing was written.
 */
export class VersionEntryError extends Error {}

/** This device has no readable id (M6, E4): the database is damaged. */
export class DeviceIdError extends Error {}

/** The stores every write opens besides its own (M6, E4, E5). */
const TRACKING: readonly StoreName[] = [STORE.versions, STORE.meta]

/** One write transaction's change: this device's id and the time. */
interface Change {
  deviceId: string
  now: string
}

function metaValue(raw: unknown): unknown {
  return typeof raw === 'object' && raw !== null && 'value' in raw
    ? raw.value
    : undefined
}

/**
 * Starts a tracked change (E4, E5): reads this device's id and marks the
 * first change not yet backed up, if none is marked.
 */
async function beginChange(tx: IDBTransaction): Promise<Change> {
  const meta = tx.objectStore(STORE.meta)
  const deviceId = metaValue(await result(meta.get(META.deviceId)))
  if (typeof deviceId !== 'string' || deviceId.length === 0) {
    throw new DeviceIdError('no device id')
  }
  const now = new Date().toISOString()
  const first: unknown = await result(meta.get(META.firstUnbackedChangeAt))
  if (first === undefined) {
    await result(meta.put({ key: META.firstUnbackedChangeAt, value: now }))
  }
  return { deviceId, now }
}

/** A deleted id's save is refused like an edit of a deleted record (M4). */
function deletedError(kind: RecordKind, id: string): Error {
  switch (kind) {
    case 'household':
      return new HouseholdNotFoundError(id)
    case 'member':
      return new MemberNotFoundError(id)
    case 'expense':
      return new ExpenseNotFoundError(id)
    case 'settlement':
      return new SettlementNotFoundError(id)
  }
}

/**
 * Adds 1 for this device to the record's clock, in the write's own
 * transaction (E4). With `deleting`, the entry stays as the deletion log's
 * entry. A deleted id is never written again by a save.
 */
async function bumpVersion(
  tx: IDBTransaction,
  change: Change,
  kind: RecordKind,
  id: string,
  householdId: string,
  { deleting = false }: { deleting?: boolean } = {},
): Promise<void> {
  const store = tx.objectStore(STORE.versions)
  const raw: unknown = await result(store.get(id))
  let clock = {}
  if (raw !== undefined) {
    const entry = readVersion(raw)
    if (
      entry === null ||
      entry.kind !== kind ||
      entry.householdId !== householdId
    ) {
      throw new VersionEntryError(id)
    }
    if (entry.deletedAt !== undefined) throw deletedError(kind, id)
    clock = entry.clock
  }
  const next: VersionEntry = {
    id,
    kind,
    householdId,
    clock: bump(clock, change.deviceId),
  }
  if (deleting) next.deletedAt = change.now
  await result(store.put(next))
}

function requireReadable<T>(value: T, read: (raw: unknown) => T | null): T {
  if (read(value) === null) {
    const id =
      typeof value === 'object' && value !== null && 'id' in value
        ? String(value.id)
        : ''
    throw new InvalidRecordError(id)
  }
  return value
}

/**
 * Deletes a record and keeps its version entry with `deletedAt` (E4). A
 * record that isn't there is a no-op. The household comes from the raw
 * record, or else from its version entry.
 */
async function deleteTracked(
  tx: IDBTransaction,
  store: StoreName,
  kind: RecordKind,
  id: string,
): Promise<void> {
  const raw: unknown = await result(tx.objectStore(store).get(id))
  if (raw === undefined) return
  const change = await beginChange(tx)
  let householdId =
    typeof raw === 'object' && raw !== null && 'householdId' in raw
      ? raw.householdId
      : undefined
  if (typeof householdId !== 'string') {
    householdId = readVersion(
      await result(tx.objectStore(STORE.versions).get(id)),
    )?.householdId
  }
  if (typeof householdId === 'string') {
    await bumpVersion(tx, change, kind, id, householdId, { deleting: true })
  }
  await result(tx.objectStore(store).delete(id))
}

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
  requireReadable(household, readHousehold)
  for (const member of members) {
    requireReadable(member, readMember)
    if (member.householdId !== household.id) {
      throw new InvalidRecordError(member.id)
    }
  }
  await transaction(
    db,
    [STORE.households, STORE.members, ...TRACKING],
    'readwrite',
    async (tx) => {
      const change = await beginChange(tx)
      await bumpVersion(tx, change, 'household', household.id, household.id)
      await result(tx.objectStore(STORE.households).add(household))
      for (const member of members) {
        await bumpVersion(tx, change, 'member', member.id, household.id)
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
  return transaction(
    db,
    [STORE.households, ...TRACKING],
    'readwrite',
    async (tx) => {
      const next = requireReadable(
        change(await requireHousehold(tx, id)),
        readHousehold,
      )
      await bumpVersion(tx, await beginChange(tx), 'household', id, id)
      await result(tx.objectStore(STORE.households).put(next))
      return next
    },
  )
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
    [STORE.households, STORE.members, ...TRACKING],
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
      requireReadable(added, readMember)
      const change = await beginChange(tx)
      await bumpVersion(tx, change, 'member', added.id, added.householdId)
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
  return transaction(
    db,
    [STORE.members, ...TRACKING],
    'readwrite',
    async (tx) => {
      const member = readMember(
        await result(tx.objectStore(STORE.members).get(memberId)),
      )
      if (member === null || member.householdId !== householdId) {
        throw new MemberNotFoundError(memberId)
      }
      const next = requireReadable(change(member), readMember)
      const tracked = await beginChange(tx)
      await bumpVersion(tx, tracked, 'member', memberId, householdId)
      await result(tx.objectStore(STORE.members).put(next))
      return next
    },
  )
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
  return transaction(
    db,
    [STORE.members, ...TRACKING],
    'readwrite',
    async (tx) => {
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
      requireReadable(next, readMember)
      const change = await beginChange(tx)
      await bumpVersion(tx, change, 'member', memberId, householdId)
      await result(tx.objectStore(STORE.members).put(next))
      return next
    },
  )
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
    [STORE.members, STORE.expenses, STORE.settlements, ...TRACKING],
    'readwrite',
    async (tx) => {
      const member = readMember(
        await result(tx.objectStore(STORE.members).get(memberId)),
      )
      if (member === null || member.householdId !== householdId) {
        throw new MemberNotFoundError(memberId)
      }
      let refusal: 'referenced' | 'unreadable' | undefined
      const check =
        <T>(
          read: (raw: unknown) => T | null,
          names: (record: T) => readonly string[],
        ) =>
        (raw: unknown) => {
          if (refusal === 'referenced') return
          const rawHousehold =
            typeof raw === 'object' && raw !== null && 'householdId' in raw
              ? raw.householdId
              : undefined
          if (
            typeof rawHousehold === 'string' &&
            rawHousehold !== householdId
          ) {
            return
          }
          const record = read(raw)
          if (record === null) {
            refusal = 'unreadable'
          } else if (names(record).includes(memberId)) {
            refusal = 'referenced'
          }
        }
      await eachRaw(
        tx.objectStore(STORE.expenses),
        check(readExpense, referencedMemberIds),
      )
      await eachRaw(
        tx.objectStore(STORE.settlements),
        check(readSettlement, (settlement) => [
          settlement.fromId,
          settlement.toId,
        ]),
      )
      if (refusal !== undefined) throw new MemberInUseError(refusal)
      await deleteTracked(tx, STORE.members, 'member', memberId)
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
  requireReadable(expense, readExpense)
  const stores: StoreName[] = [
    STORE.households,
    STORE.members,
    STORE.expenses,
    ...TRACKING,
  ]
  return transaction(db, stores, 'readwrite', async (tx) => {
    await requireHousehold(tx, expense.householdId)
    const change = await beginChange(tx)
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
        requireReadable(next, readMember)
        all.push(next)
        await bumpVersion(tx, change, 'member', next.id, next.householdId)
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
    await bumpVersion(tx, change, 'expense', expense.id, expense.householdId)
    await result(tx.objectStore(STORE.expenses).put(expense))
    return added
  })
}

export async function deleteExpense(
  db: IDBDatabase,
  id: string,
): Promise<void> {
  await transaction(db, [STORE.expenses, ...TRACKING], 'readwrite', (tx) =>
    deleteTracked(tx, STORE.expenses, 'expense', id),
  )
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

// Payments (M5, B3)

/**
 * The household's readable payments whose two members are readable
 * members of it; the rest are counted as unreadable and kept.
 */
export async function listSettlements(
  db: IDBDatabase,
  householdId: string,
): Promise<Listed<Settlement>> {
  return transaction(
    db,
    [STORE.members, STORE.settlements],
    'readonly',
    async (tx) => {
      const members = await householdMembers(tx, householdId)
      const known = new Set(members.items.map((member) => member.id))
      const raws = await getAll(
        tx.objectStore(STORE.settlements).index(INDEX.byHousehold),
        householdId,
      )
      return readAll(raws, (raw) => {
        const settlement = readSettlement(raw)
        return settlement !== null &&
          known.has(settlement.fromId) &&
          known.has(settlement.toId)
          ? settlement
          : null
      })
    },
  )
}

export async function getSettlement(
  db: IDBDatabase,
  id: string,
): Promise<Settlement | null> {
  return transaction(db, [STORE.settlements], 'readonly', async (tx) =>
    readSettlement(await result(tx.objectStore(STORE.settlements).get(id))),
  )
}

/**
 * Saves (adds or replaces) a payment in one transaction over households,
 * members and payments. Inside it the household must exist and both
 * members must belong to it ({@link MissingReferenceError} otherwise);
 * an edit (`replacing`) only replaces a payment of this household that
 * still exists ({@link SettlementNotFoundError}), so one deleted in
 * another tab is never brought back.
 */
export async function saveSettlement(
  db: IDBDatabase,
  settlement: Settlement,
  { replacing = false }: { replacing?: boolean } = {},
): Promise<void> {
  requireReadable(settlement, readSettlement)
  const stores: StoreName[] = [
    STORE.households,
    STORE.members,
    STORE.settlements,
    ...TRACKING,
  ]
  await transaction(db, stores, 'readwrite', async (tx) => {
    await requireHousehold(tx, settlement.householdId)
    if (replacing) {
      const stored: unknown = await result(
        tx.objectStore(STORE.settlements).get(settlement.id),
      )
      const storedHousehold =
        typeof stored === 'object' && stored !== null && 'householdId' in stored
          ? stored.householdId
          : undefined
      if (storedHousehold !== settlement.householdId) {
        throw new SettlementNotFoundError(settlement.id)
      }
    }
    const missing: string[] = []
    for (const memberId of new Set([settlement.fromId, settlement.toId])) {
      const member = readMember(
        await result(tx.objectStore(STORE.members).get(memberId)),
      )
      if (member === null || member.householdId !== settlement.householdId) {
        missing.push(memberId)
      }
    }
    if (missing.length > 0) throw new MissingReferenceError(missing)
    const change = await beginChange(tx)
    await bumpVersion(
      tx,
      change,
      'settlement',
      settlement.id,
      settlement.householdId,
    )
    await result(tx.objectStore(STORE.settlements).put(settlement))
  })
}

export async function deleteSettlement(
  db: IDBDatabase,
  id: string,
): Promise<void> {
  await transaction(db, [STORE.settlements, ...TRACKING], 'readwrite', (tx) =>
    deleteTracked(tx, STORE.settlements, 'settlement', id),
  )
}

// Versions and change tracking (M6, E4, E5)

/** This device's id and the ids it used before (E4). */
export interface DeviceIds {
  deviceId: string
  formerDeviceIds: string[]
}

export async function getDeviceIds(db: IDBDatabase): Promise<DeviceIds> {
  return transaction(db, [STORE.meta], 'readonly', async (tx) => {
    const meta = tx.objectStore(STORE.meta)
    const deviceId = metaValue(await result(meta.get(META.deviceId)))
    if (typeof deviceId !== 'string' || deviceId.length === 0) {
      throw new DeviceIdError('no device id')
    }
    const former = metaValue(await result(meta.get(META.formerDeviceIds)))
    return {
      deviceId,
      formerDeviceIds: Array.isArray(former)
        ? former.filter((id): id is string => typeof id === 'string')
        : [],
    }
  })
}

/** A record's version entry, or `null` when it has none or it can't be read. */
export async function getVersion(
  db: IDBDatabase,
  id: string,
): Promise<VersionEntry | null> {
  return transaction(db, [STORE.versions], 'readonly', async (tx) =>
    readVersion(await result(tx.objectStore(STORE.versions).get(id))),
  )
}

/** When the last backup was made, and the first change since (E5). */
export interface BackupStatus {
  lastBackupAt?: string
  firstUnbackedChangeAt?: string
}

export async function getBackupStatus(db: IDBDatabase): Promise<BackupStatus> {
  return transaction(db, [STORE.meta], 'readonly', async (tx) => {
    const meta = tx.objectStore(STORE.meta)
    const status: BackupStatus = {}
    const last = metaValue(await result(meta.get(META.lastBackupAt)))
    if (typeof last === 'string') status.lastBackupAt = last
    const first = metaValue(await result(meta.get(META.firstUnbackedChangeAt)))
    if (typeof first === 'string') status.firstUnbackedChangeAt = first
    return status
  })
}

/**
 * A backup was handed over (E5, E10): `lastBackupAt` becomes `at`. The
 * first unbacked change is cleared only if it came before the snapshot the
 * backup was built from (`snapshotAt`), so a change made while the file
 * was being shared stays waiting.
 */
export async function recordBackup(
  db: IDBDatabase,
  at: string,
  snapshotAt: string,
): Promise<void> {
  await transaction(db, [STORE.meta], 'readwrite', async (tx) => {
    const meta = tx.objectStore(STORE.meta)
    await result(meta.put({ key: META.lastBackupAt, value: at }))
    const first = metaValue(await result(meta.get(META.firstUnbackedChangeAt)))
    if (typeof first !== 'string' || first <= snapshotAt) {
      await result(meta.delete(META.firstUnbackedChangeAt))
    }
  })
}
