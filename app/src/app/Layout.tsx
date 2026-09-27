import { Link, NavLink, Outlet } from 'react-router'
import styles from './Layout.module.css'
import { ThemeToggle } from './ThemeToggle.tsx'

const NAV_ITEMS = [
  // `end`: Home is active only on `/` itself, not on every path under it.
  { to: '/', label: 'Home', end: true },
  { to: '/split', label: 'Split', end: false },
  { to: '/finances', label: 'Finances', end: false },
  { to: '/settings', label: 'Settings', end: false },
] as const

/**
 * The app shell: header with the app name and theme toggle, the main
 * navigation (a top bar on wide screens, a bottom tab bar under 640 px),
 * and the routed page inside `<main>`.
 */
export function Layout() {
  return (
    <>
      <a className={styles.skipLink} href="#main">
        Skip to content
      </a>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link className={styles.brand} to="/">
            project-W
          </Link>
          <nav className={styles.nav} aria-label="Main">
            <ul className={styles.navList}>
              {NAV_ITEMS.map((item) => (
                <li key={item.to}>
                  <NavLink
                    className={styles.navLink}
                    to={item.to}
                    end={item.end}
                  >
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
          <ThemeToggle />
        </div>
      </header>
      {/* tabIndex -1 lets the skip link move focus here. */}
      <main id="main" className={styles.main} tabIndex={-1}>
        <Outlet />
      </main>
    </>
  )
}
