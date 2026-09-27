import { useEffect, useRef, type Dispatch } from 'react'
import type { Region } from '../../../app/region.ts'
import { formatAmount } from '../../../lib/money.ts'
import { newId, type BillAction } from '../billReducer.ts'
import {
  displayName,
  isBillRatio,
  lineTotal,
  LIMITS,
  type Bill,
  type BillError,
  type BillField,
  type Item,
} from '../model.ts'
import { fieldError, fieldId, itemName } from './fields.ts'
import { AmountInput, RatioInput, Stepper, TextInput } from './inputs.tsx'
import styles from './split.module.css'

interface Props {
  bill: Bill
  dispatch: Dispatch<BillAction>
  errors: readonly BillError[]
  region: Region
}

export function ItemsSection({ bill, dispatch, errors, region }: Props) {
  const nameInputs = useRef(new Map<string, HTMLInputElement>())
  const focusItemId = useRef<string>(undefined)

  // "Add item" moves focus to the new row's name, once it has rendered.
  useEffect(() => {
    if (focusItemId.current !== undefined) {
      nameInputs.current.get(focusItemId.current)?.focus()
      focusItemId.current = undefined
    }
  }, [bill.items])

  return (
    <section className={styles.section} aria-labelledby="split-items-heading">
      <h2 id="split-items-heading">Items</h2>
      <ol className={styles.itemList}>
        {bill.items.map((item, index) => (
          <ItemRow
            key={item.id}
            item={item}
            index={index}
            bill={bill}
            dispatch={dispatch}
            errors={errors}
            region={region}
            nameRef={(element) => {
              if (element) {
                nameInputs.current.set(item.id, element)
              } else {
                nameInputs.current.delete(item.id)
              }
            }}
          />
        ))}
      </ol>
      <button
        type="button"
        id={fieldId({ kind: 'items' })}
        className={styles.primaryButton}
        disabled={bill.items.length >= LIMITS.maxItems}
        onClick={() => {
          const id = newId()
          dispatch({ type: 'addItem', id })
          focusItemId.current = id
        }}
      >
        Add item
      </button>
      {fieldError(errors, { kind: 'items' }, bill, region) && (
        <p className={styles.fieldError}>
          {fieldError(errors, { kind: 'items' }, bill, region)}
        </p>
      )}
    </section>
  )
}

interface RowProps extends Props {
  item: Item
  index: number
  nameRef: (element: HTMLInputElement | null) => void
}

function ItemRow({
  item,
  index,
  bill,
  dispatch,
  errors,
  region,
  nameRef,
}: RowProps) {
  const label = `Item ${index + 1}`
  const at = (part: 'name' | 'quantity' | 'unitPrice' | 'assignees') =>
    ({ kind: 'item', itemId: item.id, part }) as const
  const error = (field: BillField) => fieldError(errors, field, bill, region)
  const assignedIds = new Set(item.assignees.map((a) => a.personId))
  const lineIsValid =
    isBillRatio(item.quantity) && Number.isSafeInteger(item.unitPrice)

  return (
    <li className={styles.itemRow}>
      <div className={styles.itemFields}>
        <TextInput
          id={fieldId(at('name'))}
          label="Name"
          srPrefix={label}
          placeholder={label}
          maxLength={LIMITS.maxNameLength}
          value={item.name}
          error={error(at('name'))}
          inputRef={nameRef}
          onChange={(name) => {
            dispatch({ type: 'updateItem', itemId: item.id, changes: { name } })
          }}
        />
        <RatioInput
          key={`quantity-${region.locale}`}
          id={fieldId(at('quantity'))}
          kind="quantity"
          label="Quantity"
          srPrefix={label}
          value={item.quantity}
          error={error(at('quantity'))}
          onChange={(quantity) => {
            dispatch({
              type: 'updateItem',
              itemId: item.id,
              changes: { quantity },
            })
          }}
        />
        <AmountInput
          key={`price-${region.locale}-${region.currency}`}
          id={fieldId(at('unitPrice'))}
          label="Unit price"
          srPrefix={label}
          value={item.unitPrice}
          error={error(at('unitPrice'))}
          onChange={(unitPrice) => {
            dispatch({
              type: 'updateItem',
              itemId: item.id,
              changes: { unitPrice },
            })
          }}
        />
      </div>

      <div className={styles.itemFooter}>
        <p className={styles.lineTotal}>
          <span className={styles.srOnly}>{label}</span> Line total{' '}
          <strong>
            {lineIsValid ? formatAmount(lineTotal(item), region) : '—'}
          </strong>
        </p>
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={() => {
            dispatch({ type: 'removeItem', itemId: item.id })
          }}
        >
          Remove <span className={styles.srOnly}>{itemName(item, index)}</span>
        </button>
      </div>

      <fieldset className={styles.fieldset} id={fieldId(at('assignees'))}>
        <legend>
          <span className={styles.srOnly}>{label}:</span> Shared by
        </legend>
        <div className={styles.chips}>
          {bill.people.map((person, personIndex) => (
            <button
              key={person.id}
              type="button"
              className={styles.chip}
              aria-pressed={assignedIds.has(person.id)}
              onClick={() => {
                dispatch({
                  type: 'toggleAssignee',
                  itemId: item.id,
                  personId: person.id,
                })
              }}
            >
              {displayName(person, personIndex)}
            </button>
          ))}
        </div>
        {error(at('assignees')) && (
          <p className={styles.fieldError}>{error(at('assignees'))}</p>
        )}
      </fieldset>

      {item.assignees.length > 0 && (
        <details className={styles.details}>
          <summary>
            Shares{' '}
            <span className={styles.srOnly}>for {itemName(item, index)}</span>
          </summary>
          <div className={styles.shares}>
            {item.assignees.map((assignment) => {
              const personIndex = bill.people.findIndex(
                (p) => p.id === assignment.personId,
              )
              const person = bill.people[personIndex]
              const who = person
                ? displayName(person, personIndex)
                : 'Unknown person'
              const field: BillField = {
                kind: 'share',
                itemId: item.id,
                personId: assignment.personId,
              }
              return (
                <Stepper
                  key={assignment.personId}
                  id={fieldId(field)}
                  label={`${who}'s share`}
                  value={assignment.weight}
                  min={1}
                  max={LIMITS.maxShare}
                  decreaseLabel={`Decrease ${who}'s share of ${itemName(item, index)}`}
                  increaseLabel={`Increase ${who}'s share of ${itemName(item, index)}`}
                  error={error(field)}
                  onChange={(weight) => {
                    dispatch({
                      type: 'setShare',
                      itemId: item.id,
                      personId: assignment.personId,
                      weight,
                    })
                  }}
                />
              )
            })}
          </div>
        </details>
      )}
    </li>
  )
}
