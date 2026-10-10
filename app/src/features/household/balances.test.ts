// @vitest-environment node
/**
 * The balances engine (M5 plan, B4, acceptance targets): seeded property
 * sweeps, a planted zero-sum-groups generator against a brute force, the
 * hand-checked examples of Phase 3's edge cases, and the budgets.
 */
import { describe, expect, it } from 'vitest'
import { cents, type Cents } from '../../lib/money.ts'
import { createBill } from '../split/billReducer.ts'
import type { Bill } from '../split/model.ts'
import {
  equalSplit,
  fourMembers,
  member,
  quickExpense,
  settlement,
} from '../../test/households.ts'
import {
  MAX_EXACT,
  balances,
  explainBalance,
  paymentOutcome,
  suggestSettlements,
  zeroSumGroups,
  type LedgerInput,
  type SuggestedPayment,
} from './balances.ts'
import type { Expense, Member, QuickSplit, Settlement } from './model.ts'

const NONE = { members: 0, expenses: 0, settlements: 0 }

function ledger(
  members: readonly Member[],
  expenses: readonly Expense[],
  settlements: readonly Settlement[] = [],
  unreadable = NONE,
): LedgerInput {
  return { members, expenses, settlements, unreadable }
}

/** Each member's balance by id, in member order. */
function byId(input: LedgerInput, asOf?: string): Record<string, number> {
  return Object.fromEntries(
    balances(input, { asOf }).members.map((row) => [row.memberId, row.balance]),
  )
}

function suggest(input: LedgerInput): string[] {
  return suggestSettlements(balances(input).members).map(
    (p) => `${p.fromId} pays ${p.toId} ${String(p.amount)}`,
  )
}

/** Exact amounts, in cents, paid by `payerId`. */
function exact(
  id: string,
  payerId: string,
  amounts: Record<string, number>,
  extra: Partial<Expense> = {},
): Expense {
  const total = Object.values(amounts).reduce((a, b) => a + b, 0)
  return quickExpense(
    id,
    {
      kind: 'exact',
      amount: cents(total),
      amounts: Object.entries(amounts).map(([memberId, amount]) => ({
        memberId,
        amount: cents(amount),
      })),
    },
    { payerId, ...extra },
  )
}

/** Mulberry32, as the repository's other sweeps (no new dependency). */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** The most zero-sum groups, by brute force over every grouping. */
function bruteMostGroups(values: readonly number[]): number {
  const memo = new Map<number, number>()
  const best = (set: number): number => {
    if (set === 0) return 0
    const known = memo.get(set)
    if (known !== undefined) return known
    const first = set & -set
    const others = set ^ first
    let most = -Infinity
    for (let sub = others; ; sub = (sub - 1) & others) {
      const group = sub | first
      let total = 0
      for (let i = 0; i < values.length; i++) {
        if (group & (1 << i)) total += values[i] ?? 0
      }
      if (total === 0) most = Math.max(most, 1 + best(set ^ group))
      if (sub === 0) break
    }
    memo.set(set, most)
    return most
  }
  return best((1 << values.length) - 1)
}

/** The balances after paying `payments`: all zero when they settle. */
function applied(
  rows: readonly { memberId: string; balance: number }[],
  payments: readonly SuggestedPayment[],
): number[] {
  const left = new Map(rows.map((row) => [row.memberId, row.balance]))
  for (const p of payments) {
    left.set(p.fromId, (left.get(p.fromId) ?? NaN) + p.amount)
    left.set(p.toId, (left.get(p.toId) ?? NaN) - p.amount)
  }
  return [...left.values()]
}

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j]!, copy[i]!]
  }
  return copy
}

