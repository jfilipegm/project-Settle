import { useCallback } from 'react'
import { Navigate } from 'react-router'
import { readHouseholdPointer } from '../../data/pointer.ts'
import { listHouseholds } from '../../data/repository.ts'
import {
  useHouseholdData,
  useLoaded,
} from '../../features/household/householdData.ts'
import { useT } from '../../i18n/language.ts'
import { StorageState } from './StorageState.tsx'

/**
 * The Household tab (M4 plan, H9): the household used last, or the list.
 * An archived or missing household falls back to the list.
 */
export function HouseholdRedirect() {
  const t = useT()
  const { status } = useHouseholdData()
  const loaded = useLoaded(useCallback((db) => listHouseholds(db), []))
  if (status !== 'ready' && status !== 'idle' && status !== 'opening') {
    return (
      <>
        <h1>{t('households.title')}</h1>
        <StorageState status={status} />
      </>
    )
  }
  if (loaded.state !== 'ready') return null
  const pointer = readHouseholdPointer()
  const last = loaded.value.items.find(
    (household) =>
      household.id === pointer && household.archivedAt === undefined,
  )
  return (
    <Navigate
      to={last === undefined ? '/households' : `/households/${last.id}`}
      replace
    />
  )
}
