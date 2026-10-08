import { lazy, Suspense } from 'react'
import type { RouteObject } from 'react-router'
import { FinancesPage } from '../pages/FinancesPage.tsx'
import { HomePage } from '../pages/HomePage.tsx'
import { NotFoundPage } from '../pages/NotFoundPage.tsx'
import { SettingsPage } from '../pages/SettingsPage.tsx'
import { SplitPage } from '../pages/SplitPage.tsx'
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
    { path: 'finances', element: <FinancesPage /> },
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
  return [{ element: <Layout />, children: pages }]
}
