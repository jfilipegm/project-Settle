/**
 * Reading a Settle file, strictly (M6 plan, E2). Pure. A file with any
 * problem is refused whole: a half-imported household would be worse than
 * none. Every record goes through the database's own reader
 * (`data/records.ts`), which builds new objects from known fields only, so
 * unknown keys (`__proto__` included) are dropped. The file is then
 * checked as a whole: households, references, ids, limits and versions.
 */
import {
  readClock,
  readExpense,
  readHousehold,
  readMember,
  readSettlement,
} from '../../data/records.ts'
import {
  MAX_CLOCK_ENTRIES,
  RECORD_KINDS,
  type Clock,
  type RecordKind,
} from '../../data/versions.ts'
import {
  HOUSEHOLD_LIMITS,
  isActiveOn,
  referencedMemberIds,
  type Expense,
  type Household,
  type Member,
  type Settlement,
} from '../household/model.ts'
import {
  ENTRY_KEYS,
  FILE_FORMAT,
  FILE_KEYS,
  type FileKind,
  type FileVersion,
  type HouseholdEntry,
  type SettleFile,
} from './format.ts'
import {
  FILE_MIGRATIONS,
  FileMigrationError,
  migrateFile,
  type FileMigration,
} from './migrations.ts'

/** At most 20 MB: about a hundred times a busy household's year. */
export const MAX_FILE_BYTES = 20 * 1024 * 1024

/** At most this many problems are named; the rest are counted. */
export const MAX_PROBLEMS = 5

/** Which record a problem is about, with what can name it in words. */
export interface RecordRef {
  kind: RecordKind
  id: string
  /** A household's or member's name, or an expense's description. */
  label?: string
  /** An expense's or payment's date. */
  date?: string
}

export type FileProblem =
  | { code: 'tooLarge' }
  | { code: 'notJson' }
  | { code: 'notSettle' }
  | { code: 'newerVersion' }
  | { code: 'migrationFailed' }
  | { code: 'badShape' }
  | { code: 'unknownKey'; key: string }
  | { code: 'unknownKind' }
  | { code: 'householdCount' }
  | { code: 'badTimestamp'; record?: RecordRef }
  | { code: 'unreadable'; record: RecordRef }
  | { code: 'badId'; record: RecordRef }
  | { code: 'badPosition'; record: RecordRef }
  | { code: 'wrongHousehold'; record: RecordRef }
  | { code: 'missingMember'; record: RecordRef }
  | { code: 'duplicateId'; record: RecordRef }
  | { code: 'tooManyActive'; record: RecordRef; date: string }
  | { code: 'tooManyMembers'; record: RecordRef }
  | { code: 'missingVersion'; record: RecordRef }
  | { code: 'duplicateVersion'; record: RecordRef }
  | { code: 'badVersion'; id: string }
  | { code: 'orphanVersion'; id: string }
  | { code: 'deletedHousehold'; id: string }
  | { code: 'deletedAndPresent'; id: string }
  | { code: 'badClock'; id: string }

export type ReadResult =
  | { ok: true; file: SettleFile }
  | { ok: false; problems: FileProblem[]; total: number }

const ID = /^[A-Za-z0-9-]{1,64}$/

/** An id as a file allows it: 1 to 64 of `[A-Za-z0-9-]`. */
export function isFileId(value: unknown): value is string {
  return typeof value === 'string' && ID.test(value)
}

const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/

/** An ISO timestamp, as `Date.toISOString` writes one, that is real. */
export function isTimestamp(value: unknown): value is string {
  if (typeof value !== 'string' || !TIMESTAMP.test(value)) return false
  const time = Date.parse(value)
  return (
    !Number.isNaN(time) &&
    new Date(time).toISOString().slice(0, 19) === value.slice(0, 19)
  )
}

/** The highest member position a file allows: 2^31 − 1. */
export const MAX_POSITION = 2 ** 31 - 1

