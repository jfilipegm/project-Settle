// @vitest-environment node
/**
 * The merge keeps the ledger whole (M6 plan, E6): references, unreadable
 * and foreign records, member limits that follow the choices, the
 * re-check against another tab, round trips and performance.
 */
import { describe, expect, it } from 'vitest'
import {
  NOW,
  equalSplit,
  fourMembers,
  freshDb,
  getRaw,
  household,
  member,
  putRaw,
  quickExpense,
} from '../test/households.ts'
import { buildRichHousehold } from '../test/exchange.ts'
import {
  classOf,
  copyOf,
  fileOf,
  keepMine,
  ledgerText,
  newDevice,
  receive,
  send,
  useTheirs,
  type Device,
} from '../test/devices.ts'
import {
  ImportChangedError,
  applyImport,
  prepareImport,
  snapshotBackup,
  snapshotHousehold,
} from './exchange.ts'
import {
  addMember,
  createHousehold,
  deleteMember,
  getBackupStatus,
  getExpense,
  listMembers,
  renameMember,
  saveExpense,
} from './repository.ts'
import { STORE, result, transaction } from './db.ts'
import { readFile } from '../features/exchange/readFile.ts'
import {
  conflictKey,
  planImport,
  resolveImport,
} from '../features/exchange/merge.ts'
import type { Member } from '../features/household/model.ts'

async function pairOf(members: Member[] = fourMembers()) {
  const a = await newDevice('A')
  const b = await newDevice('B')
  await createHousehold(a.db, household(), members)
  await saveExpense(
    a.db,
    quickExpense('e1', equalSplit(1000, ['ana', 'marta'])),
  )
  await send(a, b)
  return [a, b] as const
}

async function members(device: Device) {
  return (await listMembers(device.db, 'h1')).items.map((m) => m.id).sort()
}

describe('references stay whole (E6)', () => {
  it('keeps a member deleted here but named by a record from the file', async () => {
    const [a, b] = await pairOf()
    await deleteMember(a.db, 'h1', 'tiago')
    await saveExpense(
      b.db,
      quickExpense('e2', equalSplit(2000, ['ana', 'tiago'])),
    )
    const got = await send(b, a)
    const household = got.resolution.households[0]
    expect(household?.keptForReferences).toEqual([
      {
        memberId: 'tiago',
        name: 'Tiago',
        namedBy: 1,
        overridesChoice: false,
        from: 'theirs',
      },
    ])
    expect(await members(a)).toContain('tiago')
    // Both phones agree at the next exchange.
    await send(a, b)
    expect(await ledgerText(a)).toBe(await ledgerText(b))
  })

  it('overrides "Keep mine" on the deletion, and choosing differently lets it stand (round 2, O3)', async () => {
    for (const expenseChoice of ['theirs', 'mine'] as const) {
      const [a, b] = await pairOf()
      // A drops Tiago from e1 and deletes him; B adds him to e1.
      await saveExpense(
        a.db,
        quickExpense('e1', equalSplit(1001, ['ana', 'marta'])),
        [],
        { replacing: true },
      )
      await deleteMember(a.db, 'h1', 'tiago')
      await renameMember(b.db, 'h1', 'tiago', 'Tiago S.')
      await saveExpense(
        b.db,
        quickExpense('e1', equalSplit(1002, ['ana', 'tiago'])),
        [],
        { replacing: true },
      )
      const got = await send(b, a, (item) =>
        item.id === 'e1' ? expenseChoice : 'mine',
      )
      const kept = got.resolution.households[0]?.keptForReferences ?? []
      if (expenseChoice === 'theirs') {
        expect(kept).toEqual([
          expect.objectContaining({
            memberId: 'tiago',
            name: 'Tiago S.',
            overridesChoice: true,
          }),
        ])
        expect(await members(a)).toContain('tiago')
      } else {
        expect(kept).toEqual([])
        expect(await members(a)).not.toContain('tiago')
      }
    }
  })

  it('waits to apply a member’s deletion while records here can’t be read', async () => {
    const [a, b] = await pairOf()
    await putRaw(a.db, {
      households: [],
      members: [],
      expenses: [{ v: 1, id: 'broken', householdId: 'h1' }],
    })
    await deleteMember(b.db, 'h1', 'tiago')
    const got = await send(b, a)
    expect(got.resolution.households[0]?.keptUnreadable).toEqual([
      { memberId: 'tiago', name: 'Tiago' },
    ])
    expect(await members(a)).toContain('tiago')
  })

  it('leaves out a file record naming a member that can’t be read here', async () => {
    const [a, b] = await pairOf()
    const damaged = { v: 1, id: 'marta', householdId: 'h1', name: 7 }
    await putRaw(a.db, { households: [], members: [damaged], expenses: [] })
    await saveExpense(
      b.db,
      quickExpense('e2', equalSplit(2000, ['ana', 'marta'])),
    )
    await saveExpense(b.db, quickExpense('e3', equalSplit(3000, ['ana'])))
    const got = await send(b, a)
    expect(classOf(got, 'marta')?.classification).toBe('leftOutUnreadable')
    expect(classOf(got, 'e2')).toMatchObject({
      classification: 'leftOutNames',
      namesId: 'marta',
    })
    expect(await getExpense(a.db, 'e3')).not.toBeNull()
    expect(await getExpense(a.db, 'e2')).toBeNull()
    expect(
      (await getRaw(a.db)).members.find(
        (m) => (m as { id: string }).id === 'marta',
      ),
    ).toEqual(damaged)
  })
})

