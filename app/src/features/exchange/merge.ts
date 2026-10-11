/**
 * The merge (M6 plan, E6), pure. It compares, per household and per
 * record id, this device's side ("mine") with the file's ("theirs"). Each
 * side is a record with its clock, a deletion with its clock, or nothing.
 *
 * `planImport` classifies every id once, from the file and a snapshot of
 * this device (`LocalState`, read by `data/exchange.ts`). `resolveImport`
 * then applies the conflict choices: it gives every record's result and
 * the clock it writes, keeps members that results still name, checks the
 * member limits, and lists the writes. The preview calls it after every
 * choice, and Apply calls it again inside its transaction.
 */
import {
  compare,
  resolveClock,
  type Clock,
  type MergeOutcome,
  type RecordKind,
} from '../../data/versions.ts'
import {
  HOUSEHOLD_LIMITS,
  referencedMemberIds,
  type Expense,
  type Household,
  type Member,
  type Settlement,
} from '../household/model.ts'
import { canonical, type FileKind, type SettleFile } from './format.ts'
import { crowdedDay } from './readFile.ts'

export type AnyRecord = Household | Member | Expense | Settlement

/** One side of an id: a record, a deletion, or nothing. */
export type Side =
  | { type: 'record'; record: AnyRecord; clock: Clock }
  | { type: 'deletion'; clock: Clock; deletedAt: string }
  | { type: 'none' }

const NONE: Side = { type: 'none' }

/**
 * What this device holds under an id of the file, read by key in the
 * record's own store and in `versions` (round 1, I2): this household's
 * readable side, or a reason to leave the id alone.
 */
export type LocalId =
  | { status: 'ok'; side: Side }
  /** The raw record or its version entry can't be read here. */
  | { status: 'unreadable' }
  /** This phone uses the id for another household or kind. */
  | { status: 'foreign' }

export interface LocalHousehold {
  householdId: string
  /** The household's own record here. */
  status: 'present' | 'absent' | 'unreadable' | 'foreign'
  /** This household's readable records here. */
  members: Member[]
  expenses: Expense[]
  settlements: Settlement[]
  /** This household's records here that can't be read (kept, H1). */
  unreadable: { members: number; expenses: number; settlements: number }
  /** Every id in the file's entry for this household. */
  ids: Record<string, LocalId>
}

export interface LocalState {
  deviceId: string
  formerDeviceIds: string[]
  households: LocalHousehold[]
}

export type ConflictCause = 'concurrent' | 'equal' | 'goneBack'

/** How an id is classified before any choice (E6's table). */
export type Classification =
  | 'nothingToDecide'
  | 'new'
  | 'changedThere'
  | 'deletedThere'
  | 'changedHere'
  | 'conflict'
  /** Left alone: unreadable here. */
  | 'leftOutUnreadable'
  /** Left alone: this phone uses the id for something else. */
  | 'leftOutForeign'
  /** Not added: it names a member who is left out (round 1, I3). */
  | 'leftOutNames'

export interface PlanItem {
  id: string
  kind: RecordKind
  classification: Classification
  mine: Side
  theirs: Side
  /** For a conflict. */
  cause?: ConflictCause
  /** For `leftOutNames`: the left-out member it names. */
  namesId?: string
}

export interface HouseholdPlan {
  householdId: string
  /** The file's household record. */
  household: Household
  /** Not on this device: added whole (E6). */
  isNew: boolean
  /** The household's own record here can't be read, or is foreign. */
  leftOutWhole?: 'unreadable' | 'foreign'
  items: PlanItem[]
  local: LocalHousehold
}

export interface ImportPlan {
  fileKind: FileKind
  deviceId: string
  /** Apply gives this device a new id (E6, "Gone back in time"). */
  changesDeviceId: boolean
  /** The id every bump of this Apply counts under. */
  bumpId: string
  /** Used only when `changesDeviceId`. */
  newDeviceId: string
  households: HouseholdPlan[]
}

/** A conflict's key in the choices: `householdId/id`. */
export function conflictKey(householdId: string, id: string): string {
  return `${householdId}/${id}`
}

export type Choice = 'mine' | 'theirs'

