/**
 * A test harness of devices exchanging Settle files (M6 plan, E6): each
 * device is its own IndexedDB; a file goes through the real snapshot,
 * reader, preview and Apply.
 */
import { STORE, result, transaction, type StoreName } from '../data/db.ts'
import {
  applyImport,
  prepareImport,
  snapshotHousehold,
} from '../data/exchange.ts'
import { getDeviceIds, getVersion } from '../data/repository.ts'
import type { Clock } from '../data/versions.ts'
import type { SettleFile } from '../features/exchange/format.ts'
import { readFile } from '../features/exchange/readFile.ts'
import {
  conflictKey,
  planImport,
  resolveImport,
  type Choice,
  type ImportPlan,
  type ImportResolution,
  type PlanItem,
} from '../features/exchange/merge.ts'
import { freshDb } from './households.ts'

export interface Device {
  name: string
  db: IDBDatabase
}

export async function newDevice(name: string): Promise<Device> {
  return { name, db: await freshDb() }
}

/** The file a device would share now. */
export async function fileOf(
  device: Device,
  householdId = 'h1',
  now = '2026-10-11T12:00:00.000Z',
): Promise<SettleFile> {
  const { text } = await snapshotHousehold(device.db, householdId, now)
  const read = readFile(text)
  if (!read.ok) throw new Error(JSON.stringify(read.problems))
  return read.file
}

export type Decide = (conflict: PlanItem, householdId: string) => Choice

export const keepMine: Decide = () => 'mine'
export const useTheirs: Decide = () => 'theirs'

export interface Received {
  plan: ImportPlan
  resolution: ImportResolution
  /** The conflicts decided, by id. */
  decided: Map<string, { item: PlanItem; choice: Choice }>
}

/**
 * Opens `file` on `device`, decides every conflict with `decide`, and
 * applies it. Throws if Apply is blocked.
 */
export async function receive(
  device: Device,
  file: SettleFile,
  decide: Decide = () => {
    throw new Error('unexpected conflict')
  },
): Promise<Received> {
  const preview = await prepareImport(device.db, file)
  const plan = planImport(file, preview.local, preview.newDeviceId)
  const choices: Record<string, Choice> = {}
  const decided = new Map<string, { item: PlanItem; choice: Choice }>()
  for (const household of plan.households) {
    for (const item of household.items) {
      if (item.classification !== 'conflict') continue
      const choice = decide(item, household.householdId)
      choices[conflictKey(household.householdId, item.id)] = choice
      decided.set(item.id, { item, choice })
    }
  }
  const resolution = resolveImport(plan, choices)
  await applyImport(device.db, file, preview, choices)
  return { plan, resolution, decided }
}

/** `from` shares its household file, and `to` opens it. */
export async function send(
  from: Device,
  to: Device,
  decide?: Decide,
  householdId = 'h1',
): Promise<Received> {
  return receive(to, await fileOf(from, householdId), decide)
}

/** The classification of one id in a received file. */
export function classOf(received: Received, id: string): PlanItem | undefined {
  return received.plan.households
    .flatMap((household) => household.items)
    .find((item) => item.id === id)
}

const STORES: StoreName[] = [
  STORE.households,
  STORE.members,
  STORE.expenses,
  STORE.settlements,
  STORE.versions,
  STORE.meta,
]

/** Every raw value of every store: a copy of the device's database. */
export type Copy = Record<string, unknown[]>

export async function copyOf(device: Device): Promise<Copy> {
  return transaction(device.db, STORES, 'readonly', async (tx) => {
    const copy: Copy = {}
    for (const store of STORES) {
      copy[store] = (await result(tx.objectStore(store).getAll())) as unknown[]
    }
    return copy
  })
}

/**
 * The device's database comes back from an older copy of itself: a phone
 * restored from a device backup, with the same device id (E4).
 */
export async function setBack(device: Device, copy: Copy): Promise<void> {
  await transaction(device.db, STORES, 'readwrite', async (tx) => {
    for (const store of STORES) {
      await result(tx.objectStore(store).clear())
      for (const value of copy[store] ?? []) {
        await result(tx.objectStore(store).put(value))
      }
    }
  })
}

export async function clockOf(device: Device, id: string): Promise<Clock> {
  return (await getVersion(device.db, id))?.clock ?? {}
}

export async function idOf(device: Device): Promise<string> {
  return (await getDeviceIds(device.db)).deviceId
}

/** The device's household file text without its time: equal ledgers. */
export async function ledgerText(
  device: Device,
  householdId = 'h1',
): Promise<string> {
  const { text } = await snapshotHousehold(
    device.db,
    householdId,
    '2000-01-01T00:00:00.000Z',
  )
  return text
}
