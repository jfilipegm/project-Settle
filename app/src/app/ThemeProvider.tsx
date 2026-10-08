import type { ReactNode } from 'react'
import { ThemeContext, useThemeState } from './theme.ts'

/**
 * Holds the theme for the whole app, so the header toggle and Settings'
 * Theme field show and change the same mode. `useTheme` (in theme.ts, so
 * this file only exports a component) reads it.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useThemeState()
  return <ThemeContext value={theme}>{children}</ThemeContext>
}