/** The file's side of every id in a household entry. */
function theirSides(
  entry: SettleFile['households'][number],
): Map<string, { kind: RecordKind; side: Side }> {
  const sides = new Map<string, { kind: RecordKind; side: Side }>()
  const clockOf = new Map(entry.versions.map((v) => [v.id, v]))
  const add = (kind: RecordKind, record: AnyRecord) => {
    sides.set(record.id, {
      kind,
      side: {
        type: 'record',
        record,
        clock: clockOf.get(record.id)?.clock ?? {},
      },
    })
  }
  add('household', entry.household)
  for (const member of entry.members) add('member', member)
  for (const expense of entry.expenses) add('expense', expense)
  for (const settlement of entry.settlements) add('settlement', settlement)
  for (const version of entry.versions) {
    if (version.deletedAt !== undefined) {
      sides.set(version.id, {
        kind: version.kind,
        side: {
          type: 'deletion',
          clock: version.clock,
          deletedAt: version.deletedAt,
        },
      })
    }
  }
  return sides
}

function clockOfSide(side: Side): Clock {
  return side.type === 'none' ? {} : side.clock
}

function sameContent(mine: Side, theirs: Side): boolean {
  if (mine.type === 'deletion' && theirs.type === 'deletion') return true
  return (
    mine.type === 'record' &&
    theirs.type === 'record' &&
    canonical(mine.record) === canonical(theirs.record)
  )
}

/** Whether theirs counts higher than mine for one of `ids`. */
function exposes(mine: Side, theirs: Side, ids: readonly string[]): boolean {
  const m = clockOfSide(mine)
  const t = clockOfSide(theirs)
  return ids.some((id) => (t[id] ?? 0) > (m[id] ?? 0))
}

/** The member ids a record names (expenses and payments). */
function namedMembers(kind: RecordKind, record: AnyRecord): string[] {
  if (kind === 'expense') return referencedMemberIds(record as Expense)
  if (kind === 'settlement') {
    const settlement = record as Settlement
    return [settlement.fromId, settlement.toId]
  }
  return []
}

/**
 * Classifies every id of the file (E6). `newDeviceId` is used only when
 * Apply must change this device's id.
 */
export function planImport(
  file: SettleFile,
  local: LocalState,
  newDeviceId: string,
): ImportPlan {
  const ownIds = [local.deviceId, ...local.formerDeviceIds]
  let changesDeviceId = false
  const households: HouseholdPlan[] = []
  for (const entry of file.households) {
    const householdId = entry.household.id
    const here = local.households.find((h) => h.householdId === householdId)
    if (here === undefined) throw new Error(`no local state for ${householdId}`)
    const plan: HouseholdPlan = {
      householdId,
      household: entry.household,
      isNew: here.status === 'absent',
      items: [],
      local: here,
    }
    if (here.status === 'unreadable' || here.status === 'foreign') {
      plan.leftOutWhole = here.status
      households.push(plan)
      continue
    }
    const items: PlanItem[] = []
    for (const [id, { kind, side: theirs }] of theirSides(entry)) {
      const localId = here.ids[id] ?? { status: 'ok', side: NONE }
      if (localId.status !== 'ok') {
        items.push({
          id,
          kind,
          classification:
            localId.status === 'unreadable'
              ? 'leftOutUnreadable'
              : 'leftOutForeign',
          mine: NONE,
          theirs,
        })
        continue
      }
      const mine = localId.side
      if (exposes(mine, theirs, [local.deviceId])) changesDeviceId = true
      const item: PlanItem = {
        id,
        kind,
        classification: 'nothingToDecide',
        mine,
        theirs,
      }
      if (sameContent(mine, theirs)) {
        item.classification = 'nothingToDecide'
      } else if (mine.type === 'none') {
        item.classification = 'new'
      } else if (exposes(mine, theirs, ownIds)) {
        item.classification = 'conflict'
        item.cause = 'goneBack'
      } else {
        const order = compare(clockOfSide(theirs), clockOfSide(mine))
        if (order === 'newer') {
          item.classification =
            theirs.type === 'record' ? 'changedThere' : 'deletedThere'
        } else if (order === 'older') {
          item.classification = 'changedHere'
        } else {
          item.classification = 'conflict'
          item.cause = order === 'equal' ? 'equal' : 'concurrent'
          if (
            order === 'equal' &&
            clockOfSide(mine)[local.deviceId] !== undefined
          ) {
            // Equal clocks naming this device: it may be reusing counts
            // (a restore) or the phones crossed choices; a new id is safe
            // either way (local review of revision 6, I2).
            changesDeviceId = true
          }
        }
      }
      items.push(item)
    }
    // Records from the file that name a left-out member are left out too.
    const leftOutMembers = new Set(
      items
        .filter(
          (item) =>
            item.kind === 'member' &&
            (item.classification === 'leftOutUnreadable' ||
              item.classification === 'leftOutForeign'),
        )
        .map((item) => item.id),
    )
    for (const item of items) {
      if (item.theirs.type !== 'record') continue
      if (
        item.classification === 'nothingToDecide' ||
        item.classification === 'changedHere' ||
        item.classification.startsWith('leftOut')
      ) {
        continue
      }
      const named = namedMembers(item.kind, item.theirs.record).find((id) =>
        leftOutMembers.has(id),
      )
      if (named !== undefined) {
        item.classification = 'leftOutNames'
        item.namesId = named
        delete item.cause
      }
    }
    plan.items = items.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    households.push(plan)
  }
  return {
    fileKind: file.kind,
    deviceId: local.deviceId,
    changesDeviceId,
    bumpId: changesDeviceId ? newDeviceId : local.deviceId,
    newDeviceId,
    households,
  }
}

