// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  NOW,
  TODAY,
  equalSplit,
  fourMembers,
  freshDb,
  freshFactory,
  getRaw,
  household,
  member,
  putRaw,
  quickExpense,
} from '../test/households.ts'
import { openDatabase } from './db.ts'
import {
  HouseholdNotFoundError,
  MemberInUseError,
  MemberLimitError,
  MissingReferenceError,
  addMember,
  createHousehold,
  deleteExpense,
  deleteMember,
  expensesWithReceiptKey,
  getExpense,
  listExpenses,
  listHouseholds,
  listMembers,
  renameHousehold,
  renameMember,
  saveExpense,
  setHouseholdArchived,
  setMemberLeft,
} from './repository.ts'

async function seeded(factory = freshFactory()) {
  const db = await freshDb(factory)
  await createHousehold(db, household(), fourMembers())
  return db
}

describe('households and members', () => {
  it('creates, renames, archives and restores a household', async () => {
    const db = await seeded()
    await renameHousehold(db, 'h1', 'Casa', NOW)
    await setHouseholdArchived(db, 'h1', NOW, NOW)
    let [only] = (await listHouseholds(db)).items
    expect(only).toMatchObject({ name: 'Casa', archivedAt: NOW })
    await setHouseholdArchived(db, 'h1', null, NOW)
    ;[only] = (await listHouseholds(db)).items
    expect(only).not.toHaveProperty('archivedAt')
  })

  it('adds members after the last position, and marks them as left', async () => {
    const db = await seeded()
    const added = await addMember(
      db,
      { v: 1, id: 'rui', householdId: 'h1', name: 'Rui', joinedOn: TODAY },
      TODAY,
    )
    expect(added.position).toBe(4)
    await renameMember(db, 'h1', 'rui', 'Rui S.')
    await setMemberLeft(db, 'h1', 'joao', '2026-09-30')
    const { items } = await listMembers(db, 'h1')
    expect(items.find((m) => m.id === 'joao')?.leftOn).toBe('2026-09-30')
    expect(items.find((m) => m.id === 'rui')?.name).toBe('Rui S.')
    await setMemberLeft(db, 'h1', 'joao', null)
    expect(
      (await listMembers(db, 'h1')).items.find((m) => m.id === 'joao'),
    ).not.toHaveProperty('leftOn')
  })

  it('stops at 20 active members', async () => {
    const db = await freshDb()
    const many = Array.from({ length: 20 }, (_, i) =>
      member(`m${i}`, `M${i}`, i),
    )
    await createHousehold(db, household(), many)
    await expect(
      addMember(
        db,
        { v: 1, id: 'x', householdId: 'h1', name: 'X', joinedOn: TODAY },
        TODAY,
      ),
    ).rejects.toBeInstanceOf(MemberLimitError)
  })

  it('keeps 20 active members when undoing a leave', async () => {
    const db = await freshDb()
    const many = Array.from({ length: 20 }, (_, i) =>
      member(`m${i}`, `M${i}`, i),
    )
    await createHousehold(db, household(), many)
    await setMemberLeft(db, 'h1', 'm0', '2026-09-30', TODAY)
    await addMember(
      db,
      { v: 1, id: 'x', householdId: 'h1', name: 'X', joinedOn: TODAY },
      TODAY,
    )
    await expect(
      setMemberLeft(db, 'h1', 'm0', null, TODAY),
    ).rejects.toBeInstanceOf(MemberLimitError)
    // A later leaving date, still in the past, is fine.
    await setMemberLeft(db, 'h1', 'm0', '2026-10-01', TODAY)
    const m0 = (await listMembers(db, 'h1')).items.find((m) => m.id === 'm0')
    expect(m0?.leftOn).toBe('2026-10-01')
  })

  it('keeps 20 active members when an expense adds members', async () => {
    const db = await freshDb()
    const many = Array.from({ length: 19 }, (_, i) =>
      member(`m${i}`, `M${i}`, i),
    )
    await createHousehold(db, household(), many)
    const newcomer = (id: string) => ({
      v: 1 as const,
      id,
      householdId: 'h1',
      name: id,
      joinedOn: '2026-10-01',
    })
    const expense = quickExpense('e1', equalSplit(1000, ['m0', 'n1', 'n2']), {
      payerId: 'm0',
    })
    await expect(
      saveExpense(db, expense, [newcomer('n1'), newcomer('n2')], TODAY),
    ).rejects.toBeInstanceOf(MemberLimitError)
    expect((await listMembers(db, 'h1')).items).toHaveLength(19)
    expect(await getExpense(db, 'e1')).toBeNull()
    const one = quickExpense('e1', equalSplit(1000, ['m0', 'n1']), {
      payerId: 'm0',
    })
    await saveExpense(db, one, [newcomer('n1')], TODAY)
    expect((await listMembers(db, 'h1')).items).toHaveLength(20)
  })
})

