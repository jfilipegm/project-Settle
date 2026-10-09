/**
 * Test helpers for the household ledger (M4): record builders and a fresh,
 * isolated IndexedDB per test (fake-indexeddb, H17).
 */
import { IDBFactory } from 'fake-indexeddb'
import { openDatabase, type Migration } from '../data/db.ts'
import {
  RECORD_VERSION,
  type Expense,
  type Household,
  type Member,
  type QuickSplit,
} from '../features/household/model.ts'
import { cents } from '../lib/money.ts'

export const NOW = '2026-10-09T12:00:00.000Z'
export const TODAY = '2026-10-09'

/** A fresh IndexedDB factory: no database shared between tests. */
export function freshFactory(): IDBFactory {
  return new IDBFactory()
}

export async function freshDb(
  factory: IDBFactory = freshFactory(),
  migrations?: readonly Migration[],
): Promise<IDBDatabase> {
  return openDatabase(factory, { migrations, now: () => NOW })
}

export function household(
  id = 'h1',
  name = 'Rua das Flores 12',
  extra: Partial<Household> = {},
): Household {
  return {
    v: RECORD_VERSION,
    id,
    name,
    createdAt: NOW,
    updatedAt: NOW,
    ...extra,
  }
}

export function member(
  id: string,
  name: string,
  position: number,
  extra: Partial<Member> = {},
): Member {
  return {
    v: RECORD_VERSION,
    id,
    householdId: 'h1',
    name,
    position,
    joinedOn: '2026-01-01',
    ...extra,
  }
}

/** Ana, Marta, João and Tiago in household h1. */
export function fourMembers(): Member[] {
  return [
    member('ana', 'Ana', 0),
    member('marta', 'Marta', 1),
    member('joao', 'João', 2),
    member('tiago', 'Tiago', 3),
  ]
}

export function quickExpense(
  id: string,
  split: QuickSplit,
  extra: Partial<Expense> = {},
): Expense {
  return {
    v: RECORD_VERSION,
    id,
    householdId: 'h1',
    description: 'Groceries',
    date: '2026-10-01',
    category: 'groceries',
    payerId: 'ana',
    split,
    createdAt: NOW,
    updatedAt: NOW,
    ...extra,
  }
}

export function equalSplit(amount: number, memberIds: string[]): QuickSplit {
  return { kind: 'equal', amount: cents(amount), memberIds }
}

export interface RawRecords {
  households: unknown[]
  members: unknown[]
  expenses: unknown[]
}

/** Puts raw records straight into the stores, as an older app wrote them. */
export async function putRaw(
  db: IDBDatabase,
  records: RawRecords,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(
      ['households', 'members', 'expenses'],
      'readwrite',
    )
    for (const record of records.households)
      tx.objectStore('households').put(record)
    for (const record of records.members) tx.objectStore('members').put(record)
    for (const record of records.expenses)
      tx.objectStore('expenses').put(record)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('putRaw failed'))
  })
}

/** Every raw record of the three stores, by store, sorted by id. */
export async function getRaw(db: IDBDatabase): Promise<RawRecords> {
  const all = (store: string) =>
    new Promise<unknown[]>((resolve, reject) => {
      const request = db.transaction(store).objectStore(store).getAll()
      request.onsuccess = () => resolve(request.result as unknown[])
      request.onerror = () =>
        reject(request.error ?? new Error('getRaw failed'))
    })
  return {
    households: await all('households'),
    members: await all('members'),
    expenses: await all('expenses'),
  }
}

/**
 * The test-only version-2 step (H2, R2-O1): a new index, and every record
 * rewritten from `v: 1` to `v: 2` with the same content.
 */
export const testSchemaV2: Migration = (_db, tx) => {
  tx.objectStore('expenses').createIndex('byDate', 'date')
  for (const store of ['households', 'members', 'expenses']) {
    const request = tx.objectStore(store).openCursor()
    request.onsuccess = () => {
      const cursor = request.result
      if (cursor === null) return
      cursor.update({ ...(cursor.value as object), v: 2 })
      cursor.continue()
    }
  }
}

/** A record without its format version, to compare content across versions. */
export function withoutVersion(records: unknown[]): unknown[] {
  return records.map((record) => {
    const rest = { ...(record as Record<string, unknown>) }
    delete rest.v
    return rest
  })
}
