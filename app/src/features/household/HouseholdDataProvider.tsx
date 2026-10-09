import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  StorageOutdatedError,
  browserIndexedDb,
  openDatabase,
} from '../../data/db.ts'
import {
  HouseholdDataContext,
  type HouseholdDataStatus,
} from './householdData.ts'

const CHANNEL = 'settle-data'

/**
 * The ledger's database for the pages (H18). It opens lazily, the first
 * time a household page asks, so the split never touches IndexedDB. A
 * `BroadcastChannel` tells the other tabs to refresh; it is not
 * concurrency control (the repository's transactions are).
 */
export function HouseholdDataProvider({
  factory,
  children,
}: {
  /** Tests pass a fake-indexeddb factory; the app uses the browser's. */
  factory?: IDBFactory
  children: ReactNode
}) {
  const [status, setStatus] = useState<HouseholdDataStatus>('idle')
  const [db, setDb] = useState<IDBDatabase | null>(null)
  const [revision, setRevision] = useState(0)
  const opening = useRef(false)
  const channel = useRef<BroadcastChannel | null>(null)

  const open = useCallback(() => {
    if (opening.current) return
    opening.current = true
    setStatus('opening')
    openDatabase(factory ?? browserIndexedDb(), {
      onVersionChange: () => {
        setDb(null)
        setStatus('outdated')
      },
      onBlocked: () => {
        setStatus('blocked')
      },
    }).then(
      (opened) => {
        setDb(opened)
        setStatus('ready')
      },
      (error: unknown) => {
        setStatus(
          error instanceof StorageOutdatedError ? 'outdated' : 'unavailable',
        )
      },
    )
  }, [factory])

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return
    const current = new BroadcastChannel(CHANNEL)
    current.onmessage = () => {
      setRevision((value) => value + 1)
    }
    channel.current = current
    return () => {
      current.close()
      channel.current = null
    }
  }, [])

  useEffect(() => () => db?.close(), [db])

  const changed = useCallback(() => {
    setRevision((value) => value + 1)
    channel.current?.postMessage('changed')
  }, [])

  const value = useMemo(
    () => ({ status, db, revision, open, changed }),
    [status, db, revision, open, changed],
  )
  return (
    <HouseholdDataContext.Provider value={value}>
      {children}
    </HouseholdDataContext.Provider>
  )
}
