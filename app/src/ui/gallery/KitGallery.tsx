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
import { Bars, Donut, ShareBar } from '../Charts.tsx'
import { SelectField, TextField } from '../Field.tsx'
import { Icon } from '../Icon.tsx'
import { PersonBadge } from '../PersonBadge.tsx'
import { personColorStyle } from '../personColor.ts'
import { StatusChip } from '../StatusChip.tsx'
import { Steps } from '../Steps.tsx'
import { Checkbox } from '../Checkbox.tsx'
import { Dialog } from '../Dialog.tsx'
import { Tabs } from '../Tabs.tsx'
import styles from './KitGallery.module.css'

const PEOPLE = ['Ana', 'Bruno', 'Carla', 'Duarte', 'Eva', 'Filipa', 'Gil', '']

export default function KitGallery() {
  const { region } = useRegion()
  const { language, setSetting, t } = useLanguage()
  const [theme, setTheme] = useState<ThemeMode>('light')
  const [checked, setChecked] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [viewOpen, setViewOpen] = useState(false)
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

      <Card title="Tabs">
        <Tabs
          label={t('households.tabs.label')}
          current="expenses"
          tabs={[
            {
              id: 'overview',
              label: t('households.tabs.overview'),
              to: '?tab=overview',
            },
            {
              id: 'expenses',
              label: t('households.tabs.expenses'),
              to: '?tab=expenses',
            },
            {
              id: 'members',
              label: t('households.tabs.members'),
              to: '?tab=members',
            },
          ]}
        />
      </Card>

      <Card title="Checkbox">
        <Checkbox
          label={<PersonBadge person={{ id: 'a', name: 'Ana' }} index={0} />}
          checked={checked}
          onChange={(event) => setChecked(event.target.checked)}
        />
      </Card>

      <Card title="Dialog">
        <Button onClick={() => setDialogOpen(true)}>
          {t('members.rename')}
        </Button>
        <Dialog
          open={dialogOpen}
          title={t('members.renameTitle', { name: 'Ana' })}
          onClose={() => setDialogOpen(false)}
        >
          <TextField label={t('members.name')} defaultValue="Ana" />
          <p>
            <Button variant="primary" onClick={() => setDialogOpen(false)}>
              {t('households.save')}
            </Button>
          </p>
        </Dialog>
      </Card>

      <Card title="Dialog with a close button">
        <Button onClick={() => setViewOpen(true)}>Open</Button>
        <Dialog
          open={viewOpen}
          title="Groceries"
          closeLabel={t('expense.close')}
          onClose={() => setViewOpen(false)}
        >
          <p>A dialog that shows things, closed by its button.</p>
        </Dialog>
      </Card>

      <Card title="Charts">
        <p>Hover, focus or tap a mark: its tip shows at once.</p>
        <Donut
          label="Where it went: Rent 25,50 €, Groceries 4,50 €."
          slices={[
            {
              id: 'rent',
              value: 2550,
              colour: 'var(--chart-3)',
              label: 'Rent: 25,50 €, 85 %',
            },
            {
              id: 'groceries',
              value: 450,
              colour: 'var(--chart-1)',
              label: 'Groceries: 4,50 €, 15 %',
            },
          ]}
        >
          <Amount value={cents(3000)} region={region} />
        </Donut>
        <Bars
          label="Day by day"
          summary="30,00 € in the week; the most on 1 Oct, 25,50 €."
          scale="Up to 25,50 €"
          bars={[1, 2, 3, 4, 5, 6, 7].map((day) => ({
            id: `day-${String(day)}`,
            value: [2550, 450, 0, 0, 1200, 300, 0][day - 1] ?? 0,
            label: `${String(day)} Oct`,
            tick: String(day),
          }))}
        />
        <Bars
          emphasis
          label="The last six months"
          bars={['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'].map((m, i) => ({
            id: m,
            value: [900, 1200, 400, 0, 9000, 3000][i] ?? 0,
            label: m,
            tick: m,
            current: m === 'Oct',
            to: m === 'Oct' ? undefined : `?month=${m}`,
          }))}
        />
        <ShareBar
          label="Ana 30,00 €, Bruno 10,00 €"
          segments={[
            {
              id: 'ana',
              value: 3000,
              style: personColorStyle(0),
              label: 'Ana: 30,00 €',
            },
            {
              id: 'bruno',
              value: 1000,
              style: personColorStyle(1),
              label: 'Bruno: 10,00 €',
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