type Read = Household | Member | Expense | Settlement

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Every id nested in a record, its own included (E2). */
function recordIds(kind: RecordKind, record: Read): string[] {
  switch (kind) {
    case 'household':
      return [record.id]
    case 'member':
      return [record.id, (record as Member).householdId]
    case 'expense': {
      const expense = record as Expense
      const ids = [
        expense.id,
        expense.householdId,
        ...referencedMemberIds(expense),
      ]
      if (expense.split.kind === 'itemised') {
        const { bill, members } = expense.split
        ids.push(bill.payerId)
        for (const person of bill.people) ids.push(person.id)
        for (const item of bill.items) {
          ids.push(item.id)
          for (const assignee of item.assignees) ids.push(assignee.personId)
        }
        for (const entry of members) ids.push(entry.personId, entry.memberId)
      }
      return ids
    }
    case 'settlement': {
      const settlement = record as Settlement
      return [
        settlement.id,
        settlement.householdId,
        settlement.fromId,
        settlement.toId,
      ]
    }
  }
}

function timestamps(kind: RecordKind, record: Read): unknown[] {
  if (kind === 'member') return []
  const stamped = record as Household | Expense | Settlement
  const list: unknown[] = [stamped.createdAt, stamped.updatedAt]
  if (kind === 'household' && (record as Household).archivedAt !== undefined) {
    list.push((record as Household).archivedAt)
  }
  return list
}

/** A record's words for messages: a name or description, and a date. */
export function recordRef(kind: RecordKind, record: Read): RecordRef {
  const ref: RecordRef = { kind, id: record.id }
  if (kind === 'household' || kind === 'member') {
    ref.label = (record as Household | Member).name
  } else if (kind === 'expense') {
    ref.label = (record as Expense).description
    ref.date = (record as Expense).date
  } else {
    ref.date = (record as Settlement).date
  }
  return ref
}

/**
 * E2's rules beyond the database's readers, for one readable record: the
 * id rule (its own and every nested id), ISO timestamps, and a member's
 * position from 0 to 2^31 − 1. The export uses them too, so every file
 * Settle writes opens in Settle (E1).
 */
export function stricterProblems(
  kind: RecordKind,
  record: Read,
): FileProblem[] {
  const ref = recordRef(kind, record)
  const problems: FileProblem[] = []
  if (!recordIds(kind, record).every(isFileId)) {
    problems.push({ code: 'badId', record: ref })
  }
  if (!timestamps(kind, record).every(isTimestamp)) {
    problems.push({ code: 'badTimestamp', record: ref })
  }
  if (kind === 'member') {
    const position = (record as Member).position
    if (position < 0 || position > MAX_POSITION) {
      problems.push({ code: 'badPosition', record: ref })
    }
  }
  return problems
}

/** A clock as a file allows it (E2): at most 64 entries, valid ids. */
export function isFileClock(clock: Clock): boolean {
  const devices = Object.keys(clock)
  return devices.length <= MAX_CLOCK_ENTRIES && devices.every(isFileId)
}

function isRecordKind(value: unknown): value is RecordKind {
  return RECORD_KINDS.some((kind) => kind === value)
}

/** A version entry from a file, or `null`. */
function readFileVersion(value: unknown): FileVersion | null {
  if (!isObject(value) || !isFileId(value.id) || !isRecordKind(value.kind)) {
    return null
  }
  for (const key of Object.keys(value)) {
    if (!['id', 'kind', 'clock', 'deletedAt'].includes(key)) return null
  }
  const clock = readClock(value.clock)
  if (clock === null) return null
  const entry: FileVersion = { id: value.id, kind: value.kind, clock }
  if (value.deletedAt !== undefined) {
    if (typeof value.deletedAt !== 'string') return null
    entry.deletedAt = value.deletedAt
  }
  return entry
}

function rawRef(kind: RecordKind, raw: unknown): RecordRef {
  const id = isObject(raw) && typeof raw.id === 'string' ? raw.id : ''
  const ref: RecordRef = { kind, id: id.slice(0, 64) }
  if (isObject(raw)) {
    const label = kind === 'expense' ? raw.description : raw.name
    if (typeof label === 'string') ref.label = label.slice(0, 80)
    if (typeof raw.date === 'string') ref.date = raw.date.slice(0, 10)
  }
  return ref
}