describe('unreadable and foreign records (round 1, I2, I3)', () => {
  it('never writes over or deletes an unreadable raw record, whatever its householdId', async () => {
    for (const householdId of ['h1', 'h2', undefined, 42]) {
      const [a, b] = await pairOf()
      const raw = { v: 1, id: 'e1', householdId, description: '' }
      await putRaw(a.db, { households: [], members: [], expenses: [raw] })
      await saveExpense(
        b.db,
        quickExpense('e1', equalSplit(5000, ['ana'])),
        [],
        { replacing: true },
      )
      const got = await send(b, a)
      expect(classOf(got, 'e1')?.classification).toBe('leftOutUnreadable')
      expect(
        (await getRaw(a.db)).expenses.find(
          (e) => (e as { id: string }).id === 'e1',
        ),
      ).toEqual(raw)
    }
  })

  it('leaves alone a file id that belongs to another household here', async () => {
    const a = await newDevice('A')
    const b = await newDevice('B')
    await createHousehold(a.db, household('h2', 'Other'), [
      member('ana', 'Ana', 0, { householdId: 'h2' }),
    ])
    const before = await getRaw(a.db)
    await createHousehold(b.db, household(), fourMembers())
    const got = await send(b, a)
    expect(classOf(got, 'ana')?.classification).toBe('leftOutForeign')
    const after = await getRaw(a.db)
    expect(
      after.members.find((m) => (m as { id: string }).id === 'ana'),
    ).toEqual(before.members.find((m) => (m as { id: string }).id === 'ana'))
  })

  it('leaves alone an id whose version entry here is of another kind', async () => {
    const [a, b] = await pairOf()
    await putRaw(a.db, {
      households: [],
      members: [],
      expenses: [],
      versions: [
        { id: 'e2', kind: 'member', householdId: 'h1', clock: { x: 1 } },
      ],
    })
    await saveExpense(b.db, quickExpense('e2', equalSplit(2000, ['ana'])))
    const got = await send(b, a)
    expect(classOf(got, 'e2')?.classification).toBe('leftOutForeign')
    expect(await getExpense(a.db, 'e2')).toBeNull()
  })

  it('leaves out a household whose own record can’t be read here', async () => {
    const [a, b] = await pairOf()
    await putRaw(a.db, {
      households: [{ v: 1, id: 'h1' }],
      members: [],
      expenses: [],
    })
    const before = await getRaw(a.db)
    const got = await send(b, a)
    expect(got.plan.households[0]?.leftOutWhole).toBe('unreadable')
    expect(await getRaw(a.db)).toEqual(before)
  })
})

