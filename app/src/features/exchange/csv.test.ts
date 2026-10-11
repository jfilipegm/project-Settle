// @vitest-environment node
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { translator } from '../../i18n/t.ts'
import { cents } from '../../lib/money.ts'
import { createBill } from '../split/billReducer.ts'
import {
  RECORD_VERSION,
  type Expense,
  type Member,
  type Settlement,
} from '../household/model.ts'
import { expenseAmount } from '../household/shares.ts'
import { csvAmount, csvSeparators, householdCsv, safeText } from './csv.ts'

const NOW = '2026-10-09T12:00:00.000Z'

const members: Member[] = [
  {
    v: 1,
    id: 'ana',
    householdId: 'h1',
    name: 'Ana',
    position: 0,
    joinedOn: '2026-01-01',
  },
  {
    v: 1,
    id: 'joao',
    householdId: 'h1',
    name: 'João',
    position: 1,
    joinedOn: '2026-01-01',
    leftOn: '2026-09-30',
  },
  {
    v: 1,
    id: 'marta',
    householdId: 'h1',
    name: 'Marta "M"',
    position: 2,
    joinedOn: '2026-01-01',
  },
  {
    v: 1,
    id: 'rui',
    householdId: 'h1',
    name: '=Rui',
    position: 3,
    joinedOn: '2026-02-01',
  },
]

function expense(id: string, extra: Partial<Expense>): Expense {
  return {
    v: RECORD_VERSION,
    id,
    householdId: 'h1',
    description: 'Groceries',
    date: '2026-09-01',
    category: 'groceries',
    payerId: 'ana',
    split: {
      kind: 'equal',
      amount: cents(1000),
      memberIds: ['ana', 'joao', 'marta'],
    },
    createdAt: NOW,
    updatedAt: NOW,
    ...extra,
  }
}

function itemised(): Expense {
  const bill = createBill(['ana', 'marta', 'item1'])
  bill.people = [
    { id: 'ana', name: 'Ana' },
    { id: 'marta', name: '' },
  ]
  bill.items = [
    {
      id: 'item1',
      name: 'Pão',
      quantity: { numerator: 3, denominator: 1 },
      unitPrice: cents(129),
      assignees: [
        { personId: 'ana', weight: 1 },
        { personId: 'marta', weight: 2 },
      ],
    },
  ]
  bill.tip = { kind: 'amount', value: cents(100) }
  bill.payerId = 'marta'
  return expense('it1', {
    description: 'Continente',
    date: '2026-09-10',
    payerId: 'marta',
    split: {
      kind: 'itemised',
      bill,
      members: [
        { personId: 'ana', memberId: 'ana' },
        { personId: 'marta', memberId: 'marta' },
      ],
    },
  })
}

const expenses: Expense[] = [
  expense('e2', {
    description: '=SUM(A1:A9)',
    date: '2026-09-05',
    category: 'eatingOut',
    payerId: 'rui',
    split: {
      kind: 'shares',
      amount: cents(4567),
      shares: [
        { memberId: 'ana', weight: 1 },
        { memberId: 'rui', weight: 2 },
      ],
    },
  }),
  expense('e1', { description: 'Café, pão e "bolos"' }),
  itemised(),
]

const settlements: Settlement[] = [
  {
    v: 1,
    id: 's1',
    householdId: 'h1',
    fromId: 'joao',
    toId: 'ana',
    amount: cents(123456),
    date: '2026-09-20',
    note: 'Renda\nde setembro',
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    v: 1,
    id: 's2',
    householdId: 'h1',
    fromId: 'rui',
    toId: 'marta',
    amount: cents(500),
    date: '2026-09-02',
    createdAt: NOW,
    updatedAt: NOW,
  },
]

const goldenPath = (name: string) =>
  fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url))

function golden(name: string, actual: string) {
  if (process.env.UPDATE_GOLDEN === '1') writeFileSync(goldenPath(name), actual)
  expect(actual).toBe(readFileSync(goldenPath(name), 'utf8'))
}

describe('CSV export (M6 plan, E11)', () => {
  it('matches the pt-PT golden file', () => {
    golden(
      'household.pt-PT.csv',
      householdCsv({
        t: translator('pt'),
        region: { locale: 'pt-PT', currency: 'EUR' },
        members,
        expenses,
        settlements,
      }),
    )
  })

  it('matches the en-GB golden file', () => {
    golden(
      'household.en-GB.csv',
      householdCsv({
        t: translator('en'),
        region: { locale: 'en-GB', currency: 'GBP' },
        members,
        expenses,
        settlements,
      }),
    )
  })

  it('starts with a byte-order mark, ends lines with CRLF, oldest first', () => {
    const text = householdCsv({
      t: translator('en'),
      region: { locale: 'en-GB', currency: 'EUR' },
      members,
      expenses,
      settlements,
    })
    expect(text.startsWith('﻿Type,Date,')).toBe(true)
    expect(text.endsWith('\r\n')).toBe(true)
    const dates = text
      .split('\r\n')
      .slice(1, -1)
      .map((line) => /,(\d{4}-\d{2}-\d{2}),/.exec(line)?.[1])
      .filter((date) => date !== undefined)
    expect(dates).toEqual([...dates].sort())
  })

  it('makes shares sum to each expense’s amount in every row', () => {
    for (const region of [
      { locale: 'pt-PT', currency: 'EUR' },
      { locale: 'en-GB', currency: 'EUR' },
    ] as const) {
      const { cell, decimal } = csvSeparators(region)
      const text = householdCsv({
        t: translator('en'),
        region,
        members,
        expenses,
        settlements: [],
      })
      const toCents = (value: string) =>
        Math.round(Number(value.replace(decimal, '.')) * 100)
      for (const expense of expenses) {
        const amount = expenseAmount(expense)
        // Find the row by its amount column; the shares follow it.
        const line = text
          .split('\r\n')
          .find((row) => row.includes(csvAmount(amount ?? cents(0), decimal)))
        expect(line, expense.id).toBeDefined()
        const cells = (line ?? '').split(cell)
        const shares = cells.slice(-members.length).filter((c) => c !== '')
        expect(shares.map(toCents).reduce((a, b) => a + b, 0)).toBe(amount)
      }
    }
  })

  it('never lets a cell start a formula', () => {
    for (const text of ['=1+1', '+1', '-1', '@SUM(1)', '\tx', '\rx']) {
      expect(safeText(text).startsWith("'")).toBe(true)
    }
    expect(safeText('Groceries')).toBe('Groceries')
    const csv = householdCsv({
      t: translator('en'),
      region: { locale: 'en-GB', currency: 'EUR' },
      members,
      expenses,
      settlements,
    })
    expect(csv).toContain(",'=Rui")
    expect(csv).toContain(",'=SUM(A1:A9),")
    // Amounts are numbers, never escaped.
    expect(csv).not.toContain("'45.67")
  })

  it('writes amounts without symbol or grouping', () => {
    expect(csvAmount(cents(123456), ',')).toBe('1234,56')
    expect(csvAmount(cents(5), '.')).toBe('0.05')
    expect(csvAmount(cents(-250), '.')).toBe('-2.50')
  })
})
