// @vitest-environment node
/**
 * The merge, case by case (M6 plan, E6 and its acceptance targets): each
 * row of E6's table for every record kind and the household record, the
 * clocks each outcome writes, and the traces the plan reviews named.
 */
import { describe, expect, it } from 'vitest'
import {
  NOW,
  equalSplit,
  fourMembers,
  household,
  quickExpense,
  settlement,
} from '../test/households.ts'
import {
  classOf,
  clockOf,
  copyOf,
  fileOf,
  idOf,
  keepMine,
  ledgerText,
  newDevice,
  receive,
  send,
  useTheirs,
  type Device,
} from '../test/devices.ts'
import {
  createHousehold,
  deleteExpense,
  deleteMember,
  deleteSettlement,
  getDeviceIds,
  getHousehold,
  getExpense,
  getSettlement,
  getVersion,
  listMembers,
  renameHousehold,
  renameMember,
  saveExpense,
  saveSettlement,
} from './repository.ts'
import { compare, dominates, type RecordKind } from './versions.ts'

type Kind = Exclude<RecordKind, never>

/** The record each kind's tests edit. */
const ID: Record<Kind, string> = {
  household: 'h1',
  member: 'marta',
  expense: 'e1',
  settlement: 's1',
}

async function edit(device: Device, kind: Kind, value: number): Promise<void> {
  switch (kind) {
    case 'household':
      await renameHousehold(device.db, 'h1', `Flat ${value}`, NOW)
      return
    case 'member':
      await renameMember(device.db, 'h1', 'marta', `Marta ${value}`)
      return
    case 'expense':
      await saveExpense(
        device.db,
        quickExpense('e1', equalSplit(1000 + value, ['ana', 'marta'])),
        [],
        { replacing: true },
      )
      return
    case 'settlement':
      await saveSettlement(
        device.db,
        settlement('s1', 'ana', 'tiago', 500 + value),
        { replacing: true },
      )
  }
}

async function remove(device: Device, kind: Kind): Promise<void> {
  switch (kind) {
    case 'member':
      await deleteMember(device.db, 'h1', 'marta')
      return
    case 'expense':
      await deleteExpense(device.db, 'e1')
      return
    case 'settlement':
      await deleteSettlement(device.db, 's1')
      return
    case 'household':
      throw new Error('households are never deleted')
  }
}

/** The record's content on a device, or `null` when it isn't there. */
async function contentOf(device: Device, kind: Kind): Promise<unknown> {
  switch (kind) {
    case 'household':
      return (await getHousehold(device.db, 'h1'))?.name ?? null
    case 'member':
      return (
        (await listMembers(device.db, 'h1')).items.find((m) => m.id === 'marta')
          ?.name ?? null
      )
    case 'expense':
      return (
        (
          (await getExpense(device.db, 'e1'))?.split as
            { amount?: number } | undefined
        )?.amount ?? null
      )
    case 'settlement':
      return (await getSettlement(device.db, 's1'))?.amount ?? null
  }
}

/** A on its own household; B opened A's file. Both hold e1 and s1. */
async function pair(): Promise<[Device, Device]> {
  const a = await newDevice('A')
  const b = await newDevice('B')
  await createHousehold(a.db, household(), fourMembers())
  // Marta isn't named by e1 or s1, so her deletion is never kept.
  await saveExpense(a.db, quickExpense('e1', equalSplit(1000, ['ana', 'joao'])))
  await saveSettlement(a.db, settlement('s1', 'ana', 'tiago', 500))
  const first = await send(a, b)
  expect(classOf(first, 'h1')?.classification).toBe('new')
  return [a, b]
}

const KINDS: Kind[] = ['household', 'member', 'expense', 'settlement']
const DELETABLE: Kind[] = ['member', 'expense', 'settlement']

