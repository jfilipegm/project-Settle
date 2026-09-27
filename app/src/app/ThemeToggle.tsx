import { useTheme, type ThemeMode } from './theme.ts'
import styles from './ThemeToggle.module.css'

const LABELS: Record<ThemeMode, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
}

/** One button that cycles the theme mode: system → light → dark. */
export function ThemeToggle() {
  const { mode, nextMode, cycleMode } = useTheme()

  return (
    <button
      type="button"
      className={styles.toggle}
      // The name starts with the visible text, so voice control users can
      // say what they see.
      aria-label={`Theme: ${mode}. Switch to ${nextMode}.`}
      onClick={cycleMode}
    >
      Theme: {LABELS[mode]}
    </button>
  )
}