describe('expenses', () => {
  it('saves, reads, replaces and deletes an expense', async () => {
    const db = await seeded()
    const expense = quickExpense('e1', equalSplit(1000, ['ana', 'marta']))
    await saveExpense(db, expense)
    expect(await getExpense(db, 'e1')).toEqual(expense)
    const edited = { ...expense, payerId: 'tiago', updatedAt: 'later' }
    await saveExpense(db, edited)
    expect((await listExpenses(db, 'h1')).items).toEqual([edited])
    await deleteExpense(db, 'e1')
    expect((await listExpenses(db, 'h1')).items).toEqual([])
  })

  it('refuses an expense naming a member who isn’t there, writing nothing', async () => {
    const db = await seeded()
    await expect(
      saveExpense(db, quickExpense('e1', equalSplit(1000, ['ana', 'ghost']))),
    ).rejects.toBeInstanceOf(MissingReferenceError)
    await expect(
      saveExpense(
        db,
        quickExpense('e2', equalSplit(1000, ['ana']), { householdId: 'nope' }),
      ),
    ).rejects.toBeInstanceOf(HouseholdNotFoundError)
    expect((await getRaw(db)).expenses).toEqual([])
  })

  it('saves new members with the expense in one transaction (R3-O1)', async () => {
    const db = await seeded()
    const rui = {
      v: 1 as const,
      id: 'rui',
      householdId: 'h1',
      name: 'Rui',
      joinedOn: TODAY,
    }
    const added = await saveExpense(
      db,
      quickExpense('e1', equalSplit(900, ['ana', 'rui'])),
      [rui],
    )
    expect(added.map((m) => [m.id, m.position])).toEqual([['rui', 4]])
    expect((await listExpenses(db, 'h1')).items).toHaveLength(1)

    // A failed save leaves no new member behind.
    const eva = { ...rui, id: 'eva', name: 'Eva' }
    await expect(
      saveExpense(db, quickExpense('e2', equalSplit(900, ['eva', 'ghost'])), [
        eva,
      ]),
    ).rejects.toBeInstanceOf(MissingReferenceError)
    expect((await listMembers(db, 'h1')).items.map((m) => m.id)).not.toContain(
      'eva',
    )
  })

  it('finds expenses by receipt key within the household', async () => {
    const db = await seeded()
    await saveExpense(
      db,
      quickExpense('e1', equalSplit(100, ['ana']), { receiptKey: 'qr:1:A' }),
    )
    await saveExpense(db, quickExpense('e2', equalSplit(100, ['ana'])))
    expect(
      (await expensesWithReceiptKey(db, 'h1', 'qr:1:A')).map((e) => e.id),
    ).toEqual(['e1'])
    expect(await expensesWithReceiptKey(db, 'h1', 'qr:1:B')).toEqual([])
  })

  it('counts an unreadable record and keeps it byte for byte (H1)', async () => {
    const db = await seeded()
    const broken = { ...quickExpense('bad', equalSplit(100, ['ana'])), v: 99 }
    await putRaw(db, { households: [], members: [], expenses: [broken] })
    const listed = await listExpenses(db, 'h1')
    expect(listed).toEqual({ items: [], unreadable: 1 })
    expect((await getRaw(db)).expenses).toEqual([broken])
  })
})

