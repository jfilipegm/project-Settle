import { useId } from 'react'
import { useRegion } from '../app/region.ts'
import {
  cents,
  formatAmount,
  SUPPORTED_CURRENCIES,
  SUPPORTED_LOCALES,
  type MoneyCurrency,
  type MoneyLocale,
} from '../lib/money.ts'
import styles from './SettingsPage.module.css'

const LOCALE_LABELS: Record<MoneyLocale, string> = {
  'pt-PT': 'Portuguese (Portugal)',
  'en-GB': 'English (UK)',
  'en-US': 'English (US)',
}

const CURRENCY_LABELS: Record<MoneyCurrency, string> = {
  EUR: 'Euro (€)',
  GBP: 'Pound sterling (£)',
  USD: 'US dollar ($)',
}

const EXAMPLE_AMOUNT = cents(123456)

export function SettingsPage() {
  const { region, setRegion } = useRegion()
  const localeId = useId()
  const currencyId = useId()

  return (
    <>
      <h1>Settings</h1>

      <section className={styles.section} aria-labelledby="region-heading">
        <h2 id="region-heading">Region</h2>
        <p className={styles.hint}>
          How amounts are typed and shown. Changing the currency only changes
          the symbol: amounts are never converted.
        </p>

        <div className={styles.field}>
          <label htmlFor={localeId}>Number format</label>
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
                {LOCALE_LABELS[locale]}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.field}>
          <label htmlFor={currencyId}>Currency</label>
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
                {CURRENCY_LABELS[currency]}
              </option>
            ))}
          </select>
        </div>

        <p>
          Example: <output>{formatAmount(EXAMPLE_AMOUNT, region)}</output>
        </p>
      </section>

      <section className={styles.section} aria-labelledby="receipts-heading">
        <h2 id="receipts-heading">Receipt reading</h2>
        <p>Built-in: read on this device with PaddleOCR.</p>
        <p className={styles.hint}>
          The first scan downloads the reader (about 27 MB) from this site; your
          browser keeps it for the next scans. Receipts never leave your device.
        </p>
      </section>

      <section className={styles.section} aria-labelledby="about-heading">
        <h2 id="about-heading">About</h2>
        <p>
          <a href={`${import.meta.env.BASE_URL}THIRD_PARTY_NOTICES.md`}>
            Third-party licences
          </a>
        </p>
        <p className={styles.hint}>
          The open-source libraries that read receipts, and their licences.
        </p>
      </section>
    </>
  )
}
