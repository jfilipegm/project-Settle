import { useCallback, useMemo } from 'react'
import { listExpenses, listSettlements } from '../../data/repository.ts'
import type { LedgerInput } from './balances.ts'
import { useLoaded, type Loaded } from './householdData.ts'
import type { Member } from './model.ts'

/**
 * A household's ledger for the balances engine (M5 plan, B4, B5): its
 * readable members, expenses and payments, and how many of each couldn't
 * be read. Read again after every write, here or in another tab.
 */
export function useLedger(
  householdId: string,
  members: readonly Member[],
  unreadableMembers: number,
): Loaded<LedgerInput> {
  const loaded = useLoaded(
    useCallback(
      async (db: IDBDatabase) => ({
        expenses: await listExpenses(db, householdId),
        settlements: await listSettlements(db, householdId),
      }),
      [householdId],
    ),
  )
  return useMemo(() => {
    if (loaded.state !== 'ready') return loaded
    const { expenses, settlements } = loaded.value
    return {
      state: 'ready',
      value: {
        members,
        expenses: expenses.items,
        settlements: settlements.items,
        unreadable: {
          members: unreadableMembers,
          expenses: expenses.unreadable,
          settlements: settlements.unreadable,
        },
      },
    }
  }, [loaded, members, unreadableMembers])
}
