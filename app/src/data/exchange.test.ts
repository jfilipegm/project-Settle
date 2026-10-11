// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  NOW,
  equalSplit,
  freshDb,
  household,
  member,
  putRaw,
  quickExpense,
} from '../test/households.ts'
import { buildRichHousehold, richIds } from '../test/exchange.ts'
import { formatFile } from '../features/exchange/format.ts'
import { readFile } from '../features/exchange/readFile.ts'
import {
  NothingToShareError,
  leftOutCount,
  snapshotBackup,
  snapshotHousehold,
} from './exchange.ts'
import {
  createHousehold,
  deleteExpense,
  getDeviceIds,
  listExpenses,
  listHouseholds,
  listMembers,
  listSettlements,
} from './repository.ts'

const LATER = '2026-10-12T08:00:00.000Z'

function withoutExportedAt(text: string): string {
  return text.replace(/"exportedAt": "[^"]*"/, '"exportedAt": ""')
}

describe('the Settle file of a household (M6 plan, E1)', () => {
  it('writes every record exactly as read, with a version for each', async () => {
    const db = await freshDb()
    await buildRichHousehold(db)
    const { file, text, leftOut } = await snapshotHousehold(db, 'h1', NOW)
    expect(leftOutCount(leftOut)).toBe(0)
    expect(file.kind).toBe('household')
    const [entry] = file.households
    if (entry === undefined) throw new Error('no entry')
    expect(entry.household).toEqual((await listHouseholds(db)).items[0])
    const byId = <T extends { id: string }>(list: T[]) =>
      [...list].sort((a, b) => a.id.localeCompare(b.id))
    expect(byId(entry.members)).toEqual(
      byId((await listMembers(db, 'h1')).items),
    )
    expect(byId(entry.expenses)).toEqual(
      byId((await listExpenses(db, 'h1')).items),
    )
    expect(byId(entry.settlements)).toEqual(
      byId((await listSettlements(db, 'h1')).items),
    )
    // One version per record, the household included.
    const { deviceId } = await getDeviceIds(db)
    expect(entry.versions).toHaveLength(
      1 +
        entry.members.length +
        entry.expenses.length +
        entry.settlements.length,
    )
    const joao = entry.versions.find((v) => v.id === richIds('h1').joao)
    expect(joao).toEqual({
      id: richIds('h1').joao,
      kind: 'member',
      clock: { [deviceId]: 2 },
    })
    expect(text.endsWith('}\n')).toBe(true)
    expect(text).toContain('\n  "format": "settle",\n  "formatVersion": 1,')
  })

  it('reads back to the same canonical text (the round trip)', async () => {
    const db = await freshDb()
    await buildRichHousehold(db)
    const { text } = await snapshotHousehold(db, 'h1', NOW)
    const read = readFile(text)
    if (!read.ok) throw new Error(JSON.stringify(read.problems))
    expect(formatFile(read.file)).toBe(text)
    const again = await snapshotHousehold(db, 'h1', LATER)
    expect(again.text).not.toBe(text)
    expect(withoutExportedAt(again.text)).toBe(withoutExportedAt(text))
  })

  it('carries deletions, and a record never changed since version 3 at {}', async () => {
    const db = await freshDb()
    await buildRichHousehold(db)
    await deleteExpense(db, 'h1-q0')
    await putRaw(db, {
      households: [],
      members: [],
      expenses: [
        quickExpense('old', equalSplit(1000, [richIds('h1').ana]), {
          payerId: richIds('h1').ana,
        }),
      ],
    })
    const { file } = await snapshotHousehold(db, 'h1', NOW)
    const versions = file.households[0]?.versions ?? []
    expect(versions.find((v) => v.id === 'h1-q0')).toMatchObject({
      kind: 'expense',
      deletedAt: expect.any(String) as string,
    })
    expect(versions.find((v) => v.id === 'old')).toEqual({
      id: 'old',
      kind: 'expense',
      clock: {},
    })
    expect(file.households[0]?.expenses.some((e) => e.id === 'h1-q0')).toBe(
      false,
    )
  })

  it('refuses a household that can’t be read, or isn’t there', async () => {
    const db = await freshDb()
    await expect(snapshotHousehold(db, 'nope', NOW)).rejects.toBeInstanceOf(
      NothingToShareError,
    )
    await putRaw(db, { households: [{ id: 'bad' }], members: [], expenses: [] })
    await expect(snapshotHousehold(db, 'bad', NOW)).rejects.toBeInstanceOf(
      NothingToShareError,
    )
  })
})

