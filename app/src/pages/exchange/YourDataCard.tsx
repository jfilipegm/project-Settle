import { IconDownload, IconFileImport } from '@tabler/icons-react'
import { useNavigate } from 'react-router'
import { useRegion } from '../../app/region.ts'
import { dateLocale, formatDate } from '../../features/household/format.ts'
import { isoDate } from '../../features/household/model.ts'
import { useLanguage } from '../../i18n/language.ts'
import { Button } from '../../ui/Button.tsx'
import { Card } from '../../ui/Card.tsx'
import styles from './exchange.module.css'
import { ExportStatus } from './ExportStatus.tsx'
import { useBackup, useBackupStatus } from './useBackup.ts'

/**
 * Settings' "Your data" card (M6 plan, E10): Back up now, Restore from a
 * file (Open a Settle file), and when the last backup was made.
 */
export function YourDataCard() {
  const { t, language } = useLanguage()
  const { region } = useRegion()
  const navigate = useNavigate()
  const status = useBackupStatus()
  const { state, start, confirm, cancel } = useBackup()
  const last = status.state === 'ready' ? status.value.lastBackupAt : undefined

  return (
    <Card title={t('exchange.data.title')} className={styles.card}>
      {status.state === 'ready' && (
        <p>
          {last === undefined
            ? t('exchange.data.noBackup')
            : t('exchange.data.lastBackup', {
                date: formatDate(
                  isoDate(new Date(last)),
                  dateLocale(language, region.locale),
                ),
              })}
        </p>
      )}
      <p className={styles.hint}>{t('exchange.data.hint')}</p>
      <div className={styles.actions}>
        <Button
          variant="primary"
          icon={IconDownload}
          disabled={state.kind === 'working' || state.kind === 'confirm'}
          onClick={start}
        >
          {t('exchange.data.backUp')}
        </Button>
        <Button
          icon={IconFileImport}
          onClick={() => {
            void navigate('/import')
          }}
        >
          {t('exchange.data.restore')}
        </Button>
      </div>
      <ExportStatus
        state={state}
        done={t('exchange.data.done')}
        failed={t('exchange.data.failed')}
        onConfirm={confirm}
        onCancel={cancel}
      />
      <p className={styles.hint}>{t('exchange.data.restoreHint')}</p>
    </Card>
  )
}