/** A record's result after the choices, and what the merge writes. */
export interface ResultItem {
  id: string
  kind: RecordKind
  /** What this device holds after Apply. */
  result: Side
  /** The version entry to write, or `null` for none. */
  writeClock: Clock | null
  /** The record (or deletion) changes here. */
  writesRecord: boolean
  outcome: MergeOutcome | 'changedHere' | 'leftOut' | 'onlyHere'
}

export interface KeptMember {
  memberId: string
  name: string
  /** How many kept records name the member. */
  namedBy: number
  /** Kept although "Keep mine" chose its deletion. */
  overridesChoice: boolean
  /** Whose records name it: the other phone's, or this phone's. */
  from: 'theirs' | 'mine'
}

export type LimitProblem =
  { kind: 'tooManyActive'; date: string } | { kind: 'tooManyMembers' }

export interface HouseholdCounts {
  newRecords: Record<RecordKind, number>
  changed: Record<RecordKind, number>
  deleted: Record<RecordKind, number>
  conflicts: number
  /** Readable records of the result, for "Flat now has 40 expenses". */
  members: number
  expenses: number
  settlements: number
}

export interface HouseholdResolution {
  plan: HouseholdPlan
  items: ResultItem[]
  /** Members kept because a kept record names them (E6). */
  keptForReferences: KeptMember[]
  /** Members whose deletion waits: unreadable records might name them. */
  keptUnreadable: { memberId: string; name: string }[]
  limit: LimitProblem | null
  counts: HouseholdCounts
  /** Nothing in this household changes. */
  nothingNew: boolean
}

export interface ImportResolution {
  plan: ImportPlan
  households: HouseholdResolution[]
  /** Conflicts still without a choice. */
  undecided: number
  /** Apply is allowed: every conflict decided, no limit broken. */
  canApply: boolean
}

function zeroCounts(): Record<RecordKind, number> {
  return { household: 0, member: 0, expense: 0, settlement: 0 }
}

function recordOf(side: Side): AnyRecord | null {
  return side.type === 'record' ? side.record : null
}

/** Whether taking `side` changes what this device holds (not the clock). */
function changesContent(side: Side, mine: Side): boolean {
  if (side.type !== mine.type) return true
  return side.type === 'record' && !sameContent(side, mine)
}