describe('E6, row by row, for every record kind', () => {
  // The expense's own edits name ana and marta; e1 starts with ana and joao.
  for (const kind of KINDS) {
    describe(kind, () => {
      it('nothing to decide: the same content, joining differing clocks', async () => {
        const [a, b] = await pair()
        await edit(a, kind, 7)
        await edit(b, kind, 7)
        const got = await send(a, b)
        expect(classOf(got, ID[kind])?.classification).toBe('nothingToDecide')
        const joined = await clockOf(b, ID[kind])
        expect(dominates(joined, await clockOf(a, ID[kind]))).toBe(true)
        expect(await contentOf(b, kind)).toEqual(await contentOf(a, kind))
      })

      it('changed there: theirs is newer, taken at their clock', async () => {
        const [a, b] = await pair()
        await edit(a, kind, 1)
        const got = await send(a, b)
        expect(classOf(got, ID[kind])?.classification).toBe('changedThere')
        expect(await contentOf(b, kind)).toEqual(await contentOf(a, kind))
        expect(await clockOf(b, ID[kind])).toEqual(await clockOf(a, ID[kind]))
      })

      it('changed here: mine is newer, kept, nothing written', async () => {
        const [a, b] = await pair()
        await edit(b, kind, 2)
        const before = await clockOf(b, ID[kind])
        const got = await send(a, b)
        expect(classOf(got, ID[kind])?.classification).toBe('changedHere')
        expect(await clockOf(b, ID[kind])).toEqual(before)
      })

      it('a conflict on concurrent clocks; each choice writes its clock', async () => {
        for (const [decide, wantMine] of [
          [keepMine, true],
          [useTheirs, false],
        ] as const) {
          const [a, b] = await pair()
          await edit(a, kind, 3)
          await edit(b, kind, 4)
          const mine = await clockOf(b, ID[kind])
          const theirs = await clockOf(a, ID[kind])
          const mineContent = await contentOf(b, kind)
          const got = await send(a, b, decide)
          const item = classOf(got, ID[kind])
          expect(item).toMatchObject({
            classification: 'conflict',
            cause: 'concurrent',
          })
          const written = await clockOf(b, ID[kind])
          expect(compare(written, mine)).toBe('newer')
          if (wantMine) {
            // Keep mine: the higher counts plus 1 for this device.
            expect(compare(written, theirs)).toBe('newer')
            expect(written[await idOf(b)]).toBe((mine[await idOf(b)] ?? 0) + 1)
            expect(await contentOf(b, kind)).toEqual(mineContent)
          } else {
            // Use theirs: the higher counts, no bump.
            expect(written).toEqual({ ...mine, ...theirs })
            expect(await contentOf(b, kind)).toEqual(await contentOf(a, kind))
          }
        }
      })
    })
  }

  for (const kind of DELETABLE) {
    describe(`${kind} deletions`, () => {
      it('deleted there: deleted here, at their clock', async () => {
        const [a, b] = await pair()
        await remove(a, kind)
        const got = await send(a, b)
        expect(classOf(got, ID[kind])?.classification).toBe('deletedThere')
        expect(await contentOf(b, kind)).toBeNull()
        expect(await clockOf(b, ID[kind])).toEqual(await clockOf(a, ID[kind]))
      })

      it('changed there restores a record deleted here', async () => {
        const [a, b] = await pair()
        await remove(a, kind)
        await edit(b, kind, 6)
        // B keeps its edit over A's deletion: newer than both.
        await send(a, b, keepMine)
        const got = await send(b, a)
        expect(classOf(got, ID[kind])?.classification).toBe('changedThere')
        expect(await contentOf(a, kind)).toEqual(await contentOf(b, kind))
        const entry = await getVersion(a.db, ID[kind])
        expect(entry?.deletedAt).toBeUndefined()
        expect(entry?.clock).toEqual(await clockOf(b, ID[kind]))
      })

      it('a deletion against an edit is a conflict; both choices', async () => {
        for (const decide of [keepMine, useTheirs]) {
          const [a, b] = await pair()
          await remove(a, kind)
          await edit(b, kind, 5)
          const got = await send(a, b, decide)
          expect(classOf(got, ID[kind])).toMatchObject({
            classification: 'conflict',
            cause: 'concurrent',
          })
          if (decide === keepMine) {
            expect(await contentOf(b, kind)).not.toBeNull()
          } else {
            expect(await contentOf(b, kind)).toBeNull()
            expect(await getVersion(b.db, ID[kind])).toMatchObject({
              deletedAt: expect.any(String) as string,
            })
          }
          // Either way, the decision travels back without a question.
          const back = await send(b, a)
          expect(classOf(back, ID[kind])?.classification).not.toBe('conflict')
          expect(await contentOf(a, kind)).toEqual(await contentOf(b, kind))
        }
      })
    })
  }

  it('new: a record only theirs is added with its clock', async () => {
    const [a, b] = await pair()
    await saveExpense(a.db, quickExpense('e2', equalSplit(2000, ['ana'])))
    const got = await send(a, b)
    expect(classOf(got, 'e2')?.classification).toBe('new')
    expect(await getExpense(b.db, 'e2')).not.toBeNull()
    expect(await clockOf(b, 'e2')).toEqual(await clockOf(a, 'e2'))
  })

  it('only here: a record theirs doesn’t have is kept', async () => {
    const [a, b] = await pair()
    await saveExpense(b.db, quickExpense('e2', equalSplit(2000, ['ana'])))
    const got = await send(a, b)
    expect(classOf(got, 'e2')).toBeUndefined()
    expect(await getExpense(b.db, 'e2')).not.toBeNull()
  })

  it('a deletion of a record never seen here is stored, and wins over a stale copy', async () => {
    const [a, b] = await pair()
    const c = await newDevice('C')
    await saveExpense(a.db, quickExpense('e2', equalSplit(2000, ['ana'])))
    await send(a, c)
    await deleteExpense(a.db, 'e2')
    const got = await send(a, b)
    expect(classOf(got, 'e2')?.classification).toBe('new')
    // C's stale copy of e2 is older than B's stored deletion.
    const stale = await send(c, b)
    expect(classOf(stale, 'e2')?.classification).toBe('changedHere')
    expect(await getExpense(b.db, 'e2')).toBeNull()
  })

  it('a record arriving with clock {} stores no version entry (round 2, O4)', async () => {
    const a = await newDevice('A')
    const b = await newDevice('B')
    await createHousehold(a.db, household(), fourMembers())
    const file = await fileOf(a)
    // As if A's records were older than version 3: no versions at all.
    const bare = {
      ...file,
      households: file.households.map((entry) => ({
        ...entry,
        versions: entry.versions.map((v) => ({ ...v, clock: {} })),
      })),
    }
    await receive(b, bare)
    expect(await getVersion(b.db, 'ana')).toBeNull()
    expect((await listMembers(b.db, 'h1')).items).toHaveLength(4)
  })

  it('importing your own file back changes nothing', async () => {
    const [a] = await pair()
    const before = await copyOf(a)
    const got = await send(a, a)
    expect(got.resolution.households[0]?.nothingNew).toBe(true)
    expect(got.plan.changesDeviceId).toBe(false)
    expect(await copyOf(a)).toEqual(before)
  })
})