/** A random valid household: members, expenses of every kind, payments. */
function randomHousehold(random: () => number): LedgerInput {
  const int = (min: number, max: number) =>
    min + Math.floor(random() * (max - min + 1))
  const pick = <T>(items: readonly T[]): T =>
    items[Math.floor(random() * items.length)]!
  const day = () =>
    `2026-${String(int(1, 12)).padStart(2, '0')}-${String(int(1, 28)).padStart(2, '0')}`
  const count = int(2, 12)
  const members = Array.from({ length: count }, (_, i) =>
    member(`m${String(i)}`, `M${String(i)}`, i, {
      joinedOn: random() < 0.2 ? '2026-06-01' : '2026-01-01',
      ...(random() < 0.2 ? { leftOn: '2026-09-30' } : {}),
    }),
  )
  const ids = members.map((m) => m.id)
  const expenses: Expense[] = []
  for (let e = 0, n = int(1, 60); e < n; e++) {
    const inSplit = shuffled(ids, random).slice(0, int(1, count))
    const amount = cents(int(1, 500_000))
    let split: QuickSplit | undefined
    const kind = int(0, 4)
    if (kind === 0) {
      split = { kind: 'equal', amount, memberIds: inSplit }
    } else if (kind === 1) {
      split = {
        kind: 'shares',
        amount,
        shares: inSplit.map((memberId) => ({ memberId, weight: int(1, 99) })),
      }
    } else if (kind === 2) {
      let left: number = amount
      split = {
        kind: 'exact',
        amount,
        amounts: inSplit.map((memberId, i) => {
          const part = i === inSplit.length - 1 ? left : int(0, left)
          left -= part
          return { memberId, amount: cents(part) }
        }),
      }
    } else if (kind === 3) {
      let left = 100_000
      split = {
        kind: 'percent',
        amount,
        percents: inSplit.map((memberId, i) => {
          const part = i === inSplit.length - 1 ? left : int(0, left)
          left -= part
          return { memberId, ratio: { numerator: part, denominator: 1000 } }
        }),
      }
    }
    const base = quickExpense(`e${String(e)}`, equalSplit(100, [ids[0]!]), {
      date: day(),
      payerId: pick(ids),
      createdAt: `2026-01-01T00:00:${String(e % 60).padStart(2, '0')}.000Z`,
    })
    if (split !== undefined) {
      expenses.push({ ...base, split })
    } else {
      const [a, b] = shuffled(ids, random)
      const bill: Bill = createBill(['p1', 'p2', 'i1'])
      bill.items[0] = { ...bill.items[0]!, unitPrice: amount }
      expenses.push({
        ...base,
        split: {
          kind: 'itemised',
          bill,
          members: [
            { personId: 'p1', memberId: a! },
            { personId: 'p2', memberId: b! },
          ],
        },
      })
    }
  }
  const settlements: Settlement[] = []
  for (let s = 0, n = int(0, 10); s < n; s++) {
    const [from, to] = shuffled(ids, random)
    settlements.push(
      settlement(`s${String(s)}`, from!, to!, int(1, 200_000), {
        date: day(),
      }),
    )
  }
  return ledger(members, expenses, settlements)
}