describe('limits follow the choices (round 1, I4)', () => {
  it('disables Apply for a choice that makes 21 active, and enables it back', async () => {
    const twenty = Array.from({ length: 20 }, (_, i) =>
      member(`m${i}`, `M${i}`, i),
    )
    const a = await newDevice('A')
    const b = await newDevice('B')
    await createHousehold(a.db, household(), twenty)
    await send(a, b)
    await deleteMember(a.db, 'h1', 'm19')
    await addMember(a.db, {
      v: 1,
      id: 'n1',
      householdId: 'h1',
      name: 'N1',
      joinedOn: '2026-01-01',
    })
    await renameMember(b.db, 'h1', 'm19', 'M19 S.')
    const file = await fileOf(b)
    const preview = await prepareImport(a.db, file)
    const plan = planImport(file, preview.local, preview.newDeviceId)
    const key = conflictKey('h1', 'm19')
    const theirs = resolveImport(plan, { [key]: 'theirs' })
    expect(theirs.canApply).toBe(false)
    expect(theirs.households[0]?.limit).toEqual({
      kind: 'tooManyActive',
      date: '2026-01-01',
    })
    const mine = resolveImport(plan, { [key]: 'mine' })
    expect(mine.canApply).toBe(true)
    expect(resolveImport(plan, {}).canApply).toBe(false)
    await applyImport(a.db, file, preview, { [key]: 'mine' })
  })

  it('counts members that can’t be read toward the 50', async () => {
    // 49 members who each stay one day: never 21 at once.
    const day = (i: number) =>
      new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10)
    const left = Array.from({ length: 49 }, (_, i) =>
      member(`m${i}`, `M${i}`, i, { joinedOn: day(i), leftOn: day(i) }),
    )
    const a = await newDevice('A')
    const b = await newDevice('B')
    await createHousehold(a.db, household(), left.slice(0, 20))
    await putRaw(a.db, {
      households: [],
      members: left.slice(20),
      expenses: [],
    })
    await send(a, b)
    await putRaw(a.db, {
      households: [],
      members: [{ v: 1, id: 'ghost', householdId: 'h1' }],
      expenses: [],
    })
    await addMember(b.db, {
      v: 1,
      id: 'n1',
      householdId: 'h1',
      name: 'N1',
      joinedOn: '2026-02-01',
    })
    const file = await fileOf(b)
    const preview = await prepareImport(a.db, file)
    const plan = planImport(file, preview.local, preview.newDeviceId)
    expect(resolveImport(plan, {}).households[0]?.limit).toEqual({
      kind: 'tooManyMembers',
    })
  })
})

describe('the re-check against another tab (E6)', () => {
  async function staleApply(change: (a: Device) => Promise<void>) {
    const [a, b] = await pairOf()
    await saveExpense(b.db, quickExpense('e2', equalSplit(2000, ['ana'])))
    const file = await fileOf(b)
    const preview = await prepareImport(a.db, file)
    await change(a)
    const before = await copyOf(a)
    await expect(applyImport(a.db, file, preview, {})).rejects.toBeInstanceOf(
      ImportChangedError,
    )
    expect(await copyOf(a)).toEqual(before)
  }

  it('refuses when a record changed meanwhile', async () => {
    await staleApply((a) =>
      saveExpense(a.db, quickExpense('e1', equalSplit(1500, ['ana'])), [], {
        replacing: true,
      }).then(() => undefined),
    )
  })

  it('refuses when a version entry changed meanwhile', async () => {
    await staleApply((a) =>
      putRaw(a.db, {
        households: [],
        members: [],
        expenses: [],
        versions: [
          { id: 'e1', kind: 'expense', householdId: 'h1', clock: { z: 9 } },
        ],
      }),
    )
  })

  it('refuses when a raw entry for an id in the file appeared meanwhile', async () => {
    await staleApply((a) =>
      putRaw(a.db, {
        households: [],
        members: [],
        expenses: [{ v: 1, id: 'e2', householdId: 'h1' }],
      }),
    )
  })
})

describe('a household that isn’t on this device', () => {
  it('is added whole, with its versions', async () => {
    const a = await newDevice('A')
    const b = await newDevice('B')
    await buildRichHousehold(a.db)
    const got = await send(a, b)
    const counts = got.resolution.households[0]?.counts
    expect(got.plan.households[0]?.isNew).toBe(true)
    expect(counts).toMatchObject({ members: 4, expenses: 5, settlements: 2 })
    expect(await ledgerText(b)).toBe(await ledgerText(a))
  })

  it('a backup that only adds households doesn’t mark a change to back up (E5)', async () => {
    const a = await newDevice('A')
    const b = await newDevice('B')
    await buildRichHousehold(a.db, 'h1', 'Flat')
    await buildRichHousehold(a.db, 'h2', 'Algarve', { archived: true })
    const { text } = await snapshotBackup(a.db, NOW)
    const read = readFile(text)
    if (!read.ok) throw new Error()
    await receive(b, read.file)
    expect(await getBackupStatus(b.db)).toEqual({})
    // A household file from someone else does count as a change.
    const c = await newDevice('C')
    await send(a, c)
    expect((await getBackupStatus(c.db)).firstUnbackedChangeAt).toBeDefined()
  })

  it('keeps shared positions as they are', async () => {
    const [a, b] = await pairOf()
    await addMember(a.db, {
      v: 1,
      id: 'rui',
      householdId: 'h1',
      name: 'Rui',
      joinedOn: '2026-02-01',
    })
    await addMember(b.db, {
      v: 1,
      id: 'bea',
      householdId: 'h1',
      name: 'Bea',
      joinedOn: '2026-02-01',
    })
    await send(b, a)
    const positions = (await listMembers(a.db, 'h1')).items
      .filter((m) => m.id === 'rui' || m.id === 'bea')
      .map((m) => m.position)
    expect(positions).toEqual([4, 4])
  })
})

