import { useCallback } from 'react'
import { snapshotBackup } from '../../data/exchange.ts'
import { getBackupStatus, recordBackup } from '../../data/repository.ts'
import { backupFileName } from '../../features/exchange/fileName.ts'
import {
  useHouseholdData,
  useLoaded,
} from '../../features/household/householdData.ts'
import { isoDate } from '../../features/household/model.ts'
import { useT } from '../../i18n/language.ts'
import { useExport, type Made } from './useExport.ts'

/**
 * Back up now (M6 plan, E10): every household in one file, handed over,
 * then recorded. The browser can't confirm where a download went, so a
 * backup counts once the file was handed over without an error.
 */
export function useBackup() {
  const t = useT()
  const { changed } = useHouseholdData()
  const word = t('exchange.data.word')
  const make = useCallback(
    async (db: IDBDatabase): Promise<Made> => {
      const now = new Date()
      return {
        snapshot: await snapshotBackup(db, now.toISOString()),
        fileName: backupFileName(word, isoDate(now)),
      }
    },
    [word],
  )
  const after = useCallback(
    async (db: IDBDatabase, made: Made) => {
      await recordBackup(db, new Date().toISOString(), made.snapshot.snapshotAt)
      changed()
    },
    [changed],
  )
  return useExport(make, after)
}

/** When the last backup was made, and the first change since (E5). */
export function useBackupStatus() {
  return useLoaded(useCallback((db: IDBDatabase) => getBackupStatus(db), []))
}
