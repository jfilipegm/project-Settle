import { useRegion } from '../app/region.ts'
import { useTheme, type ThemeMode } from '../app/theme.ts'
import { useLanguage, type LanguageSetting } from '../i18n/language.ts'
import {
  cents,
  SUPPORTED_CURRENCIES,
  SUPPORTED_LOCALES,
  type MoneyCurrency,
  type MoneyLocale,
} from '../lib/money.ts'
import { Amount } from '../ui/Amount.tsx'
import { Card } from '../ui/Card.tsx'
import { SelectField } from '../ui/Field.tsx'
import styles from './SettingsPage.module.css'

const LANGUAGE_SETTINGS: readonly LanguageSetting[] = ['system', 'en', 'pt']
const THEME_MODES: readonly ThemeMode[] = ['system', 'light', 'dark']

const EXAMPLE_AMOUNT = cents(123456)

/**
 * Settings (M3 plan, S8, S11) on the kit: Language, Theme, Region, and
 * receipt reading with its licences.
 */
export function SettingsPage() {
  const { region, setRegion } = useRegion()
  const { setting, setSetting, t } = useLanguage()
  const { mode, setMode } = useTheme()

  return (
    <div className={styles.page}>
      <h1>{t('settings.title')}</h1>

      <Card title={t('settings.language.heading')}>
        <SelectField
          label={t('settings.language.label')}
          hint={t('settings.language.hint')}
          value={setting}
          onChange={(event) => {
            setSetting(event.target.value as LanguageSetting)
          }}
        >
          {LANGUAGE_SETTINGS.map((option) => (
            <option key={option} value={option}>
              {t(`settings.language.option.${option}`)}
            </option>
          ))}
        </SelectField>
      </Card>

      <Card title={t('settings.theme.heading')}>
        <SelectField
          label={t('settings.theme.label')}
          hint={t('settings.theme.hint')}
          value={mode}
          onChange={(event) => {
            setMode(event.target.value as ThemeMode)
          }}
        >
          {THEME_MODES.map((option) => (
            <option key={option} value={option}>
              {t(`theme.label.${option}`)}
            </option>
          ))}
        </SelectField>
      </Card>

      <Card title={t('settings.region.heading')}>
        <p className={styles.hint}>{t('settings.region.hint')}</p>
        <div className={styles.fields}>
          <SelectField
            label={t('settings.region.numberFormat')}
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
          </SelectField>
          <SelectField
            label={t('settings.region.currency')}
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
          </SelectField>
        </div>
        <p>
          {t('settings.region.example')}{' '}
          <output>
            <Amount value={EXAMPLE_AMOUNT} region={region} />
          </output>
        </p>
      </Card>

      <Card title={t('settings.receipts.heading')}>
        <p>{t('settings.receipts.builtIn')}</p>
        <p className={styles.hint}>{t('settings.receipts.hint')}</p>
        <p>
          <a href={`${import.meta.env.BASE_URL}THIRD_PARTY_NOTICES.md`}>
            {t('settings.about.licences')}
          </a>
        </p>
        <p className={styles.hint}>{t('settings.about.hint')}</p>
      </Card>
    </div>
  )
}
