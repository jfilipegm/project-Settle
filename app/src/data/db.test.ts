// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import fixture from './fixtures/v1.json'
import fixtureV2 from './fixtures/v2.json'
import { expenseShares } from '../features/household/shares.ts'
import { inMonth, monthOf, totalOf } from '../features/household/totals.ts'
import {
  NOW,
  freshFactory,
  getRaw,
  putRaw,
  testSchemaV3,
  withoutVersion,
} from '../test/households.ts'
import {
  MIGRATIONS,
  MigrationFailedError,
  StorageOutdatedError,
  StorageUnavailableError,
  createSchemaV1,
  createSchemaV2,
  STORE,
  openDatabase,
  result,
  transaction,
  type Migration,
} from './db.ts'
import {
  listExpenses,
  listHouseholds,
  listMembers,
  listSettlements,
} from './repository.ts'

const byId = (a: unknown, b: unknown) =>
  String((a as { id: string }).id).localeCompare(
    String((b as { id: string }).id),
  )

function sorted(records: unknown[]): unknown[] {
  return [...records].sort(byId)
}

async function schemaVersion(db: IDBDatabase): Promise<unknown> {
  const tx = db.transaction('meta')
  return result(tx.objectStore('meta').get('schema'))
}

/** A database as M4 left it: version 1, holding the frozen snapshot. */
async function v1WithFixture(factory: IDBFactory): Promise<void> {
  const db = await openDatabase(factory, {
    migrations: [createSchemaV1],
    now: () => NOW,
  })
  expect(db.version).toBe(1)
  await putRaw(db, fixture)
  db.close()
}

/** Each expense's derived shares, and each month's total (H5). */
async function derived(db: IDBDatabase) {
  const { items } = await listExpenses(db, 'h1')
  return {
    shares: [...items]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((expense) => [expense.id, [...(expenseShares(expense) ?? [])]]),
    totals: [...new Set(items.map((e) => monthOf(e.date)))]
      .sort()
      .map((month) => [month, totalOf(inMonth(items, month))]),
  }
}

