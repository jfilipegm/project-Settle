/**
 * How the Split page reaches the receipt importer (M2 plan, CP4): through
 * context, so the tests can provide a fake. `ReceiptImportProvider` gives
 * the real one; this file holds the context and hook, so that file only
 * exports a component.
 */
import { createContext, useContext } from 'react'
import type { ImportOptions, ImportResult } from './importReceipt.ts'

export type ImportReceiptFn = (
  file: File,
  options: ImportOptions,
) => Promise<ImportResult>

export const ReceiptImportContext = createContext<ImportReceiptFn | null>(null)

/** The importer from the nearest `ReceiptImportProvider`. */
export function useReceiptImport(): ImportReceiptFn {
  const value = useContext(ReceiptImportContext)
  if (value === null) {
    throw new Error(
      'useReceiptImport must be used inside a ReceiptImportProvider',
    )
  }
  return value
}
