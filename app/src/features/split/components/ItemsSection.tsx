import { IconCheck, IconPencil, IconPlus, IconUsers } from '@tabler/icons-react'
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type Dispatch,
} from 'react'
import type { Region } from '../../../app/region.ts'
import { useT } from '../../../i18n/language.ts'
import type { Translate } from '../../../i18n/t.ts'
import { formatAmount } from '../../../lib/money.ts'
import { Amount } from '../../../ui/Amount.tsx'
import { Button } from '../../../ui/Button.tsx'
import { Icon } from '../../../ui/Icon.tsx'
import { PersonBadge } from '../../../ui/PersonBadge.tsx'
import { StatusChip } from '../../../ui/StatusChip.tsx'
import { personColorStyle, personInitial } from '../../../ui/personColor.ts'
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

/** An item with nothing typed yet: its editor starts open. */
function isEmptyItem(item: Item): boolean {
  return item.name.trim() === '' && item.unitPrice === 0
}

/**
 * Who had what (M3 plan, S10): choose a person, then tap the items they
 * had. Each row toggles the chosen person (`aria-pressed`, and the change
 * is announced), "Everyone" shares an item with all, and Edit opens the
 * item's editor in place, with today's fields and per-person toggles. The
 * picker and the editor's toggles dispatch the same `toggleAssignee`, so
 * the two ways of assigning can't drift.
 */
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
  const [chosenId, setChosenId] = useState(bill.people[0]?.id)
  const chosenIndex = Math.max(
    0,
    bill.people.findIndex((person) => person.id === chosenId),
  )
  const chosen = bill.people[chosenIndex]
  // Editors start open for empty items (a fresh bill's first item, one
  // just added); the rest open with Edit.
  const [openIds, setOpenIds] = useState<ReadonlySet<string>>(
    () => new Set(bill.items.filter(isEmptyItem).map((item) => item.id)),
  )
  const [announcement, setAnnouncement] = useState('')
  const pickerName = useId()

  // "Add item" moves focus to the new row's name, once it has rendered.
  useEffect(() => {
    if (focusItemId.current !== undefined) {
      nameInputs.current.get(focusItemId.current)?.focus()
      focusItemId.current = undefined
    }
  }, [bill.items])

  const setOpen = (itemId: string, open: boolean) => {
    setOpenIds((current) => {
      const next = new Set(current)
      if (open) next.add(itemId)
      else next.delete(itemId)
      return next
    })
  }

  return (
    <section className={styles.section} aria-labelledby="split-items-heading">
      <h2 id="split-items-heading">{t('split.items.heading')}</h2>

      <fieldset className={styles.picker}>
        <legend>{t('split.items.assignTo')}</legend>
        <p className={styles.hint}>{t('split.items.assignHint')}</p>
        <div className={styles.pickerChoices}>
          {bill.people.map((person, index) => (
            <label key={person.id} className={styles.pickerChoice}>
              <input
                type="radio"
                name={pickerName}
                className={styles.pickerInput}
                checked={index === chosenIndex}
                onChange={() => {
                  setChosenId(person.id)
                }}
              />
              <PersonBadge person={person} index={index} />
            </label>
          ))}
        </div>
      </fieldset>

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
            chosenId={chosen?.id}
            chosenName={
              chosen === undefined ? '' : displayName(t, chosen, chosenIndex)
            }
            flagged={flaggedItemIds?.has(item.id) ?? false}
            highlighted={item.id === highlightedItemId}
            // An item with an error opens, so the error and its field show.
            open={
              openIds.has(item.id) ||
              errors.some(
                ({ field }) => 'itemId' in field && field.itemId === item.id,
              )
            }
            onOpenChange={(open) => {
              setOpen(item.id, open)
            }}
            onAnnounce={setAnnouncement}
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
      <p role="status" className={styles.srOnly}>
        {announcement}
      </p>
      <Button
        id={fieldId({ kind: 'items' })}
        variant="primary"
        icon={IconPlus}
        disabled={bill.items.length >= LIMITS.maxItems}
        onClick={() => {
          const id = newId()
          dispatch({ type: 'addItem', id })
          setOpen(id, true)
          focusItemId.current = id
        }}
      >
        {t('split.items.add')}
      </Button>
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
  chosenId: string | undefined
  chosenName: string
  flagged: boolean
  highlighted: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  onAnnounce: (text: string) => void
  nameRef: (element: HTMLInputElement | null) => void
}

