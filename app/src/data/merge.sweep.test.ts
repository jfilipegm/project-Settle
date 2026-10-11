// @vitest-environment node
/**
 * The merge's property sweep (M6 plan, acceptance targets, "Merge,
 * properties"): three devices start from one shared household, make
 * random edits and send files on a random schedule (one way, both ways,
 * repeated, passed on, crossed), some with one device set back to an
 * earlier copy of itself. Every conflict is decided by a fixed rule per
 * device. The oracle tracks the true history in the harness, never the
 * clocks: which edits each device has seen, and which decisions were
 * made. A failing run throws with its seed and its operation trace.
 */
import { describe, expect, it } from 'vitest'
import { NOW, household } from '../test/households.ts'
import {
  copyOf,
  fileOf,
  idOf,
  ledgerText,
  newDevice,
  setBack,
  type Copy,
  type Device,
} from '../test/devices.ts'
import { applyImport, prepareImport } from './exchange.ts'
import {
  MemberInUseError,
  addMember,
  createHousehold,
  deleteExpense,
  deleteMember,
  deleteSettlement,
  getDeviceIds,
  getHousehold,
  getVersion,
  listExpenses,
  listMembers,
  listSettlements,
  renameHousehold,
  renameMember,
  saveExpense,
  saveSettlement,
  setMemberLeft,
} from './repository.ts'
import { compare, dominates, type Clock } from './versions.ts'
import { STORE, result, transaction } from './db.ts'
import type { SettleFile } from '../features/exchange/format.ts'
import {
  conflictKey,
  planImport,
  resolveImport,
  type Choice,
  type PlanItem,
  type Side,
} from '../features/exchange/merge.ts'
import { crowdedDay } from '../features/exchange/readFile.ts'
import { balances } from '../features/household/balances.ts'
import {
  RECORD_VERSION,
  type Expense,
  type Member,
  type Settlement,
} from '../features/household/model.ts'
import { cents } from '../lib/money.ts'

const RUNS = Number(process.env.SWEEP_RUNS ?? 500)
const STEPS = 30
/** The final relay's bound: a tested target, not a proof (O-EXT-1). */
const MAX_CYCLES = 3
/** Members ever created across the three devices: far from the limits. */
const MAX_MEMBERS = 12

/** mulberry32: a small seeded generator. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Name = 'A' | 'B' | 'C'
const NAMES: Name[] = ['A', 'B', 'C']

/** One event of the true history: an edit, a decision, or a kept member. */
interface Event {
  id: string
  record: string
  /** The content marker it leaves, or `deleted`. */
  content: string
  /** Every event of the record its device had seen when it happened. */
  saw: Set<string>
  device: Name
  /**
   * Protected from silent loss: a change, or a "Keep mine" (never reversed
   * without a new conflict). A "Use theirs" or a kept member only justify
   * the content they hold.
   */
  guarded: boolean
  /** For an edit of the set-back device after its set-back. */
  afterSetBack?: boolean
  reused?: boolean
  knownLimit?: boolean
  /** The count this edit issued under the device's id then. */
  count?: { deviceId: string; value: number }
}

class Fail extends Error {}

/**
 * A device's fixed decision rule (the plan's sweep): A always keeps its
 * own, B always uses theirs, C alternates by record id.
 */
function rule(name: Name, id: string): Choice {
  if (name === 'A') return 'mine'
  if (name === 'B') return 'theirs'
  const sum = [...id].reduce((total, c) => total + c.charCodeAt(0), 0)
  return sum % 2 === 0 ? 'mine' : 'theirs'
}

function sideContent(side: Side, kind: string): string {
  if (side.type === 'deletion') return 'deleted'
  if (side.type === 'none') return 'absent'
  const record = side.record as unknown as Record<string, unknown>
  if (kind === 'expense') return String(record.description)
  if (kind === 'settlement') return String(record.note)
  return String(record.name)
}

