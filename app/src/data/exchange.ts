/**
 * The database side of the Settle file (M6 plan, E1, E13): snapshots of a
 * household, or of every household, for a file. One read-only transaction
 * reads the records and their versions. The pure format, reader and merge
 * live in `features/exchange/`.
 */
import {
  readExpense,
  readHousehold,
  readMember,
  readSettlement,
  readVersion,
} from './records.ts'
import {
  INDEX,
  META,
  STORE,
  getAll,
  result,
  transaction,
  type StoreName,
} from './db.ts'
import type { Clock, RecordKind, VersionEntry } from './versions.ts'
import { newId } from '../features/split/billReducer.ts'
import {
  referencedMemberIds,
  type Expense,
  type Household,
  type Member,
  type Settlement,
} from '../features/household/model.ts'
import {
  FILE_FORMAT,
  FILE_VERSION,
  canonical,
  formatFile,
  type FileKind,
  type FileVersion,
  type HouseholdEntry,
  type SettleFile,
} from '../features/exchange/format.ts'
import {
  isFileClock,
  isFileId,
  isTimestamp,
  readFile,
  stricterProblems,
  type FileProblem,
} from '../features/exchange/readFile.ts'
import {
  planImport,
  resolveImport,
  type AnyRecord,
  type Choice,
  type ImportResolution,
  type LocalHousehold,
  type LocalId,
  type LocalState,
  type Side,
} from '../features/exchange/merge.ts'

/**
 * Records that stay out of a file, by reason (E1). They stay on this
 * device, and leaving a record out is not a delete.
 */
export interface LeftOut {
  /** Couldn't be read here (the record or its version entry). */
  unreadable: number
  /** Readable, but a value the file's stricter rules refuse. */
  invalid: number
  /** Names a record that is left out. */
  namesLeftOut: number
}

export interface Snapshot {
  file: SettleFile
  /** The canonical text, already read back by `readFile`. */
  text: string
  leftOut: LeftOut
  /** When the records were read: a backup clears changes up to here. */
  snapshotAt: string
}

/** A household file would hold nothing readable (E1). */
export class NothingToShareError extends Error {}

/**
 * A file Settle built doesn't pass its own reader. The snapshot's rules
 * should make this impossible; it is refused rather than shared.
 */
export class ExportCheckError extends Error {
  readonly problems: readonly FileProblem[]
  constructor(problems: readonly FileProblem[]) {
    super(problems.map((problem) => problem.code).join(', '))
    this.problems = problems
  }
}

export function leftOutCount(leftOut: LeftOut): number {
  return leftOut.unreadable + leftOut.invalid + leftOut.namesLeftOut
}

const STORES = [
  STORE.households,
  STORE.members,
  STORE.expenses,
  STORE.settlements,
  STORE.versions,
]

type Kind = 'member' | 'expense' | 'settlement'