function resolveHousehold(
  plan: HouseholdPlan,
  bumpId: string,
  choices: Readonly<Record<string, Choice>>,
): { resolution: HouseholdResolution; undecided: number } {
  const counts: HouseholdCounts = {
    newRecords: zeroCounts(),
    changed: zeroCounts(),
    deleted: zeroCounts(),
    conflicts: 0,
    members: 0,
    expenses: 0,
    settlements: 0,
  }
  let undecided = 0
  const items: ResultItem[] = []
  const chosenDeletion = new Set<string>()
  for (const item of plan.items) {
    const mine = clockOfSide(item.mine)
    const theirs = clockOfSide(item.theirs)
    const take = (outcome: MergeOutcome, side: Side): ResultItem => ({
      id: item.id,
      kind: item.kind,
      result: side,
      writeClock: resolveClock(outcome, mine, theirs, bumpId),
      writesRecord: changesContent(side, item.mine),
      outcome,
    })
    switch (item.classification) {
      case 'nothingToDecide': {
        const joined = resolveClock('nothingToDecide', mine, theirs, bumpId)
        let result: Side =
          item.mine.type === 'none'
            ? item.mine
            : { ...item.mine, clock: joined }
        let changed = compare(joined, mine) !== 'equal'
        // Two deletions of one record: the earlier time, so every phone
        // ends with the same entry whatever the order of exchanges.
        if (
          item.mine.type === 'deletion' &&
          item.theirs.type === 'deletion' &&
          item.theirs.deletedAt < item.mine.deletedAt
        ) {
          result = {
            ...item.mine,
            clock: joined,
            deletedAt: item.theirs.deletedAt,
          }
          changed = true
        }
        items.push({
          id: item.id,
          kind: item.kind,
          result,
          writeClock: changed ? joined : null,
          writesRecord: false,
          outcome: 'nothingToDecide',
        })
        break
      }
      case 'new':
      case 'changedThere':
      case 'deletedThere': {
        items.push(take(item.classification, item.theirs))
        break
      }
      case 'changedHere':
        items.push({
          id: item.id,
          kind: item.kind,
          result: item.mine,
          writeClock: null,
          writesRecord: false,
          outcome: 'changedHere',
        })
        break
      case 'conflict': {
        counts.conflicts++
        const choice = choices[conflictKey(plan.householdId, item.id)]
        if (choice === undefined) {
          undecided++
          // Until decided, the preview shows this phone's side.
          items.push({
            id: item.id,
            kind: item.kind,
            result: item.mine,
            writeClock: null,
            writesRecord: false,
            outcome: 'changedHere',
          })
        } else if (choice === 'mine') {
          if (item.mine.type === 'deletion') chosenDeletion.add(item.id)
          items.push(take('keepMine', item.mine))
        } else {
          items.push(take('useTheirs', item.theirs))
        }
        break
      }
      default:
        items.push({
          id: item.id,
          kind: item.kind,
          result: item.mine,
          writeClock: null,
          writesRecord: false,
          outcome: 'leftOut',
        })
    }
  }
  // Records only here: kept (they don't have them yet).
  const inFile = new Set(items.map((item) => item.id))
  const onlyHere = (kind: RecordKind, records: readonly AnyRecord[]) => {
    for (const record of records) {
      if (inFile.has(record.id)) continue
      items.push({
        id: record.id,
        kind,
        result: { type: 'record', record, clock: {} },
        writeClock: null,
        writesRecord: false,
        outcome: 'onlyHere',
      })
    }
  }
  onlyHere('member', plan.local.members)
  onlyHere('expense', plan.local.expenses)
  onlyHere('settlement', plan.local.settlements)

  const byId = new Map(items.map((item) => [item.id, item]))
  const planById = new Map(plan.items.map((item) => [item.id, item]))
  const fromFile = (item: ResultItem) =>
    item.outcome === 'new' ||
    item.outcome === 'changedThere' ||
    item.outcome === 'useTheirs'

  // Unreadable records here: a member's deletion waits (M4, H7).
  const keptUnreadable: HouseholdResolution['keptUnreadable'] = []
  if (plan.local.unreadable.expenses + plan.local.unreadable.settlements > 0) {
    for (const item of items) {
      const original = planById.get(item.id)
      if (
        item.kind === 'member' &&
        original !== undefined &&
        original.mine.type === 'record' &&
        item.result.type !== 'record'
      ) {
        keptUnreadable.push({
          memberId: item.id,
          name: (original.mine.record as Member).name,
        })
        Object.assign(item, {
          result: original.mine,
          writeClock: null,
          writesRecord: false,
          outcome: 'changedHere',
        })
      }
    }
  }

  // Kept for references: a member the kept records still name (E6).
  const keptForReferences: KeptMember[] = []
  const naming = new Map<string, { theirs: number; mine: number }>()
  for (const item of items) {
    const record = recordOf(item.result)
    if (record === null) continue
    for (const memberId of namedMembers(item.kind, record)) {
      const tally = naming.get(memberId) ?? { theirs: 0, mine: 0 }
      if (fromFile(item)) tally.theirs++
      else tally.mine++
      naming.set(memberId, tally)
    }
  }
  for (const [memberId, tally] of naming) {
    const item = byId.get(memberId)
    if (item === undefined || item.result.type === 'record') continue
    const original = planById.get(memberId)
    if (original === undefined) continue
    const side =
      original.theirs.type === 'record' ? original.theirs : original.mine
    if (side.type !== 'record') continue
    const mine = clockOfSide(original.mine)
    const theirs = clockOfSide(original.theirs)
    Object.assign(item, {
      result: side,
      writeClock: resolveClock('keptForReferences', mine, theirs, bumpId),
      writesRecord: changesContent(side, original.mine),
      outcome: 'keptForReferences',
    })
    keptForReferences.push({
      memberId,
      name: (side.record as Member).name,
      namedBy: tally.theirs + tally.mine,
      overridesChoice: chosenDeletion.has(memberId),
      from: tally.theirs > 0 ? 'theirs' : 'mine',
    })
  }

  // Counts, and the member limits on the result (H4).
  const members: Member[] = []
  for (const item of items) {
    const record = recordOf(item.result)
    if (record !== null) {
      if (item.kind === 'member') {
        members.push(record as Member)
        counts.members++
      }
      if (item.kind === 'expense') counts.expenses++
      if (item.kind === 'settlement') counts.settlements++
    }
    if (!item.writesRecord) continue
    const original = planById.get(item.id)
    const hadRecord = original?.mine.type === 'record'
    if (item.result.type === 'record') {
      if (hadRecord) counts.changed[item.kind]++
      else counts.newRecords[item.kind]++
    } else if (hadRecord) {
      counts.deleted[item.kind]++
    }
  }
  let limit: LimitProblem | null = null
  const allMembers = members.length + plan.local.unreadable.members
  if (allMembers > HOUSEHOLD_LIMITS.maxMembers) {
    limit = { kind: 'tooManyMembers' }
  } else {
    const day = crowdedDay(members)
    if (day !== null) limit = { kind: 'tooManyActive', date: day }
  }
  const nothingNew = items.every(
    (item) => !item.writesRecord && item.writeClock === null,
  )
  return {
    resolution: {
      plan,
      items,
      keptForReferences,
      keptUnreadable,
      limit,
      counts,
      nothingNew,
    },
    undecided,
  }
}

