// @vitest-environment node
/**
 * A database set back to an older copy of itself (M6 plan, E4, E6 "Gone
 * back in time", "Other phones can't see a restore", equal clocks): the
 * traces of the plan's acceptance targets, on real devices.
 */
import { describe, expect, it } from 'vitest'
import {
  NOW,
  equalSplit,
  fourMembers,
  household,
  quickExpense,
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
  setBack,
  useTheirs,
  type Device,
} from '../test/devices.ts'
import { snapshotBackup } from './exchange.ts'
import {
  createHousehold,
  deleteExpense,
  getDeviceIds,
  getExpense,
  renameHousehold,
  renameMember,
  saveExpense,
} from './repository.ts'
import { MAX_COUNT, compare } from './versions.ts'
import { readFile } from '../features/exchange/readFile.ts'
import {
  conflictKey,
  planImport,
  resolveImport,
  chooseTheirsForGoneBack,
} from '../features/exchange/merge.ts'
import { prepareImport } from './exchange.ts'

let counter = 0

/** Edits expense `id` on `device` `times` times, each to a new amount. */
async function editTimes(device: Device, times: number, id = 'e1') {
  for (let i = 0; i < times; i++) {
    counter++
    await saveExpense(
      device.db,
      quickExpense(id, equalSplit(1000 + counter, ['ana', 'marta'])),
      [],
      { replacing: true },
    )
  }
}

async function amountOf(device: Device, id = 'e1') {
  return (
    (
      (await getExpense(device.db, id))?.split as
        { amount?: number } | undefined
    )?.amount ?? null
  )
}

/** A household with e1 and e2 on A, shared to the other devices. */
async function devices(...names: string[]): Promise<Device[]> {
  const list = await Promise.all(names.map((name) => newDevice(name)))
  const [a] = list
  if (a === undefined) throw new Error('no devices')
  await createHousehold(a.db, household(), fourMembers())
  await saveExpense(a.db, quickExpense('e1', equalSplit(1000, ['ana'])))
  await saveExpense(a.db, quickExpense('e2', equalSplit(2000, ['ana'])))
  for (const other of list.slice(1)) await send(a, other)
  return list
}