describe('a merge writes the clocks E6 names (round 2, I1)', () => {
  it('takes theirs twice in a row without a conflict', async () => {
    const [a, b] = await pair()
    for (const value of [1, 2]) {
      await edit(b, 'expense', value)
      const got = await send(b, a)
      expect(classOf(got, 'e1')?.classification).toBe('changedThere')
      expect(await clockOf(a, 'e1')).toEqual(await clockOf(b, 'e1'))
    }
    // The same for a deletion.
    await remove(b, 'settlement')
    expect(classOf(await send(b, a), 's1')?.classification).toBe('deletedThere')
    // And after a concurrent "Use theirs": the other phone takes the
    // choice without a question, and its next edit is simply newer.
    await edit(a, 'member', 1)
    await edit(b, 'member', 2)
    await send(b, a, useTheirs)
    expect(classOf(await send(a, b), 'marta')?.classification).not.toBe(
      'conflict',
    )
    await edit(b, 'member', 3)
    expect(classOf(await send(b, a), 'marta')?.classification).toBe(
      'changedThere',
    )
  })
})

describe('the two stale-file traces (round 1, B1)', () => {
  it('a later file from a phone that never opened ours keeps our edit', async () => {
    const [a, b] = await pair()
    await edit(a, 'expense', 11)
    await saveSettlement(b.db, settlement('s2', 'ana', 'joao', 100))
    await send(b, a)
    await saveSettlement(b.db, settlement('s3', 'ana', 'joao', 200))
    const got = await send(b, a)
    expect(classOf(got, 'e1')?.classification).toBe('changedHere')
    expect(await contentOf(a, 'expense')).toBe(1011)
  })

  it('a "Keep mine" stays without being asked again', async () => {
    const [a, b] = await pair()
    await edit(a, 'expense', 21)
    await edit(b, 'expense', 22)
    await send(b, a, keepMine)
    await saveSettlement(b.db, settlement('s2', 'ana', 'joao', 100))
    const got = await send(b, a)
    expect(classOf(got, 'e1')?.classification).toBe('changedHere')
    expect(await contentOf(a, 'expense')).toBe(1021)
  })
})