interface World {
  rng: () => number
  devices: Record<Name, Device>
  /** The ids each device has seen. */
  knows: Record<Name, Set<string>>
  events: Map<string, Event>
  byRecord: Map<string, string[]>
  kinds: Map<string, 'household' | 'member' | 'expense' | 'settlement'>
  counter: number
  members: number
  trace: string[]
  setBackDevice?: Name
  /** Counts issued before the set-back, per `deviceId/record`. */
  issuedBefore: Map<string, number>
  /** Pre-restore edits of the set-back device, lost by the set-back. */
  preRestore: Set<string>
  /** Conflicts shown on the set-back device, by content marker. */
  shownOnSetBack: Set<string>
  idChangesWithoutSetBack: number
  decisions: number
  /** The equal-clock history generated on purpose (M-I-1). */
  equalOnPurpose: number
}

function pick<T>(world: World, list: readonly T[]): T {
  const value = list[Math.floor(world.rng() * list.length)]
  if (value === undefined) throw new Error('empty list')
  return value
}

function marker(world: World, prefix: string): string {
  world.counter++
  return `${prefix}${world.counter}`
}

function addEvent(world: World, event: Event, knowers: Name[]) {
  world.events.set(event.id, event)
  const list = world.byRecord.get(event.record) ?? []
  list.push(event.id)
  world.byRecord.set(event.record, list)
  for (const name of knowers) world.knows[name].add(event.id)
}

function seen(world: World, name: Name, record: string): Set<string> {
  return new Set(
    (world.byRecord.get(record) ?? []).filter((id) =>
      world.knows[name].has(id),
    ),
  )
}

/** Records one edit by `name`, with its count under the current id. */
async function recordEdit(
  world: World,
  name: Name,
  record: string,
  content: string,
) {
  const device = world.devices[name]
  const deviceId = await idOf(device)
  const value = (await getVersion(device.db, record))?.clock[deviceId] ?? 0
  const event: Event = {
    id: `${name}:${content}:${world.counter++}`,
    record,
    content,
    saw: seen(world, name, record),
    device: name,
    guarded: true,
    count: { deviceId, value },
  }
  if (world.setBackDevice === name) {
    event.afterSetBack = true
    const before = world.issuedBefore.get(`${deviceId}/${record}`) ?? 0
    if (value <= before) event.reused = true
    // A pre-restore edit this count equals or passes is a known-limit
    // edit: E6's known limit, widened from "passes" by the user's decisions
    // of 2026-10-11 after the sweep's seeds 45 and 39. At an equal count,
    // once another phone has built on one of the two versions, either can
    // replace the other without a question: the pre-restore edit (seed 45)
    // or this post-restore one (seed 39). Both are counted.
    for (const id of world.preRestore) {
      const pre = world.events.get(id)
      if (
        pre !== undefined &&
        pre.record === record &&
        pre.count?.deviceId === deviceId &&
        value >= pre.count.value
      ) {
        pre.knownLimit = true
        if (value === pre.count.value) event.knownLimit = true
      }
    }
  }
  addEvent(world, event, [name])
  world.trace.push(`${name} edits ${record} -> ${content}`)
}

async function state(device: Device) {
  const members = (await listMembers(device.db, 'h1')).items
  const expenses = await listExpenses(device.db, 'h1')
  const settlements = await listSettlements(device.db, 'h1')
  return { members, expenses, settlements }
}

