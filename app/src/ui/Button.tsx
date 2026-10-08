import type { Icon as TablerIcon } from '@tabler/icons-react'
import type { ButtonHTMLAttributes, Ref } from 'react'
import styles from './Button.module.css'
import { classes } from './classes.ts'
import { Icon } from './Icon.tsx'

export type ButtonVariant = 'primary' | 'secondary' | 'quiet'
export type ButtonSize = 40 | 44 | 48 | 52

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  /** The height in px (S12). */
  size?: ButtonSize
  /** A Tabler icon before the words. */
  icon?: TablerIcon
  ref?: Ref<HTMLButtonElement>
}

/**
 * A button (M3 plan, S12). Primary is ink, never rust: one accent per
 * screen. `type` defaults to `button`, so it never submits a form by
 * accident.
 */
export function Button({
  variant = 'secondary',
  size = 44,
  icon,
  type = 'button',
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={classes(
        styles.button,
        styles[variant],
        styles[`size${String(size)}`],
        className,
      )}
      {...rest}
    >
      {icon !== undefined && <Icon icon={icon} size={size >= 48 ? 24 : 20} />}
      {children}
    </button>
  )
}

interface IconButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'children'
> {
  /** The button's name: required, since the icon alone says nothing. */
  label: string
  icon: TablerIcon
  variant?: Exclude<ButtonVariant, 'primary'>
  size?: ButtonSize
  ref?: Ref<HTMLButtonElement>
}

/** A square button with an icon and no visible words (S12). */
export function IconButton({
  label,
  icon,
  variant = 'secondary',
  size = 44,
  type = 'button',
  className,
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      className={classes(
        styles.button,
        styles[variant],
        styles[`size${String(size)}`],
        styles.iconOnly,
        className,
      )}
      {...rest}
    >
      <Icon icon={icon} size={size >= 48 ? 24 : 20} />
    </button>
  )
}
