import { Link, type To } from 'react-router'
import styles from './Steps.module.css'

export interface Step<Id extends string = string> {
  id: Id
  label: string
  to: To
}

/** The named steps as links; the current one is `aria-current="step"`. */
export function Steps<Id extends string>({
  label,
  steps,
  current,
  onSelect,
}: {
  /** The navigation's name, read out. */
  label: string
  steps: readonly Step<Id>[]
  current: Id
  /** Called with the step chosen, before the link navigates. */
  onSelect?: (id: Id) => void
}) {
  return (
    <nav aria-label={label}>
      <ol className={styles.steps}>
        {steps.map((step) => (
          <li key={step.id}>
            <Link
              to={step.to}
              className={styles.link}
              aria-current={step.id === current ? 'step' : undefined}
              onClick={() => onSelect?.(step.id)}
            >
              {step.label}
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  )
}
