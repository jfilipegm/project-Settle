import { useEffect, useRef, type Dispatch } from 'react'
import type { Region } from '../../../app/region.ts'
import { useT } from '../../../i18n/language.ts'
import { formatAmount } from '../../../lib/money.ts'
import { newId, type BillAction } from '../billReducer.ts'
import {
  displayName,
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
  /** Items read from a receipt that need checking (M2, D14). */
  flaggedItemIds?: ReadonlySet<string>
  /** Any edit to an item's name, quantity or unit price. */
  onItemEdited?: (itemId: string) => void
  /** The item of the line selected in the receipt review (M2.5, P15). */
  highlightedItemId?: string | undefined
}

export function ItemsSection({
  bill,
  dispatch,
  errors,
  region,
  flaggedItemIds,
  onItemEdited,
  highlightedItemId,
}: Props) {
  const t = useT()
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
      <h2 id="split-items-heading">{t('split.items.heading')}</h2>
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
            flagged={flaggedItemIds?.has(item.id) ?? false}
            highlighted={item.id === highlightedItemId}
            onItemEdited={onItemEdited}
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
        {t('split.items.add')}
      </button>
      {fieldError(t, errors, { kind: 'items' }, bill, region) && (
        <p className={styles.fieldError}>
          {fieldError(t, errors, { kind: 'items' }, bill, region)}
        </p>
      )}
    </section>
  )
}

interface RowProps extends Omit<Props, 'flaggedItemIds' | 'highlightedItemId'> {
  item: Item
  index: number
  flagged: boolean
  highlighted: boolean
  nameRef: (element: HTMLInputElement | null) => void
}

function ItemRow({
  item,
  index,
  bill,
  dispatch,
  errors,
  region,
  flagged,
  highlighted,
  onItemEdited,
  nameRef,
}: RowProps) {
  const t = useT()
  const label = t('split.items.defaultName', { n: index + 1 })
  const at = (part: 'name' | 'quantity' | 'unitPrice' | 'assignees') =>
    ({ kind: 'item', itemId: item.id, part }) as const
  const error = (field: BillField) => fieldError(t, errors, field, bill, region)
  const assignedIds = new Set(item.assignees.map((a) => a.personId))
  // validateBill always range-checks both fields, so with no error on
  // either the line total is safe to compute.
  const lineIsValid = !errors.some(
    ({ field }) =>
      field.kind === 'item' &&
      field.itemId === item.id &&
      (field.part === 'quantity' || field.part === 'unitPrice'),
  )

  return (
    <li
      className={styles.itemRow}
      data-highlighted={highlighted || undefined}
      aria-current={highlighted || undefined}
    >
      {flagged && (
        <p className={styles.checkMarker}>
          <span aria-hidden="true">⚠ {t('split.items.check')}</span>
          <span className={styles.srOnly}>
            {t('split.items.checkLine', { item: label })}
          </span>
        </p>
      )}
      {/* The first edit to one of these fields clears the marker (D14). */}
      <div
        className={styles.itemFields}
        onChange={() => {
          if (flagged) onItemEdited?.(item.id)
        }}
      >
        <TextInput
          id={fieldId(at('name'))}
          label={t('split.items.name')}
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
          label={t('split.items.quantity')}
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
          label={t('split.items.unitPrice')}
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
          <span className={styles.srOnly}>{label}</span>{' '}
          {t('split.items.lineTotal')}{' '}
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
          {t('split.items.remove')}{' '}
          <span className={styles.srOnly}>{itemName(t, item, index)}</span>
        </button>
      </div>

      <fieldset className={styles.fieldset} id={fieldId(at('assignees'))}>
        <legend>
          <span className={styles.srOnly}>{label}:</span>{' '}
          {t('split.items.sharedBy')}
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
              {displayName(t, person, personIndex)}
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
            {t('split.items.shares')}{' '}
            <span className={styles.srOnly}>
              {t('split.items.sharesFor', { item: itemName(t, item, index) })}
            </span>
          </summary>
          <div className={styles.shares}>
            {item.assignees.map((assignment) => {
              const personIndex = bill.people.findIndex(
                (p) => p.id === assignment.personId,
              )
              const person = bill.people[personIndex]
              const who = person
                ? displayName(t, person, personIndex)
                : t('split.items.unknownPerson')
              const what = itemName(t, item, index)
              const field: BillField = {
                kind: 'share',
                itemId: item.id,
                personId: assignment.personId,
              }
              return (
                <Stepper
                  key={assignment.personId}
                  id={fieldId(field)}
                  label={t('split.items.shareOf', { person: who })}
                  value={assignment.weight}
                  min={1}
                  max={LIMITS.maxShare}
                  decreaseLabel={t('split.items.decreaseShare', {
                    person: who,
                    item: what,
                  })}
                  increaseLabel={t('split.items.increaseShare', {
                    person: who,
                    item: what,
                  })}
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