/** Who shares an item, as one sentence for screen readers. */
function sharersText(t: Translate, bill: Bill, item: Item): string {
  const names = item.assignees.flatMap(({ personId }) => {
    const index = bill.people.findIndex((person) => person.id === personId)
    const person = bill.people[index]
    return person === undefined ? [] : [displayName(t, person, index)]
  })
  return names.length === 0
    ? t('split.items.nobody')
    : t('split.items.sharers', { people: names.join(', ') })
}

/**
 * S6: a row that gains or loses a person flashes for 200 ms, through the
 * Web Animations API, so no state is set. Reduced motion skips it.
 */
function useFlash(signature: string) {
  const ref = useRef<HTMLLIElement>(null)
  const last = useRef(signature)
  useLayoutEffect(() => {
    if (last.current === signature) return
    last.current = signature
    const element = ref.current
    const still =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (element === null || still || typeof element.animate !== 'function') {
      return
    }
    // The colours and the easing are tokens (split.module.css, tokens.css),
    // read computed: the animation API takes no var().
    const style = getComputedStyle(element)
    const token = (name: string) => style.getPropertyValue(name).trim()
    element.animate(
      [
        { backgroundColor: token('--row-flash') },
        { backgroundColor: token('--color-card') },
      ],
      { duration: 200, easing: token('--ease-out') || 'ease-out' },
    )
  }, [signature])
  return ref
}

