import { IconAlertCircle } from '@tabler/icons-react'
import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type Ref,
  type SelectHTMLAttributes,
} from 'react'
import styles from './Field.module.css'
import { Icon } from './Icon.tsx'
import { classes } from './classes.ts'

interface FieldFrameProps {
  label: ReactNode
  hint?: ReactNode | undefined
  error?: string | undefined
  id?: string | undefined
  className?: string | undefined
}

/** The ids and attributes a field's control needs. */
function useField({ id, hint, error }: FieldFrameProps) {
  const generated = useId()
  const controlId = id ?? generated
  const hintId = hint === undefined ? undefined : `${controlId}-hint`
  const errorId = error === undefined ? undefined : `${controlId}-error`
  const describedBy = [hintId, errorId].filter(Boolean).join(' ')
  return {
    controlId,
    hintId,
    errorId,
    controlProps: {
      id: controlId,
      'aria-invalid': error === undefined ? undefined : true,
      'aria-describedby': describedBy === '' ? undefined : describedBy,
    },
  }
}

function FieldFrame({
  label,
  hint,
  error,
  className,
  controlId,
  hintId,
  errorId,
  children,
}: FieldFrameProps & {
  controlId: string
  hintId: string | undefined
  errorId: string | undefined
  children: ReactNode
}) {
  return (
    <div className={classes(styles.field, className)}>
      <label className={styles.label} htmlFor={controlId}>
        {label}
      </label>
      {children}
      {hint !== undefined && (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      )}
      {error !== undefined && (
        <p id={errorId} className={styles.error}>
          <Icon icon={IconAlertCircle} size={16} />
          <span>{error}</span>
        </p>
      )}
    </div>
  )
}

type TextFieldProps = FieldFrameProps &
  Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'className'> & {
    ref?: Ref<HTMLInputElement>
  }

/** A text input with its label above, and a hint and an error below. */
export function TextField({
  label,
  hint,
  error,
  id,
  className,
  type = 'text',
  ...rest
}: TextFieldProps) {
  const field = useField({ label, hint, error, id })
  return (
    <FieldFrame
      label={label}
      hint={hint}
      error={error}
      className={className}
      {...field}
    >
      <input
        type={type}
        className={styles.control}
        {...rest}
        {...field.controlProps}
      />
    </FieldFrame>
  )
}

type SelectFieldProps = FieldFrameProps &
  Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id' | 'className'> & {
    ref?: Ref<HTMLSelectElement>
  }

/** A select with its label above, and a hint and an error below. */
export function SelectField({
  label,
  hint,
  error,
  id,
  className,
  children,
  ...rest
}: SelectFieldProps) {
  const field = useField({ label, hint, error, id })
  return (
    <FieldFrame
      label={label}
      hint={hint}
      error={error}
      className={className}
      {...field}
    >
      <select className={styles.control} {...rest} {...field.controlProps}>
        {children}
      </select>
    </FieldFrame>
  )
}