/** One random edit on one device. */
async function randomEdit(world: World, name: Name) {
  const device = world.devices[name]
  const { members, expenses, settlements } = await state(device)
  const active = members.filter((m) => m.leftOn === undefined)
  const roll = world.rng()
  if (roll < 0.12 || expenses.items.length < 3) {
    if (active.length < 2) return
    const content = marker(world, 'E')
    const people = active.slice(0, 1 + Math.floor(world.rng() * active.length))
    const expense: Expense = {
      v: RECORD_VERSION,
      id: `x-${content}`,
      householdId: 'h1',
      description: content,
      date: '2026-10-01',
      category: 'groceries',
      payerId: pick(world, active).id,
      split: {
        kind: 'equal',
        amount: cents(100 + Math.floor(world.rng() * 9000)),
        memberIds: people.map((m) => m.id),
      },
      createdAt: NOW,
      updatedAt: NOW,
    }
    await saveExpense(device.db, expense)
    await recordEdit(world, name, expense.id, content)
    world.kinds.set(expense.id, 'expense')
  } else if (roll < 0.42) {
    const target = pick(world, expenses.items)
    const content = marker(world, 'E')
    await saveExpense(device.db, { ...target, description: content }, [], {
      replacing: true,
    })
    await recordEdit(world, name, target.id, content)
  } else if (roll < 0.55) {
    const target = pick(world, expenses.items)
    await deleteExpense(device.db, target.id)
    await recordEdit(world, name, target.id, 'deleted')
  } else if (roll < 0.65 && active.length >= 2) {
    const content = marker(world, 'P')
    const [from, to] = [pick(world, active), pick(world, active)]
    if (from.id === to.id) return
    const payment: Settlement = {
      v: RECORD_VERSION,
      id: `p-${content}`,
      householdId: 'h1',
      fromId: from.id,
      toId: to.id,
      amount: cents(100 + Math.floor(world.rng() * 5000)),
      date: '2026-10-02',
      note: content,
      createdAt: NOW,
      updatedAt: NOW,
    }
    await saveSettlement(device.db, payment)
    await recordEdit(world, name, payment.id, content)
    world.kinds.set(payment.id, 'settlement')
  } else if (roll < 0.72 && settlements.items.length > 0) {
    const target = pick(world, settlements.items)
    if (world.rng() < 0.5) {
      const content = marker(world, 'P')
      await saveSettlement(
        device.db,
        { ...target, note: content },
        {
          replacing: true,
        },
      )
      await recordEdit(world, name, target.id, content)
    } else {
      await deleteSettlement(device.db, target.id)
      await recordEdit(world, name, target.id, 'deleted')
    }
  } else if (roll < 0.8 && world.members < MAX_MEMBERS) {
    const content = marker(world, 'N')
    const id = `m-${content}`
    world.members++
    await addMember(device.db, {
      v: RECORD_VERSION,
      id,
      householdId: 'h1',
      name: content,
      joinedOn: '2026-01-01',
    })
    await recordEdit(world, name, id, content)
    world.kinds.set(id, 'member')
  } else if (roll < 0.9 && members.length > 0) {
    const target = pick(world, members)
    const content = marker(world, 'N')
    // A rename, sometimes with a leaving date.
    if (world.rng() < 0.3) {
      await setMemberLeft(device.db, 'h1', target.id, '2026-12-31')
    }
    await renameMember(device.db, 'h1', target.id, content)
    await recordEdit(world, name, target.id, content)
  } else if (roll < 0.95 && members.length > 0) {
    const target = pick(world, members)
    try {
      await deleteMember(device.db, 'h1', target.id)
      await recordEdit(world, name, target.id, 'deleted')
    } catch (error) {
      if (!(error instanceof MemberInUseError)) throw error
    }
  } else {
    const content = marker(world, 'H')
    await renameHousehold(device.db, 'h1', content, NOW)
    await recordEdit(world, name, 'h1', content)
  }
}

interface Built {
  from: Name
  file: SettleFile
  knows: Set<string>
}

async function build(world: World, from: Name): Promise<Built> {
  return {
    from,
    file: await fileOf(world.devices[from]),
    knows: new Set(world.knows[from]),
  }
}

async function recordsAndVersions(device: Device) {
  const copy = await copyOf(device)
  delete copy[STORE.meta]
  return copy
}

