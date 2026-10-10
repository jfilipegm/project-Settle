import { render } from '@testing-library/react'
import { IDBFactory } from 'fake-indexeddb'
import { MemoryRouter } from 'react-router'
import { vi } from 'vitest'
import { RegionProvider } from '../app/RegionProvider.tsx'
import { AppRoutes } from '../app/router.tsx'
import { ReceiptImportProvider } from '../features/receipt/ReceiptImportProvider.tsx'
import { LanguageProvider } from '../i18n/LanguageProvider.tsx'

/**
 * Gives the app a fresh, isolated IndexedDB (fake-indexeddb, M4 plan,
 * H17) as `window.indexedDB`, and returns it so a test can seed it. Undo
 * with `vi.unstubAllGlobals()`.
 */
export function stubIndexedDb(): IDBFactory {
  const factory = new IDBFactory()
  vi.stubGlobal('indexedDB', factory)
  return factory
}

/** The whole app at a path, with every provider the pages need. */
export function renderApp(path: string) {
  return render(
    <LanguageProvider>
      <RegionProvider>
        <ReceiptImportProvider>
          <MemoryRouter initialEntries={[path]}>
            <AppRoutes />
          </MemoryRouter>
        </ReceiptImportProvider>
      </RegionProvider>
    </LanguageProvider>,
  )
}
