import { useT } from '../i18n/language.ts'
import { displayName, type Person } from '../features/split/model.ts'
import styles from './PersonBadge.module.css'
import { classes } from './classes.ts'
import { personColorStyle, personInitial } from './personColor.ts'

interface PersonBadgeProps {
  person: Person
  /** The person's position in the bill, which sets their colour. */
  index: number
  /** Show the name next to the disc; otherwise it is only read out. */
  showName?: boolean
  size?: 'small' | 'regular'
}

/** A person's colour and initial, with their name (S2, S12). */
export function PersonBadge({
  person,
  index,
  showName = true,
  size = 'regular',
}: PersonBadgeProps) {
  const t = useT()
  const name = displayName(t, person, index)
  return (
    <span
      className={classes(styles.badge, size === 'small' && styles.small)}
      style={personColorStyle(index)}
      data-person-slot={(index % 6) + 1}
    >
      <span className={styles.disc} aria-hidden="true">
        {personInitial(person.name, index)}
      </span>
      <span className={showName ? styles.name : styles.srOnly}>{name}</span>
    </span>
  )
}
