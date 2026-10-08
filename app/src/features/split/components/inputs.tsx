import { useState } from 'react'
import { useRegion } from '../../../app/region.ts'
import { useT } from '../../../i18n/language.ts'
import { parseAmount, type Cents, type Ratio } from '../../../lib/money.ts'
import { LIMITS, toBillRatio } from '../model.ts'
import {
  amountInputMessage,
  amountText,
  ratioInputMessage,
  ratioText,
  type RatioInputKind,
} from './fields.ts'
import styles from './split.module.css'

interface FieldProps {
  id: string
  /** The visible label; `srPrefix` is read before it by screen readers. */
  label: string
  srPrefix?: string
  /** A validation error from the bill, shown when the text itself is fine. */
  error?: string | undefined
}

function Field({
  id,
  label,
  srPrefix,
  error,
  children,
}: FieldProps & { children: React.ReactNode }) {
  return (
    <div className={styles.field}>
      <label htmlFor={id}>
        {srPrefix && (
          <>
            <span className={styles.srOnly}>{srPrefix}</span>{' '}
          </>
        )}
        {label}
      </label>
      {children}
      {error && (
        <p id={`${id}-error`} className={styles.fieldError}>
          {error}
        </p>
      )}
    </div>
  )
}

function inputProps(id: string, error: string | undefined) {
  return {
    id,
    className: styles.input,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? `${id}-error` : undefined,
  }
}

/**
 * A money input in the current region. It keeps the typed text while it's
 * invalid and reports only valid, in-range amounts, so a typo never changes
 * the result. Empty means 0. Remount it (with a `key`) to reset its text
 * from `value`.
 */
export function AmountInput({
  value,
  onChange,
  ...field
}: FieldProps & { value: Cents; onChange: (value: Cents) => void }) {
  const { region } = useRegion()
  const t = useT()
  const [text, setText] = useState(() => amountText(value, region.locale))
  const [inputError, setInputError] = useState<string>()
  const error = inputError ?? field.error

  return (
    <Field {...field} error={error}>
      <input
        {...inputProps(field.id, error)}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        placeholder={amountText(0 as Cents, region.locale) || '0'}
        value={text}
        onChange={(event) => {
          const next = event.target.value
          setText(next)
          if (next.trim() === '') {
            setInputError(undefined)
            onChange(0 as Cents)
            return
          }
          const parsed = parseAmount(next, region.locale, region.currency)
          if (!parsed.ok) {
            setInputError(amountInputMessage(t, parsed.error, region))
          } else if (parsed.value < 0) {
            setInputError(amountInputMessage(t, 'negative', region))
          } else if (parsed.value > LIMITS.maxAmount) {
            setInputError(amountInputMessage(t, 'tooLarge', region))
          } else {
            setInputError(undefined)
            onChange(parsed.value)
          }
        }}
      />
    </Field>
  )
}

/**
 * A quantity or percentage input: like {@link AmountInput}, through
 * `toBillRatio`, so `1,0000` is fine and a 4th decimal place isn't. An
 * empty percentage means 0; an empty quantity is an error.
 */
export function RatioInput({
  kind,
  value,
  onChange,
  ...field
}: FieldProps & {
  kind: RatioInputKind
  value: Ratio
  onChange: (value: Ratio) => void
}) {
  const { region } = useRegion()
  const t = useT()
  const [text, setText] = useState(() =>
    kind === 'percent' && value.numerator === 0
      ? ''
      : ratioText(value, region.locale),
  )
  const [inputError, setInputError] = useState<string>()
  const error = inputError ?? field.error

  return (
    <Field {...field} error={error}>
      <input
        {...inputProps(field.id, error)}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        placeholder={kind === 'percent' ? '0' : '1'}
        value={text}
        onChange={(event) => {
          const next = event.target.value
          setText(next)
          if (kind === 'percent' && next.trim() === '') {
            setInputError(undefined)
            onChange({ numerator: 0, denominator: 1 })
            return
          }
          const parsed = toBillRatio(next)
          if (!parsed.ok) {
            setInputError(ratioInputMessage(t, kind, parsed.error))
            return
          }
          const { numerator, denominator } = parsed.ratio
          const max =
            kind === 'quantity' ? LIMITS.maxQuantity : LIMITS.maxPercent
          if (
            (kind === 'quantity' && numerator === 0) ||
            numerator > max * denominator
          ) {
            setInputError(ratioInputMessage(t, kind, 'range'))
            return
          }
          setInputError(undefined)
          onChange(parsed.ratio)
        }}
      />
    </Field>
  )
}

export function TextInput({
  value,
  onChange,
  placeholder,
  maxLength,
  inputRef,
  ...field
}: FieldProps & {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  maxLength?: number
  inputRef?: React.Ref<HTMLInputElement>
}) {
  return (
    <Field {...field}>
      <input
        {...inputProps(field.id, field.error)}
        ref={inputRef}
        type="text"
        autoComplete="off"
        placeholder={placeholder}
        maxLength={maxLength}
        value={value}
        onChange={(event) => {
          onChange(event.target.value)
        }}
      />
    </Field>
  )
}

/** A whole-number stepper: − value +, clamped to `min`–`max`. */
export function Stepper({
  id,
  label,
  value,
  min,
  max,
  onChange,
  decreaseLabel,
  increaseLabel,
  format = String,
  error,
}: {
  id: string
  label: string
  value: number
  min: number
  max: number
  onChange: (value: number) => void
  decreaseLabel: string
  increaseLabel: string
  format?: (value: number) => string
  error?: string | undefined
}) {
  // A stored value outside the range (from a saved draft) steps back in.
  const whole = Number.isFinite(value) ? Math.trunc(value) : min
  const clamp = (next: number) => Math.min(max, Math.max(min, next))
  return (
    <div
      className={styles.stepperGroup}
      role="group"
      aria-labelledby={`${id}-label`}
    >
      <span id={`${id}-label`} className={styles.stepperLabel}>
        {label}
      </span>
      <div className={styles.stepper}>
        <button
          type="button"
          className={styles.stepperButton}
          aria-label={decreaseLabel}
          disabled={whole === min}
          onClick={() => {
            onChange(clamp(whole - 1))
          }}
        >
          −
        </button>
        <output id={id} className={styles.stepperValue} aria-live="polite">
          {format(value)}
        </output>
        <button
          type="button"
          className={styles.stepperButton}
          aria-label={increaseLabel}
          disabled={whole === max}
          onClick={() => {
            onChange(clamp(whole + 1))
          }}
        >
          +
        </button>
      </div>
      {error && (
        <p id={`${id}-error`} className={styles.fieldError}>
          {error}
        </p>
      )}
    </div>
  )
}
