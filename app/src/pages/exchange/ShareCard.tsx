import { IconShare } from '@tabler/icons-react'
import { useCallback, type ReactNode } from 'react'
import { snapshotHousehold } from '../../data/exchange.ts'
import { householdFileName } from '../../features/exchange/fileName.ts'
import { isoDate } from '../../features/household/model.ts'
import { useT } from '../../i18n/language.ts'
import { Button } from '../../ui/Button.tsx'
import { Card } from '../../ui/Card.tsx'
import styles from './exchange.module.css'
import { ExportStatus } from './ExportStatus.tsx'
import { useExport } from './useExport.ts'

/**
 * The Members tab's "Share and export" card (M6 plan, E9): the privacy
 * line, always visible, and Share household file. `children` holds the
 * other exports (CSV).
 */
export function ShareCard({
  householdId,
  householdName,
  children,
}: {
  householdId: string
  householdName: string
  children?: ReactNode
}) {
  const t = useT()
  const make = useCallback(
    async (db: IDBDatabase) => {
      const now = new Date()
      const snapshot = await snapshotHousehold(
        db,
        householdId,
        now.toISOString(),
      )
      return {
        snapshot,
        fileName: householdFileName(householdName, isoDate(now)),
      }
    },
    [householdId, householdName],
  )
  const { state, start, confirm, cancel } = useExport(make)

  return (
    <Card title={t('exchange.share.title')} className={styles.card}>
      <p className={styles.hint}>{t('exchange.share.privacy')}</p>
      <div className={styles.actions}>
        <Button
          variant="primary"
          icon={IconShare}
          disabled={state.kind === 'working' || state.kind === 'confirm'}
          onClick={start}
        >
          {t('exchange.share.shareFile')}
        </Button>
        {children}
      </div>
      <ExportStatus
        state={state}
        done={t('exchange.share.ready')}
        failed={t('exchange.share.failed')}
        onConfirm={confirm}
        onCancel={cancel}
      />
    </Card>
  )
}