/** The result of `plan` under `choices` (E6, E8). */
export function resolveImport(
  plan: ImportPlan,
  choices: Readonly<Record<string, Choice>>,
): ImportResolution {
  let undecided = 0
  const households: HouseholdResolution[] = []
  for (const household of plan.households) {
    if (household.leftOutWhole !== undefined) {
      households.push({
        plan: household,
        items: [],
        keptForReferences: [],
        keptUnreadable: [],
        limit: null,
        counts: {
          newRecords: zeroCounts(),
          changed: zeroCounts(),
          deleted: zeroCounts(),
          conflicts: 0,
          members: 0,
          expenses: 0,
          settlements: 0,
        },
        nothingNew: true,
      })
      continue
    }
    const resolved = resolveHousehold(household, plan.bumpId, choices)
    undecided += resolved.undecided
    households.push(resolved.resolution)
  }
  return {
    plan,
    households,
    undecided,
    canApply:
      undecided === 0 &&
      households.every((household) => household.limit === null),
  }
}

/** Every gone-back-in-time conflict set to "Use theirs" (round 3, O2). */
export function useTheirsForGoneBack(
  plan: ImportPlan,
  choices: Readonly<Record<string, Choice>>,
): Record<string, Choice> {
  const next = { ...choices }
  for (const household of plan.households) {
    for (const item of household.items) {
      if (item.classification === 'conflict' && item.cause === 'goneBack') {
        next[conflictKey(household.householdId, item.id)] = 'theirs'
      }
    }
  }
  return next
}

/** The conflicts of a plan, in order. */
export function conflicts(
  plan: ImportPlan,
): { householdId: string; item: PlanItem }[] {
  return plan.households.flatMap((household) =>
    household.items
      .filter((item) => item.classification === 'conflict')
      .map((item) => ({ householdId: household.householdId, item })),
  )
}