describe('every file Settle writes opens in Settle (E1, round 2 I3)', () => {
  it('leaves out an unreadable member and the expenses that name it', async () => {
    const db = await freshDb()
    await buildRichHousehold(db)
    const ana = richIds('h1').ana
    await putRaw(db, {
      households: [],
      // Ana's record is damaged: no name.
      members: [{ v: 1, id: ana, householdId: 'h1', position: 0 }],
      expenses: [],
    })
    const { file, text, leftOut } = await snapshotHousehold(db, 'h1', NOW)
    expect(leftOut.unreadable).toBe(1)
    // Every quick expense, the itemised one and both payments name Ana.
    expect(leftOut.namesLeftOut).toBe(7)
    expect(file.households[0]?.members.some((m) => m.id === ana)).toBe(false)
    expect(readFile(text).ok).toBe(true)
  })

  it('leaves out an expense whose stored createdAt isn’t ISO', async () => {
    const db = await freshDb()
    await buildRichHousehold(db)
    const ana = richIds('h1').ana
    await putRaw(db, {
      households: [],
      members: [],
      expenses: [
        quickExpense('loose', equalSplit(1000, [ana]), {
          payerId: ana,
          createdAt: 'yesterday',
        }),
      ],
    })
    const { file, text, leftOut } = await snapshotHousehold(db, 'h1', NOW)
    expect(leftOut).toEqual({ unreadable: 0, invalid: 1, namesLeftOut: 0 })
    expect(file.households[0]?.expenses.some((e) => e.id === 'loose')).toBe(
      false,
    )
    expect(readFile(text).ok).toBe(true)
  })

  it('leaves out a member with a position out of range, and a clock over 64 entries', async () => {
    const db = await freshDb()
    await buildRichHousehold(db)
    const ana = richIds('h1').ana
    const clock = Object.fromEntries(
      Array.from({ length: 65 }, (_, i) => [`d${i}`, 1]),
    )
    await putRaw(db, {
      households: [],
      members: [member('far', 'Far', 2 ** 31, { joinedOn: '2026-01-01' })],
      expenses: [
        quickExpense('wide', equalSplit(1000, [ana]), { payerId: ana }),
      ],
      versions: [{ id: 'wide', kind: 'expense', householdId: 'h1', clock }],
    })
    const { leftOut, text } = await snapshotHousehold(db, 'h1', NOW)
    expect(leftOut.invalid).toBe(2)
    expect(readFile(text).ok).toBe(true)
  })

  it('leaves out a record whose version entry is damaged or of another kind', async () => {
    const db = await freshDb()
    await buildRichHousehold(db)
    await putRaw(db, {
      households: [],
      members: [],
      expenses: [],
      versions: [
        { id: 'h1-q1', kind: 'expense', householdId: 'h1', clock: { a: 0 } },
        { id: 'h1-q2', kind: 'member', householdId: 'h1', clock: { a: 1 } },
      ],
    })
    const { leftOut, text } = await snapshotHousehold(db, 'h1', NOW)
    expect(leftOut.unreadable).toBe(2)
    expect(readFile(text).ok).toBe(true)
  })
})

describe('the backup (E1, E10)', () => {
  it('holds every household, archived included, and round-trips', async () => {
    const db = await freshDb()
    await buildRichHousehold(db, 'h1', 'Flat')
    await buildRichHousehold(db, 'h2', 'Algarve 2026', { archived: true })
    await createHousehold(db, household('h3', 'Empty'), [
      member('h3-rui', 'Rui', 0, { householdId: 'h3' }),
    ])
    const { file, text } = await snapshotBackup(db, NOW)
    expect(file.kind).toBe('backup')
    expect(file.households.map((entry) => entry.household.id)).toEqual([
      'h1',
      'h2',
      'h3',
    ])
    expect(file.households[1]?.household.archivedAt).toBe(NOW)
    const read = readFile(text)
    if (!read.ok) throw new Error(JSON.stringify(read.problems))
    expect(formatFile(read.file)).toBe(text)
  })

  it('is a valid file with no household on a new device', async () => {
    const db = await freshDb()
    const { file, text } = await snapshotBackup(db, NOW)
    expect(file.households).toEqual([])
    expect(readFile(text).ok).toBe(true)
  })

  it('counts a household whose own record can’t be read, and its records', async () => {
    const db = await freshDb()
    await buildRichHousehold(db, 'h1')
    await putRaw(db, {
      households: [{ v: 1, id: 'h1', name: '' }],
      members: [],
      expenses: [],
    })
    const { file, leftOut } = await snapshotBackup(db, NOW)
    expect(file.households).toEqual([])
    expect(leftOut.unreadable).toBe(1)
    expect(leftOut.namesLeftOut).toBe(4 + 5 + 2)
  })
})