describe('round trips (the roadmap’s completion criterion)', () => {
  it('export, import into an empty database, export again: the same bytes but exportedAt', async () => {
    const a = await newDevice('A')
    await buildRichHousehold(a.db, 'h1', 'Flat')
    await buildRichHousehold(a.db, 'h2', 'Algarve 2026', { archived: true })
    await createHousehold(a.db, household('h3', 'Empty'), [
      member('h3-rui', 'Rui', 0, { householdId: 'h3' }),
    ])
    const first = await snapshotBackup(a.db, '2026-10-11T10:00:00.000Z')
    const read = readFile(first.text)
    if (!read.ok) throw new Error()
    const b = await newDevice('B')
    await receive(b, read.file)
    const second = await snapshotBackup(b.db, '2026-10-12T10:00:00.000Z')
    const strip = (text: string) =>
      text.replace(/"exportedAt": "[^"]*"/, '"exportedAt": ""')
    expect(strip(second.text)).toBe(strip(first.text))
    for (const id of ['h1', 'h2', 'h3']) {
      const one = await snapshotHousehold(a.db, id, NOW)
      const two = await snapshotHousehold(b.db, id, NOW)
      expect(two.text).toBe(one.text)
    }
  })
})

describe('performance', () => {
  it('previews a 2000-expense household with 200 changes in under 500 ms', async () => {
    const db = await freshDb()
    await createHousehold(db, household(), fourMembers())
    const expenses = Array.from({ length: 2000 }, (_, i) =>
      quickExpense(`x${i}`, equalSplit(1000 + i, ['ana', 'marta'])),
    )
    await putRaw(db, { households: [], members: [], expenses })
    const { file } = await snapshotHousehold(db, 'h1', NOW)
    const entry = file.households[0]
    if (entry === undefined) throw new Error()
    // 200 changed records from another phone, with newer clocks.
    for (let i = 0; i < 200; i++) {
      const expense = entry.expenses[i]
      const version = entry.versions.find((v) => v.id === expense?.id)
      if (expense === undefined || version === undefined) throw new Error()
      expense.description = `Changed ${i}`
      version.clock = { other: 1 }
    }
    const preview = await prepareImport(db, file)
    const start = performance.now()
    const plan = planImport(file, preview.local, preview.newDeviceId)
    const resolution = resolveImport(plan, {})
    const elapsed = performance.now() - start
    expect(resolution.households[0]?.counts.changed.expense).toBe(200)
    expect(elapsed).toBeLessThan(500)
  })

  it('reads a 5 MB file in under 1 s', async () => {
    const db = await freshDb()
    await createHousehold(db, household(), fourMembers())
    const expenses = Array.from({ length: 8500 }, (_, i) =>
      quickExpense(`x${i}`, equalSplit(1000 + i, ['ana', 'marta', 'joao'])),
    )
    await putRaw(db, { households: [], members: [], expenses })
    const { text } = await snapshotHousehold(db, 'h1', NOW)
    expect(text.length).toBeGreaterThan(5_000_000)
    const start = performance.now()
    const read = readFile(text)
    expect(performance.now() - start).toBeLessThan(1000)
    expect(read.ok).toBe(true)
  })
})

describe('Apply covers every household of a backup in one transaction', () => {
  it('writes all or nothing', async () => {
    const a = await newDevice('A')
    await buildRichHousehold(a.db, 'h1', 'Flat')
    await buildRichHousehold(a.db, 'h2', 'Algarve')
    const { text } = await snapshotBackup(a.db, NOW)
    const read = readFile(text)
    if (!read.ok) throw new Error()
    const b = await newDevice('B')
    const preview = await prepareImport(b.db, read.file)
    // Another tab adds a household meanwhile, under an id the file uses.
    await transaction(b.db, [STORE.households], 'readwrite', (tx) =>
      result(tx.objectStore(STORE.households).put(household('h2', 'Mine'))),
    )
    await expect(
      applyImport(b.db, read.file, preview, {}),
    ).rejects.toBeInstanceOf(ImportChangedError)
    expect((await getRaw(b.db)).expenses).toEqual([])
    expect(keepMine).toBeDefined()
    expect(useTheirs).toBeDefined()
  })
})
