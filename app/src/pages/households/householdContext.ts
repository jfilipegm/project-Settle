import { useOutletContext } from 'react-router'
import type { Household, Member } from '../../features/household/model.ts'

export interface HouseholdContext {
  household: Household
  /** In position order; members who left included. */
  members: Member[]
  unreadableMembers: number
}

/** The household a page inside the shell belongs to. */
export function useHouseholdContext(): HouseholdContext {
  return useOutletContext<HouseholdContext>()
}
