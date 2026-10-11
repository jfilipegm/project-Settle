import { useId } from 'react'
import type {
  Choice,
  HouseholdResolution,
  PlanItem,
} from '../../features/exchange/merge.ts'
import { conflictKey } from '../../features/exchange/merge.ts'
import {
  changeLines,
  countsLine,
  describeSide,
  differingFields,
  differsLine,
  recordWords,
  type Words,
} from '../../features/exchange/words.ts'
import { formatDate } from '../../features/household/format.ts'
import type {
  Expense,
  Household,
  Member,
  Settlement,
} from '../../features/household/model.ts'
import { Card } from '../../ui/Card.tsx'
import styles from './import.module.css'

type AnyRecord = Household | Member | Expense | Settlement

function sideRecord(item: PlanItem): AnyRecord | null {
  if (item.mine.type === 'record') return item.mine.record
  if (item.theirs.type === 'record') return item.theirs.record
  return null
}

/** A record named for a line: "the expense “Groceries” on 3 Oct". */
function named(item: PlanItem, words: Words): string {
  const record = sideRecord(item)
  if (record === null) return words.t('exchange.record.unnamed')
  const ref = {
    kind: item.kind,
    id: item.id,
    label:
      item.kind === 'expense'
        ? (record as Expense).description
        : 'name' in record
          ? record.name
          : undefined,
    date:
      item.kind === 'expense' || item.kind === 'settlement'
        ? (record as Expense | Settlement).date
        : undefined,
  }
  return recordWords(ref, words)
}

function Conflict({
  householdId,
  item,
  choice,
  words,
  onChoose,
}: {
  householdId: string
  item: PlanItem
  choice: Choice | undefined
  words: Words
  onChoose: (id: string, choice: Choice) => void
}) {
  const { t } = words
  const name = `${conflictKey(householdId, item.id)}`
  const legendId = useId()
  const both = item.mine.type === 'record' && item.theirs.type === 'record'
  return (
    <fieldset className={styles.conflict} aria-labelledby={legendId}>
      <legend id={legendId} className={styles.legend}>
        {both
          ? t('exchange.preview.changedOnBoth')
          : t('exchange.preview.deletedOnOne')}
        {': '}
        {named(item, words)}
      </legend>
      <div className={styles.sides}>
        <p className={styles.side}>
          <span className={styles.sideLabel}>
            {t('exchange.preview.thisPhone')}
          </span>
          <span>{describeSide(item.kind, item.mine, words)}</span>
        </p>
        <p className={`${styles.side} ${styles.theirs}`}>
          <span className={styles.sideLabel}>
            {t('exchange.preview.theFile')}
          </span>
          <span>{describeSide(item.kind, item.theirs, words)}</span>
        </p>
      </div>
      {item.mine.type === 'record' && item.theirs.type === 'record' && (
        <p className={styles.hint}>
          {differsLine(
            differingFields(item.kind, item.mine.record, item.theirs.record),
            t,
          )}
        </p>
      )}
      {item.cause === 'equal' && (
        <p className={styles.hint}>{t('exchange.preview.sameHistory')}</p>
      )}
      <div className={styles.choices}>
        {(['mine', 'theirs'] as const).map((option) => (
          <label key={option} className={styles.choice}>
            <input
              type="radio"
              name={name}
              checked={choice === option}
              onChange={() => onChoose(item.id, option)}
            />
            {option === 'mine'
              ? t('exchange.preview.keepMine')
              : t('exchange.preview.useTheirs')}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

/**
 * One household of the file in the preview (M6 plan, E8): new on this
 * device, or a merge with its counts, the kept and left-out records, each
 * conflict as a pair with a choice, the limit check, and the changes.
 */
export function HouseholdPreview({
  resolution,
  choices,
  words,
  onChoose,
}: {
  resolution: HouseholdResolution
  choices: Readonly<Record<string, Choice>>
  words: Words
  onChoose: (id: string, choice: Choice) => void
}) {
  const { t } = words
  const { plan, counts } = resolution
  const name = plan.household.name

  if (plan.leftOutWhole !== undefined) {
    return (
      <Card title={name} className={styles.card}>
        <p>
          {plan.leftOutWhole === 'unreadable'
            ? t('exchange.preview.leftOutWhole')
            : t('exchange.preview.leftOutWholeForeign')}
        </p>
      </Card>
    )
  }

  const nameOfMember = (id: string) => words.nameOf(id)
  const conflicts = plan.items.filter(
    (item) => item.classification === 'conflict',
  )
  const leftOut = plan.items.filter((item) =>
    item.classification.startsWith('leftOut'),
  )
  const changes = changeLines(resolution, words)

  return (
    <Card title={name} className={styles.card}>
      {plan.isNew ? (
        <p>
          {t('exchange.preview.newHousehold', { name })}{' '}
          {t('exchange.preview.newCounts', {
            members: t('exchange.preview.people', { count: counts.members }),
            expenses: t('exchange.preview.expenses', {
              count: counts.expenses,
            }),
            payments: t('exchange.preview.payments', {
              count: counts.settlements,
            }),
          })}
        </p>
      ) : (
        <p>
          {countsLine(counts, t) ??
            (conflicts.length === 0 ? t('exchange.preview.nothingNew') : '')}
        </p>
      )}

      {resolution.keptForReferences.map((kept) => (
        <p key={kept.memberId} className={styles.hint}>
          {kept.overridesChoice
            ? t('exchange.preview.keptOverride', {
                name: kept.name,
                count: kept.namedBy,
              })
            : kept.from === 'theirs'
              ? t('exchange.preview.keptFromFile', {
                  name: kept.name,
                  count: kept.namedBy,
                })
              : t('exchange.preview.kept', {
                  name: kept.name,
                  count: kept.namedBy,
                })}
        </p>
      ))}
      {resolution.keptUnreadable.map((kept) => (
        <p key={kept.memberId} className={styles.hint}>
          {t('exchange.preview.keptUnreadable', { name: kept.name })}
        </p>
      ))}
      {leftOut.map((item) => (
        <p key={item.id} className={styles.hint}>
          {item.classification === 'leftOutUnreadable'
            ? t('exchange.preview.keptRecord', { record: named(item, words) })
            : item.classification === 'leftOutForeign'
              ? t('exchange.preview.foreignRecord', {
                  record: named(item, words),
                })
              : t('exchange.preview.notAdded', {
                  record: named(item, words),
                  name: nameOfMember(item.namesId ?? ''),
                })}
        </p>
      ))}

      {conflicts.length > 0 && (
        <div className={styles.conflicts}>
          <h3>
            {t('exchange.preview.conflicts', { count: conflicts.length })}
          </h3>
          {conflicts.map((item) => (
            <Conflict
              key={item.id}
              householdId={plan.householdId}
              item={item}
              choice={choices[conflictKey(plan.householdId, item.id)]}
              words={words}
              onChoose={onChoose}
            />
          ))}
        </div>
      )}

      {resolution.limit !== null && (
        <p role="alert" className={styles.limit}>
          {resolution.limit.kind === 'tooManyActive'
            ? t('exchange.preview.tooManyActive', {
                date: formatDate(resolution.limit.date, words.locale),
              })
            : t('exchange.preview.tooManyMembers')}
        </p>
      )}

      {changes.length > 0 && (
        <details className={styles.changes}>
          <summary>
            {t('exchange.preview.showChanges', { count: changes.length })}
          </summary>
          <ul>
            {changes.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  )
}
