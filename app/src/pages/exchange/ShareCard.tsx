import { IconFileSpreadsheet, IconShare } from '@tabler/icons-react'
import { useCallback, useState } from 'react'
import { handOver } from '../../app/handOver.ts'
import { useRegion } from '../../app/region.ts'
import { snapshotHousehold } from '../../data/exchange.ts'
import {
  listExpenses,
  listMembers,
  listSettlements,
} from '../../data/repository.ts'
import { householdCsv } from '../../features/exchange/csv.ts'
import {
  csvFileName,
  householdFileName,
} from '../../features/exchange/fileName.ts'
import { useHouseholdData } from '../../features/household/householdData.ts'
import { isoDate } from '../../features/household/model.ts'
import { useT } from '../../i18n/language.ts'
import { Button } from '../../ui/Button.tsx'
import { Card } from '../../ui/Card.tsx'
import styles from './exchange.module.css'
import { ExportStatus } from './ExportStatus.tsx'
import { useExport } from './useExport.ts'

type CsvState = 'idle' | 'working' | 'done' | 'failed'

/**
 * The Members tab's "Share and export" card (M6 plan, E9, E11): the
 * privacy line, always visible, Share household file, and Export CSV.
 */
export function ShareCard({
  householdId,
  householdName,
}: {
  householdId: string
  householdName: string
}) {
  const t = useT()
  const { region } = useRegion()
  const { db } = useHouseholdData()
  const [csv, setCsv] = useState<CsvState>('idle')

  const exportCsv = () => {
    if (db === null) return
    setCsv('working')
    const run = async () => {
      const members = await listMembers(db, householdId)
      const expenses = await listExpenses(db, householdId)
      const settlements = await listSettlements(db, householdId)
      const text = householdCsv({
        t,
        region,
        members: members.items,
        expenses: expenses.items,
        settlements: settlements.items,
      })
      const file = new File(
        [text],
        csvFileName(householdName, isoDate(new Date())),
        { type: 'text/csv' },
      )
      setCsv((await handOver(file)) === 'cancelled' ? 'idle' : 'done')
    }
    run().catch(() => {
      setCsv('failed')
    })
  }
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
        <Button
          icon={IconFileSpreadsheet}
          disabled={csv === 'working'}
          onClick={exportCsv}
        >
          {t('exchange.csv.export')}
        </Button>
      </div>
      <ExportStatus
        state={state}
        done={t('exchange.share.ready')}
        failed={t('exchange.share.failed')}
        onConfirm={confirm}
        onCancel={cancel}
      />
      {csv === 'done' && (
        <p className={styles.status} role="status">
          {t('exchange.csv.done')}
        </p>
      )}
      {csv === 'failed' && (
        <p className={styles.error} role="alert">
          {t('exchange.csv.failed')}
        </p>
      )}
    </Card>
  )
}
