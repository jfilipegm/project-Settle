/**
 * Test helpers for the Settle file and the merge (M6): a household with
 * every kind of record, written through the real repository.
 */
import { createBill } from '../features/split/billReducer.ts'
import type { Bill } from '../features/split/model.ts'
import {
  RECORD_VERSION,
  type Expense,
  type Member,
  type QuickSplit,
  type Settlement,
} from '../features/household/model.ts'
import { cents } from '../lib/money.ts'
import {
  createHousehold,
  saveExpense,
  saveSettlement,
  setHouseholdArchived,
  setMemberLeft,
} from '../data/repository.ts'
import { NOW, household } from './households.ts'

/** The member ids of a rich household: unique across households. */
export function richIds(householdId: string) {
  const id = (name: string) => `${householdId}-${name}`
  return {
    ana: id('ana'),
    marta: id('marta'),
    joao: id('joao'),
    tiago: id('tiago'),
  }
}

function richBill(people: string[], prefix: string): Bill {
  const bill = createBill([
    people[0] ?? 'p',
    people[1] ?? 'q',
    `${prefix}-item1`,
  ])
  bill.people = people.map((id, i) => ({ id, name: i === 0 ? '' : id }))
  bill.items = [
    {
      id: `${prefix}-item1`,
      name: 'Pão',
      quantity: { numerator: 3, denominator: 1 },
      unitPrice: cents(129),
      assignees: people.map((personId) => ({ personId, weight: 1 })),
    },
    {
      id: `${prefix}-item2`,
      name: 'Queijo da Serra',
      quantity: { numerator: 75, denominator: 100 },
      unitPrice: cents(1899),
      assignees: [{ personId: people[0] ?? '', weight: 2 }],
    },
  ]
  bill.tax = { kind: 'percent', ratio: { numerator: 6, denominator: 1 } }
  bill.tip = { kind: 'amount', value: cents(150) }
  bill.tipMode = 'equal'
  bill.discount = { kind: 'amount', value: cents(200) }
  bill.payerId = people[0] ?? ''
  return bill
}

/**
 * A household with members (one who left), every kind of expense (equal,
 * shares, exact, percent, itemised with tax, tip and a discount), and
 * payments with and without a note.
 */
export async function buildRichHousehold(
  db: IDBDatabase,
  householdId = 'h1',
  name = 'Rua das Flores 12',
  { archived = false }: { archived?: boolean } = {},
): Promise<void> {
  const m = richIds(householdId)
  const members: Member[] = [m.ana, m.marta, m.joao, m.tiago].map(
    (id, position) => ({
      v: RECORD_VERSION,
      id,
      householdId,
      name: ['Ana', 'Marta', 'João', 'Tiago'][position] ?? 'X',
      position,
      joinedOn: '2026-01-01',
    }),
  )
  await createHousehold(db, household(householdId, name), members)
  const all = [m.ana, m.marta, m.joao, m.tiago]
  const amount = cents(4567)
  const splits: QuickSplit[] = [
    { kind: 'equal', amount, memberIds: all },
    {
      kind: 'shares',
      amount,
      shares: all.map((memberId, k) => ({ memberId, weight: k + 1 })),
    },
    {
      kind: 'exact',
      amount,
      amounts: [
        { memberId: m.ana, amount: cents(4000) },
        { memberId: m.marta, amount: cents(567) },
      ],
    },
    {
      kind: 'percent',
      amount,
      percents: [
        { memberId: m.ana, ratio: { numerator: 33_333, denominator: 1000 } },
        { memberId: m.joao, ratio: { numerator: 66_667, denominator: 1000 } },
      ],
    },
  ]
  for (const [i, split] of splits.entries()) {
    await saveExpense(db, {
      v: RECORD_VERSION,
      id: `${householdId}-q${i}`,
      householdId,
      description: `Compras ${i} “ok”`,
      date: `2026-09-0${i + 1}`,
      category: 'groceries',
      payerId: all[i] ?? m.ana,
      split,
      createdAt: NOW,
      updatedAt: NOW,
    })
  }
  const people = [m.ana, m.marta, m.tiago]
  const itemised: Expense = {
    v: RECORD_VERSION,
    id: `${householdId}-it1`,
    householdId,
    description: 'Continente',
    date: '2026-09-10',
    category: 'groceries',
    payerId: m.marta,
    split: {
      kind: 'itemised',
      bill: richBill(people, householdId),
      members: people.map((id) => ({ personId: id, memberId: id })),
    },
    receipt: {
      merchant: 'Continente',
      merchantTaxId: '502011475',
      date: '2026-09-10',
      total: cents(1000),
      totalSource: 'qr',
    },
    receiptKey: 'qr:502011475:ABC-1',
    createdAt: NOW,
    updatedAt: NOW,
  }
  await saveExpense(db, itemised)
  const payment = (
    id: string,
    extra: Partial<Settlement> = {},
  ): Settlement => ({
    v: RECORD_VERSION,
    id: `${householdId}-${id}`,
    householdId,
    fromId: m.joao,
    toId: m.ana,
    amount: cents(1500),
    date: '2026-09-20',
    createdAt: NOW,
    updatedAt: NOW,
    ...extra,
  })
  await saveSettlement(db, payment('s1'))
  await saveSettlement(db, payment('s2', { note: 'Renda de setembro' }))
  await setMemberLeft(db, householdId, m.joao, '2026-09-30')
  if (archived) await setHouseholdArchived(db, householdId, NOW, NOW)
}
