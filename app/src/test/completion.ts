/**
 * The completion scenario's household (M4, M5), shared by the completion
 * tests: 4 members, 30+ expenses of both kinds, a member who leaves and
 * one who joins, and corrections. M6's two-device scenario builds it too.
 */
import { createBill } from '../features/split/billReducer.ts'
import type { Bill } from '../features/split/model.ts'
import {
  RECORD_VERSION,
  type Expense,
  type QuickSplit,
} from '../features/household/model.ts'
import { cents } from '../lib/money.ts'
import { MIGRATIONS, openDatabase, type Migration } from '../data/db.ts'
import {
  addMember,
  createHousehold,
  deleteExpense,
  saveExpense,
  setMemberLeft,
} from '../data/repository.ts'
import {
  NOW,
  freshFactory,
  getRaw,
  household,
  member,
  putRaw,
} from './households.ts'

export const MEMBERS = ['ana', 'marta', 'joao', 'tiago']

export function quick(
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

export function quickSplit(i: number, people: string[]): QuickSplit {
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

export function itemisedBill(i: number, people: string[]): Bill {
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

export function itemised(
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

/**
 * The scenario in a database of `migrations`' version. Today's repository
 * writes version 3's record versions (M6, E4), so an older database gets
 * the same records copied in raw, as its own version stored them.
 */
export async function buildScenario(
  factory: IDBFactory,
  migrations: readonly Migration[] = MIGRATIONS,
  {
    editedAt = 'edit',
  }: {
    /** The edited expense's `updatedAt`: M4's tests used a marker. */
    editedAt?: string
  } = {},
) {
  if (migrations.length < MIGRATIONS.length) {
    const scratch = await buildScenario(freshFactory(), MIGRATIONS, {
      editedAt,
    })
    const raw = await getRaw(scratch)
    scratch.close()
    const db = await openDatabase(factory, { migrations })
    await putRaw(db, {
      households: raw.households,
      members: raw.members,
      expenses: raw.expenses,
      settlements: db.objectStoreNames.contains('settlements')
        ? raw.settlements
        : [],
    })
    return db
  }
  const db = await openDatabase(factory, { migrations })
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
  await addMember(db, {
    v: RECORD_VERSION,
    id: 'rui',
    householdId: 'h1',
    name: 'Rui',
    joinedOn: '2026-09-01',
  })
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
      { updatedAt: editedAt },
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
