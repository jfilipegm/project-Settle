// @vitest-environment node
/**
 * Payments in storage (M5 plan, B2 and B3): the reader, the repository's
 * reference checks inside each transaction, unreadable payments kept,
 * member deletes refused by a payment, and two tabs.
 */
import { describe, expect, it } from 'vitest'
import {
  equalSplit,
  fourMembers,
  freshDb,
  freshFactory,
  getRaw,
  household,
  member,
  putRaw,
  quickExpense,
  settlement,
} from '../test/households.ts'
import { openDatabase } from './db.ts'
import { readSettlement } from './records.ts'
import {
  HouseholdNotFoundError,
  MemberInUseError,
  MissingReferenceError,
  SettlementNotFoundError,
  createHousehold,
  deleteMember,
  deleteSettlement,
  getSettlement,
  listSettlements,
  saveExpense,
  saveSettlement,
  setMemberLeft,
} from './repository.ts'

async function seeded(factory = freshFactory()) {
  const db = await freshDb(factory)
  await createHousehold(db, household(), fourMembers())
  return db
}

describe('readSettlement (B2)', () => {
  it('reads a payment from its known fields only', () => {
    const stored = {
      ...settlement('s1', 'tiago', 'ana', 9115, { note: 'Rent' }),
      extra: 'ignored',
    }
    expect(readSettlement(stored)).toEqual(
      settlement('s1', 'tiago', 'ana', 9115, { note: 'Rent' }),
    )
    expect(readSettlement(settlement('s2', 'ana', 'marta', 1))).toEqual(
      settlement('s2', 'ana', 'marta', 1),
    )
  })

  it.each([
    ['another version', { v: 2 }],
    ['the same member twice', { toId: 'tiago' }],
    ['a zero amount', { amount: 0 }],
    ['a negative amount', { amount: -100 }],
    ['a fractional amount', { amount: 1.5 }],
    ['an amount over 1 000 000,00', { amount: 100_000_001 }],
    ['an unreal date', { date: '2026-02-30' }],
    ['a date before 2000', { date: '1999-12-31' }],
    ['an empty note', { note: ' ' }],
    ['an untrimmed note', { note: ' Rent' }],
    ['a note over 80 characters', { note: 'x'.repeat(81) }],
    ['a non-string note', { note: 5 }],
    ['a missing household', { householdId: undefined }],
    ['a missing payer', { fromId: null }],
  ])('returns null for %s, never throwing', (_name, change) => {
    expect(
      readSettlement({ ...settlement('s1', 'tiago', 'ana', 100), ...change }),
    ).toBeNull()
  })

  it.each([null, 'payment', 42, [], {}])('returns null for %j', (value) => {
    expect(readSettlement(value)).toBeNull()
  })
})

describe('payments in the repository (B3)', () => {
  it('saves, reads, replaces and deletes a payment', async () => {
    const db = await seeded()
    const paid = settlement('s1', 'tiago', 'ana', 9115)
    await saveSettlement(db, paid)
    expect(await getSettlement(db, 's1')).toEqual(paid)
    const partial = { ...paid, amount: 5000 as typeof paid.amount }
    await saveSettlement(db, partial, { replacing: true })
    expect(await listSettlements(db, 'h1')).toEqual({
      items: [partial],
      unreadable: 0,
    })
    await deleteSettlement(db, 's1')
    expect(await getSettlement(db, 's1')).toBeNull()
    expect((await listSettlements(db, 'h1')).items).toEqual([])
  })

  it('lists only the household’s own payments', async () => {
    const db = await seeded()
    await createHousehold(db, household('h2', 'Algarve'), [
      member('rui', 'Rui', 0, { householdId: 'h2' }),
      member('eva', 'Eva', 1, { householdId: 'h2' }),
    ])
    await saveSettlement(db, settlement('s1', 'ana', 'marta', 100))
    await saveSettlement(
      db,
      settlement('s2', 'rui', 'eva', 200, { householdId: 'h2' }),
    )
    expect((await listSettlements(db, 'h1')).items.map((s) => s.id)).toEqual([
      's1',
    ])
    expect((await listSettlements(db, 'h2')).items.map((s) => s.id)).toEqual([
      's2',
    ])
  })

  it('allows a payment by or to a member who has left', async () => {
    const db = await seeded()
    await setMemberLeft(db, 'h1', 'joao', '2026-09-30')
    await saveSettlement(db, settlement('s1', 'joao', 'marta', 2240))
    await saveSettlement(db, settlement('s2', 'ana', 'joao', 100))
    expect((await listSettlements(db, 'h1')).items).toHaveLength(2)
  })

  it('refuses a payment naming a member who isn’t there, writing nothing', async () => {
    const db = await seeded()
    await expect(
      saveSettlement(db, settlement('s1', 'ghost', 'ana', 100)),
    ).rejects.toEqual(new MissingReferenceError(['ghost']))
    await createHousehold(db, household('h2', 'Algarve'), [
      member('rui', 'Rui', 0, { householdId: 'h2' }),
    ])
    // A member of another household isn't a member of this one.
    await expect(
      saveSettlement(db, settlement('s2', 'ana', 'rui', 100)),
    ).rejects.toBeInstanceOf(MissingReferenceError)
    await expect(
      saveSettlement(
        db,
        settlement('s3', 'ana', 'marta', 100, { householdId: 'nope' }),
      ),
    ).rejects.toBeInstanceOf(HouseholdNotFoundError)
    expect((await getRaw(db)).settlements).toEqual([])
  })

  it('never brings back an edited payment deleted in another tab', async () => {
    const factory = freshFactory()
    const tabA = await seeded(factory)
    const tabB = await openDatabase(factory)
    const paid = settlement('s1', 'tiago', 'ana', 9115)
    await saveSettlement(tabA, paid)
    await deleteSettlement(tabB, 's1')
    await expect(
      saveSettlement(tabA, { ...paid, note: 'Edited' }, { replacing: true }),
    ).rejects.toBeInstanceOf(SettlementNotFoundError)
    expect((await getRaw(tabA)).settlements).toEqual([])
  })

  it('counts an unreadable payment and keeps it byte for byte', async () => {
    const db = await seeded()
    const broken = { ...settlement('bad', 'ana', 'marta', 100), v: 99 }
    const orphan = settlement('orphan', 'ana', 'ghost', 100)
    await putRaw(db, {
      households: [],
      members: [],
      expenses: [],
      settlements: [broken, orphan],
    })
    await saveSettlement(db, settlement('s1', 'ana', 'marta', 100))
    const listed = await listSettlements(db, 'h1')
    expect(listed.items.map((s) => s.id)).toEqual(['s1'])
    expect(listed.unreadable).toBe(2)
    const raw = (await getRaw(db)).settlements ?? []
    expect(raw).toContainEqual(broken)
    expect(raw).toContainEqual(orphan)
  })

  it('counts a payment whose member can’t be read as unreadable', async () => {
    const db = await seeded()
    await saveSettlement(db, settlement('s1', 'ana', 'tiago', 100))
    await putRaw(db, {
      households: [],
      members: [{ ...member('tiago', 'Tiago', 3), v: 99 }],
      expenses: [],
    })
    expect(await listSettlements(db, 'h1')).toEqual({
      items: [],
      unreadable: 1,
    })
  })
})

