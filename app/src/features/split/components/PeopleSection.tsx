import type { Dispatch, Ref } from 'react'
import type { Region } from '../../../app/region.ts'
import { useT } from '../../../i18n/language.ts'
import { newId, type BillAction } from '../billReducer.ts'
import { displayName, LIMITS, type Bill, type BillError } from '../model.ts'
import { fieldError, fieldId } from './fields.ts'
import { Stepper, TextInput } from './inputs.tsx'
import styles from './split.module.css'

interface Props {
  bill: Bill
  dispatch: Dispatch<BillAction>
  errors: readonly BillError[]
  region: Region
  /** Who had what's first heading: the step's focus target (S9). */
  headingRef?: Ref<HTMLHeadingElement>
}

export function PeopleSection({
  bill,
  dispatch,
  errors,
  region,
  headingRef,
}: Props) {
  const t = useT()
  const error = (field: Parameters<typeof fieldError>[2]) =>
    fieldError(t, errors, field, bill, region)

  return (
    <section className={styles.section} aria-labelledby="split-people-heading">
      <h2 id="split-people-heading" tabIndex={-1} ref={headingRef}>
        {t('split.people.heading')}
      </h2>

      <Stepper
        id={fieldId({ kind: 'people' })}
        label={t('split.people.count')}
        value={bill.people.length}
        min={LIMITS.minPeople}
        max={LIMITS.maxPeople}
        decreaseLabel={t('split.people.remove')}
        increaseLabel={t('split.people.add')}
        error={error({ kind: 'people' })}
        onChange={(count) => {
          dispatch({
            type: 'setPeopleCount',
            count,
            ids: Array.from(
              { length: Math.max(0, count - bill.people.length) },
              newId,
            ),
          })
        }}
      />

      <ul className={styles.peopleList}>
        {bill.people.map((person, index) => (
          <li key={person.id} className={styles.personRow}>
            <TextInput
              id={fieldId({ kind: 'person', personId: person.id })}
              label={t('split.people.defaultName', { n: index + 1 })}
              srPrefix={t('split.people.nameOf')}
              placeholder={t('split.people.defaultName', { n: index + 1 })}
              maxLength={LIMITS.maxNameLength}
              value={person.name}
              error={error({ kind: 'person', personId: person.id })}
              onChange={(name) => {
                dispatch({ type: 'renamePerson', personId: person.id, name })
              }}
            />
            {bill.people.length > LIMITS.minPeople && (
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => {
                  dispatch({ type: 'removePerson', personId: person.id })
                }}
              >
                {t('split.people.removeButton')}{' '}
                <span className={styles.srOnly}>
                  {displayName(t, person, index)}
                </span>
              </button>
            )}
          </li>
        ))}
      </ul>

      <fieldset className={styles.fieldset} id={fieldId({ kind: 'payer' })}>
        <legend>{t('split.people.whoPaid')}</legend>
        <div className={styles.choices}>
          {bill.people.map((person, index) => (
            <label key={person.id} className={styles.choice}>
              <input
                type="radio"
                name="split-payer"
                checked={bill.payerId === person.id}
                onChange={() => {
                  dispatch({ type: 'setPayer', personId: person.id })
                }}
              />
              {displayName(t, person, index)}
            </label>
          ))}
        </div>
        {error({ kind: 'payer' }) && (
          <p className={styles.fieldError}>{error({ kind: 'payer' })}</p>
        )}
      </fieldset>
    </section>
  )
}