/** Opens a built file on `to`, deciding by `to`'s rule, with the checks. */
async function open(world: World, to: Name, built: Built): Promise<number> {
  const device = world.devices[to]
  const before = await recordsAndVersions(device)
  const preview = await prepareImport(device.db, built.file)
  const plan = planImport(built.file, preview.local, preview.newDeviceId)
  const choices: Record<string, Choice> = {}
  const decided: { item: PlanItem; choice: Choice }[] = []
  for (const item of plan.households.flatMap((h) => h.items)) {
    if (item.classification === 'leftOutUnreadable') {
      throw new Fail(`unexpected left-out id ${item.id}`)
    }
    if (item.classification !== 'conflict') continue
    // Without a restore, no file counts higher under an own id (E6's
    // premise; local review of revision 7, O3): no gone-back conflict.
    if (item.cause === 'goneBack' && world.setBackDevice === undefined) {
      throw new Fail(`a gone-back conflict on ${item.id} without a set-back`)
    }
    const choice = rule(to, item.id)
    choices[conflictKey('h1', item.id)] = choice
    decided.push({ item, choice })
    if (world.setBackDevice === to) {
      world.shownOnSetBack.add(sideContent(item.mine, item.kind))
      world.shownOnSetBack.add(sideContent(item.theirs, item.kind))
    }
  }
  const resolution = resolveImport(plan, choices)
  if (!resolution.canApply) throw new Fail('Apply blocked')
  await applyImport(device.db, built.file, preview, choices)
  if (plan.changesDeviceId && world.setBackDevice === undefined) {
    world.idChangesWithoutSetBack++
  }
  world.trace.push(
    `${built.from} -> ${to}: ${decided.length} decided${plan.changesDeviceId ? ', new id' : ''}`,
    ...decided.map(
      ({ item, choice }) =>
        `  ${item.id} ${item.cause ?? ''}: ${sideContent(item.mine, item.kind)} ${JSON.stringify(item.mine.type === 'none' ? {} : item.mine.clock)} vs ${sideContent(item.theirs, item.kind)} ${JSON.stringify(item.theirs.type === 'none' ? {} : item.theirs.clock)} -> ${choice}`,
    ),
  )

  // A file older than this device's copy never changes anything.
  if ([...built.knows].every((id) => world.knows[to].has(id))) {
    const after = await recordsAndVersions(device)
    if (JSON.stringify(after) !== JSON.stringify(before)) {
      throw new Fail(`${to}: an older file changed something`)
    }
  }

  // Knowledge merges; each decision and kept member is an event.
  for (const id of built.knows) world.knows[to].add(id)
  for (const { item, choice } of decided) {
    world.decisions++
    const side = choice === 'mine' ? item.mine : item.theirs
    const content = sideContent(side, item.kind)
    addEvent(
      world,
      {
        id: `${to}:decide:${world.counter++}`,
        record: item.id,
        content,
        saw: seen(world, to, item.id),
        device: to,
        guarded: choice === 'mine',
      },
      [to],
    )
    // Every decision makes causal progress (local review of rev. 6, I1).
    const written: Clock = (await getVersion(device.db, item.id))?.clock ?? {}
    const mine = item.mine.type === 'none' ? {} : item.mine.clock
    const theirs = item.theirs.type === 'none' ? {} : item.theirs.clock
    const notTaken = choice === 'mine' ? theirs : mine
    if (
      !dominates(written, mine) ||
      !dominates(written, theirs) ||
      compare(written, notTaken) !== 'newer'
    ) {
      throw new Fail(`no causal progress on ${item.id}`)
    }
  }
  for (const household of resolution.households) {
    for (const kept of household.keptForReferences) {
      addEvent(
        world,
        {
          id: `${to}:kept:${world.counter++}`,
          record: kept.memberId,
          content: kept.name,
          saw: seen(world, to, kept.memberId),
          device: to,
          guarded: false,
        },
        [to],
      )
    }
  }

  await checkDevice(world, to)
  return decided.length
}

/** What a device holds for a record: its marker, `deleted` or `absent`. */
async function contentOn(
  world: World,
  device: Device,
  record: string,
): Promise<string> {
  const kind = world.kinds.get(record)
  if (kind === 'household') {
    return (await getHousehold(device.db, 'h1'))?.name ?? 'absent'
  }
  const version = await getVersion(device.db, record)
  if (version?.deletedAt !== undefined) return 'deleted'
  if (kind === 'member') {
    const member = (await listMembers(device.db, 'h1')).items.find(
      (m) => m.id === record,
    )
    return member?.name ?? 'absent'
  }
  if (kind === 'expense') {
    const expense = (await listExpenses(device.db, 'h1')).items.find(
      (e) => e.id === record,
    )
    return expense?.description ?? 'absent'
  }
  const payment = (await listSettlements(device.db, 'h1')).items.find(
    (s) => s.id === record,
  )
  return payment?.note ?? 'absent'
}

