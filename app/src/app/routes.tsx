import { lazy, Suspense } from 'react'
import { Navigate, type RouteObject } from 'react-router'
import { HomePage } from '../pages/HomePage.tsx'
import { NotFoundPage } from '../pages/NotFoundPage.tsx'
import { SettingsPage } from '../pages/SettingsPage.tsx'
import { SplitPage } from '../pages/SplitPage.tsx'
import { ExpensesPage } from '../pages/households/ExpensesPage.tsx'
import { ExpensePage } from '../pages/households/ExpensePage.tsx'
import {
  EditExpensePage,
  NewExpensePage,
} from '../pages/households/ExpenseFormPage.tsx'
import { HouseholdRedirect } from '../pages/households/HouseholdRedirect.tsx'
import { HouseholdShell } from '../pages/households/HouseholdShell.tsx'
import { HouseholdsPage } from '../pages/households/HouseholdsPage.tsx'
import { MembersPage } from '../pages/households/MembersPage.tsx'
import { OverviewPage } from '../pages/households/OverviewPage.tsx'
import { HouseholdDataProvider } from '../features/household/HouseholdDataProvider.tsx'
import { Layout } from './Layout.tsx'

/**
 * The component gallery (M3 plan, S12), development only. The lazy import
 * sits behind `import.meta.env.DEV`, which a production build replaces
 * with `false`, so the gallery's code is dropped and no chunk is emitted
 * (`scripts/check-build.mjs` checks).
 */
const KitGallery = import.meta.env.DEV
  ? lazy(() => import('../ui/gallery/KitGallery.tsx'))
  : undefined

/**
 * The app's routes, all inside the shell. Path-based (`/split`, not
 * `/#/split`), so the host must serve index.html for unknown paths: see
 * docs/adr/0001-web-app-tech-stack.md, D11. `dev` adds the gallery at
 * `/_kit`; the app passes `import.meta.env.DEV`, and the tests pass both
 * (under Vitest `import.meta.env.DEV` is always true).
 */
export function routeTable({ dev }: { dev: boolean }): RouteObject[] {
  const pages: RouteObject[] = [
    { index: true, element: <HomePage /> },
    { path: 'split', element: <SplitPage /> },
    // The Household tab: the household used last, or the list (M4, H9).
    { path: 'household', element: <HouseholdRedirect /> },
    { path: 'households', element: <HouseholdsPage /> },
    {
      path: 'households/:hid',
      element: <HouseholdShell />,
      children: [
        { index: true, element: <OverviewPage /> },
        { path: 'expenses', element: <ExpensesPage /> },
        { path: 'expenses/new', element: <NewExpensePage /> },
        { path: 'expenses/:eid', element: <ExpensePage /> },
        { path: 'expenses/:eid/edit', element: <EditExpensePage /> },
        { path: 'members', element: <MembersPage /> },
      ],
    },
    // The old Finances page promised a milestone the 2026-09-28 roadmap
    // dropped (M3 plan, S8): a bookmark lands on the Household tab.
    { path: 'finances', element: <Navigate to="/household" replace /> },
    { path: 'settings', element: <SettingsPage /> },
  ]
  if (dev && KitGallery !== undefined) {
    pages.push({
      path: '_kit',
      element: (
        <Suspense fallback={null}>
          <KitGallery />
        </Suspense>
      ),
    })
  }
  pages.push({ path: '*', element: <NotFoundPage /> })
  // The ledger's database opens lazily, on the first household page (M4,
  // H18): the split and its tests never touch IndexedDB.
  return [
    {
      element: (
        <HouseholdDataProvider>
          <Layout />
        </HouseholdDataProvider>
      ),
      children: pages,
    },
  ]
}
