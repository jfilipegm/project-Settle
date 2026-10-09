import { useT } from '../../../i18n/language.ts'
import { photoAdvice } from '../messages.ts'
import type { PhotoIssue } from '../model.ts'
import styles from './receipt.module.css'

/**
 * M2.5 plan, P11: the photo quality check's advice, one line per issue.
 * Advice only: it never stops the import.
 */
export function PhotoAdvice({
  issues,
  lead,
}: {
  issues: readonly PhotoIssue[]
  lead: string
}) {
  const t = useT()
  if (issues.length === 0) return null
  return (
    <div className={styles.photoAdvice} data-photo-issues={issues.join(' ')}>
      <p>{lead}</p>
      <ul aria-label={t('receipt.photo.label')}>
        {issues.map((issue) => (
          <li key={issue}>{photoAdvice(t, issue)}</li>
        ))}
      </ul>
    </div>
  )
}