const READERS = {
  member: readMember,
  expense: readExpense,
  settlement: readSettlement,
} as const

/**
 * The first day with more than 20 members active, or `null`. A day's
 * count only rises on someone's first day, so those are the days to check.
 */
export function crowdedDay(members: readonly Member[]): string | null {
  const days = [...new Set(members.map((member) => member.joinedOn))].sort()
  for (const day of days) {
    if (
      members.filter((member) => isActiveOn(member, day)).length >
      HOUSEHOLD_LIMITS.maxActiveMembers
    ) {
      return day
    }
  }
  return null
}

/** Reads and checks one household entry, adding to `problems`. */
function readEntry(
  raw: unknown,
  problems: FileProblem[],
  seen: Set<string>,
): HouseholdEntry | null {
  if (!isObject(raw)) {
    problems.push({ code: 'badShape' })
    return null
  }
  for (const key of Object.keys(raw)) {
    if (!(ENTRY_KEYS as readonly string[]).includes(key)) {
      problems.push({ code: 'unknownKey', key: key.slice(0, 40) })
    }
  }
  const lists = ['members', 'expenses', 'settlements', 'versions'] as const
  if (lists.some((key) => !Array.isArray(raw[key]))) {
    problems.push({ code: 'badShape' })
    return null
  }
  const household = readHousehold(raw.household)
  if (household === null) {
    problems.push({
      code: 'unreadable',
      record: rawRef('household', raw.household),
    })
    return null
  }
  const records = new Map<string, { kind: RecordKind; ref: RecordRef }>()
  const keep = (kind: RecordKind, record: Read) => {
    const ref = recordRef(kind, record)
    problems.push(...stricterProblems(kind, record))
    if (seen.has(record.id)) {
      problems.push({ code: 'duplicateId', record: ref })
    }
    seen.add(record.id)
    records.set(record.id, { kind, ref })
    if (
      kind !== 'household' &&
      (record as Member | Expense | Settlement).householdId !== household.id
    ) {
      problems.push({ code: 'wrongHousehold', record: ref })
    }
  }
  keep('household', household)

  const read = <K extends keyof typeof READERS>(kind: K) => {
    const list: NonNullable<ReturnType<(typeof READERS)[K]>>[] = []
    for (const value of raw[`${kind}s`] as unknown[]) {
      const record = READERS[kind](value) as NonNullable<
        ReturnType<(typeof READERS)[K]>
      > | null
      if (record === null) {
        problems.push({ code: 'unreadable', record: rawRef(kind, value) })
      } else {
        keep(kind, record)
        list.push(record)
      }
    }
    return list
  }
  const members = read('member')
  const expenses = read('expense')
  const settlements = read('settlement')

  // References resolve inside the file.
  const memberIds = new Set(members.map((member) => member.id))
  for (const expense of expenses) {
    if (!referencedMemberIds(expense).every((id) => memberIds.has(id))) {
      problems.push({
        code: 'missingMember',
        record: recordRef('expense', expense),
      })
    }
  }
  for (const settlement of settlements) {
    if (!memberIds.has(settlement.fromId) || !memberIds.has(settlement.toId)) {
      problems.push({
        code: 'missingMember',
        record: recordRef('settlement', settlement),
      })
    }
  }

  // The member limits (H4): 20 active on any day, 50 in all.
  const householdRef = recordRef('household', household)
  if (members.length > HOUSEHOLD_LIMITS.maxMembers) {
    problems.push({ code: 'tooManyMembers', record: householdRef })
  }
  const crowded = crowdedDay(members)
  if (crowded !== null) {
    problems.push({
      code: 'tooManyActive',
      record: householdRef,
      date: crowded,
    })
  }

  // Versions: one per record, and deletions of records not in the file.
  const versions: FileVersion[] = []
  const versioned = new Set<string>()
  for (const value of raw.versions as unknown[]) {
    const entry = readFileVersion(value)
    if (entry === null || !isFileClock(entry.clock)) {
      const id = isObject(value) && typeof value.id === 'string' ? value.id : ''
      problems.push({ code: 'badVersion', id: id.slice(0, 64) })
      continue
    }
    const record = records.get(entry.id)
    if (entry.deletedAt !== undefined) {
      if (entry.kind === 'household') {
        problems.push({ code: 'deletedHousehold', id: entry.id })
      } else if (record !== undefined) {
        problems.push({ code: 'deletedAndPresent', id: entry.id })
      } else if (Object.keys(entry.clock).length === 0) {
        problems.push({ code: 'badClock', id: entry.id })
      } else if (!isTimestamp(entry.deletedAt)) {
        problems.push({ code: 'badTimestamp' })
      } else if (seen.has(entry.id)) {
        problems.push({
          code: 'duplicateVersion',
          record: { kind: entry.kind, id: entry.id },
        })
      }
      seen.add(entry.id)
    } else if (record === undefined) {
      problems.push({ code: 'orphanVersion', id: entry.id })
    } else if (record.kind !== entry.kind) {
      problems.push({ code: 'badVersion', id: entry.id })
    } else if (versioned.has(entry.id)) {
      problems.push({ code: 'duplicateVersion', record: record.ref })
    }
    versioned.add(entry.id)
    versions.push(entry)
  }
  for (const [id, { ref }] of records) {
    if (!versioned.has(id))
      problems.push({ code: 'missingVersion', record: ref })
  }

  return { household, members, expenses, settlements, versions }
}

