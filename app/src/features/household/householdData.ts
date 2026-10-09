import { createContext, useContext, useEffect, useState } from 'react'

/** Where the ledger's database stands (M4 plan, H2, H3). */
export type HouseholdDataStatus =
  | 'idle'
  | 'opening'
  | 'ready'
  /** No IndexedDB here, or it can't open (H3). */
  | 'unavailable'
  /** Another tab updated Settle: reload (H2). */
  | 'outdated'
  /** An older tab holds the database: close it (H2). */
  | 'blocked'

export interface HouseholdDataValue {
  status: HouseholdDataStatus
  db: IDBDatabase | null
  /** Bumped after every write, here or in another tab. */
  revision: number
  /** Opens the database on first use. */
  open: () => void
  /** Call after a write: refreshes this tab's lists and the other tabs'. */
  changed: () => void
}

export const HouseholdDataContext = createContext<HouseholdDataValue | null>(
  null,
)

/** The ledger's database, opened on first use. */
export function useHouseholdData(): HouseholdDataValue {
  const value = useContext(HouseholdDataContext)
  if (value === null) {
    throw new Error('useHouseholdData needs a HouseholdDataProvider')
  }
  const { status, open } = value
  useEffect(() => {
    if (status === 'idle') open()
  }, [status, open])
  return value
}

export type Loaded<T> =
  | { state: 'loading' }
  | { state: 'ready'; value: T }
  | { state: 'error'; error: unknown }

/**
 * Reads from the database once it's ready, and again after every write
 * (`revision`). `load` must be stable for the same inputs (wrap it in
 * `useCallback`).
 */
export function useLoaded<T>(load: (db: IDBDatabase) => Promise<T>): Loaded<T> {
  const { db, revision } = useHouseholdData()
  // The value, with the load that produced it: a new `load` (another
  // household, say) reads as loading until its own value arrives, never
  // as the previous one's.
  const [loaded, setLoaded] = useState<{
    load: (db: IDBDatabase) => Promise<T>
    value: Loaded<T>
  } | null>(null)
  useEffect(() => {
    if (db === null) return
    let current = true
    load(db).then(
      (value) => {
        if (current) setLoaded({ load, value: { state: 'ready', value } })
      },
      (error: unknown) => {
        if (current) setLoaded({ load, value: { state: 'error', error } })
      },
    )
    return () => {
      current = false
    }
  }, [db, load, revision])
  return loaded !== null && loaded.load === load
    ? loaded.value
    : { state: 'loading' }
}
