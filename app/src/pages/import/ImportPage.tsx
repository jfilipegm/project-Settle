import { IconFileImport } from '@tabler/icons-react'
import { useId, useMemo, useState, type ChangeEvent } from 'react'
import { Link } from 'react-router'
import { useRegion } from '../../app/region.ts'
import {
  ImportChangedError,
  applyImport,
  prepareImport,
  type AppliedHousehold,
  type ImportPreview,
} from '../../data/exchange.ts'
import type { SettleFile } from '../../features/exchange/format.ts'
import {
  conflictKey,
  planImport,
  resolveImport,
  chooseTheirsForGoneBack,
  type Choice,
} from '../../features/exchange/merge.ts'
import {
  MAX_FILE_BYTES,
  readFile,
  type FileProblem,
} from '../../features/exchange/readFile.ts'
import { dateLocale } from '../../features/household/format.ts'
import { useHouseholdData } from '../../features/household/householdData.ts'
import { useLanguage } from '../../i18n/language.ts'
import { Button } from '../../ui/Button.tsx'
import { Card } from '../../ui/Card.tsx'
import { StorageState } from '../households/StorageState.tsx'
import { HouseholdPreview } from './HouseholdPreview.tsx'
import { problemText, type Words } from '../../features/exchange/words.ts'
import styles from './import.module.css'

type Phase =
  | { kind: 'pick' }
  | { kind: 'reading' }
  | { kind: 'refused'; problems: FileProblem[]; total: number }
  | {
      kind: 'preview'
      file: SettleFile
      fileName: string
      preview: ImportPreview
      /** Apply refused: the data changed while the user was reviewing. */
      changed?: boolean
      failed?: boolean
      applying?: boolean
    }
  | { kind: 'done'; applied: AppliedHousehold[]; wroteNothing: boolean }

/**
 * Open a Settle file (M6 plan, E7, E8): pick a file, see what it would do,
 * decide each conflict, then Apply writes everything at once. Cancel
 * writes nothing.
 */
