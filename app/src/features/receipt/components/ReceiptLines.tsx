import { useId, useState, type FormEvent } from 'react'
import type { Region } from '../../../app/region.ts'
import { useT } from '../../../i18n/language.ts'
import { formatAmount, parseAmount, type Cents } from '../../../lib/money.ts'
import { LIMITS, type Bill } from '../../split/model.ts'
import { amountInputMessage } from '../../split/components/fields.ts'
import splitStyles from '../../split/components/split.module.css'
import { ROLE_KEYS, canAddAsItem, nameFromLine } from '../lineReview.ts'
import type { ReviewLine } from '../model.ts'
import styles from './receiptLines.module.css'

interface Props {
  lines: readonly ReviewLine[]
  /** The first page's image (D14), when this page holds it. */
  imageUrl?: string | undefined
  bill: Bill
  region: Region
  /** Adds a flagged item shared by everyone (the `addItems` action). */
  onAddItem: (name: string, amount: Cents) => void
  /** The bill row of the selected line, to highlight it; or none. */
  onSelectItem: (itemId: string | undefined) => void
}

/**
 * M2.5 plan, P15: "Review lines", what the reader found. The receipt image
 * with a box over each line, coloured by its role, and the same lines as a
 * list, in receipt order, each with its role, text and amount. The list is
 * the accessible form; the boxes are a visual aid. Selecting a line
 * highlights its box and its bill row. An ignored line or an item detail
 * with an amount can be added as an item, and so can a line the reader
 * missed. Nothing here is stored.
 *
 * A new import's lines start afresh: everything here (the line selected,
 * the lines added, a half-typed missed line and its errors) belongs to the
 * receipt it was read from, so the review is remounted for each new
 * `lines`.
 */
export function ReceiptLines(props: Props) {
  const [shown, setShown] = useState({ lines: props.lines, generation: 0 })
  if (shown.lines !== props.lines) {
    setShown({ lines: props.lines, generation: shown.generation + 1 })
  }
  return <LinesReview key={shown.generation} {...props} />
}

function LinesReview({
  lines,
  imageUrl,
  bill,
  region,
  onAddItem,
  onSelectItem,
}: Props) {
  const t = useT()
  const [selected, setSelected] = useState<number>()
  const [added, setAdded] = useState<ReadonlySet<number>>(new Set())
  const [size, setSize] = useState<{ width: number; height: number }>()
  const boxed = lines.some((line) => line.box?.page === 0)
  const full = bill.items.length >= LIMITS.maxItems

  const select = (index: number) => {
    const next = selected === index ? undefined : index
    setSelected(next)
    onSelectItem(next === undefined ? undefined : lines[next]?.billItemId)
  }

  return (
    <div className={styles.review}>
      {imageUrl !== undefined && boxed && (
        <div className={styles.figure}>
          <img
            src={imageUrl}
            alt={t('receipt.lines.imageAlt')}
            onLoad={(event) => {
              const image = event.currentTarget
              setSize({
                width: image.naturalWidth,
                height: image.naturalHeight,
              })
            }}
          />
          {size !== undefined && (
            <svg
              className={styles.boxes}
              viewBox={`0 0 ${size.width} ${size.height}`}
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              {lines.map((line, index) =>
                line.box?.page === 0 ? (
                  <rect
                    key={index}
                    data-role={line.role}
                    data-selected={selected === index || undefined}
                    x={line.box.x}
                    y={line.box.y}
                    width={line.box.width}
                    height={line.box.height}
                    onClick={() => {
                      select(index)
                    }}
                  />
                ) : null,
              )}
            </svg>
          )}
        </div>
      )}

      <ol className={styles.lines} aria-label={t('receipt.lines.list')}>
        {lines.map((line, index) => (
          <li
            key={index}
            className={styles.line}
            data-role={line.role}
            data-selected={selected === index || undefined}
          >
            <button
              type="button"
              className={styles.lineButton}
              aria-pressed={selected === index}
              onClick={() => {
                select(index)
              }}
            >
              <span className={styles.role}>
                <span className={styles.swatch} aria-hidden="true" />
                {t(ROLE_KEYS[line.role])}
                {line.leftOut === true &&
                  ` ${t('receipt.lines.leftOutOfBill')}`}
              </span>
              <span className={styles.text}>{line.text}</span>
              {line.amount !== undefined && (
                <span className={styles.amount}>
                  {formatAmount(line.amount, region)}
                </span>
              )}
            </button>
            {canAddAsItem(line, bill.items.length) && (
              <button
                type="button"
                className={splitStyles.secondaryButton}
                disabled={added.has(index)}
                onClick={() => {
                  if (line.amount === undefined) return
                  onAddItem(nameFromLine(line.text), line.amount)
                  setAdded(new Set([...added, index]))
                }}
              >
                {added.has(index)
                  ? t('receipt.lines.added')
                  : t('receipt.lines.addAsItem')}
                <span className={splitStyles.srOnly}>: {line.text}</span>
              </button>
            )}
          </li>
        ))}
      </ol>

      {full ? (
        <p className={splitStyles.hint}>
          {t('receipt.lines.full', { max: LIMITS.maxItems })}
        </p>
      ) : (
        <MissedLine region={region} onAdd={onAddItem} />
      )}
    </div>
  )
}

