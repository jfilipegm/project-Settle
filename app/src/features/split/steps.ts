import { billHasContent } from '../receipt/importUi.ts'
import type { Bill } from './model.ts'

/** The split's three steps (M3 plan, S9), as the `step` URL parameter. */
export type SplitStep = 'receipt' | 'items' | 'split'

export const SPLIT_STEPS: readonly SplitStep[] = ['receipt', 'items', 'split']

/** A `step` parameter's step, or undefined for none or an unknown one. */
export function parseStep(value: string | null): SplitStep | undefined {
  return SPLIT_STEPS.find((step) => step === value)
}

/**
 * The step with no `step` in the URL (S9, L4-I1): a bill without content
 * opens on Receipt, one with content on Who had what. A fresh bill's one
 * empty item isn't content.
 */
export function defaultStep(bill: Bill): SplitStep {
  return billHasContent(bill) ? 'items' : 'receipt'
}
