import { Link } from 'react-router'
import { activeMembers, isoDate } from '../../features/household/model.ts'
import { formatMonth } from '../../features/household/format.ts'
import { dateLocale } from '../../features/household/format.ts'
import { useRegion } from '../../app/region.ts'
import { useLanguage } from '../../i18n/language.ts'
import { Card } from '../../ui/Card.tsx'
import { useHouseholdContext } from './householdContext.ts'
import styles from './households.module.css'

/**
 * A household's overview (M4 plan, H13): the month, and the empty states.
 * CP3 adds the month's expenses and totals.
 */
export function OverviewPage() {
  const { t, language } = useLanguage()
  const { region } = useRegion()
  const { household, members } = useHouseholdContext()
  const today = isoDate(new Date())
  const locale = dateLocale(language, region.locale)
  const active = activeMembers(members, today)
  return (
    <>
      <h1>{formatMonth(today.slice(0, 7), locale)}</h1>
      {active.length === 0 ? (
        <Card title={t('overview.noMembers')}>
          <p className={styles.hint}>{t('overview.noMembersHint')}</p>
          <p>
            <Link to={`/households/${household.id}/members`}>
              {t('overview.toMembers')}
            </Link>
          </p>
        </Card>
      ) : (
        <Card>
          <p className={styles.hint}>{t('overview.noExpenses')}</p>
        </Card>
      )}
    </>
  )
}
