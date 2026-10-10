import type { InputHTMLAttributes, ReactNode, Ref } from 'react'
import styles from './Checkbox.module.css'
import { classes } from './classes.ts'

interface CheckboxProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'children'
> {
  /** The words (or a badge) next to the box: the control's name. */
  label: ReactNode
  ref?: Ref<HTMLInputElement>
}

/** A labelled native checkbox at the kit's touch size (M4 plan, H14). */
export function Checkbox({ label, className, ...rest }: CheckboxProps) {
  return (
    <label className={classes(styles.checkbox, className)}>
      <input type="checkbox" className={styles.input} {...rest} />
      <span className={styles.label}>{label}</span>
    </label>
  )
}