describe('a stale file can’t undo newer edits', () => {
  it('keeps every newer edit however often an old file comes back', async () => {
    const [a, b] = await pair()
    const old = await fileOf(b)
    await edit(a, 'expense', 31)
    await remove(a, 'settlement')
    await edit(a, 'household', 31)
    for (let i = 0; i < 3; i++) {
      const got = await receive(a, old)
      expect(got.resolution.households[0]?.nothingNew).toBe(true)
    }
    expect(await contentOf(a, 'expense')).toBe(1031)
    expect(await contentOf(a, 'settlement')).toBeNull()
  })
})

describe('crossed choices (round 2, I4; local review of revision 6, I2)', () => {
  it('repeat while both decide differently, and end at a sequential exchange', async () => {
    const [a, b] = await pair()
    await edit(a, 'expense', 41)
    await edit(b, 'expense', 42)
    const fromA = await fileOf(a)
    const fromB = await fileOf(b)
    await receive(a, fromB, keepMine)
    await receive(b, fromA, keepMine)
    // Both kept their own: the next exchange shows it again on both.
    const again = await send(a, b, useTheirs)
    expect(classOf(again, 'e1')?.classification).toBe('conflict')
    // B decided after seeing A's choice: A takes it without a question.
    const end = await send(b, a)
    expect(classOf(end, 'e1')?.classification).not.toBe('conflict')
    expect(await ledgerText(a)).toBe(await ledgerText(b))
  })

  it('crossed "Use theirs" reach equal clocks: an ordinary conflict, a new id, then the end', async () => {
    const [a, b] = await pair()
    await edit(a, 'expense', 51)
    await edit(b, 'expense', 52)
    const fromA = await fileOf(a)
    const fromB = await fileOf(b)
    await receive(a, fromB, useTheirs)
    await receive(b, fromA, useTheirs)
    expect(await clockOf(a, 'e1')).toEqual(await clockOf(b, 'e1'))
    expect(await contentOf(a, 'expense')).toBe(1052)
    expect(await contentOf(b, 'expense')).toBe(1051)

    const oldA = await idOf(a)
    const got = await send(b, a, useTheirs)
    const item = classOf(got, 'e1')
    expect(item).toMatchObject({ classification: 'conflict', cause: 'equal' })
    // Not shown as a restore: no gone-back-in-time conflict.
    expect(
      got.plan.households[0]?.items.some((i) => i.cause === 'goneBack'),
    ).toBe(false)
    expect(got.plan.changesDeviceId).toBe(true)
    const newA = await idOf(a)
    expect(newA).not.toBe(oldA)
    expect((await getDeviceIds(a.db)).formerDeviceIds).toEqual([oldA])
    // The choice is bumped under the new id.
    expect((await clockOf(a, 'e1'))[newA]).toBe(1)
    // A sequential exchange ends it.
    const end = await send(a, b)
    expect(classOf(end, 'e1')?.classification).not.toBe('conflict')
    expect(await ledgerText(a)).toBe(await ledgerText(b))
    const quiet = await send(b, a)
    expect(quiet.resolution.households[0]?.nothingNew).toBe(true)
  })
})
