import { BrowserRouter } from 'react-router'
import { RegionProvider } from './app/RegionProvider.tsx'
import { AppRoutes } from './app/router.tsx'

export default function App() {
  return (
    <RegionProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </RegionProvider>
  )
}
