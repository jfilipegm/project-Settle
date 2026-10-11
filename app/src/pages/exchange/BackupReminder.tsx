import { useState } from 'react'
import { useT } from '../../i18n/language.ts'
import { Button } from '../../ui/Button.tsx'
import styles from './exchange.module.css'
import { ExportStatus } from './ExportStatus.tsx'
import { useBackup, useBackupStatus } from './useBackup.ts'

/** Where Later's snooze lives (M6 plan, E10). */
export const SNOOZE_KEY = 'settle.backupSnooze'

const DAY = 24 * 60 * 60 * 1000
/** The reminder waits this long, and Later hides it as long (E10). */
export const REMINDER_DAYS = 7

function snoozedUntil(): number {
  try {
    const value = localStorage.getItem(SNOOZE_KEY)
    return value === null ? 0 : Date.parse(value) || 0
  } catch {
    return 0
  }
}

/**
 * The backup reminder (M6 plan, E10): on the Households page and a
 * household's Overview when changes have waited a week or more for a
 * backup. Back up now runs the backup; Later hides it for a week (storage
 * that can't be written simply shows it again). It never blocks anything.
 */
export function BackupReminder({ now: givenNow }: { now?: number }) {
  const t = useT()
  const status = useBackupStatus()
  const backup = useBackup()
  const [snooze, setSnooze] = useState(snoozedUntil)
  const [openedAt] = useState(() => Date.now())
  const now = givenNow ?? openedAt

  const first =
    status.state === 'ready' ? status.value.firstUnbackedChangeAt : undefined
  const since = first === undefined ? NaN : Date.parse(first)
  const days = Math.floor((now - since) / DAY)
  const showing =
    backup.state.kind !== 'idle' ||
    (Number.isFinite(days) && days >= REMINDER_DAYS && now >= snooze)
  if (!showing) return null

  return (
    <section
      className={styles.reminder}
      aria-label={t('exchange.reminder.label')}
    >
      {backup.state.kind !== 'done' && (
        <p>{t('exchange.reminder.text', { count: days })}</p>
      )}
      {backup.state.kind !== 'done' && (
        <div className={styles.actions}>
          <Button
            variant="primary"
            disabled={
              backup.state.kind === 'working' || backup.state.kind === 'confirm'
            }
            onClick={backup.start}
          >
            {t('exchange.data.backUp')}
          </Button>
          <Button
            onClick={() => {
              const until = new Date(now + REMINDER_DAYS * DAY).toISOString()
              try {
                localStorage.setItem(SNOOZE_KEY, until)
              } catch {
                // Storage can't be written: it shows again next time.
              }
              setSnooze(Date.parse(until))
            }}
          >
            {t('exchange.reminder.later')}
          </Button>
        </div>
      )}
      <ExportStatus
        state={backup.state}
        done={t('exchange.data.done')}
        failed={t('exchange.data.failed')}
        onConfirm={backup.confirm}
        onCancel={backup.cancel}
      />
    </section>
  )
}
