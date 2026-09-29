import type { ReactNode } from 'react'
import { ReceiptImportContext, type ImportReceiptFn } from './receiptImport.ts'

/** The real importer, loaded on the first scan (see browserImport.ts). */
const importOnFirstUse: ImportReceiptFn = async (file, options) => {
  let module: typeof import('./browserImport.ts')
  try {
    module = await import('./browserImport.ts')
  } catch {
    // The app's own chunk couldn't load: offline on a first scan.
    return { ok: false, error: { code: 'assetsUnavailable' } }
  }
  return module.importWithBrowser(file, options)
}

/**
 * Provides the receipt importer with its real dependencies. The tests
 * provide a fake through `ReceiptImportContext` instead.
 */
export function ReceiptImportProvider({ children }: { children: ReactNode }) {
  return (
    <ReceiptImportContext value={importOnFirstUse}>
      {children}
    </ReceiptImportContext>
  )
}
