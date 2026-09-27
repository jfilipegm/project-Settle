import { Route, Routes } from 'react-router'
import { FinancesPage } from '../pages/FinancesPage.tsx'
import { HomePage } from '../pages/HomePage.tsx'
import { NotFoundPage } from '../pages/NotFoundPage.tsx'
import { SettingsPage } from '../pages/SettingsPage.tsx'
import { SplitPage } from '../pages/SplitPage.tsx'
import { Layout } from './Layout.tsx'

/**
 * The app's routes, all inside the shell. Path-based (`/split`, not
 * `/#/split`), so the host must serve index.html for unknown paths: see
 * docs/adr/0001-web-app-tech-stack.md, D11. Rendered inside a router:
 * `BrowserRouter` in App, `MemoryRouter` in tests.
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="split" element={<SplitPage />} />
        <Route path="finances" element={<FinancesPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
