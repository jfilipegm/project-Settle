import { useT } from '../i18n/language.ts'
import { PlaceholderPage } from './PlaceholderPage.tsx'

export function FinancesPage() {
  const t = useT()
  return (
    <PlaceholderPage
      title={t('placeholder.finances.title')}
      summary={t('placeholder.finances.summary')}
      milestone="M5"
      milestoneName={t('placeholder.finances.milestoneName')}
    />
  )
}