export function ImportPage() {
  const { t, language } = useLanguage()
  const { region } = useRegion()
  const { status, db, changed } = useHouseholdData()
  const [phase, setPhase] = useState<Phase>({ kind: 'pick' })
  const [choices, setChoices] = useState<Record<string, Choice>>({})
  const inputId = useId()
  const locale = dateLocale(language, region.locale)

  const prepare = (file: SettleFile, fileName: string) => {
    if (db === null) {
      setPhase({ kind: 'pick' })
      return
    }
    prepareImport(db, file).then(
      (preview) => {
        setChoices({})
        setPhase({ kind: 'preview', file, fileName, preview })
      },
      () => {
        setPhase({ kind: 'refused', problems: [], total: 0 })
      },
    )
  }

  const pick = (event: ChangeEvent<HTMLInputElement>) => {
    const chosen = event.target.files?.[0]
    event.target.value = ''
    if (chosen === undefined) return
    // Larger files are refused before they are read (E2).
    if (chosen.size > MAX_FILE_BYTES) {
      setPhase({ kind: 'refused', problems: [{ code: 'tooLarge' }], total: 1 })
      return
    }
    setPhase({ kind: 'reading' })
    chosen.text().then(
      (text) => {
        const read = readFile(text)
        if (!read.ok) {
          setPhase({
            kind: 'refused',
            problems: read.problems,
            total: read.total,
          })
          return
        }
        prepare(read.file, chosen.name)
      },
      () => {
        setPhase({ kind: 'refused', problems: [{ code: 'notJson' }], total: 1 })
      },
    )
  }

  const plan = useMemo(
    () =>
      phase.kind === 'preview'
        ? planImport(phase.file, phase.preview.local, phase.preview.newDeviceId)
        : null,
    [phase],
  )
  const resolution = useMemo(
    () => (plan === null ? null : resolveImport(plan, choices)),
    [plan, choices],
  )

  const names = useMemo(() => {
    const map = new Map<string, string>()
    if (phase.kind !== 'preview') return map
    for (const household of phase.preview.local.households) {
      for (const member of household.members) map.set(member.id, member.name)
    }
    for (const entry of phase.file.households) {
      for (const member of entry.members) map.set(member.id, member.name)
    }
    return map
  }, [phase])
  const words: Words = {
    t,
    region,
    locale,
    nameOf: (id) => names.get(id) ?? '?',
  }

  const apply = () => {
    if (db === null || phase.kind !== 'preview') return
    setPhase({ ...phase, applying: true, changed: false, failed: false })
    applyImport(db, phase.file, phase.preview, choices).then(
      (applied) => {
        changed()
        setPhase({
          kind: 'done',
          applied,
          wroteNothing:
            resolution?.households.every((h) => h.nothingNew) === true &&
            plan?.changesDeviceId !== true,
        })
      },
      (error: unknown) => {
        setPhase({
          ...phase,
          applying: false,
          changed: error instanceof ImportChangedError,
          failed: !(error instanceof ImportChangedError),
        })
      },
    )
  }

  const chooser = (
    <Card className={styles.card}>
      <p>{t('exchange.open.intro')}</p>
      <label htmlFor={inputId} className={styles.picker}>
        <span className={styles.pickerLabel}>{t('exchange.open.file')}</span>
        <input
          id={inputId}
          type="file"
          accept=".json,application/json"
          className={styles.input}
          disabled={db === null}
          onChange={pick}
        />
      </label>
      <p className={styles.hint}>{t('exchange.open.hint')}</p>
    </Card>
  )

  return (
    <div className={styles.page}>
      <h1>{t('exchange.open.title')}</h1>
      <StorageState status={status} />

      {phase.kind === 'pick' && chooser}

      {phase.kind === 'reading' && (
        <p role="status">{t('exchange.open.reading')}</p>
      )}

      {phase.kind === 'refused' && (
        <section role="alert" className={styles.refused}>
          <h2>{t('exchange.open.cantOpen')}</h2>
          {phase.problems.length > 0 && (
            <ul>
              {phase.problems.map((problem, i) => (
                <li key={i}>{problemText(problem, words)}</li>
              ))}
            </ul>
          )}
          {phase.total > phase.problems.length && (
            <p>
              {t('exchange.open.more', {
                count: phase.total - phase.problems.length,
              })}
            </p>
          )}
          <p className={styles.hint}>{t('exchange.open.nothingWritten')}</p>
          <div>
            <Button
              variant="primary"
              icon={IconFileImport}
              onClick={() => setPhase({ kind: 'pick' })}
            >
              {t('exchange.open.another')}
            </Button>
          </div>
        </section>
      )}

      {phase.kind === 'preview' && plan !== null && resolution !== null && (
        <>
          <p className={styles.hint}>
            {t('exchange.preview.fileName', { name: phase.fileName })}
          </p>
          {plan.households.some((household) =>
            household.items.some((item) => item.cause === 'goneBack'),
          ) && (
            <section className={styles.notice}>
              <p>{t('exchange.preview.restored')}</p>
              <div>
                <Button
                  onClick={() =>
                    setChoices((current) =>
                      chooseTheirsForGoneBack(plan, current),
                    )
                  }
                >
                  {t('exchange.preview.useTheirsAll')}
                </Button>
              </div>
            </section>
          )}
          {resolution.households.map((household) => (
            <HouseholdPreview
              key={household.plan.householdId}
              resolution={household}
              choices={choices}
              words={words}
              onChoose={(id, choice) =>
                setChoices((current) => ({
                  ...current,
                  [conflictKey(household.plan.householdId, id)]: choice,
                }))
              }
            />
          ))}
          {resolution.households.every((h) => h.nothingNew) && (
            <p>{t('exchange.preview.nothingNewFile')}</p>
          )}
          {phase.file.kind === 'backup' && (
            <p className={styles.hint}>{t('exchange.data.restoreHint')}</p>
          )}
          {plan.changesDeviceId && (
            <p className={styles.hint}>{t('exchange.preview.newDevice')}</p>
          )}
          <div className={styles.footer}>
            <p aria-live="polite" className={styles.reason}>
              {phase.changed === true
                ? t('exchange.preview.changedMeanwhile')
                : phase.failed === true
                  ? t('exchange.preview.failed')
                  : resolution.undecided > 0
                    ? t('exchange.preview.undecided', {
                        count: resolution.undecided,
                      })
                    : ''}
            </p>
            <div className={styles.actions}>
              {phase.changed === true ? (
                <Button
                  variant="primary"
                  size={48}
                  onClick={() => prepare(phase.file, phase.fileName)}
                >
                  {t('exchange.preview.reviewAgain')}
                </Button>
              ) : (
                <Button
                  variant="primary"
                  size={48}
                  disabled={!resolution.canApply || phase.applying === true}
                  onClick={apply}
                >
                  {phase.applying === true
                    ? t('exchange.preview.applying')
                    : t('exchange.preview.apply')}
                </Button>
              )}
              <Button
                size={48}
                disabled={phase.applying === true}
                onClick={() => setPhase({ kind: 'pick' })}
              >
                {t('exchange.preview.cancel')}
              </Button>
            </div>
          </div>
        </>
      )}

      {phase.kind === 'done' && (
        <section role="status" className={styles.done}>
          <h2>{t('exchange.done.title')}</h2>
          {phase.wroteNothing ? (
            <p>{t('exchange.done.nothing')}</p>
          ) : (
            <ul className={styles.doneList}>
              {phase.applied.map((household) => (
                <li key={household.householdId}>
                  <span>
                    {t('exchange.done.household', {
                      name: household.name,
                      expenses: t('exchange.preview.expenses', {
                        count: household.expenses,
                      }),
                    })}
                  </span>{' '}
                  <Link to={`/households/${household.householdId}`}>
                    {t('exchange.done.open', { name: household.name })}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}