describe('the property sweep: 2000 seeded households (acceptance targets)', () => {
  it('balances sum to zero, the suggestion clears them in the fewest payments, deterministically', () => {
    const random = seededRandom(20261010)
    let brute = 0
    for (let n = 0; n < 2000; n++) {
      const input = randomHousehold(random)
      const result = balances(input)
      expect(result.complete).toBe(true)
      const rows = result.members
      // 1. Exactly zero across the household.
      expect(rows.reduce((a, r) => a + r.balance, 0)).toBe(0)
      for (const row of rows) {
        expect(row.balance).toBe(row.paid - row.share + row.sent - row.received)
      }
      // 2. The suggestion clears every balance, with real payments.
      const payments = suggestSettlements(rows)
      expect(applied(rows, payments).every((b) => b === 0)).toBe(true)
      for (const p of payments) {
        expect(p.amount).toBeGreaterThan(0)
        expect(Number.isSafeInteger(p.amount)).toBe(true)
        expect(p.fromId).not.toBe(p.toId)
      }
      // 3. The minimum: n − the most zero-sum groups, by brute force up
      //    to 8 non-zero balances.
      const values = rows.map((r) => r.balance).filter((b) => b !== 0)
      if (values.length <= 8) {
        expect(payments).toHaveLength(
          values.length === 0 ? 0 : values.length - bruteMostGroups(values),
        )
        brute++
      } else {
        expect(payments.length).toBeLessThanOrEqual(values.length - 1)
      }
      // 4. Deterministic, and independent of the records' order.
      const reordered = ledger(
        shuffled(input.members, random),
        shuffled(input.expenses, random),
        shuffled(input.settlements, random),
      )
      expect(balances(reordered)).toEqual(result)
      expect(suggestSettlements(balances(reordered).members)).toEqual(payments)
      // 5. An explanation sums to its balance: the first, the last and
      //    one member between, by turns.
      const explained = [rows[0], rows[n % rows.length], rows.at(-1)]
      for (const row of explained) {
        if (row === undefined) continue
        const explained = explainBalance(input, row.memberId)
        expect(explained?.lines.reduce((a, l) => a + l.effect, 0)).toBe(
          row.balance,
        )
      }
      // 6. As of a date: the balances of the records up to it.
      const asOf = `2026-${String(1 + (n % 12)).padStart(2, '0')}-15`
      expect(balances(input, { asOf }).members).toEqual(
        balances(
          ledger(
            input.members,
            input.expenses.filter((e) => e.date <= asOf),
            input.settlements.filter((s) => s.date <= asOf),
          ),
        ).members,
      )
    }
    expect(brute).toBeGreaterThan(500)
  }, 60_000)

  it('finds the fewest payments on planted zero-sum groups (L2-O1)', () => {
    const random = seededRandom(465)
    const int = (min: number, max: number) =>
      min + Math.floor(random() * (max - min + 1))
    let checked = 0
    let brute = 0
    for (let n = 0; n < 2000; n++) {
      // 2 to 4 groups of small integers, each summing to zero.
      const planted = int(2, 4)
      let values: number[] = []
      for (let g = 0; g < planted; g++) {
        const size = int(
          2,
          Math.min(5, 16 - values.length - 2 * (planted - g - 1)),
        )
        let group: number[]
        do {
          group = Array.from(
            { length: size - 1 },
            () => int(1, 5) * (random() < 0.5 ? -1 : 1),
          )
          group.push(-group.reduce((a, b) => a + b, 0))
        } while (group.at(-1) === 0)
        values.push(...group)
      }
      values = shuffled(values, random)
      expect(values.length).toBeLessThanOrEqual(16)
      const rows = values.map((balance, i) => ({
        memberId: `m${String(i)}`,
        balance: balance as Cents,
      }))
      const payments = suggestSettlements(rows)
      expect(applied(rows, payments).every((b) => b === 0)).toBe(true)
      const nonZero = values.filter((v) => v !== 0)
      if (nonZero.length <= 8) {
        expect(payments).toHaveLength(nonZero.length - bruteMostGroups(nonZero))
        brute++
      }
      expect(payments.length).toBeLessThanOrEqual(nonZero.length - planted)
      checked++
    }
    // The generator really exercises grouping, on both sides of 8.
    expect(checked).toBeGreaterThan(1900)
    expect(brute).toBeGreaterThan(200)
    expect(checked - brute).toBeGreaterThan(200)
  })

  it('agrees with the brute force on the most groups, up to 12 balances', () => {
    const random = seededRandom(7)
    let checked = 0
    for (let n = 0; n < 300; n++) {
      const size = 2 + (n % 11)
      const values = Array.from(
        { length: size - 1 },
        () => Math.floor(random() * 7) - 3 || 1,
      )
      values.push(-values.reduce((a, b) => a + b, 0) || 0)
      const nonZero = values.filter((v) => v !== 0)
      if (nonZero.reduce((a, b) => a + b, 0) !== 0 || nonZero.length === 0) {
        continue
      }
      expect(zeroSumGroups(nonZero)).toHaveLength(bruteMostGroups(nonZero))
      checked++
    }
    expect(checked).toBeGreaterThan(200)
  })
})