describe('the database and its migrations (H2, M5 B3)', () => {
  it('creates version 2 fresh, with its stores and schema record', async () => {
    const db = await openDatabase(freshFactory(), { now: () => NOW })
    expect(MIGRATIONS).toEqual([createSchemaV1, createSchemaV2])
    expect(db.version).toBe(2)
    expect([...db.objectStoreNames].sort()).toEqual([
      'expenses',
      'households',
      'members',
      'meta',
      'settlements',
    ])
    expect([
      ...db.transaction('settlements').objectStore('settlements').indexNames,
    ]).toEqual(['byHousehold'])
    expect(await schemaVersion(db)).toEqual({
      key: 'schema',
      version: 2,
      migratedAt: NOW,
    })
    db.close()
  })

  it('reads the frozen version-1 snapshot back equal', async () => {
    const factory = freshFactory()
    await v1WithFixture(factory)
    const db = await openDatabase(factory)
    const households = await listHouseholds(db)
    expect(households.unreadable).toBe(0)
    expect(sorted(households.items)).toEqual(sorted(fixture.households))
    const members = await listMembers(db, 'h1')
    expect(sorted(members.items)).toEqual(
      sorted(fixture.members.filter((m) => m.householdId === 'h1')),
    )
    const expenses = await listExpenses(db, 'h1')
    expect(expenses.unreadable).toBe(0)
    expect(sorted(expenses.items)).toEqual(sorted(fixture.expenses))
    db.close()
  })

  it('reads the frozen version-2 snapshot back equal, payments included', async () => {
    const db = await openDatabase(freshFactory())
    await putRaw(db, fixtureV2)
    const expenses = await listExpenses(db, 'h1')
    expect(sorted(expenses.items)).toEqual(sorted(fixtureV2.expenses))
    const settlements = await listSettlements(db, 'h1')
    expect(settlements.unreadable).toBe(0)
    expect(sorted(settlements.items)).toEqual(sorted(fixtureV2.settlements))
    expect((await listSettlements(db, 'h2')).items).toEqual([])
    db.close()
  })

  it('upgrades an empty version-1 database to version 2', async () => {
    const factory = freshFactory()
    const v1 = await openDatabase(factory, { migrations: [createSchemaV1] })
    v1.close()
    const db = await openDatabase(factory, { now: () => NOW })
    expect(db.version).toBe(2)
    expect(db.objectStoreNames.contains('settlements')).toBe(true)
    expect(await schemaVersion(db)).toMatchObject({ version: 2 })
    expect(await getRaw(db)).toEqual({
      households: [],
      members: [],
      expenses: [],
      settlements: [],
    })
    db.close()
  })

  it('upgrades version 1 to version 2 keeping every record byte for byte', async () => {
    const factory = freshFactory()
    await v1WithFixture(factory)
    const before = await openDatabase(factory, { migrations: [createSchemaV1] })
    const rawBefore = await getRaw(before)
    const derivedBefore = await derived(before)
    before.close()

    const db = await openDatabase(factory, { now: () => NOW })
    expect(db.version).toBe(2)
    const raw = await getRaw(db)
    // Nothing rewritten: the very records version 1 stored.
    expect(sorted(raw.households)).toEqual(sorted(rawBefore.households))
    expect(sorted(raw.members)).toEqual(sorted(rawBefore.members))
    expect(sorted(raw.expenses)).toEqual(sorted(rawBefore.expenses))
    expect(sorted(raw.expenses)).toEqual(sorted(fixture.expenses))
    expect(raw.settlements).toEqual([])
    expect(await derived(db)).toEqual(derivedBefore)
    expect(await schemaVersion(db)).toMatchObject({ version: 2 })
    db.close()
  })

  it('upgrades version 2 to a test-only version 3, every record intact', async () => {
    const factory = freshFactory()
    const v2 = await openDatabase(factory)
    await putRaw(v2, fixtureV2)
    v2.close()
    const db = await openDatabase(factory, {
      migrations: [...MIGRATIONS, testSchemaV3],
      now: () => NOW,
    })
    expect(db.version).toBe(3)
    expect([
      ...db.transaction('expenses').objectStore('expenses').indexNames,
    ]).toContain('byDate')
    const raw = await getRaw(db)
    for (const store of ['households', 'members', 'expenses'] as const) {
      expect(raw[store].every((r) => (r as { v: number }).v === 2)).toBe(true)
      expect(sorted(withoutVersion(raw[store]))).toEqual(
        sorted(withoutVersion(fixtureV2[store])),
      )
    }
    expect(sorted(raw.settlements ?? [])).toEqual(sorted(fixtureV2.settlements))
    expect(await schemaVersion(db)).toMatchObject({ version: 3 })
    db.close()
  })

  it('rolls back a failing version-2 step: the version-1 data is unchanged', async () => {
    const factory = freshFactory()
    await v1WithFixture(factory)
    const failing: Migration = (db, tx) => {
      createSchemaV2(db, tx)
      throw new Error('step failed')
    }
    await expect(
      openDatabase(factory, { migrations: [createSchemaV1, failing] }),
    ).rejects.toBeInstanceOf(MigrationFailedError)
    const db = await openDatabase(factory, { migrations: [createSchemaV1] })
    expect(db.version).toBe(1)
    expect(db.objectStoreNames.contains('settlements')).toBe(false)
    const raw = await getRaw(db)
    expect(sorted(raw.households)).toEqual(sorted(fixture.households))
    expect(sorted(raw.members)).toEqual(sorted(fixture.members))
    expect(sorted(raw.expenses)).toEqual(sorted(fixture.expenses))
    expect(await schemaVersion(db)).toMatchObject({ version: 1 })
    db.close()
  })

  it('refuses a database newer than the code (another tab updated)', async () => {
    const factory = freshFactory()
    const newer = await openDatabase(factory, {
      migrations: [...MIGRATIONS, testSchemaV3],
    })
    newer.close()
    await expect(openDatabase(factory)).rejects.toBeInstanceOf(
      StorageOutdatedError,
    )
  })

  it('closes on versionchange when a newer version opens elsewhere', async () => {
    const factory = freshFactory()
    const onVersionChange = vi.fn()
    const old = await openDatabase(factory, {
      migrations: [createSchemaV1],
      onVersionChange,
    })
    const newer = await openDatabase(factory)
    expect(onVersionChange).toHaveBeenCalledOnce()
    expect(() => old.transaction('households')).toThrow()
    newer.close()
  })

  it('reports storage unavailable without IndexedDB (H3)', async () => {
    await expect(openDatabase(undefined)).rejects.toBeInstanceOf(
      StorageUnavailableError,
    )
  })
})

describe('transactions', () => {
  it('rolls back everything when a request fails, even one the body never awaited', async () => {
    const db = await openDatabase(freshFactory())
    await transaction(db, [STORE.meta], 'readwrite', (tx) =>
      result(tx.objectStore(STORE.meta).add({ key: 'a' })),
    )
    const run = transaction(db, [STORE.meta], 'readwrite', async (tx) => {
      const meta = tx.objectStore(STORE.meta)
      // Not awaited: the duplicate key fails after the body has resolved.
      meta.add({ key: 'a' }).onerror = () => undefined
      await result(meta.put({ key: 'b' }))
    })
    await expect(run).rejects.toMatchObject({ name: 'ConstraintError' })
    const kept: unknown = await transaction(
      db,
      [STORE.meta],
      'readonly',
      (tx) => result(tx.objectStore(STORE.meta).get('b')),
    )
    expect(kept).toBeUndefined()
    db.close()
  })
})
