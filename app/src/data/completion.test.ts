// @vitest-environment node
/**
 * The roadmap's completion criterion for M4 (plan, acceptance targets,
 * REQ-11): a household with 4 members, 30+ expenses of both kinds, a
 * member who leaves and one who joins, and several corrections survives a
 * reload and an app update. Over the real repositories and fake-indexeddb.
 */
import { describe, expect, it } from 'vitest'
import fixture from './fixtures/v1.json'
import {
  NOW,
  freshFactory,
  getRaw,
  household,
  member,
  putRaw,
  testSchemaV2,
  withoutVersion,
} from '../test/households.ts'
import { createBill } from '../features/split/billReducer.ts'
import type { Bill } from '../features/split/model.ts'
import {
  RECORD_VERSION,
  type Expense,
  type QuickSplit,
} from '../features/household/model.ts'
import { expenseShares } from '../features/household/shares.ts'
import {
  categoryTotals,
  inMonth,
  totalOf,
} from '../features/household/totals.ts'
import { cents } from '../lib/money.ts'
import { createSchemaV1, openDatabase } from './db.ts'
import {
  addMember,
  createHousehold,
  deleteExpense,
  listExpenses,
  listHouseholds,
  listMembers,
  saveExpense,
  setMemberLeft,
} from './repository.ts'

const MEMBERS = ['ana', 'marta', 'joao', 'tiago']

function quick(
  i: number,
  split: QuickSplit,
  extra: Partial<Expense> = {},
): Expense {
  const month = i < 12 ? '08' : '09'
  return {
    v: RECORD_VERSION,
    id: `q${i}`,
    householdId: 'h1',
    description: `Quick ${i}`,
    date: `2026-${month}-${String((i % 27) + 1).padStart(2, '0')}`,
    category:
      (['groceries', 'utilities', 'rent', 'internet'] as const)[i % 4] ??
      'other',
    payerId: MEMBERS[i % 4] ?? 'ana',
    split,
    createdAt: NOW,
    updatedAt: NOW,
    ...extra,
  }
}

function quickSplit(i: number, people: string[]): QuickSplit {
  const amount = cents(1000 + i * 137)
  switch (i % 4) {
    case 0:
      return { kind: 'equal', amount, memberIds: people }
    case 1:
      return {
        kind: 'shares',
        amount,
        shares: people.map((memberId, k) => ({ memberId, weight: k + 1 })),
      }
    case 2: {
      const each = Math.floor(amount / people.length)
      return {
        kind: 'exact',
        amount,
        amounts: people.map((memberId, k) => ({
          memberId,
          amount: cents(k === 0 ? amount - each * (people.length - 1) : each),
        })),
      }
    }
    default: {
      const units = Math.floor(100_000 / people.length)
      return {
        kind: 'percent',
        amount,
        percents: people.map((memberId, k) => ({
          memberId,
          ratio: {
            numerator: k === 0 ? 100_000 - units * (people.length - 1) : units,
            denominator: 1000,
          },
        })),
      }
    }
  }
}

function itemisedBill(i: number, people: string[]): Bill {
  const bill = createBill([people[0] ?? 'p', people[1] ?? 'q', `item-${i}`])
  bill.people = people.map((id) => ({ id, name: id }))
  bill.items = [
    {
      id: `item-${i}`,
      name: `Thing ${i}`,
      quantity: { numerator: 1 + (i % 3), denominator: 1 },
      unitPrice: cents(299 + i * 41),
      assignees: people.map((personId) => ({ personId, weight: 1 })),
    },
  ]
  bill.tip = { kind: 'percent', ratio: { numerator: 5, denominator: 1 } }
  bill.payerId = people[0] ?? ''
  return bill
}

function itemised(
  i: number,
  people: string[],
  extra: Partial<Expense> = {},
): Expense {
  return {
    v: RECORD_VERSION,
    id: `it${i}`,
    householdId: 'h1',
    description: `Shop ${i}`,
    date: `2026-09-${String(i + 10).padStart(2, '0')}`,
    category: 'groceries',
    payerId: people[i % people.length] ?? 'ana',
    split: {
      kind: 'itemised',
      bill: itemisedBill(i, people),
      members: people.map((id) => ({ personId: id, memberId: id })),
    },
    createdAt: NOW,
    updatedAt: NOW,
    ...extra,
  }
}

/** What a household reads as: its records, shares and month totals. */
async function snapshot(db: IDBDatabase) {
  const households = (await listHouseholds(db)).items
  const members = (await listMembers(db, 'h1')).items
  const listed = await listExpenses(db, 'h1')
  const expenses = [...listed.items].sort((a, b) => a.id.localeCompare(b.id))
  return {
    households,
    members: [...members].sort((a, b) => a.id.localeCompare(b.id)),
    unreadable: listed.unreadable,
    expenses,
    shares: expenses.map((e) => [e.id, [...(expenseShares(e) ?? [])]]),
    months: ['2026-08', '2026-09'].map((month) => [
      month,
      totalOf(inMonth(expenses, month)),
      categoryTotals(inMonth(expenses, month)),
    ]),
  }
}

