import { Navigate, useParams } from 'react-router'
import { EXPENSE_PARAM } from '../../features/household/components/ExpenseRow.tsx'

/**
 * `/households/:hid/expenses/:eid` (M4 plan, CP3), kept for links, saves
 * and bookmarks: an expense now opens in a dialog over the Expenses list
 * (review finding M-5), so this route lands there with it open.
 */
export function ExpensePage() {
  const { hid = '', eid = '' } = useParams()
  return (
    <Navigate
      to={`/households/${hid}/expenses?${EXPENSE_PARAM}=${encodeURIComponent(eid)}`}
      replace
    />
  )
}
