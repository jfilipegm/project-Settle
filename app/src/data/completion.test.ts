// @vitest-environment node
/**
 * The roadmap's completion criterion for M4 (plan, acceptance targets,
 * REQ-11): a household with 4 members, 30+ expenses of both kinds, a
 * member who leaves and one who joins, and several corrections survives a
 * reload and an app update. Over the real repositories and fake-indexeddb.
 *
 * M5 extends it (plan, acceptance targets, "The completion scenario"):
 * the same household with payments has the same balances, suggestion and
 * explanations across a reload and across the real version-1 to
 * version-2 upgrade.
 */
import { describe, expect, it } from 'vitest'
import fixture from './fixtures/v1.json'
import {
  NOW,
  freshFactory,
  getRaw,
  putRaw,
  testSchemaV4,
  withoutVersion,
} from '../test/households.ts'
import { buildScenario } from '../test/completion.ts'
import { RECORD_VERSION, type Settlement } from '../features/household/model.ts'
import {
  balances,
  explainBalance,
  suggestSettlements,
  type LedgerInput,
} from '../features/household/balances.ts'
import { expenseShares } from '../features/household/shares.ts'
import {
  categoryTotals,
  inMonth,
  totalOf,
} from '../features/household/totals.ts'
import { cents } from '../lib/money.ts'
import {
  MIGRATIONS,
  createSchemaV1,
  createSchemaV2,
  openDatabase,
} from './db.ts'
import {
  deleteSettlement,
  listExpenses,
  listSettlements,
  listHouseholds,
  listMembers,
  saveSettlement,
} from './repository.ts'

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

    // 2. An app update: the test-only version-3 upgrade (L1-I1).
    const upgraded = await openDatabase(factory, {
      migrations: [...MIGRATIONS, testSchemaV4],
    })
    const raw = await getRaw(upgraded)
    expect(raw.expenses.every((r) => (r as { v: number }).v === 2)).toBe(true)
    upgraded.close()
    // Read back with version-3-aware eyes: the content, without `v`.
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
        migrations: [...MIGRATIONS, testSchemaV4],
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

/** What the balances read as: every member's, the suggestion, each explanation. */
async function ledgerSnapshot(db: IDBDatabase) {
  const members = await listMembers(db, 'h1')
  const expenses = await listExpenses(db, 'h1')
  const settlements = db.objectStoreNames.contains('settlements')
    ? await listSettlements(db, 'h1')
    : { items: [], unreadable: 0 }
  const input: LedgerInput = {
    members: members.items,
    expenses: expenses.items,
    settlements: settlements.items,
    unreadable: {
      members: members.unreadable,
      expenses: expenses.unreadable,
      settlements: settlements.unreadable,
    },
  }
  const result = balances(input)
  return {
    result,
    suggestion: suggestSettlements(result.members),
    explanations: result.members.map((row) =>
      explainBalance(input, row.memberId),
    ),
  }
}

describe('the M5 completion scenario: balances and payments', () => {
  it('keeps the balances across the real version-1 to version-2 upgrade', async () => {
    const factory = freshFactory()
    const v1 = await buildScenario(factory, [createSchemaV1])
    expect(v1.version).toBe(1)
    const before = await ledgerSnapshot(v1)
    expect(before.result.complete).toBe(true)
    expect(before.result.members.reduce((a, r) => a + r.balance, 0)).toBe(0)
    expect(before.suggestion.length).toBeGreaterThan(0)
    v1.close()

    const v2 = await openDatabase(factory, {
      migrations: [createSchemaV1, createSchemaV2],
    })
    expect(v2.version).toBe(2)
    expect(await ledgerSnapshot(v2)).toEqual(before)
    v2.close()
  })

  it('keeps every record and the balances across the real version-2 to version-3 upgrade (M6, E5)', async () => {
    const factory = freshFactory()
    const v2 = await buildScenario(factory, [createSchemaV1, createSchemaV2])
    expect(v2.version).toBe(2)
    const before = await ledgerSnapshot(v2)
    const rawBefore = await getRaw(v2)
    v2.close()

    const v3 = await openDatabase(factory)
    expect(v3.version).toBe(3)
    expect(await ledgerSnapshot(v3)).toEqual(before)
    const raw = await getRaw(v3)
    const byId = (records: unknown[]) =>
      [...records].sort((a, b) =>
        String((a as { id: string }).id).localeCompare(
          String((b as { id: string }).id),
        ),
      )
    for (const store of ['households', 'members', 'expenses'] as const) {
      expect(byId(raw[store])).toEqual(byId(rawBefore[store]))
    }
    expect(raw.versions).toEqual([])
    v3.close()
  })

  it('records five payments, then survives a reload with the same balances', async () => {
    const factory = freshFactory()
    const db = await buildScenario(factory)
    const start = await ledgerSnapshot(db)
    const payment = (
      id: string,
      fromId: string,
      toId: string,
      amount: number,
    ): Settlement => ({
      v: RECORD_VERSION,
      id,
      householdId: 'h1',
      fromId,
      toId,
      amount: cents(amount),
      date: '2026-10-05',
      createdAt: NOW,
      updatedAt: NOW,
    })

    // Two from the suggestion, as Mark as paid records them.
    const [first] = start.suggestion
    if (first === undefined) throw new Error('no suggestion')
    await saveSettlement(
      db,
      payment('s1', first.fromId, first.toId, first.amount),
    )
    const [second] = (await ledgerSnapshot(db)).suggestion
    if (second === undefined) throw new Error('no second suggestion')
    await saveSettlement(
      db,
      payment('s2', second.fromId, second.toId, second.amount),
    )
    // One partial: half of the next suggestion. The rest stays owed.
    const beforePartial = await ledgerSnapshot(db)
    const [third] = beforePartial.suggestion
    if (third === undefined) throw new Error('no third suggestion')
    const half = Math.floor(third.amount / 2)
    await saveSettlement(db, payment('s3', third.fromId, third.toId, half))
    const balanceOf = (snap: typeof start, id: string) =>
      snap.result.members.find((r) => r.memberId === id)?.balance
    const afterPartial = await ledgerSnapshot(db)
    expect(balanceOf(afterPartial, third.fromId)).toBe(
      (balanceOf(beforePartial, third.fromId) ?? 0) + half,
    )
    expect(balanceOf(afterPartial, third.fromId)).toBeLessThan(0)
    // One by João, who has left.
    await saveSettlement(db, payment('s4', 'joao', 'ana', 1234))
    // One edited, one deleted.
    await saveSettlement(db, payment('s5', 'marta', 'rui', 5000))
    await saveSettlement(
      db,
      { ...payment('s5', 'marta', 'rui', 2500), updatedAt: 'edit' },
      {
        replacing: true,
      },
    )
    await saveSettlement(db, payment('s6', 'tiago', 'marta', 777))
    await deleteSettlement(db, 's6')

    const before = await ledgerSnapshot(db)
    expect(
      (await listSettlements(db, 'h1')).items.map((s) => s.id).sort(),
    ).toEqual(['s1', 's2', 's3', 's4', 's5'])
    expect(before.result.complete).toBe(true)
    expect(before.result.members.reduce((a, r) => a + r.balance, 0)).toBe(0)
    for (const explained of before.explanations) {
      expect(explained?.lines.reduce((a, l) => a + l.effect, 0)).toBe(
        explained?.balance.balance,
      )
    }
    db.close()

    const reloaded = await openDatabase(factory)
    expect(await ledgerSnapshot(reloaded)).toEqual(before)
    reloaded.close()
  })
})
