import { useEffect, useReducer, type Dispatch } from 'react'
import {
  billReducer,
  createBill,
  NEW_BILL_ID_COUNT,
  newId,
  type BillAction,
} from './billReducer.ts'
import { loadDraft, saveDraft } from './draft.ts'
import type { Bill } from './model.ts'

/** Ids for a new bill: see {@link createBill}. */
export function newBillIds(): string[] {
  return Array.from({ length: NEW_BILL_ID_COUNT }, newId)
}

function initialBill(): Bill {
  return loadDraft() ?? createBill(newBillIds())
}

/**
 * The bill being edited: loaded from the saved draft (or fresh), and saved
 * again after every change.
 */
export function useBill(): [Bill, Dispatch<BillAction>] {
  const [bill, dispatch] = useReducer(billReducer, undefined, initialBill)

  useEffect(() => {
    saveDraft(bill)
  }, [bill])

  return [bill, dispatch]
}