/** The events a device's content for a record justifies. */
function justified(world: World, name: Name, record: string, content: string) {
  const covered = new Set<string>()
  for (const id of world.byRecord.get(record) ?? []) {
    const event = world.events.get(id)
    if (event === undefined || !world.knows[name].has(id)) continue
    if (event.content !== content) continue
    covered.add(id)
    for (const before of event.saw) covered.add(before)
  }
  return covered
}

/** References, limits and no silent loss, on one device. */
async function checkDevice(world: World, name: Name) {
  const device = world.devices[name]
  const { members, expenses, settlements } = await state(device)
  if (expenses.unreadable > 0 || settlements.unreadable > 0) {
    throw new Fail(`${name}: a record names a missing member`)
  }
  if (members.length > 50 || crowdedDay(members) !== null) {
    throw new Fail(`${name}: member limits broken`)
  }
  for (const [record, ids] of world.byRecord) {
    const known = ids.filter((id) => world.knows[name].has(id))
    if (known.length === 0) continue
    const content = await contentOn(world, device, record)
    if (content === 'absent') {
      throw new Fail(`${name}: ${record} is gone without a deletion`)
    }
    const covered = justified(world, name, record, content)
    for (const id of known) {
      const event = world.events.get(id)
      if (event === undefined || !event.guarded || covered.has(id)) continue
      // Reused and known-limit edits: the set-back property checks them.
      if (event.reused === true || event.knownLimit === true) continue
      throw new Fail(`${name}: edit ${id} of ${record} silently lost`)
    }
  }
}

async function exchange(world: World, from: Name, to: Name) {
  return open(world, to, await build(world, from))
}

