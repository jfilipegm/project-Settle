import { useMemo, useState, type ReactNode } from 'react'
import {
  RegionContext,
  readStoredRegion,
  storeRegion,
  type Region,
} from './region.ts'

/**
 * Holds the region for the whole app, read once from storage. `useRegion`
 * (in region.ts, so this file only exports a component) reads it.
 */
export function RegionProvider({ children }: { children: ReactNode }) {
  const [region, setRegionState] = useState(readStoredRegion)

  const value = useMemo(
    () => ({
      region,
      setRegion: (next: Region) => {
        storeRegion(next)
        setRegionState(next)
      },
    }),
    [region],
  )

  return <RegionContext value={value}>{children}</RegionContext>
}
