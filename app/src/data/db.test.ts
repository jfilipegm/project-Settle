// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import fixture from './fixtures/v1.json'
import {
  NOW,
  freshFactory,
  getRaw,
  putRaw,
  testSchemaV2,
  withoutVersion,
} from '../test/households.ts'
import {
  MIGRATIONS,
  MigrationFailedError,
  StorageOutdatedError,
  StorageUnavailableError,
  createSchemaV1,
  openDatabase,
  result,
  type Migration,
} from './db.ts'
import { listExpenses, listHouseholds, listMembers } from './repository.ts'

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

async function v1WithFixture(factory: IDBFactory): Promise<void> {
  const db = await openDatabase(factory, { now: () => NOW })
  await putRaw(db, fixture)
  db.close()
}

describe('the database and its migrations (H2)', () => {
  it('creates version 1 fresh, with its stores and schema record', async () => {
    const db = await openDatabase(freshFactory(), { now: () => NOW })
    expect(db.version).toBe(MIGRATIONS.length)
    expect([...db.objectStoreNames].sort()).toEqual([
      'expenses',
      'households',
      'members',
      'meta',
    ])
    expect(await schemaVersion(db)).toEqual({
      key: 'schema',
      version: 1,
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

  it('upgrades version 1 to a test-only version 2, every record intact', async () => {
    const factory = freshFactory()
    await v1WithFixture(factory)
    const db = await openDatabase(factory, {
      migrations: [createSchemaV1, testSchemaV2],
      now: () => NOW,
    })
    expect(db.version).toBe(2)
    expect([
      ...db.transaction('expenses').objectStore('expenses').indexNames,
    ]).toContain('byDate')
    const raw = await getRaw(db)
    for (const store of ['households', 'members', 'expenses'] as const) {
      expect(raw[store].every((r) => (r as { v: number }).v === 2)).toBe(true)
      expect(sorted(withoutVersion(raw[store]))).toEqual(
        sorted(withoutVersion(fixture[store])),
      )
    }
    expect(await schemaVersion(db)).toMatchObject({ version: 2 })
    db.close()
  })

  it('rolls back a failing step: the version-1 data is unchanged', async () => {
    const factory = freshFactory()
    await v1WithFixture(factory)
    const failing: Migration = () => {
      throw new Error('step failed')
    }
    await expect(
      openDatabase(factory, { migrations: [createSchemaV1, failing] }),
    ).rejects.toBeInstanceOf(MigrationFailedError)
    const db = await openDatabase(factory)
    expect(db.version).toBe(1)
    const raw = await getRaw(db)
    expect(sorted(raw.expenses)).toEqual(sorted(fixture.expenses))
    db.close()
  })

  it('refuses a database newer than the code (another tab updated)', async () => {
    const factory = freshFactory()
    const newer = await openDatabase(factory, {
      migrations: [createSchemaV1, testSchemaV2],
    })
    newer.close()
    await expect(openDatabase(factory)).rejects.toBeInstanceOf(
      StorageOutdatedError,
    )
  })

  it('closes on versionchange when a newer version opens elsewhere', async () => {
    const factory = freshFactory()
    const onVersionChange = vi.fn()
    const old = await openDatabase(factory, { onVersionChange })
    const newer = await openDatabase(factory, {
      migrations: [createSchemaV1, testSchemaV2],
    })
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