/** One household's entry for a file, or `null` when it is left out whole. */
async function householdEntry(
  tx: IDBTransaction,
  rawHousehold: unknown,
  leftOut: LeftOut,
): Promise<HouseholdEntry | null> {
  const id =
    typeof rawHousehold === 'object' &&
    rawHousehold !== null &&
    'id' in rawHousehold
      ? rawHousehold.id
      : undefined
  const raws = async (store: string) =>
    typeof id === 'string'
      ? getAll(tx.objectStore(store).index(INDEX.byHousehold), id)
      : []
  const rawMembers = await raws(STORE.members)
  const rawExpenses = await raws(STORE.expenses)
  const rawSettlements = await raws(STORE.settlements)
  const rawVersions = await raws(STORE.versions)

  const versionOf = async (recordId: string) => {
    const raw: unknown = await result(
      tx.objectStore(STORE.versions).get(recordId),
    )
    return raw === undefined ? undefined : readVersion(raw)
  }
  /** The record's file version, or the reason it stays out. */
  const fileVersion = async (
    kind: 'household' | Kind,
    record: Household | Member | Expense | Settlement,
    householdId: string,
  ): Promise<FileVersion | 'unreadable' | 'invalid'> => {
    const entry = await versionOf(record.id)
    if (entry === null) return 'unreadable'
    if (
      entry !== undefined &&
      (entry.kind !== kind ||
        entry.householdId !== householdId ||
        entry.deletedAt !== undefined)
    ) {
      return 'unreadable'
    }
    if (stricterProblems(kind, record).length > 0) return 'invalid'
    const clock = entry?.clock ?? {}
    if (!isFileClock(clock)) return 'invalid'
    return { id: record.id, kind, clock }
  }

  const leaveOutAll = (reason: keyof LeftOut) => {
    leftOut[reason]++
    leftOut.namesLeftOut +=
      rawMembers.length + rawExpenses.length + rawSettlements.length
    return null
  }
  const household = readHousehold(rawHousehold)
  if (household === null) return leaveOutAll('unreadable')
  const householdVersion = await fileVersion(
    'household',
    household,
    household.id,
  )
  if (typeof householdVersion === 'string') return leaveOutAll(householdVersion)
  const versions: FileVersion[] = [householdVersion]

  const keep = async <T extends Member | Expense | Settlement>(
    kind: Kind,
    raw: unknown[],
    read: (value: unknown) => T | null,
    names: (record: T) => readonly string[],
    known: ReadonlySet<string>,
  ): Promise<T[]> => {
    const kept: T[] = []
    for (const value of raw) {
      const record = read(value)
      if (record === null) {
        leftOut.unreadable++
        continue
      }
      if (!names(record).every((name) => known.has(name))) {
        leftOut.namesLeftOut++
        continue
      }
      const version = await fileVersion(kind, record, household.id)
      if (typeof version === 'string') {
        leftOut[version]++
        continue
      }
      versions.push(version)
      kept.push(record)
    }
    return kept
  }
  const members = await keep(
    'member',
    rawMembers,
    readMember,
    () => [],
    new Set(),
  )
  const memberIds = new Set(members.map((member) => member.id))
  const expenses = await keep(
    'expense',
    rawExpenses,
    readExpense,
    referencedMemberIds,
    memberIds,
  )
  const settlements = await keep(
    'settlement',
    rawSettlements,
    readSettlement,
    (settlement) => [settlement.fromId, settlement.toId],
    memberIds,
  )

  // Deletions (E4): every readable deletion of a record not here.
  const present = new Set(versions.map((version) => version.id))
  for (const raw of rawVersions) {
    const entry: VersionEntry | null = readVersion(raw)
    if (
      entry === null ||
      entry.deletedAt === undefined ||
      entry.householdId !== household.id ||
      present.has(entry.id) ||
      !isFileId(entry.id) ||
      !isTimestamp(entry.deletedAt) ||
      Object.keys(entry.clock).length === 0 ||
      !isFileClock(entry.clock)
    ) {
      continue
    }
    versions.push({
      id: entry.id,
      kind: entry.kind,
      clock: entry.clock,
      deletedAt: entry.deletedAt,
    })
  }
  return { household, members, expenses, settlements, versions }
}

async function snapshot(
  db: IDBDatabase,
  kind: FileKind,
  householdId: string | undefined,
  now: string,
): Promise<Snapshot> {
  const leftOut: LeftOut = { unreadable: 0, invalid: 0, namesLeftOut: 0 }
  const households = await transaction(db, STORES, 'readonly', async (tx) => {
    const raws =
      householdId === undefined
        ? await getAll(tx.objectStore(STORE.households))
        : [await result(tx.objectStore(STORE.households).get(householdId))]
    const entries: HouseholdEntry[] = []
    for (const raw of raws) {
      if (raw === undefined) continue
      const entry = await householdEntry(tx, raw, leftOut)
      if (entry !== null) entries.push(entry)
    }
    return entries
  })
  if (kind === 'household' && households.length !== 1) {
    throw new NothingToShareError(householdId)
  }
  const file: SettleFile = {
    format: FILE_FORMAT,
    formatVersion: FILE_VERSION,
    kind,
    exportedAt: now,
    households,
  }
  const text = formatFile(file)
  const check = readFile(text)
  if (!check.ok) throw new ExportCheckError(check.problems)
  return { file, text, leftOut, snapshotAt: now }
}

/** A household's file (E1, E7). */
export function snapshotHousehold(
  db: IDBDatabase,
  householdId: string,
  now: string,
): Promise<Snapshot> {
  return snapshot(db, 'household', householdId, now)
}

/** The backup: every household, archived included (E1, E10). */
export function snapshotBackup(
  db: IDBDatabase,
  now: string,
): Promise<Snapshot> {
  return snapshot(db, 'backup', undefined, now)
}

// Importing a file (E6, E8)

const ALL_STORES: StoreName[] = [
  STORE.households,
  STORE.members,
  STORE.expenses,
  STORE.settlements,
  STORE.versions,
  STORE.meta,
]

const STORE_OF: Record<RecordKind, StoreName> = {
  household: STORE.households,
  member: STORE.members,
  expense: STORE.expenses,
  settlement: STORE.settlements,
}

const READER_OF: Record<RecordKind, (raw: unknown) => AnyRecord | null> = {
  household: readHousehold,
  member: readMember,
  expense: readExpense,
  settlement: readSettlement,
}

function metaValue(raw: unknown): unknown {
  return typeof raw === 'object' && raw !== null && 'value' in raw
    ? raw.value
    : undefined
}