function ItemRow({
  item,
  index,
  bill,
  dispatch,
  errors,
  region,
  chosenId,
  chosenName,
  flagged,
  highlighted,
  open,
  onOpenChange,
  onAnnounce,
  onItemEdited,
  nameRef,
}: RowProps) {
  const t = useT()
  const label = t('split.items.defaultName', { n: index + 1 })
  const name = itemName(t, item, index)
  const editorId = useId()
  const sharersId = useId()
  const at = (part: 'name' | 'quantity' | 'unitPrice' | 'assignees') =>
    ({ kind: 'item', itemId: item.id, part }) as const
  const error = (field: BillField) => fieldError(t, errors, field, bill, region)
  const assignedIds = new Set(item.assignees.map((a) => a.personId))
  const chosenHasIt = chosenId !== undefined && assignedIds.has(chosenId)
  const everyoneHasIt = bill.people.every((person) =>
    assignedIds.has(person.id),
  )
  const rowRef = useFlash([...assignedIds].sort().join(' '))
  // validateBill always range-checks both fields, so with no error on
  // either the line total is safe to compute.
  const lineIsValid = !errors.some(
    ({ field }) =>
      field.kind === 'item' &&
      field.itemId === item.id &&
      (field.part === 'quantity' || field.part === 'unitPrice'),
  )
  const toggle = (personId: string) => {
    dispatch({ type: 'toggleAssignee', itemId: item.id, personId })
  }

  return (
    <li
      ref={rowRef}
      className={styles.itemRow}
      data-highlighted={highlighted || undefined}
      aria-current={highlighted || undefined}
    >
      {flagged && (
        <p className={styles.checkMarker}>
          <span aria-hidden="true">
            <StatusChip tone="warning">{t('split.items.check')}</StatusChip>
          </span>
          <span className={styles.srOnly}>
            {t('split.items.checkLine', { item: label })}
          </span>
        </p>
      )}

      <div className={styles.itemMain}>
        <button
          type="button"
          className={styles.itemToggle}
          aria-pressed={chosenHasIt}
          aria-describedby={sharersId}
          disabled={chosenId === undefined}
          onClick={() => {
            if (chosenId === undefined) return
            toggle(chosenId)
            onAnnounce(
              t(
                chosenHasIt
                  ? 'split.items.personRemoved'
                  : 'split.items.personAdded',
                { person: chosenName, item: name },
              ),
            )
          }}
        >
          <span className={styles.itemName}>{name}</span>
          <span className={styles.itemPrice}>
            {lineIsValid ? (
              <Amount value={lineTotal(item)} region={region} />
            ) : (
              '—'
            )}
          </span>
          <span className={styles.sharers} aria-hidden="true">
            {item.assignees.map(({ personId }) => {
              const personIndex = bill.people.findIndex(
                (p) => p.id === personId,
              )
              const person = bill.people[personIndex]
              return person === undefined ? null : (
                <span
                  key={personId}
                  className={styles.sharer}
                  style={personColorStyle(personIndex)}
                >
                  {personInitial(person.name, personIndex)}
                </span>
              )
            })}
          </span>
        </button>
        <span id={sharersId} className={styles.srOnly}>
          {sharersText(t, bill, item)}
        </span>
        <div className={styles.itemActions}>
          <Button
            size={40}
            variant="quiet"
            icon={IconUsers}
            disabled={everyoneHasIt}
            onClick={() => {
              for (const person of bill.people) {
                if (!assignedIds.has(person.id)) toggle(person.id)
              }
              onAnnounce(t('split.items.everyoneAdded', { item: name }))
            }}
          >
            {t('split.items.everyone')}{' '}
            <span className={styles.srOnly}>
              {t('split.items.everyoneFor', { item: name })}
            </span>
          </Button>
          <Button
            size={40}
            icon={open ? IconCheck : IconPencil}
            aria-expanded={open}
            aria-controls={editorId}
            onClick={() => {
              onOpenChange(!open)
            }}
          >
            {open ? t('split.items.done') : t('split.items.edit')}{' '}
            <span className={styles.srOnly}>{name}</span>
          </Button>
        </div>
      </div>

      <div id={editorId} className={styles.editor} hidden={!open}>
        {open && (
          <Editor
            item={item}
            index={index}
            label={label}
            bill={bill}
            dispatch={dispatch}
            region={region}
            assignedIds={assignedIds}
            error={error}
            at={at}
            lineIsValid={lineIsValid}
            flagged={flagged}
            onItemEdited={onItemEdited}
            nameRef={nameRef}
            toggle={toggle}
          />
        )}
      </div>
    </li>
  )
}

/** Today's item editor (M1, M2), kept whole behind Edit (S10). */
function Editor({
  item,
  index,
  label,
  bill,
  dispatch,
  region,
  assignedIds,
  error,
  at,
  lineIsValid,
  flagged,
  onItemEdited,
  nameRef,
  toggle,
}: {
  item: Item
  index: number
  label: string
  bill: Bill
  dispatch: Dispatch<BillAction>
  region: Region
  assignedIds: ReadonlySet<string>
  error: (field: BillField) => string | undefined
  at: (
    part: 'name' | 'quantity' | 'unitPrice' | 'assignees',
  ) => Extract<BillField, { kind: 'item' }>
  lineIsValid: boolean
  flagged: boolean
  onItemEdited: ((itemId: string) => void) | undefined
  nameRef: (element: HTMLInputElement | null) => void
  toggle: (personId: string) => void
}) {
  const t = useT()
  return (
    <>
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
          <strong className="amount">
            {lineIsValid ? formatAmount(lineTotal(item), region) : '—'}
          </strong>
        </p>
        <Button
          size={40}
          variant="quiet"
          onClick={() => {
            dispatch({ type: 'removeItem', itemId: item.id })
          }}
        >
          {t('split.items.remove')}{' '}
          <span className={styles.srOnly}>{itemName(t, item, index)}</span>
        </Button>
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
              style={personColorStyle(personIndex)}
              aria-pressed={assignedIds.has(person.id)}
              onClick={() => {
                toggle(person.id)
              }}
            >
              {assignedIds.has(person.id) && (
                <Icon icon={IconCheck} size={16} />
              )}
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
    </>
  )
}
