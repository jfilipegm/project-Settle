import { BrowserRouter } from 'react-router'
import { RegionProvider } from './app/RegionProvider.tsx'
import { AppRoutes } from './app/router.tsx'
import { ReceiptImportProvider } from './features/receipt/ReceiptImportProvider.tsx'

export default function App() {
  return (
    <RegionProvider>
      <ReceiptImportProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </ReceiptImportProvider>
    </RegionProvider>
  )
}
