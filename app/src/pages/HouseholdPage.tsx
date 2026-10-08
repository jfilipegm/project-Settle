import { Link } from 'react-router'
import { useT } from '../i18n/language.ts'
import { Card } from '../ui/Card.tsx'

/**
 * The Household destination (M3 plan, S8), a placeholder until M4: one
 * line of copy and a link to the split. Navigation scaffolding only: no
 * household state, model or storage exists before M4 (O-EXT-3).
 */
export function HouseholdPage() {
  const t = useT()
  return (
    <>
      <h1>{t('household.title')}</h1>
      <Card>
        <p>{t('household.coming')}</p>
        <p>
          <Link to="/split">{t('household.split')}</Link>
        </p>
      </Card>
    </>
  )
}
