import { useId, type HTMLAttributes, type ReactNode } from 'react'
import styles from './Card.module.css'
import { classes } from './classes.ts'

interface CardProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  /** A title makes the card a labelled section, with an `h2`. */
  title?: ReactNode
  children: ReactNode
}

/** A flat card on the page ground (S6). */
export function Card({ title, className, children, ...rest }: CardProps) {
  const titleId = useId()
  if (title === undefined) {
    return (
      <div className={classes(styles.card, className)} {...rest}>
        {children}
      </div>
    )
  }
  return (
    <section
      className={classes(styles.card, className)}
      aria-labelledby={titleId}
      {...rest}
    >
      <h2 id={titleId} className={styles.title}>
        {title}
      </h2>
      {children}
    </section>
  )
}
