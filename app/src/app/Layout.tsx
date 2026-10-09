import {
  IconHome,
  IconReceipt,
  IconSettings,
  type Icon as TablerIcon,
} from '@tabler/icons-react'
import { Link, NavLink, Outlet } from 'react-router'
import { useT } from '../i18n/language.ts'
import type { MessageKey } from '../i18n/t.ts'
import { Icon } from '../ui/Icon.tsx'
import styles from './Layout.module.css'
import { ThemeToggle } from './ThemeToggle.tsx'

/** The three destinations (M3 plan, S8); Home is the wordmark. */
const NAV_ITEMS: readonly {
  to: string
  label: MessageKey
  icon: TablerIcon
}[] = [
  { to: '/split', label: 'nav.split', icon: IconReceipt },
  { to: '/household', label: 'nav.household', icon: IconHome },
  { to: '/settings', label: 'nav.settings', icon: IconSettings },
]

/**
 * The app shell (S8): the header with the wordmark, a link to Home; the
 * three destinations as a bottom tab bar under 640 px and as a menu in
 * the header from 640 px, with the compact theme toggle; and the routed
 * page inside `<main>`.
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
          <Link className={styles.brand} to="/" aria-label={t('nav.home')}>
            Settle
          </Link>
          <nav className={styles.nav} aria-label={t('nav.main')}>
            <ul className={styles.navList}>
              {NAV_ITEMS.map((item) => (
                <li key={item.to}>
                  <NavLink className={styles.navLink} to={item.to}>
                    <Icon
                      icon={item.icon}
                      size={24}
                      className={styles.navIcon}
                    />
                    <span>{t(item.label)}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
          <div className={styles.headerTheme}>
            <ThemeToggle />
          </div>
        </div>
      </header>
      {/* tabIndex -1 lets the skip link move focus here. */}
      <main id="main" className={styles.main} tabIndex={-1}>
        <Outlet />
      </main>
    </>
  )
}