describe('deleting a member (H7, M-I-4)', () => {
  it('deletes an unused member', async () => {
    const db = await seeded()
    await deleteMember(db, 'h1', 'tiago')
    expect((await listMembers(db, 'h1')).items.map((m) => m.id)).not.toContain(
      'tiago',
    )
  })

  it('refuses while an expense names them, as payer or in the split', async () => {
    const db = await seeded()
    await saveExpense(
      db,
      quickExpense('e1', equalSplit(100, ['marta']), { payerId: 'tiago' }),
    )
    await expect(deleteMember(db, 'h1', 'tiago')).rejects.toEqual(
      new MemberInUseError('referenced'),
    )
    await expect(deleteMember(db, 'h1', 'marta')).rejects.toEqual(
      new MemberInUseError('referenced'),
    )
  })

  it.each([
    [
      'an unreadable expense naming them',
      { ...quickExpense('x', equalSplit(100, ['tiago'])), description: '' },
    ],
    [
      'an unsupported record version',
      { ...quickExpense('x', equalSplit(100, ['ana'])), v: 99 },
    ],
    ['an expense with no readable household', { id: 'x', payerId: 'tiago' }],
  ])('fails closed on %s, changing nothing', async (_name, raw) => {
    const db = await seeded()
    await putRaw(db, { households: [], members: [], expenses: [raw] })
    const before = await getRaw(db)
    await expect(deleteMember(db, 'h1', 'tiago')).rejects.toEqual(
      new MemberInUseError('unreadable'),
    )
    expect(await getRaw(db)).toEqual(before)
  })

  it('is not blocked by another household’s unreadable expense', async () => {
    const db = await seeded()
    const other = {
      ...quickExpense('x', equalSplit(100, ['zz'])),
      householdId: 'h2',
      v: 99,
    }
    await putRaw(db, { households: [], members: [], expenses: [other] })
    await deleteMember(db, 'h1', 'tiago')
    expect((await listMembers(db, 'h1')).items.map((m) => m.id)).not.toContain(
      'tiago',
    )
  })
})

describe('two tabs: two connections to one database (M-I-3)', () => {
  it('refuses a save after its member was deleted elsewhere', async () => {
    const factory = freshFactory()
    const tabA = await seeded(factory)
    const tabB = await openDatabase(factory)
    await deleteMember(tabB, 'h1', 'tiago')
    await expect(
      saveExpense(tabA, quickExpense('e1', equalSplit(100, ['ana', 'tiago']))),
    ).rejects.toBeInstanceOf(MissingReferenceError)
    expect((await getRaw(tabA)).expenses).toEqual([])
  })

  it('refuses a delete after an expense naming them was saved elsewhere', async () => {
    const factory = freshFactory()
    const tabA = await seeded(factory)
    const tabB = await openDatabase(factory)
    await saveExpense(tabA, quickExpense('e1', equalSplit(100, ['tiago'])))
    await expect(deleteMember(tabB, 'h1', 'tiago')).rejects.toBeInstanceOf(
      MemberInUseError,
    )
  })

  it('started together, exactly one wins and nothing is orphaned', async () => {
    for (let round = 0; round < 10; round++) {
      const factory = freshFactory()
      const tabA = await seeded(factory)
      const tabB = await openDatabase(factory)
      const [save, del] = await Promise.allSettled([
        saveExpense(
          tabA,
          quickExpense('e1', equalSplit(100, ['ana', 'tiago'])),
        ),
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
      const expenseSaved = raw.expenses.length === 1
      // Never an expense naming a member who is gone.
      expect(expenseSaved ? tiagoExists : true).toBe(true)
    }
  })
})