export interface ReadOptions {
  /** The file migrations; tests pass a test-only next version (E3). */
  migrations?: readonly FileMigration[]
}

function refuse(problems: FileProblem[]): ReadResult {
  return {
    ok: false,
    problems: problems.slice(0, MAX_PROBLEMS),
    total: problems.length,
  }
}

/** Reads a Settle file's text, all or nothing (E2). */
export function readFile(text: string, options: ReadOptions = {}): ReadResult {
  const migrations = options.migrations ?? FILE_MIGRATIONS
  const knownVersion = 1 + migrations.length
  if (new TextEncoder().encode(text).length > MAX_FILE_BYTES) {
    return refuse([{ code: 'tooLarge' }])
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return refuse([{ code: 'notJson' }])
  }
  if (!isObject(parsed) || parsed.format !== FILE_FORMAT) {
    return refuse([{ code: 'notSettle' }])
  }
  const version = parsed.formatVersion
  if (
    typeof version !== 'number' ||
    !Number.isInteger(version) ||
    version < 1
  ) {
    return refuse([{ code: 'notSettle' }])
  }
  if (version > knownVersion) return refuse([{ code: 'newerVersion' }])
  let file: Record<string, unknown>
  try {
    file = migrateFile(parsed, version, migrations)
  } catch (error) {
    if (error instanceof FileMigrationError) {
      return refuse([{ code: 'migrationFailed' }])
    }
    throw error
  }

  const problems: FileProblem[] = []
  for (const key of Object.keys(file)) {
    if (!(FILE_KEYS as readonly string[]).includes(key)) {
      problems.push({ code: 'unknownKey', key: key.slice(0, 40) })
    }
  }
  const kind = file.kind
  if (kind !== 'household' && kind !== 'backup') {
    problems.push({ code: 'unknownKind' })
  }
  if (!isTimestamp(file.exportedAt)) problems.push({ code: 'badTimestamp' })
  if (!Array.isArray(file.households)) {
    problems.push({ code: 'badShape' })
    return refuse(problems)
  }
  if (kind === 'household' && file.households.length !== 1) {
    problems.push({ code: 'householdCount' })
  }
  const seen = new Set<string>()
  const households: HouseholdEntry[] = []
  for (const raw of file.households as unknown[]) {
    const entry = readEntry(raw, problems, seen)
    if (entry !== null) households.push(entry)
  }
  if (problems.length > 0) return refuse(problems)
  return {
    ok: true,
    file: {
      format: FILE_FORMAT,
      formatVersion: knownVersion,
      kind: kind as FileKind,
      exportedAt: file.exportedAt as string,
      households,
    },
  }
}