describe('hand-checked examples (Phase 3’s edge cases)', () => {
  const [ana, marta, joao, tiago] = fourMembers() as [
    Member,
    Member,
    Member,
    Member,
  ]

  it('1. the canvas: three payments, as drawn', () => {
    // Ana paid 91,15, all of it Tiago's: Ana +91,15, Tiago −91,15.
    // Marta paid 30,05: João 22,40 and Tiago 7,65.
    // So Ana +91,15, Marta +30,05, João −22,40, Tiago −98,80. No two
    // non-zero balances sum to zero: one group, three payments. Tiago (the
    // largest debtor) pays Ana (the largest creditor) 91,15; then João
    // pays Marta 22,40; then Tiago pays Marta the last 7,65.
    const input = ledger(fourMembers(), [
      exact('e1', 'ana', { tiago: 9115 }),
      exact('e2', 'marta', { joao: 2240, tiago: 765 }),
    ])
    expect(byId(input)).toEqual({
      ana: 9115,
      marta: 3005,
      joao: -2240,
      tiago: -9880,
    })
    expect(suggest(input)).toEqual([
      'tiago pays ana 9115',
      'joao pays marta 2240',
      'tiago pays marta 765',
    ])
    expect(balances(input).members.map((r) => r.paid)).toEqual([
      9115, 3005, 0, 0,
    ])
  })

  it('2. a member who joins mid-month shares only the later expenses', () => {
    // Eva joins on the 15th. Ana pays 30,00 for Ana and Marta on the 5th
    // (15,00 each), then 30,00 for Ana, Marta and Eva on the 20th (10,00
    // each): Ana +60,00 − 25,00 = +35,00; Marta −25,00; Eva −10,00.
    const eva = member('eva', 'Eva', 4, { joinedOn: '2026-10-15' })
    const input = ledger(
      [ana, marta, eva],
      [
        quickExpense('e1', equalSplit(3000, ['ana', 'marta']), {
          date: '2026-10-05',
        }),
        quickExpense('e2', equalSplit(3000, ['ana', 'marta', 'eva']), {
          date: '2026-10-20',
        }),
      ],
    )
    expect(byId(input)).toEqual({ ana: 3500, marta: -2500, eva: -1000 })
    expect(byId(input, '2026-10-14')).toEqual({
      ana: 1500,
      marta: -1500,
      eva: 0,
    })
    expect(suggest(input)).toEqual(['marta pays ana 2500', 'eva pays ana 1000'])
  })

  it('3. a member leaves owing money, then pays after leaving', () => {
    // João left on 30 Sep owing half of Ana's 40,00 (−20,00); he pays
    // Ana 20,00 on 5 Oct, after leaving: everyone is settled.
    const gone = { ...joao, leftOn: '2026-09-30' }
    const input = ledger(
      [ana, gone],
      [
        quickExpense('e1', equalSplit(4000, ['ana', 'joao']), {
          date: '2026-09-10',
        }),
      ],
      [settlement('s1', 'joao', 'ana', 2000, { date: '2026-10-05' })],
    )
    expect(byId(input, '2026-09-30')).toEqual({ ana: 2000, joao: -2000 })
    expect(byId(input)).toEqual({ ana: 0, joao: 0 })
    expect(suggest(input)).toEqual([])
  })

  it('4. someone pays for others without a share of their own', () => {
    // Ana pays 30,00 for Marta and Tiago only: +30,00, −15,00, −15,00.
    // Equal amounts: the earlier payer (Marta) first.
    const input = ledger(fourMembers(), [
      quickExpense('e1', equalSplit(3000, ['marta', 'tiago'])),
    ])
    expect(byId(input)).toEqual({
      ana: 3000,
      marta: -1500,
      joao: 0,
      tiago: -1500,
    })
    expect(suggest(input)).toEqual([
      'marta pays ana 1500',
      'tiago pays ana 1500',
    ])
  })

  it('5. unequal splits: shares, exact amounts, percentages', () => {
    // Marta pays 100,00 by shares, Ana 1 and Marta 3: Ana −25,00.
    // Ana pays 50,00 exactly: Marta 20,00, Ana 30,00: Ana +20,00.
    // Marta pays 10,00 by percent, Ana 40 %, Marta 60 %: Ana −4,00.
    // Ana −9,00, Marta +9,00.
    const input = ledger(
      [ana, marta],
      [
        quickExpense(
          'e1',
          {
            kind: 'shares',
            amount: cents(10000),
            shares: [
              { memberId: 'ana', weight: 1 },
              { memberId: 'marta', weight: 3 },
            ],
          },
          { payerId: 'marta' },
        ),
        exact('e2', 'ana', { marta: 2000, ana: 3000 }),
        quickExpense(
          'e3',
          {
            kind: 'percent',
            amount: cents(1000),
            percents: [
              {
                memberId: 'ana',
                ratio: { numerator: 40000, denominator: 1000 },
              },
              {
                memberId: 'marta',
                ratio: { numerator: 60000, denominator: 1000 },
              },
            ],
          },
          { payerId: 'marta' },
        ),
      ],
    )
    expect(byId(input)).toEqual({ ana: -900, marta: 900 })
    expect(suggest(input)).toEqual(['ana pays marta 900'])
  })

  it('6. an itemised expense with a shared item, a discount, a tax and a tip', () => {
    // Bread 2,00 (Ana) and wine 10,00 shared: Ana 7,00, Marta 5,00 of a
    // 12,00 subtotal. A 2,00 discount, proportional: 1,1666… and 0,8333…,
    // the leftover cent to the larger remainder (Ana): 1,17 and 0,83.
    // A 1,00 tax and a 2,00 tip, both split equally: 1,50 each.
    // Ana 7,00 − 1,17 + 1,50 = 7,33; Marta 5,00 − 0,83 + 1,50 = 5,67;
    // 13,00 in all, paid by Ana: Ana +5,67, Marta −5,67.
    const bill: Bill = {
      ...createBill(['p1', 'p2', 'i1']),
      items: [
        {
          id: 'i1',
          name: 'Bread',
          quantity: { numerator: 1, denominator: 1 },
          unitPrice: cents(200),
          assignees: [{ personId: 'p1', weight: 1 }],
        },
        {
          id: 'i2',
          name: 'Wine',
          quantity: { numerator: 1, denominator: 1 },
          unitPrice: cents(1000),
          assignees: [
            { personId: 'p1', weight: 1 },
            { personId: 'p2', weight: 1 },
          ],
        },
      ],
      discount: { kind: 'amount', value: cents(200) },
      tax: { kind: 'amount', value: cents(100) },
      taxMode: 'equal',
      tip: { kind: 'amount', value: cents(200) },
      tipMode: 'equal',
    }
    const expense: Expense = {
      ...quickExpense('e1', equalSplit(1, ['ana'])),
      split: {
        kind: 'itemised',
        bill,
        members: [
          { personId: 'p1', memberId: 'ana' },
          { personId: 'p2', memberId: 'marta' },
        ],
      },
    }
    const input = ledger([ana, marta], [expense])
    expect(balances(input).members.map((r) => [r.paid, r.share])).toEqual([
      [1300, 733],
      [0, 567],
    ])
    expect(byId(input)).toEqual({ ana: 567, marta: -567 })
    expect(suggest(input)).toEqual(['marta pays ana 567'])
  })

  it('7. a duplicate receipt saved twice counts twice, and deleting it restores', () => {
    const once = exact('e1', 'ana', { marta: 1250 }, { receiptKey: 'qr:1:A' })
    const twice = { ...once, id: 'e2' }
    expect(byId(ledger([ana, marta], [once, twice]))).toEqual({
      ana: 2500,
      marta: -2500,
    })
    expect(byId(ledger([ana, marta], [once]))).toEqual({
      ana: 1250,
      marta: -1250,
    })
  })

  it('8. corrections are not dated: an edited old expense counts as corrected on every date', () => {
    // Ana's 20,00 for Marta on 1 Sep is corrected in October to 30,00,
    // paid by Marta for Ana. There is no history of the old values:
    // balances on 15 Sep already use the corrected ones.
    const original = exact('e1', 'ana', { marta: 2000 }, { date: '2026-09-01' })
    const corrected = {
      ...exact('e1', 'marta', { ana: 3000 }, { date: '2026-09-01' }),
      updatedAt: '2026-10-08T10:00:00.000Z',
    }
    expect(byId(ledger([ana, marta], [original]), '2026-09-15')).toEqual({
      ana: 2000,
      marta: -2000,
    })
    expect(byId(ledger([ana, marta], [corrected]), '2026-09-15')).toEqual({
      ana: -3000,
      marta: 3000,
    })
  })

  it('9. a historical expense added later counts at its own date', () => {
    // Entered on 9 Oct, dated 3 Aug: in on 31 Aug, out on 31 Jul.
    const late = exact(
      'e1',
      'ana',
      { marta: 800 },
      { date: '2026-08-03', createdAt: '2026-10-09T09:00:00.000Z' },
    )
    const input = ledger([ana, marta], [late])
    expect(byId(input, '2026-07-31')).toEqual({ ana: 0, marta: 0 })
    expect(byId(input, '2026-08-31')).toEqual({ ana: 800, marta: -800 })
  })

  it('10. a partial payment, then the rest', () => {
    // Tiago owes Ana 91,15; he pays 50,00, then 41,15.
    const debt = exact('e1', 'ana', { tiago: 9115 })
    const first = settlement('s1', 'tiago', 'ana', 5000)
    const partial = ledger([ana, tiago], [debt], [first])
    expect(byId(partial)).toEqual({ ana: 4115, tiago: -4115 })
    expect(suggest(partial)).toEqual(['tiago pays ana 4115'])
    const rest = ledger(
      [ana, tiago],
      [debt],
      [first, settlement('s2', 'tiago', 'ana', 4115)],
    )
    expect(byId(rest)).toEqual({ ana: 0, tiago: 0 })
    expect(suggest(rest)).toEqual([])
  })

  it('11. a payment larger than owed turns the balance the other way', () => {
    // Tiago owes Ana 10,00 and pays 25,00: now Ana owes Tiago 15,00.
    const input = ledger(
      [ana, tiago],
      [exact('e1', 'ana', { tiago: 1000 })],
      [settlement('s1', 'tiago', 'ana', 2500)],
    )
    expect(byId(input)).toEqual({ ana: -1500, tiago: 1500 })
    expect(suggest(input)).toEqual(['ana pays tiago 1500'])
  })

  it('12. two separate pairs take two payments, not three', () => {
    // Ana owes Marta 10,00 and João owes Tiago 7,00: two zero-sum pairs,
    // so 4 non-zero balances − 2 groups = 2 payments.
    const input = ledger(fourMembers(), [
      exact('e1', 'marta', { ana: 1000 }),
      exact('e2', 'tiago', { joao: 700 }),
    ])
    expect(suggest(input)).toEqual([
      'ana pays marta 1000',
      'joao pays tiago 700',
    ])
    // With equal debts, both orders tie on amount: the earlier payer first.
    const even = ledger(fourMembers(), [
      exact('e1', 'marta', { ana: 1000 }),
      exact('e2', 'tiago', { joao: 1000 }),
    ])
    expect(suggest(even)).toEqual([
      'ana pays marta 1000',
      'joao pays tiago 1000',
    ])
  })

  it('13. everyone settled: no payments', () => {
    const input = ledger(
      [ana, marta],
      [exact('e1', 'ana', { marta: 1000 })],
      [settlement('s1', 'marta', 'ana', 1000)],
    )
    expect(byId(input)).toEqual({ ana: 0, marta: 0 })
    expect(suggest(input)).toEqual([])
    expect(suggest(ledger([ana, marta], []))).toEqual([])
  })
})

