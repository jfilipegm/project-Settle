/**
 * Record versions (M6 plan, E4): a version vector for every record. Each
 * device has a random id, and a record's clock maps device ids to how
 * many changes that device made to it. Pure: the repository stores the
 * clocks, the merge compares them.
 */

/** Device id to count. A count is a whole number from 1 to 2^31. */
export type Clock = Readonly<Record<string, number>>

export type RecordKind = 'household' | 'member' | 'expense' | 'settlement'

export const RECORD_KINDS: readonly RecordKind[] = [
  'household',
  'member',
  'expense',
  'settlement',
]

/**
 * A record's stored version: its clock, and `deletedAt` once the record is
 * deleted (the deletion log is the same store, E4).
 */
export interface VersionEntry {
  id: string
  kind: RecordKind
  householdId: string
  clock: Clock
  deletedAt?: string
}

/** The highest count a clock may hold (E2's limit). */
export const MAX_COUNT = 2 ** 31

/** The most entries a clock in a file may have (E2). */
export const MAX_CLOCK_ENTRIES = 64

/** A bump past {@link MAX_COUNT}: only damaged data gets there (E4). */
export class ClockOverflowError extends Error {}

/** The clock with one more change by `deviceId`. */
export function bump(clock: Clock, deviceId: string): Clock {
  const next = (clock[deviceId] ?? 0) + 1
  if (next > MAX_COUNT) throw new ClockOverflowError(deviceId)
  return sortClock({ ...clock, [deviceId]: next })
}

/** The higher count for each device. */
export function join(a: Clock, b: Clock): Clock {
  const joined: Record<string, number> = { ...a }
  for (const [device, count] of Object.entries(b)) {
    joined[device] = Math.max(joined[device] ?? 0, count)
  }
  return sortClock(joined)
}

export type Order = 'equal' | 'newer' | 'older' | 'concurrent'

/**
 * How clock `a` stands to clock `b` (E6): `newer` when every count in
 * `a` is at least `b`'s and one is higher, `older` the other way round,
 * `concurrent` when each holds a change the other hasn't seen.
 */
export function compare(a: Clock, b: Clock): Order {
  let aHigher = false
  let bHigher = false
  for (const device of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const ca = a[device] ?? 0
    const cb = b[device] ?? 0
    if (ca > cb) aHigher = true
    else if (cb > ca) bHigher = true
  }
  if (aHigher && bHigher) return 'concurrent'
  if (aHigher) return 'newer'
  if (bHigher) return 'older'
  return 'equal'
}

/** Whether `a` is newer than or equal to `b`. */
export function dominates(a: Clock, b: Clock): boolean {
  const order = compare(a, b)
  return order === 'newer' || order === 'equal'
}

/** The clock with its devices in a fixed order (canonical files, E1). */
export function sortClock(clock: Clock): Clock {
  const sorted: Record<string, number> = {}
  for (const device of Object.keys(clock).sort()) {
    sorted[device] = clock[device] as number
  }
  return sorted
}

/**
 * What a merge decided for one record (M6 plan, E6): an outcome without a
 * question, or a conflict's choice.
 */
export type MergeOutcome =
  | 'nothingToDecide'
  | 'new'
  | 'changedThere'
  | 'deletedThere'
  | 'keepMine'
  | 'useTheirs'
  | 'keptForReferences'

/**
 * Which merge outcomes add 1 for this device (E4's exception, owned here
 * so the rule and the code can't drift apart): "Keep mine", "kept for
 * references", and either choice on a conflict between equal clocks.
 * Taking a record, a deletion, or a "Use theirs" over a concurrent or
 * newer clock writes no bump, so the sender's next edit is never
 * concurrent with ours.
 */
export function mergeBumps(
  outcome: MergeOutcome,
  equalClocks: boolean,
): boolean {
  if (outcome === 'keepMine' || outcome === 'keptForReferences') return true
  return outcome === 'useTheirs' && equalClocks
}

/**
 * The clock a merge writes for an outcome (E6): the higher count for each
 * device, plus 1 under `bumpId` when {@link mergeBumps} says so. The
 * result is newer than or equal to both sides, and strictly newer than
 * the clock of every side whose content it didn't take ("What a decision
 * guarantees").
 */
export function resolveClock(
  outcome: MergeOutcome,
  mine: Clock,
  theirs: Clock,
  bumpId: string,
): Clock {
  const joined = join(mine, theirs)
  const equalClocks = compare(mine, theirs) === 'equal'
  return mergeBumps(outcome, equalClocks) ? bump(joined, bumpId) : joined
}
