/**
 * The ledger's IndexedDB database (M4 plan, H1 to H3), through a small
 * wrapper of our own: open it, run its migrations, and run transactions.
 * No React here.
 */

export const DB_NAME = 'settle'

export const STORE = {
  households: 'households',
  members: 'members',
  expenses: 'expenses',
  meta: 'meta',
  settlements: 'settlements',
} as const

export type StoreName = (typeof STORE)[keyof typeof STORE]

export const INDEX = {
  byHousehold: 'byHousehold',
  byReceiptKey: 'byReceiptKey',
} as const

/**
 * One schema step: version `i + 1` is `migrations[i]`. It runs inside the
 * upgrade transaction; anything it throws aborts the whole upgrade, so the
 * older data stays as it was (H2).
 */
export type Migration = (db: IDBDatabase, tx: IDBTransaction) => void

/** Version 1: the stores and indexes of H1. */
export const createSchemaV1: Migration = (db) => {
  db.createObjectStore(STORE.households, { keyPath: 'id' })
  const members = db.createObjectStore(STORE.members, { keyPath: 'id' })
  members.createIndex(INDEX.byHousehold, 'householdId')
  const expenses = db.createObjectStore(STORE.expenses, { keyPath: 'id' })
  expenses.createIndex(INDEX.byHousehold, 'householdId')
  // A record without a receiptKey isn't in this index at all.
  expenses.createIndex(INDEX.byReceiptKey, ['householdId', 'receiptKey'])
  db.createObjectStore(STORE.meta, { keyPath: 'key' })
}

/**
 * Version 2 (M5, B3): the payments' store. It creates and rewrites
 * nothing else; every version-1 record stays as it was.
 */
export const createSchemaV2: Migration = (db) => {
  const settlements = db.createObjectStore(STORE.settlements, {
    keyPath: 'id',
  })
  settlements.createIndex(INDEX.byHousehold, 'householdId')
}

/** The app's migrations: its database version is their count. */
export const MIGRATIONS: readonly Migration[] = [createSchemaV1, createSchemaV2]

/** IndexedDB is missing, or the database couldn't be opened (H3). */
export class StorageUnavailableError extends Error {}

/** The database is newer than this code: another tab updated Settle (H2). */
export class StorageOutdatedError extends Error {}

/** A migration step failed; the upgrade was rolled back (H2). */
export class MigrationFailedError extends Error {}

export interface OpenOptions {
  name?: string
  migrations?: readonly Migration[]
  /** Another tab is opening a newer version: this connection is closed. */
  onVersionChange?: () => void
  /** An older tab holds the database open, so the upgrade waits. */
  onBlocked?: () => void
  /** For the schema record. */
  now?: () => string
}

/** The browser's IndexedDB, or `undefined` where there is none. */
export function browserIndexedDb(): IDBFactory | undefined {
  try {
    return typeof indexedDB === 'undefined' ? undefined : indexedDB
  } catch {
    // Some browsers throw on access when storage is blocked.
    return undefined
  }
}

/**
 * Opens the database at the version the migrations define, running every
 * step from the stored version up (H2).
 */
export function openDatabase(
  factory: IDBFactory | undefined,
  options: OpenOptions = {},
): Promise<IDBDatabase> {
  const migrations = options.migrations ?? MIGRATIONS
  const version = migrations.length
  const now = options.now ?? (() => new Date().toISOString())
  return new Promise((resolve, reject) => {
    if (factory === undefined) {
      reject(new StorageUnavailableError('IndexedDB is not available'))
      return
    }
    let request: IDBOpenDBRequest
    try {
      request = factory.open(options.name ?? DB_NAME, version)
    } catch (error) {
      reject(new StorageUnavailableError(String(error)))
      return
    }
    let migrationError: unknown
    request.onupgradeneeded = (event) => {
      const db = request.result
      const tx = request.transaction
      if (tx === null) return
      try {
        for (let v = event.oldVersion + 1; v <= version; v++) {
          migrations[v - 1]?.(db, tx)
        }
        tx.objectStore(STORE.meta).put({
          key: 'schema',
          version,
          migratedAt: now(),
        })
      } catch (error) {
        migrationError = error
        tx.abort()
      }
    }
    request.onblocked = () => options.onBlocked?.()
    request.onsuccess = () => {
      const db = request.result
      db.onversionchange = () => {
        db.close()
        options.onVersionChange?.()
      }
      resolve(db)
    }
    request.onerror = () => {
      const error = request.error
      if (migrationError !== undefined) {
        reject(new MigrationFailedError(asError(migrationError).message))
      } else if (error?.name === 'VersionError') {
        reject(new StorageOutdatedError(error.message))
      } else {
        reject(new StorageUnavailableError(String(error)))
      }
    }
  })
}

/** Any thrown value as an Error, for a promise's rejection. */
export function asError(value: unknown): Error {
  if (value instanceof Error) return value
  if (value instanceof DOMException) return new Error(value.message)
  return new Error(typeof value === 'string' ? value : 'unknown failure')
}

/** A request's result, as a promise. */
export function result<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('request failed'))
  })
}

/**
 * Runs `body` in one transaction over `stores` and resolves with its value
 * once the transaction has committed. If `body` throws, the transaction is
 * aborted, nothing it wrote is kept, and the promise rejects with what was
 * thrown. `body` must only await IndexedDB requests of `tx` (any other
 * await lets the transaction close).
 */
export function transaction<T>(
  db: IDBDatabase,
  stores: readonly StoreName[],
  mode: IDBTransactionMode,
  body: (tx: IDBTransaction) => Promise<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction([...stores], mode)
    let value: T
    let failure: { error: unknown } | undefined
    tx.oncomplete = () => {
      if (failure === undefined) resolve(value)
      else reject(asError(failure.error))
    }
    tx.onabort = () =>
      reject(
        asError(failure?.error ?? tx.error ?? new Error('transaction aborted')),
      )
    tx.onerror = (event) => {
      // A failed request aborts the transaction (IndexedDB's default, kept
      // on purpose: nothing can commit after it); onabort reports the
      // first error.
      const request = event.target as IDBRequest | null
      failure ??= { error: request?.error ?? tx.error }
    }
    body(tx).then(
      (v) => {
        value = v
      },
      (error: unknown) => {
        failure ??= { error }
        try {
          tx.abort()
        } catch {
          // Already finished: onabort or oncomplete reports.
        }
      },
    )
  })
}

/** Every value of a store, or of an index under one key. */
export function getAll(
  source: IDBObjectStore | IDBIndex,
  key?: IDBValidKey,
): Promise<unknown[]> {
  return result(source.getAll(key)) as Promise<unknown[]>
}