describe('the grouping rule and its limits (B4)', () => {
  const rows = (values: number[]) =>
    values.map((balance, i) => ({
      memberId: `m${String(i)}`,
      balance: balance as Cents,
    }))

  it('picks, among groupings of equal size, the fewest members, then the earliest (L1-O1)', () => {
    // m0 +5, m1 −5, m2 +5, m3 −5: {m0,m1}+{m2,m3} and {m0,m3}+{m1,m2}
    // both make two groups of two. The first group holds m0 and, among
    // the two-member choices, the earliest: m1.
    expect(zeroSumGroups([5, -5, 5, -5])).toEqual([
      [0, 1],
      [2, 3],
    ])
    // m0 +3, m1 +2, m2 −2, m3 −3: {m0,m3} (two members) is chosen over
    // {m0,m1,m2,m3} split another way; then {m1,m2}.
    expect(zeroSumGroups([3, 2, -2, -3])).toEqual([
      [0, 3],
      [1, 2],
    ])
    expect(
      suggestSettlements(rows([3, 2, -2, -3])).map(
        (p) => `${p.fromId}>${p.toId}:${String(p.amount)}`,
      ),
    ).toEqual(['m3>m0:3', 'm2>m1:2'])
  })

  it('above 16, takes out opposite pairs first, members who left included (L3-O1)', () => {
    // 18 members, ten of whom left: nine opposite pairs (+k, −k).
    const members = Array.from({ length: 18 }, (_, i) =>
      member(`m${String(i)}`, `M${String(i)}`, i, {
        ...(i >= 8 ? { leftOn: '2026-09-30' } : {}),
      }),
    )
    const expenses = Array.from({ length: 9 }, (_, k) =>
      exact(`e${String(k)}`, `m${String(2 * k)}`, {
        [`m${String(2 * k + 1)}`]: 100 * (k + 1),
      }),
    )
    const result = balances(ledger(members, expenses))
    expect(result.members.filter((r) => r.balance !== 0)).toHaveLength(18)
    const payments = suggestSettlements(result.members)
    expect(payments).toHaveLength(9)
    expect(applied(result.members, payments).every((b) => b === 0)).toBe(true)
  })

  it('above 16 with no pairs, settles everyone in at most n − 1 payments', () => {
    const values = Array.from({ length: 17 }, (_, i) => i + 1)
    values.push(-values.reduce((a, b) => a + b, 0))
    const payments = suggestSettlements(rows(values))
    expect(payments.length).toBeLessThanOrEqual(values.length - 1)
    expect(applied(rows(values), payments).every((b) => b === 0)).toBe(true)
    expect(suggestSettlements(rows(values))).toEqual(payments)
  })

  it('runs the programme on what’s left after the pairs, when it fits', () => {
    // 10 opposite pairs and 8 others making two groups: 18 non-zero.
    const values = [
      ...Array.from({ length: 10 }, (_, k) => [k + 100, -(k + 100)]).flat(),
      1,
      2,
      -3,
      4,
      -4,
      5,
      6,
      -11,
    ]
    const payments = suggestSettlements(rows(values))
    // 10 pairs (10 payments) + {1,2,−3} (2) + {4,−4} (1) + {5,6,−11} (2).
    expect(payments).toHaveLength(15)
    expect(applied(rows(values), payments).every((b) => b === 0)).toBe(true)
  })

  it('orders the payments by amount, then payer, then payee', () => {
    const payments = suggestSettlements(rows([4, 4, -4, -4]))
    expect(payments.map((p) => `${p.fromId}>${p.toId}`)).toEqual([
      'm2>m0',
      'm3>m1',
    ])
  })

  it('refuses a programme over more than 16 balances', () => {
    expect(() => zeroSumGroups(Array.from({ length: 17 }, () => 0))).toThrow(
      RangeError,
    )
    expect(MAX_EXACT).toBe(16)
  })
})

