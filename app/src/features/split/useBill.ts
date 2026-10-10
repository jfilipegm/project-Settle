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
 * Where the bill being edited comes from (M4 plan, H10, L1-O2): the saved
 * draft (the default, unchanged), or a working copy held in memory, such as
 * an itemised expense being edited, which saves nowhere until its own
 * "Save changes".
 */
export type BillSource = { kind: 'draft' } | { kind: 'memory'; initial: Bill }

const DRAFT: BillSource = { kind: 'draft' }

/**
 * The bill being edited: loaded from the saved draft (or fresh), and saved
 * again after every change; or, from memory, a working copy that is never
 * saved here.
 */
export function useBill(
  source: BillSource = DRAFT,
): [Bill, Dispatch<BillAction>] {
  const [bill, dispatch] = useReducer(billReducer, source, (from) =>
    from.kind === 'memory' ? from.initial : initialBill(),
  )
  const persist = source.kind === 'draft'

  useEffect(() => {
    if (persist) saveDraft(bill)
  }, [bill, persist])

  return [bill, dispatch]
}