async function runOnce(seed: number, trace: string[]): Promise<World> {
  const rng = mulberry32(seed)
  const devices = {
    A: await newDevice('A'),
    B: await newDevice('B'),
    C: await newDevice('C'),
  }
  const world: World = {
    rng,
    devices,
    knows: { A: new Set(), B: new Set(), C: new Set() },
    events: new Map(),
    byRecord: new Map(),
    kinds: new Map([['h1', 'household']]),
    counter: 0,
    members: 4,
    trace,
    issuedBefore: new Map(),
    preRestore: new Set(),
    shownOnSetBack: new Set(),
    idChangesWithoutSetBack: 0,
    decisions: 0,
    equalOnPurpose: 0,
  }
  const start: Member[] = ['ana', 'marta', 'joao', 'tiago'].map((id, i) => ({
    v: RECORD_VERSION,
    id: `m-${id}`,
    householdId: 'h1',
    name: `N0${i}`,
    position: i,
    joinedOn: '2026-01-01',
  }))
  await createHousehold(devices.A.db, household('h1', 'H0'), start)
  for (const [i, m] of start.entries()) {
    world.kinds.set(m.id, 'member')
    await recordEdit(world, 'A', m.id, `N0${i}`)
  }
  await recordEdit(world, 'A', 'h1', 'H0')
  await exchange(world, 'A', 'B')
  await exchange(world, 'A', 'C')

  const setBackRun = rng() < 0.35
  const setBackAt = Math.floor(rng() * (STEPS - 4)) + 2
  let copy: { name: Name; copy: Copy; knows: Set<string> } | undefined
  for (let step = 0; step < STEPS; step++) {
    if (setBackRun && step === setBackAt - 2 && copy === undefined) {
      const name = pick(world, NAMES)
      copy = {
        name,
        copy: await copyOf(world.devices[name]),
        knows: new Set(world.knows[name]),
      }
      world.trace.push(`copy of ${name}`)
    }
    if (setBackRun && step === setBackAt - 1 && copy !== undefined) {
      // A pre-restore edit, sent on, for the equal clock made on purpose
      // after the set-back (M-I-1).
      const { name } = copy
      const { items } = await listExpenses(world.devices[name].db, 'h1')
      const target = items[0]
      if (target !== undefined) {
        const content = marker(world, 'E')
        await saveExpense(
          world.devices[name].db,
          { ...target, description: content },
          [],
          { replacing: true },
        )
        await recordEdit(world, name, target.id, content)
        const [other] = NAMES.filter((n) => n !== name)
        if (other !== undefined) await exchange(world, name, other)
        continue
      }
    }
    if (setBackRun && step === setBackAt && copy !== undefined) {
      await setBackDevice(world, copy)
      continue
    }
    const roll = rng()
    if (roll < 0.3) {
      await randomEdit(world, pick(world, NAMES))
    } else if (roll < 0.45) {
      // Edits on two devices before either hears of the other's.
      const [x, y] = twoOf(world)
      await randomEdit(world, x)
      await randomEdit(world, y)
    } else if (roll < 0.6) {
      const [from, to] = twoOf(world)
      await exchange(world, from, to)
    } else if (roll < 0.7) {
      const [from, to] = twoOf(world)
      await exchange(world, from, to)
      await exchange(world, to, from)
    } else if (roll < 0.77) {
      const [from, to] = twoOf(world)
      await randomEdit(world, from)
      await exchange(world, from, to)
      await randomEdit(world, from)
      await exchange(world, from, to)
    } else if (roll < 0.84) {
      await exchange(world, 'A', 'B')
      await exchange(world, 'B', 'C')
      await exchange(world, 'C', 'A')
    } else if (roll < 0.95) {
      // Crossed files: both built before either import.
      const [x, y] = twoOf(world)
      const fromX = await build(world, x)
      const fromY = await build(world, y)
      await open(world, y, fromX)
      await open(world, x, fromY)
    } else {
      // A device opens its own file: nothing changes.
      const name = pick(world, NAMES)
      const before = await copyOf(world.devices[name])
      await exchange(world, name, name)
      if (
        JSON.stringify(await copyOf(world.devices[name])) !==
        JSON.stringify(before)
      ) {
        throw new Fail(`${name}: its own file changed something`)
      }
    }
  }

  // The final relay, repeated until a whole cycle decides nothing.
  let cycles = 0
  for (;;) {
    cycles++
    let decided = 0
    decided += await exchange(world, 'A', 'B')
    decided += await exchange(world, 'B', 'C')
    decided += await exchange(world, 'C', 'A')
    if (decided === 0) break
    if (cycles >= MAX_CYCLES) {
      throw new Fail(`the final relay still decides in cycle ${cycles}`)
    }
  }
  await exchange(world, 'A', 'B')

  const texts = await Promise.all(NAMES.map((n) => ledgerText(devices[n])))
  if (texts[0] !== texts[1] || texts[1] !== texts[2]) {
    const lines = texts.map((t) => t.split('\n'))
    const at = (lines[0] ?? []).findIndex(
      (line, i) => line !== lines[1]?.[i] || line !== lines[2]?.[i],
    )
    const around = (n: number) =>
      lines.map((l) => l.slice(Math.max(0, n - 12), n + 3).join('\n'))
    throw new Fail(
      `the ledgers differ after the final relay, at line ${at}:\n${around(at).join('\n-----\n')}`,
    )
  }
  const sums = await Promise.all(
    NAMES.map(async (n) => {
      const { members, expenses, settlements } = await state(devices[n])
      const result = balances({
        members,
        expenses: expenses.items,
        settlements: settlements.items,
        unreadable: { members: 0, expenses: 0, settlements: 0 },
      })
      if (result.members.reduce((t, r) => t + r.balance, 0) !== 0) {
        throw new Fail(`${n}: balances don't sum to zero`)
      }
      return JSON.stringify(result.members)
    }),
  )
  if (new Set(sums).size !== 1) throw new Fail('balances differ')

  // The set-back property: every edit after the set-back survives, was
  // replaced by a later change or a choice, or was shown in a conflict
  // on the set-back device. Known-limit edits are E6's stated limit.
  if (world.setBackDevice !== undefined) {
    for (const event of world.events.values()) {
      if (event.afterSetBack !== true || event.knownLimit === true) continue
      const content = await contentOn(world, devices.A, event.record)
      const covered = justified(world, 'A', event.record, content)
      if (covered.has(event.id)) continue
      if (world.shownOnSetBack.has(event.content)) continue
      throw new Fail(`set-back edit ${event.id} lost without a question`)
    }
  }
  return world
}

