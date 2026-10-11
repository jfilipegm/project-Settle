// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  NOW,
  TODAY,
  equalSplit,
  fourMembers,
  freshDb,
  getRaw,
  household,
  putRaw,
  quickExpense,
  settlement,
} from '../test/households.ts'
import { META, STORE, result, transaction } from './db.ts'
import {
  ExpenseNotFoundError,
  InvalidRecordError,
  MemberLimitError,
  MemberNotFoundError,
  MissingReferenceError,
  SettlementNotFoundError,
  VersionEntryError,
  addMember,
  createHousehold,
  deleteExpense,
  deleteMember,
  deleteSettlement,
  getBackupStatus,
  getDeviceIds,
  getVersion,
  recordBackup,
  renameHousehold,
  renameMember,
  saveExpense,
  saveSettlement,
  setHouseholdArchived,
  setMemberLeft,
} from './repository.ts'
import { ClockOverflowError, MAX_COUNT } from './versions.ts'

async function seeded() {
  const db = await freshDb()
  await createHousehold(db, household(), fourMembers())
  return db
}

async function clockOf(db: IDBDatabase, id: string) {
  return (await getVersion(db, id))?.clock
}

describe('every write bumps its record clock (M6 plan, E4)', () => {
  it('creates a household and its members at count 1 for this device', async () => {
    const db = await seeded()
    const { deviceId } = await getDeviceIds(db)
    expect(await getVersion(db, 'h1')).toEqual({
      id: 'h1',
      kind: 'household',
      householdId: 'h1',
      clock: { [deviceId]: 1 },
    })
    expect(await getVersion(db, 'ana')).toEqual({
      id: 'ana',
      kind: 'member',
      householdId: 'h1',
      clock: { [deviceId]: 1 },
    })
  })

  it('bumps on rename, archive, member changes, saves and deletes', async () => {
    const db = await seeded()
    const { deviceId: d } = await getDeviceIds(db)
    await renameHousehold(db, 'h1', 'Casa', NOW)
    await setHouseholdArchived(db, 'h1', NOW, NOW)
    expect(await clockOf(db, 'h1')).toEqual({ [d]: 3 })

    await renameMember(db, 'h1', 'ana', 'Ana S.')
    await setMemberLeft(db, 'h1', 'ana', '2026-09-30')
    expect(await clockOf(db, 'ana')).toEqual({ [d]: 3 })

    await addMember(db, {
      v: 1,
      id: 'rui',
      householdId: 'h1',
      name: 'Rui',
      joinedOn: TODAY,
    })
    expect(await clockOf(db, 'rui')).toEqual({ [d]: 1 })

    const expense = quickExpense('e1', equalSplit(1000, ['ana', 'marta']))
    await saveExpense(db, expense, [
      { v: 1, id: 'bea', householdId: 'h1', name: 'Bea', joinedOn: TODAY },
    ])
    expect(await clockOf(db, 'e1')).toEqual({ [d]: 1 })
    expect(await clockOf(db, 'bea')).toEqual({ [d]: 1 })
    await saveExpense(db, { ...expense, description: 'Rent' }, [], {
      replacing: true,
    })
    expect(await clockOf(db, 'e1')).toEqual({ [d]: 2 })

    await saveSettlement(db, settlement('s1', 'ana', 'marta', 500))
    await saveSettlement(db, settlement('s1', 'ana', 'marta', 600), {
      replacing: true,
    })
    expect(await clockOf(db, 's1')).toEqual({ [d]: 2 })
  })

  it('adds to a clock that holds other devices', async () => {
    const db = await seeded()
    const { deviceId: d } = await getDeviceIds(db)
    await putRaw(db, {
      households: [],
      members: [],
      expenses: [quickExpense('e1', equalSplit(1000, ['ana']))],
      versions: [
        { id: 'e1', kind: 'expense', householdId: 'h1', clock: { other: 4 } },
      ],
    })
    await saveExpense(db, quickExpense('e1', equalSplit(2000, ['ana'])), [], {
      replacing: true,
    })
    expect(await clockOf(db, 'e1')).toEqual({ other: 4, [d]: 1 })
  })

  it('leaves the clock untouched when the write is refused', async () => {
    const db = await seeded()
    const before = await getRaw(db)
    await expect(
      saveExpense(db, quickExpense('e1', equalSplit(1000, ['nobody']))),
    ).rejects.toBeInstanceOf(MissingReferenceError)
    const many = Array.from({ length: 17 }, (_, i) => ({
      v: 1 as const,
      id: `m${i}`,
      householdId: 'h1',
      name: `M${i}`,
      joinedOn: TODAY,
    }))
    await expect(
      saveExpense(db, quickExpense('e2', equalSplit(1000, ['ana'])), many),
    ).rejects.toBeInstanceOf(MemberLimitError)
    expect(await getRaw(db)).toEqual(before)
    expect(await getVersion(db, 'e1')).toBeNull()
    expect(await getVersion(db, 'm0')).toBeNull()
  })

  it('refuses a write whose version entry is damaged or of another kind', async () => {
    const db = await seeded()
    await putRaw(db, {
      households: [],
      members: [],
      expenses: [],
      versions: [
        { id: 'e1', kind: 'expense', householdId: 'h1', clock: { a: 0 } },
        { id: 'e2', kind: 'member', householdId: 'h1', clock: { a: 1 } },
      ],
    })
    for (const id of ['e1', 'e2']) {
      await expect(
        saveExpense(db, quickExpense(id, equalSplit(1000, ['ana']))),
      ).rejects.toBeInstanceOf(VersionEntryError)
      expect(
        (await getRaw(db)).expenses.some(
          (e) => (e as { id: string }).id === id,
        ),
      ).toBe(false)
    }
  })

  it('refuses a bump past 2^31 as damaged data', async () => {
    const db = await seeded()
    const { deviceId: d } = await getDeviceIds(db)
    await putRaw(db, {
      households: [],
      members: [],
      expenses: [quickExpense('e1', equalSplit(1000, ['ana']))],
      versions: [
        {
          id: 'e1',
          kind: 'expense',
          householdId: 'h1',
          clock: { [d]: MAX_COUNT },
        },
      ],
    })
    await expect(
      saveExpense(db, quickExpense('e1', equalSplit(2000, ['ana'])), [], {
        replacing: true,
      }),
    ).rejects.toBeInstanceOf(ClockOverflowError)
    expect(await clockOf(db, 'e1')).toEqual({ [d]: MAX_COUNT })
  })
})