describe('dates, completeness, explanations and the "after this" line', () => {
  const members = fourMembers()

  it('counts records dated after today by default, and leaves them out of an earlier date (L1-I1)', () => {
    const input = ledger(
      members,
      [
        exact('e1', 'ana', { marta: 1000 }, { date: '2026-10-01' }),
        exact('e2', 'ana', { marta: 50000 }, { date: '2026-11-01' }),
      ],
      [
        settlement('s1', 'marta', 'ana', 300, { date: '2026-10-02' }),
        settlement('s2', 'marta', 'ana', 200, { date: '2026-12-01' }),
      ],
    )
    const all = balances(input, { today: '2026-10-09' })
    expect(all.members[0]?.balance).toBe(1000 + 50000 - 300 - 200)
    expect(all.futureDated).toEqual({ expenses: 1, settlements: 1 })
    const then = balances(input, { asOf: '2026-10-09', today: '2026-10-09' })
    expect(then.members[0]?.balance).toBe(700)
    expect(then.futureDated).toEqual({ expenses: 0, settlements: 0 })
  })

  it.each([
    ['a member', { members: 1, expenses: 0, settlements: 0 }],
    ['an expense', { members: 0, expenses: 1, settlements: 0 }],
    ['a payment', { members: 0, expenses: 0, settlements: 1 }],
  ])('is incomplete with an unreadable %s (M-I-1)', (_name, unreadable) => {
    const input = ledger(
      members,
      [exact('e1', 'ana', { tiago: 100 })],
      [],
      unreadable,
    )
    const result = balances(input)
    expect(result.complete).toBe(false)
    expect(result.unreadable.total).toBe(1)
    // The figures still come from the readable records.
    expect(result.members[0]?.balance).toBe(100)
    expect(
      paymentOutcome(input, settlement('new', 'tiago', 'ana', 100)),
    ).toBeNull()
  })

  it('is complete when everything reads', () => {
    expect(balances(ledger(members, [])).complete).toBe(true)
  })

  it('explains a balance: every expense and payment, newest first, summing to it', () => {
    const input = ledger(
      members,
      [
        exact('e1', 'ana', { ana: 962, marta: 2885 }, { date: '2026-10-01' }),
        exact('e2', 'marta', { ana: 500 }, { date: '2026-10-03' }),
        exact('e3', 'joao', { tiago: 100 }, { date: '2026-10-04' }),
      ],
      [
        settlement('s1', 'marta', 'ana', 1000, { date: '2026-10-02' }),
        settlement('s2', 'ana', 'tiago', 50, { date: '2026-10-05' }),
      ],
    )
    const explained = explainBalance(input, 'ana')
    expect(
      explained?.lines.map((line) =>
        line.kind === 'expense'
          ? `${line.expense.id} ${String(line.paid)}/${String(line.share)} ${String(line.effect)}`
          : `${line.settlement.id} ${String(line.effect)}`,
      ),
    ).toEqual(['s2 50', 'e2 0/500 -500', 's1 -1000', 'e1 3847/962 2885'])
    expect(explained?.balance.balance).toBe(50 - 500 - 1000 + 2885)
    expect(explainBalance(input, 'ghost')).toBeNull()
    // A member with nothing has a zero balance and no lines.
    expect(explainBalance(input, 'joao')?.lines).toHaveLength(1)
  })

  it('previews a payment over the default balances, an edit without itself (L2-I1)', () => {
    const debt = exact('e1', 'ana', { tiago: 9115 })
    const recorded = settlement('s1', 'tiago', 'ana', 9115)
    const input = ledger(members, [debt], [recorded])
    // A new 50,00 on top of the recorded 91,15: Tiago would get 50,00 back.
    expect(
      paymentOutcome(input, settlement('new', 'tiago', 'ana', 5000)),
    ).toMatchObject({
      from: { memberId: 'tiago', balance: 5000 },
      to: { memberId: 'ana', balance: -5000 },
    })
    // Editing the 91,15 down to 50,00 shows 50,00 alone: 41,15 still owed.
    expect(
      paymentOutcome(
        input,
        { ...recorded, amount: cents(5000) },
        { replacing: 's1' },
      ),
    ).toMatchObject({
      from: { memberId: 'tiago', balance: -4115 },
      to: { memberId: 'ana', balance: 4115 },
    })
    // Changing who paid names the new pair, still without the original.
    expect(
      paymentOutcome(
        input,
        { ...recorded, fromId: 'marta', amount: cents(5000) },
        { replacing: 's1' },
      ),
    ).toMatchObject({
      from: { memberId: 'marta', balance: 5000 },
      to: { memberId: 'ana', balance: 9115 - 5000 },
    })
  })
})