describe('deleting a member named by a payment (B3)', () => {
  it('refuses while a payment names them, sending or receiving', async () => {
    const db = await seeded()
    await saveSettlement(db, settlement('s1', 'tiago', 'ana', 100))
    for (const id of ['tiago', 'ana']) {
      await expect(deleteMember(db, 'h1', id)).rejects.toEqual(
        new MemberInUseError('referenced'),
      )
    }
    // Neither payment nor member was touched.
    const raw = await getRaw(db)
    expect(raw.settlements).toHaveLength(1)
    expect(raw.members).toHaveLength(4)
    await deleteMember(db, 'h1', 'marta')
    expect((await getRaw(db)).members).toHaveLength(3)
  })

  it('refuses while an unreadable payment of the household might name them', async () => {
    const db = await seeded()
    await putRaw(db, {
      households: [],
      members: [],
      expenses: [],
      settlements: [{ ...settlement('x', 'ana', 'marta', 100), v: 99 }],
    })
    await expect(deleteMember(db, 'h1', 'tiago')).rejects.toEqual(
      new MemberInUseError('unreadable'),
    )
  })

  it('is not blocked by another household’s payments, readable or not', async () => {
    const db = await seeded()
    await createHousehold(db, household('h2', 'Algarve'), [
      member('rui', 'Rui', 0, { householdId: 'h2' }),
      member('eva', 'Eva', 1, { householdId: 'h2' }),
    ])
    await saveSettlement(
      db,
      settlement('s1', 'rui', 'eva', 100, { householdId: 'h2' }),
    )
    await putRaw(db, {
      households: [],
      members: [],
      expenses: [],
      settlements: [
        {
          ...settlement('x', 'tiago', 'ana', 100, { householdId: 'h2' }),
          v: 99,
        },
      ],
    })
    await deleteMember(db, 'h1', 'tiago')
    expect(
      (await getRaw(db)).members.some(
        (m) => (m as { id: string }).id === 'tiago',
      ),
    ).toBe(false)
  })

  it('still checks expenses as before', async () => {
    const db = await seeded()
    await saveExpense(db, quickExpense('e1', equalSplit(100, ['tiago'])))
    await expect(deleteMember(db, 'h1', 'tiago')).rejects.toEqual(
      new MemberInUseError('referenced'),
    )
  })
})

describe('payments in two tabs (M-I-3)', () => {
  it('refuses a payment after its member was deleted elsewhere, writing nothing', async () => {
    const factory = freshFactory()
    const tabA = await seeded(factory)
    const tabB = await openDatabase(factory)
    await deleteMember(tabB, 'h1', 'tiago')
    await expect(
      saveSettlement(tabA, settlement('s1', 'tiago', 'ana', 100)),
    ).rejects.toBeInstanceOf(MissingReferenceError)
    expect((await getRaw(tabA)).settlements).toEqual([])
  })

  it('refuses a delete after a payment naming them was saved elsewhere', async () => {
    const factory = freshFactory()
    const tabA = await seeded(factory)
    const tabB = await openDatabase(factory)
    await saveSettlement(tabA, settlement('s1', 'ana', 'tiago', 100))
    await expect(deleteMember(tabB, 'h1', 'tiago')).rejects.toBeInstanceOf(
      MemberInUseError,
    )
  })

  it('started together, exactly one wins and no payment is orphaned', async () => {
    for (let round = 0; round < 10; round++) {
      const factory = freshFactory()
      const tabA = await seeded(factory)
      const tabB = await openDatabase(factory)
      const [save, del] = await Promise.allSettled([
        saveSettlement(tabA, settlement('s1', 'tiago', 'ana', 100)),
        deleteMember(tabB, 'h1', 'tiago'),
      ])
      expect([save.status, del.status].sort()).toEqual([
        'fulfilled',
        'rejected',
      ])
      const raw = await getRaw(tabA)
      const tiagoExists = raw.members.some(
        (m) => (m as { id: string }).id === 'tiago',
      )
      expect((raw.settlements ?? []).length === 1 ? tiagoExists : true).toBe(
        true,
      )
    }
  })
})