async function buildScenario(factory: IDBFactory) {
  const db = await openDatabase(factory)
  await createHousehold(
    db,
    household(),
    MEMBERS.map((id, position) =>
      member(id, id[0]?.toUpperCase() + id.slice(1), position),
    ),
  )
  // 24 quick expenses, the four methods in turn.
  for (let i = 0; i < 24; i++) {
    await saveExpense(
      db,
      quick(i, quickSplit(i, i < 12 ? MEMBERS : MEMBERS.slice(0, 3))),
    )
  }
  // João leaves at the end of August; Rui joins in September.
  await setMemberLeft(db, 'h1', 'joao', '2026-08-31')
  await addMember(
    db,
    {
      v: RECORD_VERSION,
      id: 'rui',
      householdId: 'h1',
      name: 'Rui',
      joinedOn: '2026-09-01',
    },
    '2026-09-01',
  )
  // 10 itemised expenses in September; one with its receipt and key.
  for (let i = 0; i < 10; i++) {
    const people = i % 2 === 0 ? ['ana', 'marta', 'rui'] : ['ana', 'tiago']
    await saveExpense(
      db,
      itemised(
        i,
        people,
        i === 0
          ? {
              receipt: {
                merchant: 'Continente',
                date: '2026-09-10',
                total: cents(1000),
                totalSource: 'qr',
              },
              receiptKey: 'qr:502011475:ABC-1',
            }
          : {},
      ),
    )
  }
  // Six corrections: three edits (amount, payer, split), three deletes.
  await saveExpense(
    db,
    quick(
      1,
      { ...quickSplit(1, MEMBERS), amount: cents(9999) },
      { updatedAt: 'edit' },
    ),
  )
  await saveExpense(
    db,
    quick(2, quickSplit(2, MEMBERS), { payerId: 'rui', date: '2026-09-02' }),
  )
  await saveExpense(db, quick(3, quickSplit(3, ['ana', 'tiago'])))
  await deleteExpense(db, 'q20')
  await deleteExpense(db, 'q21')
  await deleteExpense(db, 'it9')
  return db
}

describe('the M4 completion scenario (REQ-11)', () => {
  it('survives a reload, an app update and a round trip', async () => {
    const factory = freshFactory()
    const db = await buildScenario(factory)
    const before = await snapshot(db)
    expect(before.expenses).toHaveLength(31)
    expect(before.unreadable).toBe(0)
    expect(before.members.find((m) => m.id === 'joao')?.leftOn).toBe(
      '2026-08-31',
    )
    expect(before.members.find((m) => m.id === 'rui')).toMatchObject({
      position: 4,
    })
    // Both kinds, all four quick methods.
    const kinds = new Set(before.expenses.map((e) => e.split.kind))
    expect(kinds).toEqual(
      new Set(['equal', 'shares', 'exact', 'percent', 'itemised']),
    )
    for (const [, shares] of before.shares) expect(shares).not.toHaveLength(0)
    db.close()

    // 1. A reload.
    const reloaded = await openDatabase(factory)
    expect(await snapshot(reloaded)).toEqual(before)
    reloaded.close()

    // 2. An app update: the test-only version-2 upgrade (L1-I1).
    const upgraded = await openDatabase(factory, {
      migrations: [createSchemaV1, testSchemaV2],
    })
    const raw = await getRaw(upgraded)
    expect(raw.expenses.every((r) => (r as { v: number }).v === 2)).toBe(true)
    upgraded.close()
    // Read back with version-2-aware eyes: the content, without `v`.
    const v1Again = freshFactory()
    const back = await openDatabase(v1Again)
    await putRaw(back, {
      households: raw.households.map((r) => ({ ...(r as object), v: 1 })),
      members: raw.members.map((r) => ({ ...(r as object), v: 1 })),
      expenses: raw.expenses.map((r) => ({ ...(r as object), v: 1 })),
    })
    expect(await snapshot(back)).toEqual(before)
    back.close()

    // 3. A fixture round trip: the raw records into a fresh database.
    const exported = await getRaw(
      await openDatabase(factory, {
        migrations: [createSchemaV1, testSchemaV2],
      }),
    )
    const trip = await openDatabase(freshFactory())
    await putRaw(trip, {
      households: withoutVersion(exported.households).map((r) => ({
        ...(r as object),
        v: 1,
      })),
      members: withoutVersion(exported.members).map((r) => ({
        ...(r as object),
        v: 1,
      })),
      expenses: withoutVersion(exported.expenses).map((r) => ({
        ...(r as object),
        v: 1,
      })),
    })
    expect(await snapshot(trip)).toEqual(before)
    trip.close()
  })

  it('still reads the frozen version-1 snapshot back equal (H2)', async () => {
    const factory = freshFactory()
    const db = await openDatabase(factory)
    await putRaw(db, fixture)
    db.close()
    const again = await openDatabase(factory)
    const listed = await listExpenses(again, 'h1')
    expect(listed.unreadable).toBe(0)
    expect([...listed.items].sort((a, b) => a.id.localeCompare(b.id))).toEqual(
      [...fixture.expenses].sort((a, b) => a.id.localeCompare(b.id)),
    )
    again.close()
  })
})