describe('gone back in time (round 2, I2)', () => {
  async function setBackTrace() {
    const [a, b, c] = await devices('A', 'B', 'C')
    if (a === undefined || b === undefined || c === undefined) throw new Error()
    await editTimes(a, 4) // e1 at {A:5}
    const old = await copyOf(a)
    await editTimes(a, 2) // {A:7}
    await send(a, b)
    const sent = await amountOf(a)
    const oldId = await idOf(a)
    await setBack(a, old)
    await editTimes(a, 1) // {A:6}: a reused count
    await send(a, c) // C now holds A's {A:6}
    return { a, b, c, sent, oldId }
  }

  it('makes a conflict, not "Changed there", and gives A a new id', async () => {
    const { a, b, oldId } = await setBackTrace()
    const mine = await amountOf(a)
    const got = await send(b, a, keepMine)
    expect(classOf(got, 'e1')).toMatchObject({
      classification: 'conflict',
      cause: 'goneBack',
    })
    expect(got.plan.changesDeviceId).toBe(true)
    const ids = await getDeviceIds(a.db)
    expect(ids.deviceId).not.toBe(oldId)
    expect(ids.formerDeviceIds).toEqual([oldId])
    // "Keep mine": the bump is under the new id (round 3, O1).
    expect(await amountOf(a)).toBe(mine)
    expect(await clockOf(a, 'e1')).toEqual({ [oldId]: 7, [ids.deviceId]: 1 })
    // The next edit counts under the new id.
    await editTimes(a, 1)
    expect(await clockOf(a, 'e1')).toEqual({ [oldId]: 7, [ids.deviceId]: 2 })
  })

  it('"Use theirs" writes their clock exactly, and A’s reused {A:6} is then older', async () => {
    const { a, b, c, sent, oldId } = await setBackTrace()
    await send(b, a, useTheirs)
    expect(await amountOf(a)).toBe(sent)
    expect(await clockOf(a, 'e1')).toEqual({ [oldId]: 7 })
    expect(await clockOf(a, 'e1')).toEqual(await clockOf(b, 'e1'))
    const later = await send(c, a)
    expect(classOf(later, 'e1')?.classification).toBe('changedHere')
    expect(await amountOf(a)).toBe(sent)
  })

  it('"Use theirs for all of these" sets every gone-back conflict, each still changeable', async () => {
    const { a, b } = await setBackTrace()
    const file = await fileOf(b)
    const preview = await prepareImport(a.db, file)
    const plan = planImport(file, preview.local, preview.newDeviceId)
    const all = chooseTheirsForGoneBack(plan, {})
    expect(all).toEqual({ [conflictKey('h1', 'e1')]: 'theirs' })
    expect(resolveImport(plan, all).canApply).toBe(true)
    const changed = { ...all, [conflictKey('h1', 'e1')]: 'mine' as const }
    expect(resolveImport(plan, changed).canApply).toBe(true)
  })

  it('asks a second time for a still higher pre-restore count (round 4, O1)', async () => {
    const [a, b, c] = await devices('A', 'B', 'C')
    if (a === undefined || b === undefined || c === undefined) throw new Error()
    await editTimes(a, 4) // {A:5}
    const old = await copyOf(a)
    await editTimes(a, 2) // {A:7}
    await send(a, b)
    await editTimes(a, 2) // {A:9}
    await send(a, c)
    await setBack(a, old)
    await editTimes(a, 1) // {A:6}
    const first = await send(b, a, keepMine)
    expect(classOf(first, 'e1')?.cause).toBe('goneBack')
    const newId = await idOf(a)
    const second = await send(c, a, keepMine)
    expect(classOf(second, 'e1')?.cause).toBe('goneBack')
    // The higher count is under a former id: no second new id.
    expect(second.plan.changesDeviceId).toBe(false)
    expect(await idOf(a)).toBe(newId)
    // Asked again only for a count it hasn't seen.
    const third = await send(c, a)
    expect(classOf(third, 'e1')?.classification).toBe('changedHere')
  })

  it('changes the id for an exposure with equal content, asking nothing (round 4, O3)', async () => {
    const [a, b] = await devices('A', 'B')
    if (a === undefined || b === undefined) throw new Error()
    const old = await copyOf(a)
    // A rename to the same name: a new version, the same content.
    await renameMember(a.db, 'h1', 'ana', 'Ana')
    await send(a, b)
    const oldId = await idOf(a)
    await setBack(a, old)
    const got = await send(b, a)
    expect(classOf(got, 'ana')?.classification).toBe('nothingToDecide')
    expect(got.plan.changesDeviceId).toBe(true)
    expect(await idOf(a)).not.toBe(oldId)
  })

  it('changes the id rather than overflowing for a count of 2^31', async () => {
    const [a] = await devices('A')
    if (a === undefined) throw new Error()
    const me = await idOf(a)
    const file = await fileOf(a)
    const entry = file.households[0]
    if (entry === undefined) throw new Error()
    const household = entry.versions.find((v) => v.id === 'h1')
    if (household === undefined) throw new Error()
    household.clock = { [me]: MAX_COUNT }
    const got = await receive(a, file)
    expect(got.plan.changesDeviceId).toBe(true)
    await renameHousehold(a.db, 'h1', 'Casa', NOW)
    expect(await clockOf(a, 'h1')).toEqual({
      [me]: MAX_COUNT,
      [await idOf(a)]: 1,
    })
  })
})

describe('gone back in time, after the id changed (round 3, I1)', () => {
  it('still asks about a reused count under the former id', async () => {
    const [a, b, c] = await devices('A', 'B', 'C')
    if (a === undefined || b === undefined || c === undefined) throw new Error()
    await editTimes(a, 3) // e1 {A:4}
    await send(a, b)
    const old = await copyOf(a) // e1 {A:4}, e2 {A:1}
    await editTimes(a, 1, 'e2') // e2 {A:2}
    await send(a, b)
    await editTimes(a, 5) // e1 {A:9}
    await send(a, c)
    await setBack(a, old)
    await editTimes(a, 1) // e1 {A:5}, P
    const p = await amountOf(a)

    const fromB = await send(b, a, useTheirs)
    expect(classOf(fromB, 'e2')?.cause).toBe('goneBack')
    expect(classOf(fromB, 'e1')?.classification).toBe('changedHere')
    expect(fromB.plan.changesDeviceId).toBe(true)
    const newId = await idOf(a)

    const fromC = await send(c, a, keepMine)
    // Not "Changed there": A's edit is kept or replaced only by A's choice.
    expect(classOf(fromC, 'e1')).toMatchObject({
      classification: 'conflict',
      cause: 'goneBack',
    })
    expect(fromC.plan.changesDeviceId).toBe(false)
    expect(await idOf(a)).toBe(newId)
    expect(await amountOf(a)).toBe(p)
  })
})

