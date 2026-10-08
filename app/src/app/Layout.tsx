import { Link, NavLink, Outlet } from 'react-router'
import { useT } from '../i18n/language.ts'
import type { MessageKey } from '../i18n/t.ts'
import styles from './Layout.module.css'
import { ThemeToggle } from './ThemeToggle.tsx'

const NAV_ITEMS: readonly { to: string; label: MessageKey; end: boolean }[] = [
  // `end`: Home is active only on `/` itself, not on every path under it.
  { to: '/', label: 'nav.home', end: true },
  { to: '/split', label: 'nav.split', end: false },
  { to: '/finances', label: 'nav.finances', end: false },
  { to: '/settings', label: 'nav.settings', end: false },
]

/**
 * The app shell: header with the app name and theme toggle, the main
 * navigation (a top bar on wide screens, a bottom tab bar under 640 px),
 * and the routed page inside `<main>`.
 */
export function Layout() {
  const t = useT()
  return (
    <>
      <a className={styles.skipLink} href="#main">
        {t('nav.skip')}
      </a>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link className={styles.brand} to="/">
            Settle
          </Link>
          <nav className={styles.nav} aria-label={t('nav.main')}>
            <ul className={styles.navList}>
              {NAV_ITEMS.map((item) => (
                <li key={item.to}>
                  <NavLink
                    className={styles.navLink}
                    to={item.to}
                    end={item.end}
                  >
                    {t(item.label)}
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