function twoOf(world: World): [Name, Name] {
  const from = pick(world, NAMES)
  const to = pick(
    world,
    NAMES.filter((n) => n !== from),
  )
  return [from, to]
}

async function setBackDevice(
  world: World,
  copy: { name: Name; copy: Copy; knows: Set<string> },
) {
  const { name } = copy
  const device = world.devices[name]
  // Counts issued before the set-back, under each own id, per record.
  const ids = await getDeviceIds(device.db)
  const versions = await transaction(
    device.db,
    [STORE.versions],
    'readonly',
    (tx) => result(tx.objectStore(STORE.versions).getAll()),
  )
  for (const entry of versions as { id: string; clock: Clock }[]) {
    for (const own of [ids.deviceId, ...ids.formerDeviceIds]) {
      const count = entry.clock[own]
      if (count !== undefined)
        world.issuedBefore.set(`${own}/${entry.id}`, count)
    }
  }
  for (const id of world.knows[name]) {
    const event = world.events.get(id)
    if (event?.device === name && !copy.knows.has(id)) world.preRestore.add(id)
  }
  await setBack(device, copy.copy)
  world.knows[name] = new Set(copy.knows)
  world.setBackDevice = name
  world.trace.push(`${name} is set back`)

  // On purpose (M-I-1): an equal clock with different content. The
  // set-back device re-edits a record it changed before the set-back, at
  // the same count, and sends it before it hears of the first.
  const restoredId = await idOf(device)
  for (const id of world.preRestore) {
    const event = world.events.get(id)
    if (
      event === undefined ||
      event.content === 'deleted' ||
      world.kinds.get(event.record) !== 'expense' ||
      event.count?.deviceId !== restoredId
    ) {
      continue
    }
    const now =
      (await getVersion(device.db, event.record))?.clock[restoredId] ?? 0
    const expense = (await listExpenses(device.db, 'h1')).items.find(
      (e) => e.id === event.record,
    )
    // The re-edit issues exactly the count the lost edit had.
    if (expense === undefined || now + 1 !== event.count.value) continue
    const content = marker(world, 'E')
    await saveExpense(device.db, { ...expense, description: content }, [], {
      replacing: true,
    })
    await recordEdit(world, name, expense.id, content)
    world.trace.push('an equal clock, on purpose')
    world.equalOnPurpose++
    const other = pick(
      world,
      NAMES.filter((n) => n !== name),
    )
    await exchange(world, name, other)
    break
  }
}

describe('the merge, three devices, seeded (M6 plan, acceptance targets)', () => {
  it(`keeps every record and edit, and converges, over ${RUNS} runs`, async () => {
    let setBackRuns = 0
    let idChanges = 0
    let decisions = 0
    let equalOnPurpose = 0
    let knownLimit = 0
    for (let seed = 1; seed <= RUNS; seed++) {
      let world: World
      const trace: string[] = []
      try {
        world = await runOnce(seed, trace)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        throw new Error(`seed ${seed}: ${message}\n${trace.join('\n')}`, {
          cause: error,
        })
      }
      if (world.setBackDevice !== undefined) setBackRuns++
      idChanges += world.idChangesWithoutSetBack
      decisions += world.decisions
      equalOnPurpose += world.equalOnPurpose
      knownLimit += [...world.events.values()].filter(
        (event) => event.knownLimit === true,
      ).length
    }
    // Id changes without a set-back come from crossed choices (I2, O2).
    console.info(
      `merge sweep: ${RUNS} runs, ${setBackRuns} set back, ${equalOnPurpose} with an equal clock on purpose, ${knownLimit} known-limit edits, ${decisions} decisions, ${idChanges} id changes without a set-back`,
    )
    expect(equalOnPurpose).toBeGreaterThan(RUNS / 20)
    expect(setBackRuns).toBeGreaterThan(RUNS / 5)
    expect(decisions).toBeGreaterThan(RUNS)
  }, 600_000)
})