/** "Add a missed line": a name and a price, checked like the bill editor. */
function MissedLine({
  region,
  onAdd,
}: {
  region: Region
  onAdd: (name: string, amount: Cents) => void
}) {
  const t = useT()
  const id = useId()
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [errors, setErrors] = useState<{ name?: string; price?: string }>({})

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const next: { name?: string; price?: string } = {}
    if (name.trim() === '') next.name = t('receipt.lines.enterName')
    const parsed = parseAmount(price, region.locale, region.currency)
    let amount: Cents | undefined
    if (!parsed.ok) next.price = amountInputMessage(t, parsed.error, region)
    else if (parsed.value < 0)
      next.price = amountInputMessage(t, 'negative', region)
    else if (parsed.value > LIMITS.maxAmount)
      next.price = amountInputMessage(t, 'tooLarge', region)
    else amount = parsed.value
    setErrors(next)
    if (next.name !== undefined || amount === undefined) return
    onAdd(name.trim(), amount)
    setName('')
    setPrice('')
  }

  const describe = (field: 'name' | 'price') =>
    errors[field] === undefined
      ? {}
      : { 'aria-invalid': true, 'aria-describedby': `${id}-${field}-error` }

  return (
    <form className={styles.missed} onSubmit={submit} noValidate>
      <fieldset className={splitStyles.fieldset}>
        <legend>{t('receipt.lines.missed')}</legend>
        <div className={splitStyles.field}>
          <label htmlFor={`${id}-name`}>{t('receipt.lines.name')}</label>
          <input
            id={`${id}-name`}
            className={splitStyles.input}
            type="text"
            autoComplete="off"
            maxLength={LIMITS.maxNameLength}
            value={name}
            onChange={(event) => {
              setName(event.target.value)
            }}
            {...describe('name')}
          />
          {errors.name !== undefined && (
            <p id={`${id}-name-error`} className={splitStyles.fieldError}>
              {errors.name}
            </p>
          )}
        </div>
        <div className={splitStyles.field}>
          <label htmlFor={`${id}-price`}>{t('receipt.lines.price')}</label>
          <input
            id={`${id}-price`}
            className={splitStyles.input}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={price}
            onChange={(event) => {
              setPrice(event.target.value)
            }}
            {...describe('price')}
          />
          {errors.price !== undefined && (
            <p id={`${id}-price-error`} className={splitStyles.fieldError}>
              {errors.price}
            </p>
          )}
        </div>
        <button type="submit" className={splitStyles.secondaryButton}>
          {t('receipt.lines.addMissed')}
        </button>
      </fieldset>
    </form>
  )
}
