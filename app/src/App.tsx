import { BrowserRouter } from 'react-router'
import { RegionProvider } from './app/RegionProvider.tsx'
import { AppRoutes } from './app/router.tsx'
import { ReceiptImportProvider } from './features/receipt/ReceiptImportProvider.tsx'
import { LanguageProvider } from './i18n/LanguageProvider.tsx'

export default function App() {
  return (
    <LanguageProvider>
      <RegionProvider>
        <ReceiptImportProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </ReceiptImportProvider>
      </RegionProvider>
    </LanguageProvider>
  )
}