function householdOf(kind: RecordKind, record: AnyRecord): string {
  return kind === 'household'
    ? record.id
    : (record as Member | Expense | Settlement).householdId
}

/** Every id of a file entry, with the kind the file gives it. */
function fileIds(entry: HouseholdEntry): Map<string, RecordKind> {
  const ids = new Map<string, RecordKind>([[entry.household.id, 'household']])
  for (const member of entry.members) ids.set(member.id, 'member')
  for (const expense of entry.expenses) ids.set(expense.id, 'expense')
  for (const settlement of entry.settlements) {
    ids.set(settlement.id, 'settlement')
  }
  for (const version of entry.versions) ids.set(version.id, version.kind)
  return ids
}

/**
 * What this device holds under one id, read by key in the record's own
 * store and in `versions` (E6, round 1 I2).
 */
async function localId(
  tx: IDBTransaction,
  kind: RecordKind,
  id: string,
  householdId: string,
  memberIds: ReadonlySet<string>,
): Promise<LocalId> {
  const rawVersion: unknown = await result(
    tx.objectStore(STORE.versions).get(id),
  )
  const raw: unknown = await result(tx.objectStore(STORE_OF[kind]).get(id))
  let version: VersionEntry | undefined
  if (rawVersion !== undefined) {
    const read = readVersion(rawVersion)
    if (read === null) return { status: 'unreadable' }
    if (read.kind !== kind || read.householdId !== householdId) {
      return { status: 'foreign' }
    }
    version = read
  }
  if (raw !== undefined) {
    const record = READER_OF[kind](raw)
    if (record === null) return { status: 'unreadable' }
    if (householdOf(kind, record) !== householdId) return { status: 'foreign' }
    if (
      (kind === 'expense' &&
        !referencedMemberIds(record as Expense).every((m) =>
          memberIds.has(m),
        )) ||
      (kind === 'settlement' &&
        (!memberIds.has((record as Settlement).fromId) ||
          !memberIds.has((record as Settlement).toId)))
    ) {
      // As the lists read it: an expense naming a missing member is
      // unreadable here (H1), so it is left alone.
      return { status: 'unreadable' }
    }
    if (version?.deletedAt !== undefined) return { status: 'unreadable' }
    return {
      status: 'ok',
      side: { type: 'record', record, clock: version?.clock ?? {} },
    }
  }
  if (version === undefined) return { status: 'ok', side: { type: 'none' } }
  if (version.deletedAt === undefined) return { status: 'unreadable' }
  return {
    status: 'ok',
    side: {
      type: 'deletion',
      clock: version.clock,
      deletedAt: version.deletedAt,
    },
  }
}

async function localHousehold(
  tx: IDBTransaction,
  entry: HouseholdEntry,
): Promise<LocalHousehold> {
  const householdId = entry.household.id
  const byHousehold = (store: StoreName) =>
    getAll(tx.objectStore(store).index(INDEX.byHousehold), householdId)
  const members: Member[] = []
  const unreadable = { members: 0, expenses: 0, settlements: 0 }
  for (const raw of await byHousehold(STORE.members)) {
    const member = readMember(raw)
    if (member === null) unreadable.members++
    else members.push(member)
  }
  const memberIds = new Set(members.map((member) => member.id))
  const expenses: Expense[] = []
  for (const raw of await byHousehold(STORE.expenses)) {
    const expense = readExpense(raw)
    if (
      expense === null ||
      !referencedMemberIds(expense).every((id) => memberIds.has(id))
    ) {
      unreadable.expenses++
    } else {
      expenses.push(expense)
    }
  }
  const settlements: Settlement[] = []
  for (const raw of await byHousehold(STORE.settlements)) {
    const settlement = readSettlement(raw)
    if (
      settlement === null ||
      !memberIds.has(settlement.fromId) ||
      !memberIds.has(settlement.toId)
    ) {
      unreadable.settlements++
    } else {
      settlements.push(settlement)
    }
  }
  const ids: Record<string, LocalId> = {}
  for (const [id, kind] of fileIds(entry)) {
    ids[id] = await localId(tx, kind, id, householdId, memberIds)
  }
  const own = ids[householdId] ?? { status: 'unreadable' }
  const status: LocalHousehold['status'] =
    own.status !== 'ok'
      ? own.status
      : own.side.type === 'record'
        ? 'present'
        : own.side.type === 'none'
          ? 'absent'
          : 'unreadable'
  return {
    householdId,
    status,
    members,
    expenses,
    settlements,
    unreadable,
    ids,
  }
}

