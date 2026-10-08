import { useT } from '../i18n/language.ts'
import { useTheme } from './theme.ts'
import styles from './ThemeToggle.module.css'

/** One button that cycles the theme mode: system → light → dark. */
export function ThemeToggle() {
  const t = useT()
  const { mode, nextMode, cycleMode } = useTheme()

  return (
    <button
      type="button"
      className={styles.toggle}
      // The name starts with the visible text, so voice control users can
      // say what they see.
      aria-label={t('theme.toggleName', {
        mode: t(`theme.mode.${mode}`),
        next: t(`theme.mode.${nextMode}`),
      })}
      onClick={cycleMode}
    >
      {t('theme.toggle', { mode: t(`theme.label.${mode}`) })}
    </button>
  )
}
