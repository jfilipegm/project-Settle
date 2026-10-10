import { Link, type To } from 'react-router'
import styles from './Tabs.module.css'

export interface Tab<Id extends string = string> {
  id: Id
  label: string
  to: To
}

/**
 * A segmented group of links (M4 plan, H14): a slate track with the
 * current tab on the card colour and bold, and `aria-current="page"`,
 * never colour alone.
 */
export function Tabs<Id extends string>({
  label,
  tabs,
  current,
}: {
  /** The navigation's name, read out. */
  label: string
  tabs: readonly Tab<Id>[]
  current: Id | undefined
}) {
  return (
    <nav aria-label={label}>
      <ul className={styles.tabs}>
        {tabs.map((tab) => (
          <li key={tab.id} className={styles.item}>
            <Link
              to={tab.to}
              className={styles.tab}
              aria-current={tab.id === current ? 'page' : undefined}
            >
              {tab.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
