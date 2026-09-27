import type { Dispatch } from 'react'
import type { Region } from '../../../app/region.ts'
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
}

export function PeopleSection({ bill, dispatch, errors, region }: Props) {
  const error = (field: Parameters<typeof fieldError>[1]) =>
    fieldError(errors, field, bill, region)

  return (
    <section className={styles.section} aria-labelledby="split-people-heading">
      <h2 id="split-people-heading">People</h2>

      <Stepper
        id={fieldId({ kind: 'people' })}
        label="Number of people"
        value={bill.people.length}
        min={LIMITS.minPeople}
        max={LIMITS.maxPeople}
        decreaseLabel="Remove a person"
        increaseLabel="Add a person"
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
              label={`Person ${index + 1}`}
              srPrefix="Name of"
              placeholder={`Person ${index + 1}`}
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
                Remove{' '}
                <span className={styles.srOnly}>
                  {displayName(person, index)}
                </span>
              </button>
            )}
          </li>
        ))}
      </ul>

      <fieldset className={styles.fieldset} id={fieldId({ kind: 'payer' })}>
        <legend>Who paid?</legend>
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
              {displayName(person, index)}
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
