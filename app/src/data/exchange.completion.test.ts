// @vitest-environment node
/**
 * M6's completion scenario (plan, acceptance targets, "The completion
 * scenario (two devices)"): M5's household on device A (4 members who
 * stay, one who left, 31 expenses, 5 payments) is shared to an empty
 * device B. Both change it, with one conflict, and exchange files both
 * ways; then both hold the same ledger, balances and settle-up
 * suggestion, and A's backup restored onto an empty device C gives the
 * same ledger again. The file round trip holds for the scenario too.
 */
import { describe, expect, it } from 'vitest'
import { NOW, freshFactory } from '../test/households.ts'
import { buildScenario, quick, quickSplit } from '../test/completion.ts'
import {
  classOf,
  ledgerText,
  newDevice,
  receive,
  send,
  useTheirs,
  type Device,
} from '../test/devices.ts'
import { MIGRATIONS } from './db.ts'
import { snapshotBackup, snapshotHousehold } from './exchange.ts'
import {
  deleteExpense,
  listExpenses,
  listMembers,
  listSettlements,
  saveExpense,
  saveSettlement,
} from './repository.ts'
import { formatFile } from '../features/exchange/format.ts'
import { readFile } from '../features/exchange/readFile.ts'
import { balances, suggestSettlements } from '../features/household/balances.ts'
import { RECORD_VERSION, type Settlement } from '../features/household/model.ts'
import { cents } from '../lib/money.ts'

function payment(
  id: string,
  fromId: string,
  toId: string,
  amount: number,
): Settlement {
  return {
    v: RECORD_VERSION,
    id,
    householdId: 'h1',
    fromId,
    toId,
    amount: cents(amount),
    date: '2026-10-05',
    createdAt: NOW,
    updatedAt: NOW,
  }
}

/** M5's household, with its five payments, on a device of its own. */
async function deviceA(): Promise<Device> {
  const db = await buildScenario(freshFactory(), MIGRATIONS, {
    editedAt: NOW,
  })
  await saveSettlement(db, payment('s1', 'tiago', 'ana', 4210))
  await saveSettlement(db, payment('s2', 'marta', 'rui', 1999))
  await saveSettlement(db, payment('s3', 'tiago', 'marta', 500))
  await saveSettlement(db, payment('s4', 'joao', 'ana', 1234))
  await saveSettlement(db, payment('s5', 'marta', 'rui', 2500))
  return { name: 'A', db }
}

async function ledger(device: Device) {
  const members = (await listMembers(device.db, 'h1')).items
  const expenses = await listExpenses(device.db, 'h1')
  const settlements = await listSettlements(device.db, 'h1')
  const input = {
    members,
    expenses: expenses.items,
    settlements: settlements.items,
    unreadable: {
      members: 0,
      expenses: expenses.unreadable,
      settlements: settlements.unreadable,
    },
  }
  const result = balances(input)
  return {
    expenses: expenses.items.length,
    settlements: settlements.items.length,
    unreadable: expenses.unreadable + settlements.unreadable,
    balances: result.members,
    complete: result.complete,
    suggestion: suggestSettlements(result.members),
  }
}

describe('the M6 completion scenario: two devices, one household', () => {
  it('shares, changes on both, exchanges both ways, and restores a backup', async () => {
    const a = await deviceA()
    const start = await ledger(a)
    expect(start).toMatchObject({ expenses: 31, settlements: 5, unreadable: 0 })
    expect(start.complete).toBe(true)

    // A shares to an empty device B.
    const b = await newDevice('B')
    const shared = await send(a, b)
    expect(shared.plan.households[0]?.isNew).toBe(true)
    expect(await ledgerText(b)).toBe(await ledgerText(a))

    // B adds 3 expenses and a payment, edits one expense, deletes another.
    for (const i of [40, 41, 42]) {
      await saveExpense(b.db, quick(i, quickSplit(i, ['ana', 'marta', 'rui'])))
    }
    await saveSettlement(b.db, payment('sb', 'rui', 'tiago', 900))
    await saveExpense(
      b.db,
      quick(5, { ...quickSplit(5, ['ana', 'marta']), amount: cents(5555) }),
      [],
      { replacing: true },
    )
    await deleteExpense(b.db, 'q6')
    // A edits a different expense, and the same one B edited.
    await saveExpense(
      a.db,
      quick(7, { ...quickSplit(7, ['ana', 'tiago']), amount: cents(7777) }),
      [],
      { replacing: true },
    )
    await saveExpense(
      a.db,
      quick(5, { ...quickSplit(5, ['ana', 'tiago']), amount: cents(6666) }),
      [],
      { replacing: true },
    )

    // They exchange both ways: A decides the conflict, B takes it.
    const atA = await send(b, a, useTheirs)
    expect(classOf(atA, 'q5')).toMatchObject({
      classification: 'conflict',
      cause: 'concurrent',
    })
    expect(classOf(atA, 'q6')?.classification).toBe('deletedThere')
    expect(classOf(atA, 'q40')?.classification).toBe('new')
    const atB = await send(a, b)
    expect(atB.decided.size).toBe(0)
    expect(classOf(atB, 'q7')?.classification).toBe('changedThere')

    // Both hold the same ledger, balances and suggestion.
    expect(await ledgerText(a)).toBe(await ledgerText(b))
    const onA = await ledger(a)
    expect(onA).toEqual(await ledger(b))
    expect(onA).toMatchObject({ expenses: 33, settlements: 6, unreadable: 0 })
    expect(onA.balances.reduce((total, row) => total + row.balance, 0)).toBe(0)

    // A's backup restored onto an empty device C gives the same ledger.
    const backup = readFile((await snapshotBackup(a.db, NOW)).text)
    if (!backup.ok) throw new Error('backup unreadable')
    const c = await newDevice('C')
    await receive(c, backup.file)
    expect(await ledgerText(c)).toBe(await ledgerText(a))
    expect(await ledger(c)).toEqual(onA)
  })

  it('round-trips M5’s scenario: export, import, export gives the same bytes', async () => {
    const a = await deviceA()
    const first = await snapshotHousehold(
      a.db,
      'h1',
      '2026-10-11T10:00:00.000Z',
    )
    expect(first.leftOut).toEqual({
      unreadable: 0,
      invalid: 0,
      namesLeftOut: 0,
    })
    const read = readFile(first.text)
    if (!read.ok) throw new Error('unreadable')
    expect(formatFile(read.file)).toBe(first.text)
    const b = await newDevice('B')
    await receive(b, read.file)
    const second = await snapshotHousehold(
      b.db,
      'h1',
      '2026-10-11T10:00:00.000Z',
    )
    expect(second.text).toBe(first.text)
  })
})
