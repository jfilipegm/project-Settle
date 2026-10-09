/**
 * The component gallery (M3 plan, S12): every kit component, in both
 * themes and both languages, at `/_kit` in development only. Its own
 * headings are developer text; the components show catalogue text, so the
 * language switch shows them in Portuguese.
 */
import { IconPlus, IconReceipt, IconTrash } from '@tabler/icons-react'
import { useState } from 'react'
import { useRegion } from '../../app/region.ts'
import { applyThemeMode, type ThemeMode } from '../../app/theme.ts'
import { useLanguage } from '../../i18n/language.ts'
import { cents } from '../../lib/money.ts'
import { Amount } from '../Amount.tsx'
import { Button, IconButton } from '../Button.tsx'
import { Card } from '../Card.tsx'
import { SelectField, TextField } from '../Field.tsx'
import { Icon } from '../Icon.tsx'
import { PersonBadge } from '../PersonBadge.tsx'
import { StatusChip } from '../StatusChip.tsx'
import { Steps } from '../Steps.tsx'
import styles from './KitGallery.module.css'

const PEOPLE = ['Ana', 'Bruno', 'Carla', 'Duarte', 'Eva', 'Filipa', 'Gil', '']

export default function KitGallery() {
  const { region } = useRegion()
  const { language, setSetting, t } = useLanguage()
  const [theme, setTheme] = useState<ThemeMode>('light')
  const switchTheme = (mode: ThemeMode) => {
    applyThemeMode(mode)
    setTheme(mode)
  }

  return (
    <div className={styles.gallery} data-kit-gallery="">
      <h1>Kit</h1>
      <div className={styles.switches}>
        <Button
          size={40}
          aria-pressed={theme === 'light'}
          onClick={() => switchTheme('light')}
        >
          {t('theme.label.light')}
        </Button>
        <Button
          size={40}
          aria-pressed={theme === 'dark'}
          onClick={() => switchTheme('dark')}
        >
          {t('theme.label.dark')}
        </Button>
        <Button
          size={40}
          aria-pressed={language === 'en'}
          onClick={() => setSetting('en')}
        >
          {t('settings.language.option.en')}
        </Button>
        <Button
          size={40}
          aria-pressed={language === 'pt'}
          onClick={() => setSetting('pt')}
        >
          {t('settings.language.option.pt')}
        </Button>
      </div>

      <Card title="Button">
        <div className={styles.row}>
          <Button variant="primary" icon={IconReceipt}>
            {t('receipt.scan.takePhoto')}
          </Button>
          <Button>{t('split.newBill')}</Button>
          <Button variant="quiet">{t('split.seeSplit')}</Button>
          <Button disabled>{t('receipt.scan.cancel')}</Button>
        </div>
        <div className={styles.row}>
          {([40, 44, 48, 52] as const).map((size) => (
            <Button key={size} variant="primary" size={size} icon={IconPlus}>
              {t('split.items.add')}
            </Button>
          ))}
        </div>
      </Card>

      <Card title="IconButton">
        <div className={styles.row}>
          <IconButton label={t('split.items.remove')} icon={IconTrash} />
          <IconButton
            label={t('split.people.add')}
            icon={IconPlus}
            variant="quiet"
          />
        </div>
      </Card>

      <Card title="TextField, SelectField">
        <div className={styles.stack}>
          <TextField label={t('split.items.name')} />
          <TextField
            label={t('split.items.unitPrice')}
            hint={t('split.adjustments.percentHint')}
            error={t('split.errors.negative')}
            defaultValue="-2"
          />
          <SelectField
            label={t('settings.language.label')}
            hint={t('settings.language.hint')}
            defaultValue="system"
          >
            <option value="system">
              {t('settings.language.option.system')}
            </option>
            <option value="en">{t('settings.language.option.en')}</option>
            <option value="pt">{t('settings.language.option.pt')}</option>
          </SelectField>
        </div>
      </Card>

      <Card title="StatusChip">
        <div className={styles.row}>
          <StatusChip tone="success">{t('receipt.check.matches')}</StatusChip>
          <StatusChip tone="warning">{t('split.items.check')}</StatusChip>
          <StatusChip tone="error">{t('split.errors.unassigned')}</StatusChip>
        </div>
      </Card>

      <Card title="PersonBadge">
        <div className={styles.row}>
          {PEOPLE.map((name, index) => (
            <PersonBadge
              key={index}
              person={{ id: String(index), name }}
              index={index}
            />
          ))}
        </div>
      </Card>

      <Card title="Amount">
        <div className={styles.row}>
          <Amount value={cents(123456)} region={region} />
          <Amount value={cents(-250)} region={region} />
          <Amount value={cents(250)} region={region} sign="always" />
        </div>
      </Card>

      <Card title="Steps">
        <Steps
          label={t('split.title')}
          current="items"
          steps={[
            {
              id: 'receipt',
              label: t('receipt.check.heading'),
              to: '?step=receipt',
            },
            { id: 'items', label: t('split.items.heading'), to: '?step=items' },
            {
              id: 'split',
              label: t('split.result.heading'),
              to: '?step=split',
            },
          ]}
        />
      </Card>

      <Card title="Icon">
        <div className={styles.row}>
          {([16, 20, 24] as const).map((size) => (
            <Icon key={size} icon={IconReceipt} size={size} />
          ))}
        </div>
      </Card>
    </div>
  )
}
