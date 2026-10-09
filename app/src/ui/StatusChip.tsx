import {
  IconAlertCircle,
  IconAlertTriangle,
  IconCircleCheck,
  type Icon as TablerIcon,
} from '@tabler/icons-react'
import type { ReactNode } from 'react'
import styles from './StatusChip.module.css'
import { Icon } from './Icon.tsx'

export type StatusTone = 'success' | 'warning' | 'error'

const ICONS: Record<StatusTone, TablerIcon> = {
  success: IconCircleCheck,
  warning: IconAlertTriangle,
  error: IconAlertCircle,
}

/** A state in words with its icon: colour is never the only signal. */
export function StatusChip({
  tone,
  children,
}: {
  tone: StatusTone
  children: ReactNode
}) {
  return (
    <span className={`${styles.chip} ${styles[tone]}`} data-tone={tone}>
      <Icon icon={ICONS[tone]} size={16} />
      <span>{children}</span>
    </span>
  )
}
