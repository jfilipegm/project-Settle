import { Link } from 'react-router'
import { useT } from '../i18n/language.ts'
import styles from './HomePage.module.css'

export function HomePage() {
  const t = useT()
  return (
    <>
      <h1>Settle</h1>
      <p className={styles.tagline}>{t('home.tagline')}</p>
      <p>{t('home.intro')}</p>
      <p>
        <Link to="/split">{t('home.splitBill')}</Link>
      </p>
    </>
  )
}