async function readLocalState(
  tx: IDBTransaction,
  file: SettleFile,
): Promise<LocalState> {
  const meta = tx.objectStore(STORE.meta)
  const deviceId = metaValue(await result(meta.get(META.deviceId)))
  if (typeof deviceId !== 'string' || deviceId.length === 0) {
    throw new Error('no device id')
  }
  const former = metaValue(await result(meta.get(META.formerDeviceIds)))
  const households: LocalHousehold[] = []
  for (const entry of file.households) {
    households.push(await localHousehold(tx, entry))
  }
  return {
    deviceId,
    formerDeviceIds: Array.isArray(former)
      ? former.filter((id): id is string => typeof id === 'string')
      : [],
    households,
  }
}

/**
 * What the preview was made from: this device's state for the file's ids,
 * and the id Apply would give this device. Apply compares it with a fresh
 * read and refuses if anything changed meanwhile (E6, the re-check).
 */
export interface ImportPreview {
  local: LocalState
  newDeviceId: string
}

export async function prepareImport(
  db: IDBDatabase,
  file: SettleFile,
): Promise<ImportPreview> {
  const local = await transaction(db, ALL_STORES, 'readonly', (tx) =>
    readLocalState(tx, file),
  )
  return { local, newDeviceId: newId() }
}

/** The data changed between the preview and Apply (another tab). */
export class ImportChangedError extends Error {}

/** Apply was asked with an undecided conflict or a broken limit. */
export class ImportBlockedError extends Error {}

/** A record the merge would write that its reader refuses (E12). */
export class ImportInvalidRecordError extends Error {}

export interface AppliedHousehold {
  householdId: string
  name: string
  expenses: number
}

function versionEntry(
  id: string,
  kind: RecordKind,
  householdId: string,
  clock: Clock,
  result: Side,
): VersionEntry {
  const entry: VersionEntry = { id, kind, householdId, clock }
  if (result.type === 'deletion') entry.deletedAt = result.deletedAt
  return entry
}

/**
 * Applies a file under `choices` in one transaction over every store the
 * households use, `versions` and `meta` included (E6). It re-reads this
 * device's records, version entries and the raw entries for every id in
 * the file, and writes nothing if they differ from the preview's. Then it
 * re-runs the merge, re-checks content and limits, and writes.
 */
export async function applyImport(
  db: IDBDatabase,
  file: SettleFile,
  preview: ImportPreview,
  choices: Readonly<Record<string, Choice>>,
  now: string = new Date().toISOString(),
): Promise<AppliedHousehold[]> {
  return transaction(db, ALL_STORES, 'readwrite', async (tx) => {
    const local = await readLocalState(tx, file)
    if (canonical(local) !== canonical(preview.local)) {
      throw new ImportChangedError('changed')
    }
    const plan = planImport(file, local, preview.newDeviceId)
    const resolution: ImportResolution = resolveImport(plan, choices)
    if (!resolution.canApply) throw new ImportBlockedError('blocked')

    let wrote = false
    const applied: AppliedHousehold[] = []
    for (const household of resolution.households) {
      const householdId = household.plan.householdId
      for (const item of household.items) {
        const store = tx.objectStore(STORE_OF[item.kind])
        if (item.writesRecord) {
          if (item.result.type === 'record') {
            if (READER_OF[item.kind](item.result.record) === null) {
              throw new ImportInvalidRecordError(item.id)
            }
            await result(store.put(item.result.record))
          } else {
            await result(store.delete(item.id))
          }
          wrote = true
        }
        const clock = item.writeClock
        if (
          clock !== null &&
          (Object.keys(clock).length > 0 || item.result.type === 'deletion')
        ) {
          await result(
            tx
              .objectStore(STORE.versions)
              .put(
                versionEntry(
                  item.id,
                  item.kind,
                  householdId,
                  clock,
                  item.result,
                ),
              ),
          )
          wrote = true
        }
      }
      if (household.plan.leftOutWhole === undefined) {
        applied.push({
          householdId,
          name: household.plan.household.name,
          expenses: household.counts.expenses,
        })
      }
    }

    const meta = tx.objectStore(STORE.meta)
    if (plan.changesDeviceId) {
      await result(meta.put({ key: META.deviceId, value: plan.newDeviceId }))
      await result(
        meta.put({
          key: META.formerDeviceIds,
          value: [...local.formerDeviceIds, local.deviceId],
        }),
      )
    }
    // A backup that only adds households is already backed up (E5).
    const onlyAdds =
      file.kind === 'backup' &&
      resolution.households.every(
        (household) =>
          household.plan.isNew || household.plan.leftOutWhole !== undefined,
      )
    if (wrote && !onlyAdds) {
      const first: unknown = await result(meta.get(META.firstUnbackedChangeAt))
      if (first === undefined) {
        await result(meta.put({ key: META.firstUnbackedChangeAt, value: now }))
      }
    }
    return applied
  })
}
