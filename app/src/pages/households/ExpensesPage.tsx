import { useT } from '../../i18n/language.ts'
import { Card } from '../../ui/Card.tsx'
import styles from './households.module.css'

/** A household's expenses (M4 plan, H12). CP5 adds the history. */
export function ExpensesPage() {
  const t = useT()
  return (
    <>
      <h1>{t('expenses.title')}</h1>
      <Card>
        <p className={styles.hint}>{t('overview.noExpenses')}</p>
      </Card>
    </>
  )
}
