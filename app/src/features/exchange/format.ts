/**
 * The Settle file (M6 plan, E1): one documented JSON format for sharing a
 * household and backing up every household. Pure: the types and the
 * canonical writer. `readFile.ts` reads it back, strictly.
 */
import type { Clock, RecordKind } from '../../data/versions.ts'
import type {
  Expense,
  Household,
  Member,
  Settlement,
} from '../household/model.ts'

export const FILE_FORMAT = 'settle'

/** This code's file version (E3). A newer file is refused. */
export const FILE_VERSION = 1

export type FileKind = 'household' | 'backup'

/**
 * A record's version in a file (E4): its clock, and `deletedAt` for a
 * deletion, whose record is not in the file. The household is the entry
 * it sits in.
 */
export interface FileVersion {
  id: string
  kind: RecordKind
  clock: Clock
  deletedAt?: string
}

export interface HouseholdEntry {
  household: Household
  members: Member[]
  expenses: Expense[]
  settlements: Settlement[]
  versions: FileVersion[]
}

export interface SettleFile {
  format: typeof FILE_FORMAT
  formatVersion: number
  /** `household`: exactly one; `backup`: every household, possibly none. */
  kind: FileKind
  exportedAt: string
  households: HouseholdEntry[]
}

/** The top-level keys, in the order a file writes them. */
export const FILE_KEYS = [
  'format',
  'formatVersion',
  'kind',
  'exportedAt',
  'households',
] as const

/** A household entry's keys, in the order a file writes them. */
export const ENTRY_KEYS = [
  'household',
  'members',
  'expenses',
  'settlements',
  'versions',
] as const

/** A value with every object's keys sorted, arrays kept in order. */
function sortedKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortedKeys)
  if (typeof value === 'object' && value !== null) {
    const sorted: Record<string, unknown> = {}
    for (const key of Object.keys(value).sort()) {
      sorted[key] = sortedKeys((value as Record<string, unknown>)[key])
    }
    return sorted
  }
  return value
}

function byId<T extends { id: string }>(records: readonly T[]): T[] {
  return [...records].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

/**
 * The canonical text (E1): the top level and household entries in their
 * fixed order, every record's keys sorted, records and versions sorted by
 * id, two-space indentation and a final newline. Two exports of the same
 * data differ only in `exportedAt`.
 */
export function formatFile(file: SettleFile): string {
  const households = byId(
    file.households.map((entry) => ({ ...entry, id: entry.household.id })),
  ).map((entry) => ({
    household: sortedKeys(entry.household),
    members: byId(entry.members).map(sortedKeys),
    expenses: byId(entry.expenses).map(sortedKeys),
    settlements: byId(entry.settlements).map(sortedKeys),
    versions: byId(entry.versions).map(sortedKeys),
  }))
  const ordered = {
    format: file.format,
    formatVersion: file.formatVersion,
    kind: file.kind,
    exportedAt: file.exportedAt,
    households,
  }
  return `${JSON.stringify(ordered, null, 2)}\n`
}
