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
import { INDEX, STORE, getAll, result, transaction } from './db.ts'
import type { VersionEntry } from './versions.ts'
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
