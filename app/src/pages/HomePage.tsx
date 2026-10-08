import { useState } from 'react'
import { Link } from 'react-router'
import { billHasContent } from '../features/receipt/importUi.ts'
import { loadDraft } from '../features/split/draft.ts'
import { useT } from '../i18n/language.ts'
import styles from './HomePage.module.css'

/**
 * A short start page (M3 plan, S8): what Settle does, one primary action,
 * and the privacy line. The action reads "Continue your bill" when the
 * saved draft has content (`billHasContent`, L4-I1), and "Split a bill"
 * otherwise: a fresh bill's one empty item isn't content.
 */
export function HomePage() {
  const t = useT()
  const [started] = useState(() => {
    const draft = loadDraft()
    return draft !== null && billHasContent(draft)
  })

  return (
    <div className={styles.home}>
      <h1>Settle</h1>
      <p className={styles.tagline}>{t('home.tagline')}</p>
      <p className={styles.intro}>{t('home.intro')}</p>
      <p>
        <Link to="/split" className={styles.action}>
          {started ? t('home.continueBill') : t('home.splitBill')}
        </Link>
      </p>
      <p className={styles.privacy}>{t('home.privacy')}</p>
    </div>
  )
}