describe('the budgets (B11, O-EXT-1)', () => {
  it('1000 expenses and 200 payments: balances, a suggestion and an explanation within 500 ms', () => {
    const random = seededRandom(1000)
    const members = Array.from({ length: 12 }, (_, i) =>
      member(`m${String(i)}`, `M${String(i)}`, i),
    )
    const ids = members.map((m) => m.id)
    const expenses = Array.from({ length: 1000 }, (_, e) =>
      quickExpense(
        `e${String(e)}`,
        equalSplit(
          1 + Math.floor(random() * 100_000),
          ids.slice(0, 2 + (e % 10)),
        ),
        {
          payerId: ids[e % 12]!,
          date: `2026-${String(1 + (e % 12)).padStart(2, '0')}-10`,
        },
      ),
    )
    const settlements = Array.from({ length: 200 }, (_, s) =>
      settlement(`s${String(s)}`, ids[s % 12]!, ids[(s + 5) % 12]!, 1 + s),
    )
    const input = ledger(members, expenses, settlements)
    const start = performance.now()
    const result = balances(input)
    suggestSettlements(result.members)
    explainBalance(input, 'm0')
    expect(performance.now() - start).toBeLessThan(500)
  })

  it('16 adversarial balances with many zero-sum subsets, within 500 ms', () => {
    const random = seededRandom(16)
    let rounds = 0
    for (let round = 0; round < 20; round++) {
      const values = Array.from(
        { length: 15 },
        () => [1, -1, 2, -2, 3, -3][Math.floor(random() * 6)]!,
      )
      const last = -values.reduce((a, b) => a + b, 0)
      values.push(last === 0 ? 1 : last)
      if (values.reduce((a, b) => a + b, 0) !== 0) values[14] = values[14]! - 1
      const nonZero = values.filter((v) => v !== 0)
      if (nonZero.reduce((a, b) => a + b, 0) !== 0) continue
      const start = performance.now()
      const groups = zeroSumGroups(nonZero)
      expect(performance.now() - start).toBeLessThan(500)
      expect(groups.flat().sort((a, b) => a - b)).toEqual(
        nonZero.map((_, i) => i),
      )
      rounds++
    }
    expect(rounds).toBeGreaterThan(5)
    // The worst shape: eight +1 and eight −1, every pair a group.
    const start = performance.now()
    expect(
      zeroSumGroups([1, -1, 1, -1, 1, -1, 1, -1, 1, -1, 1, -1, 1, -1, 1, -1]),
    ).toHaveLength(8)
    expect(performance.now() - start).toBeLessThan(500)
  })
})
