import { leftOutLine } from '../../features/exchange/words.ts'
import { useT } from '../../i18n/language.ts'
import { Button } from '../../ui/Button.tsx'
import styles from './exchange.module.css'
import type { ExportState } from './useExport.ts'

/**
 * What an export says under its buttons: the records left out with a
 * choice, the file handed over, or why it couldn't be made.
 */
export function ExportStatus({
  state,
  done,
  failed,
  onConfirm,
  onCancel,
}: {
  state: ExportState
  done: string
  failed: string
  onConfirm: () => void
  onCancel: () => void
}) {
  const t = useT()
  switch (state.kind) {
    case 'confirm':
      return (
        <div className={styles.confirm} role="alert">
          <p>
            {leftOutLine(state.leftOut, t)} {t('exchange.leftOut.keep')}
          </p>
          <div className={styles.actions}>
            <Button variant="primary" onClick={onConfirm}>
              {t('exchange.leftOut.continue')}
            </Button>
            <Button onClick={onCancel}>{t('exchange.leftOut.cancel')}</Button>
          </div>
        </div>
      )
    case 'done':
      return (
        <p className={styles.status} role="status">
          {done}
        </p>
      )
    case 'nothing':
      return (
        <p className={styles.error} role="alert">
          {t('exchange.share.nothing')}
        </p>
      )
    case 'failed':
      return (
        <p className={styles.error} role="alert">
          {failed}
        </p>
      )
    default:
      return null
  }
}
