import { IconRefresh } from '@tabler/icons-react'
import { Link } from 'react-router'
import type { HouseholdDataStatus } from '../../features/household/householdData.ts'
import { useT } from '../../i18n/language.ts'
import { Button } from '../../ui/Button.tsx'
import { Card } from '../../ui/Card.tsx'

/**
 * What a household page shows while the ledger's database isn't ready
 * (M4 plan, H2, H3): nothing while it opens, else what happened and what
 * to do. Every state keeps the way to the split.
 */
export function StorageState({ status }: { status: HouseholdDataStatus }) {
  const t = useT()
  if (status === 'idle' || status === 'opening' || status === 'ready') {
    return null
  }
  const message =
    status === 'unavailable'
      ? t('households.storage.unavailable')
      : status === 'migrationFailed'
        ? t('households.storage.migrationFailed')
        : status === 'outdated'
          ? t('households.storage.outdated')
          : t('households.storage.blocked')
  const titled = status === 'unavailable' || status === 'migrationFailed'
  return (
    <Card
      title={
        status === 'unavailable'
          ? t('households.storage.unavailableTitle')
          : status === 'migrationFailed'
            ? t('households.storage.migrationFailedTitle')
            : undefined
      }
      role={titled ? undefined : 'alert'}
    >
      <p>{message}</p>
      {(status === 'outdated' || status === 'migrationFailed') && (
        <p>
          <Button
            icon={IconRefresh}
            onClick={() => {
              window.location.reload()
            }}
          >
            {t('households.storage.reload')}
          </Button>
        </p>
      )}
      <p>
        <Link to="/split">{t('households.storage.splitLink')}</Link>
      </p>
    </Card>
  )
}
