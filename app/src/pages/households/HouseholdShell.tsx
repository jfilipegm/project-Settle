import { IconSelector } from '@tabler/icons-react'
import { useCallback, useEffect } from 'react'
import { Link, Outlet, useLocation, useParams } from 'react-router'
import { writeHouseholdPointer } from '../../data/pointer.ts'
import {
  getHousehold,
  listMembers,
  setHouseholdArchived,
} from '../../data/repository.ts'
import {
  useHouseholdData,
  useLoaded,
} from '../../features/household/householdData.ts'
import { sortByPosition } from '../../features/household/model.ts'
import { useT } from '../../i18n/language.ts'
import { Button } from '../../ui/Button.tsx'
import { Card } from '../../ui/Card.tsx'
import { Icon } from '../../ui/Icon.tsx'
import { Tabs } from '../../ui/Tabs.tsx'
import { NotFoundPage } from '../NotFoundPage.tsx'
import type { HouseholdContext } from './householdContext.ts'
import styles from './households.module.css'
import { StorageState } from './StorageState.tsx'

type TabId = 'overview' | 'expenses' | 'members'

/** The tab a page belongs to: an expense's pages stay under Expenses. */
function currentTab(pathname: string, base: string): TabId | undefined {
  const rest = pathname.slice(base.length)
  const under = (section: string) =>
    rest === section || rest.startsWith(`${section}/`)
  if (rest === '' || rest === '/') return 'overview'
  if (under('/expenses')) return 'expenses'
  if (under('/members')) return 'members'
  return undefined
}

/**
 * A household's pages (M4 plan, H9): its name as the way to switch
 * household, then the tabs Overview, Expenses and Members. An unknown id
 * shows Not found.
 */
export function HouseholdShell() {
  const t = useT()
  const { hid = '' } = useParams()
  const { pathname } = useLocation()
  const { status, db, changed } = useHouseholdData()
  const loaded = useLoaded(
    useCallback(
      async (d: IDBDatabase) => {
        const household = await getHousehold(d, hid)
        const members = await listMembers(d, hid)
        return { household, members }
      },
      [hid],
    ),
  )

  const found = loaded.state === 'ready' ? loaded.value.household : null
  useEffect(() => {
    if (found !== null && found.archivedAt === undefined) {
      writeHouseholdPointer(found.id)
    }
  }, [found])

  if (status !== 'ready' && status !== 'idle' && status !== 'opening') {
    return (
      <div className={styles.page}>
        <h1>{t('households.title')}</h1>
        <StorageState status={status} />
      </div>
    )
  }
  if (loaded.state !== 'ready') return null
  const { household, members } = loaded.value
  if (household === null) return <NotFoundPage />

  const base = `/households/${household.id}`
  const context: HouseholdContext = {
    household,
    members: sortByPosition(members.items),
    unreadableMembers: members.unreadable,
  }
  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <Link
          className={styles.switcher}
          to="/households"
          aria-label={t('households.switch', { name: household.name })}
        >
          <span className={styles.switcherName}>{household.name}</span>
          <Icon icon={IconSelector} size={16} />
        </Link>
        <Tabs
          label={t('households.tabs.label')}
          current={currentTab(pathname, base)}
          tabs={[
            { id: 'overview', label: t('households.tabs.overview'), to: base },
            {
              id: 'expenses',
              label: t('households.tabs.expenses'),
              to: `${base}/expenses`,
            },
            {
              id: 'members',
              label: t('households.tabs.members'),
              to: `${base}/members`,
            },
          ]}
        />
      </div>
      {household.archivedAt !== undefined && (
        <Card role="status">
          <p>{t('households.archivedNotice')}</p>
          <p>
            <Button
              onClick={() => {
                if (db === null) return
                const now = new Date().toISOString()
                void setHouseholdArchived(db, household.id, null, now)
                  .then(changed)
                  .catch(() => undefined)
              }}
            >
              {t('households.restore')}
            </Button>
          </p>
        </Card>
      )}
      <Outlet context={context} />
    </div>
  )
}
