import { useRoutes } from 'react-router'
import { routeTable } from './routes.tsx'

/**
 * The app's routes (see routes.tsx). Rendered inside a router:
 * `BrowserRouter` in App, `MemoryRouter` in tests.
 */
export function AppRoutes() {
  return useRoutes(routeTable({ dev: import.meta.env.DEV }))
}
