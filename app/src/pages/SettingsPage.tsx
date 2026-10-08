import { useId } from 'react'
import { useRegion } from '../app/region.ts'
import { useLanguage } from '../i18n/language.ts'
import type { LanguageSetting } from '../i18n/language.ts'
import {
  cents,
  formatAmount,
  SUPPORTED_CURRENCIES,
  SUPPORTED_LOCALES,
  type MoneyCurrency,
  type MoneyLocale,
} from '../lib/money.ts'
import styles from './SettingsPage.module.css'

const LANGUAGE_SETTINGS: readonly LanguageSetting[] = ['system', 'en', 'pt']

const EXAMPLE_AMOUNT = cents(123456)

export function SettingsPage() {
  const { region, setRegion } = useRegion()
  const { setting, setSetting, t } = useLanguage()
  const languageId = useId()
  const localeId = useId()
  const currencyId = useId()

  return (
    <>
      <h1>{t('settings.title')}</h1>

      <section className={styles.section} aria-labelledby="language-heading">
        <h2 id="language-heading">{t('settings.language.heading')}</h2>
        <div className={styles.field}>
          <label htmlFor={languageId}>{t('settings.language.label')}</label>
          <select
            id={languageId}
            className={styles.select}
            value={setting}
            aria-describedby={`${languageId}-hint`}
            onChange={(event) => {
              setSetting(event.target.value as LanguageSetting)
            }}
          >
            {LANGUAGE_SETTINGS.map((option) => (
              <option key={option} value={option}>
                {t(`settings.language.option.${option}`)}
              </option>
            ))}
          </select>
        </div>
        <p id={`${languageId}-hint`} className={styles.hint}>
          {t('settings.language.hint')}
        </p>
      </section>

      <section className={styles.section} aria-labelledby="region-heading">
        <h2 id="region-heading">{t('settings.region.heading')}</h2>
        <p className={styles.hint}>{t('settings.region.hint')}</p>

        <div className={styles.field}>
          <label htmlFor={localeId}>{t('settings.region.numberFormat')}</label>
          <select
            id={localeId}
            className={styles.select}
            value={region.locale}
            onChange={(event) => {
              setRegion({
                ...region,
                locale: event.target.value as MoneyLocale,
              })
            }}
          >
            {SUPPORTED_LOCALES.map((locale) => (
              <option key={locale} value={locale}>
                {t(`settings.region.locale.${locale}`)}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.field}>
          <label htmlFor={currencyId}>{t('settings.region.currency')}</label>
          <select
            id={currencyId}
            className={styles.select}
            value={region.currency}
            onChange={(event) => {
              setRegion({
                ...region,
                currency: event.target.value as MoneyCurrency,
              })
            }}
          >
            {SUPPORTED_CURRENCIES.map((currency) => (
              <option key={currency} value={currency}>
                {t(`settings.region.currencyName.${currency}`)}
              </option>
            ))}
          </select>
        </div>

        <p>
          {t('settings.region.example')}{' '}
          <output>{formatAmount(EXAMPLE_AMOUNT, region)}</output>
        </p>
      </section>

      <section className={styles.section} aria-labelledby="receipts-heading">
        <h2 id="receipts-heading">{t('settings.receipts.heading')}</h2>
        <p>{t('settings.receipts.builtIn')}</p>
        <p className={styles.hint}>{t('settings.receipts.hint')}</p>
      </section>

      <section className={styles.section} aria-labelledby="about-heading">
        <h2 id="about-heading">{t('settings.about.heading')}</h2>
        <p>
          <a href={`${import.meta.env.BASE_URL}THIRD_PARTY_NOTICES.md`}>
            {t('settings.about.licences')}
          </a>
        </p>
        <p className={styles.hint}>{t('settings.about.hint')}</p>
      </section>
    </>
  )
}