describe('another phone takes a reused count (round 4, I1)', () => {
  it('is a transient: the restored phone is asked, and its choice spreads', async () => {
    const [a, b, c] = await devices('A', 'B', 'C')
    if (a === undefined || b === undefined || c === undefined) throw new Error()
    await editTimes(a, 3) // {A:4}
    await send(a, b)
    const old = await copyOf(a)
    await editTimes(a, 5) // {A:9}
    await send(a, c)
    await setBack(a, old)
    await editTimes(a, 1) // {A:5}, P
    const p = await amountOf(a)

    expect(classOf(await send(a, b), 'e1')?.classification).toBe('changedThere')
    // B can't see the restore: C's {A:9} replaces P without a prompt.
    expect(classOf(await send(c, b), 'e1')?.classification).toBe('changedThere')
    expect(await amountOf(b)).not.toBe(p)
    // A is asked at its next import carrying {A:9}.
    const got = await send(b, a, keepMine)
    expect(classOf(got, 'e1')?.cause).toBe('goneBack')
    await send(a, b)
    await send(b, c)
    for (const device of [a, b, c]) expect(await amountOf(device)).toBe(p)
  })
})

describe('equal clocks, different content (manual external review of revision 5, M-I-1)', () => {
  for (const [label, decide] of [
    ['Use theirs', useTheirs],
    ['Keep mine', keepMine],
  ] as const) {
    it(`settles it for good with "${label}"`, async () => {
      const [a, b, c] = await devices('A', 'B', 'C')
      if (a === undefined || b === undefined || c === undefined) {
        throw new Error()
      }
      await editTimes(a, 3) // {A:4}
      const old = await copyOf(a)
      await editTimes(a, 1) // Q at {A:5}
      const q = await amountOf(a)
      await send(a, b)
      const oldId = await idOf(a)
      await setBack(a, old)
      await editTimes(a, 1) // P at {A:5}
      const p = await amountOf(a)
      await send(a, c)

      const got = await send(b, a, decide)
      expect(classOf(got, 'e1')).toMatchObject({
        classification: 'conflict',
        cause: 'equal',
      })
      expect(got.plan.changesDeviceId).toBe(true)
      const newId = await idOf(a)
      expect(newId).not.toBe(oldId)
      const kept = decide === useTheirs ? q : p
      expect(await amountOf(a)).toBe(kept)
      expect(await clockOf(a, 'e1')).toEqual({ [oldId]: 5, [newId]: 1 })

      // C's content at {A:5} is now older, or the same as A's: no
      // question either way.
      expect(classOf(await send(c, a), 'e1')?.classification).toBe(
        decide === useTheirs ? 'changedHere' : 'nothingToDecide',
      )
      expect(await amountOf(a)).toBe(kept)
      await send(a, b)
      await send(b, c)
      await send(c, a)
      for (const device of [a, b, c]) {
        expect(await amountOf(device)).toBe(kept)
        expect(await clockOf(device, 'e1')).toEqual({
          [oldId]: 5,
          [newId]: 1,
        })
      }
    })
  }

  it('settles a record against a deletion at equal clocks', async () => {
    for (const decide of [useTheirs, keepMine]) {
      const [a, b] = await devices('A', 'B')
      if (a === undefined || b === undefined) throw new Error()
      await editTimes(a, 3) // {A:4}
      const old = await copyOf(a)
      await deleteExpense(a.db, 'e1') // deletion at {A:5}
      await send(a, b)
      await setBack(a, old)
      await editTimes(a, 1) // record at {A:5}
      const got = await send(b, a, decide)
      expect(classOf(got, 'e1')?.cause).toBe('equal')
      const after = await clockOf(a, 'e1')
      expect(compare(after, await clockOf(b, 'e1'))).toBe('newer')
      await send(a, b)
      expect(await ledgerText(a)).toBe(await ledgerText(b))
    }
  })

  it('on a phone the clock doesn’t name: bumps under its own id, which stays', async () => {
    const [a, b, c] = await devices('A', 'B', 'C')
    if (a === undefined || b === undefined || c === undefined) throw new Error()
    await editTimes(a, 3)
    const old = await copyOf(a)
    await editTimes(a, 1) // Q {A:5}
    await send(a, b)
    await setBack(a, old)
    await editTimes(a, 1) // P {A:5}
    await send(a, c)
    const bId = await idOf(b)
    const got = await send(c, b, useTheirs)
    expect(classOf(got, 'e1')?.cause).toBe('equal')
    expect(got.plan.changesDeviceId).toBe(false)
    expect(await idOf(b)).toBe(bId)
    expect((await clockOf(b, 'e1'))[bId]).toBe(1)
  })
})

describe('restore doesn’t roll back (round 2, O2)', () => {
  it('changes nothing newer when an older backup comes back', async () => {
    const [a] = await devices('A')
    if (a === undefined) throw new Error()
    const { text } = await snapshotBackup(a.db, NOW)
    await editTimes(a, 2)
    const now = await amountOf(a)
    const read = readFile(text)
    if (!read.ok) throw new Error()
    const got = await receive(a, read.file)
    expect(got.resolution.households.every((h) => h.nothingNew)).toBe(true)
    expect(await amountOf(a)).toBe(now)
  })
})