describe('the deletion log (E4)', () => {
  it('keeps a deleted record’s entry, with deletedAt and the clock bumped', async () => {
    const db = await seeded()
    const { deviceId: d } = await getDeviceIds(db)
    await saveExpense(db, quickExpense('e1', equalSplit(1000, ['ana'])))
    await saveSettlement(db, settlement('s1', 'ana', 'marta', 500))
    await deleteExpense(db, 'e1')
    await deleteSettlement(db, 's1')
    await deleteMember(db, 'h1', 'tiago')
    for (const [id, kind] of [
      ['e1', 'expense'],
      ['s1', 'settlement'],
      ['tiago', 'member'],
    ] as const) {
      const entry = await getVersion(db, id)
      expect(entry).toMatchObject({ id, kind, householdId: 'h1' })
      expect(entry?.clock).toEqual({ [d]: 2 })
      expect(entry?.deletedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    }
    const raw = await getRaw(db)
    expect(raw.expenses).toEqual([])
    expect(raw.settlements).toEqual([])
  })

  it('gives a record from before version 3 its first entry when deleted', async () => {
    const db = await seeded()
    const { deviceId: d } = await getDeviceIds(db)
    await putRaw(db, {
      households: [],
      members: [],
      expenses: [quickExpense('old', equalSplit(1000, ['ana']))],
    })
    await deleteExpense(db, 'old')
    expect(await getVersion(db, 'old')).toMatchObject({
      clock: { [d]: 1 },
      deletedAt: expect.any(String) as string,
    })
  })

  it('treats deleting a record that isn’t there as a no-op', async () => {
    const db = await seeded()
    const before = await getRaw(db)
    await deleteExpense(db, 'missing')
    await deleteSettlement(db, 'missing')
    expect(await getRaw(db)).toEqual(before)
  })

  it('never writes a deleted id again from a save', async () => {
    const db = await seeded()
    await saveExpense(db, quickExpense('e1', equalSplit(1000, ['ana'])))
    await deleteExpense(db, 'e1')
    await expect(
      saveExpense(db, quickExpense('e1', equalSplit(1000, ['ana']))),
    ).rejects.toBeInstanceOf(ExpenseNotFoundError)
    await saveSettlement(db, settlement('s1', 'ana', 'marta', 500))
    await deleteSettlement(db, 's1')
    await expect(
      saveSettlement(db, settlement('s1', 'ana', 'marta', 500)),
    ).rejects.toBeInstanceOf(SettlementNotFoundError)
    await deleteMember(db, 'h1', 'tiago')
    await expect(
      addMember(db, {
        v: 1,
        id: 'tiago',
        householdId: 'h1',
        name: 'Tiago',
        joinedOn: TODAY,
      }),
    ).rejects.toBeInstanceOf(MemberNotFoundError)
    expect((await getRaw(db)).expenses).toEqual([])
  })
})

describe('content checks in the repository (E12)', () => {
  it('refuses an expense its reader would refuse, writing nothing', async () => {
    const db = await seeded()
    const before = await getRaw(db)
    const bad = [
      quickExpense('e1', equalSplit(1000, ['ana']), { description: ' ' }),
      quickExpense('e2', equalSplit(0, ['ana'])),
      quickExpense('e3', equalSplit(1000, ['ana', 'ana'])),
      quickExpense('e4', equalSplit(1000, ['ana']), { date: '2026-02-30' }),
    ]
    for (const expense of bad) {
      await expect(saveExpense(db, expense)).rejects.toBeInstanceOf(
        InvalidRecordError,
      )
    }
    expect(await getRaw(db)).toEqual(before)
  })

  it('refuses a payment its reader would refuse, writing nothing', async () => {
    const db = await seeded()
    const before = await getRaw(db)
    for (const payment of [
      settlement('s1', 'ana', 'ana', 500),
      settlement('s2', 'ana', 'marta', 0),
      settlement('s3', 'ana', 'marta', 500, { note: '' }),
      settlement('s4', 'ana', 'marta', 500, { date: '1999-12-31' }),
    ]) {
      await expect(saveSettlement(db, payment)).rejects.toBeInstanceOf(
        InvalidRecordError,
      )
    }
    expect(await getRaw(db)).toEqual(before)
  })

  it('refuses invalid names for households and members', async () => {
    const db = await freshDb()
    await expect(
      createHousehold(db, household('h1', ' Flat'), []),
    ).rejects.toBeInstanceOf(InvalidRecordError)
    await createHousehold(db, household(), fourMembers())
    await expect(renameHousehold(db, 'h1', '', NOW)).rejects.toBeInstanceOf(
      InvalidRecordError,
    )
    await expect(
      renameMember(db, 'h1', 'ana', 'x'.repeat(61)),
    ).rejects.toBeInstanceOf(InvalidRecordError)
    await expect(
      addMember(db, {
        v: 1,
        id: 'rui',
        householdId: 'h1',
        name: 'Rui',
        joinedOn: 'soon',
      }),
    ).rejects.toBeInstanceOf(InvalidRecordError)
  })
})

describe('change tracking (E5)', () => {
  it('marks the first unbacked change once, and a backup clears it', async () => {
    const db = await freshDb()
    expect(await getBackupStatus(db)).toEqual({})
    await createHousehold(db, household(), fourMembers())
    const first = (await getBackupStatus(db)).firstUnbackedChangeAt
    expect(first).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    await renameHousehold(db, 'h1', 'Casa', NOW)
    expect((await getBackupStatus(db)).firstUnbackedChangeAt).toBe(first)

    await recordBackup(db, '2026-10-12T10:00:00.000Z', '9999-01-01T00:00:00Z')
    expect(await getBackupStatus(db)).toEqual({
      lastBackupAt: '2026-10-12T10:00:00.000Z',
    })
    await deleteMember(db, 'h1', 'tiago')
    expect((await getBackupStatus(db)).firstUnbackedChangeAt).toBeDefined()
  })

  it('keeps a change made after the backup’s snapshot waiting', async () => {
    const db = await freshDb()
    await createHousehold(db, household(), fourMembers())
    await recordBackup(db, '2026-10-12T10:00:00.000Z', '2000-01-01T00:00:00Z')
    expect(await getBackupStatus(db)).toMatchObject({
      lastBackupAt: '2026-10-12T10:00:00.000Z',
      firstUnbackedChangeAt: expect.any(String) as string,
    })
  })

  it('does not mark a change when the write is refused', async () => {
    const db = await freshDb()
    await expect(
      saveExpense(db, quickExpense('e1', equalSplit(1000, ['ana']))),
    ).rejects.toBeDefined()
    expect(await getBackupStatus(db)).toEqual({})
  })

  it('opens versions and meta in every write transaction', async () => {
    const db = await seeded()
    const value: unknown = await transaction(
      db,
      [STORE.meta],
      'readonly',
      (tx) =>
        result(tx.objectStore(STORE.meta).get(META.firstUnbackedChangeAt)),
    )
    expect(value).toMatchObject({ key: META.firstUnbackedChangeAt })
  })
})
