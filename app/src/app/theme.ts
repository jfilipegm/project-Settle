import { useEffect, useState } from 'react'

/**
 * `system` follows the operating system's light/dark preference through
 * CSS alone (`prefers-color-scheme` in tokens.css); `light` and `dark`
 * force a palette with `data-theme` on `<html>`.
 */
export type ThemeMode = 'system' | 'light' | 'dark'

/** public/theme-init.js reads the same key before first paint. */
export const THEME_STORAGE_KEY = 'settle.theme'

/**
 * Each palette's `theme-color`: its `--color-surface` token, the colour of
 * the header next to the browser's own UI. public/theme-init.js repeats
 * these values; tokens.test.ts and theme-init.test.ts keep them in step.
 */
export const THEME_COLORS = {
  light: '#ffffff',
  dark: '#1b1e25',
} as const

const NEXT_MODE: Record<ThemeMode, ThemeMode> = {
  system: 'light',
  light: 'dark',
  dark: 'system',
}

/** The toggle's cycle: system → light → dark → system. */
export function nextThemeMode(mode: ThemeMode): ThemeMode {
  return NEXT_MODE[mode]
}

function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'system' || value === 'light' || value === 'dark'
}

/**
 * The stored mode. A missing or unknown value, or storage that can't be
 * read at all (disabled, blocked, or throwing on access), means `system`.
 */
export function readStoredThemeMode(): ThemeMode {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
    return isThemeMode(stored) ? stored : 'system'
  } catch {
    return 'system'
  }
}

function storeThemeMode(mode: ThemeMode): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, mode)
  } catch {
    // Storage is full, disabled or blocked. The mode still applies until
    // the page is reloaded.
  }
}

/**
 * Sets `data-theme` on `<html>` (removed for `system`) and the
 * `theme-color` metas. index.html has one meta per scheme, each with a
 * `media` query, so the browser picks the system one by itself. A forced
 * mode sets both to the forced palette's colour; `system` restores each
 * to its own scheme's colour.
 */
export function applyThemeMode(mode: ThemeMode): void {
  const root = document.documentElement
  if (mode === 'system') {
    root.removeAttribute('data-theme')
  } else {
    root.setAttribute('data-theme', mode)
  }

  const metas = document.querySelectorAll<HTMLMetaElement>(
    'meta[name="theme-color"]',
  )
  for (const meta of metas) {
    meta.content = THEME_COLORS[mode === 'system' ? metaScheme(meta) : mode]
  }
}

function metaScheme(meta: HTMLMetaElement): 'light' | 'dark' {
  // getAttribute, not meta.media: that property is newer than the
  // attribute and missing from some engines (and jsdom).
  const media = meta.getAttribute('media') ?? ''
  return /prefers-color-scheme:\s*dark/.test(media) ? 'dark' : 'light'
}

export interface Theme {
  mode: ThemeMode
  /** The mode `cycleMode` switches to. */
  nextMode: ThemeMode
  /** Switches to `nextMode`, applies it and stores it. */
  cycleMode: () => void
}

export function useTheme(): Theme {
  const [mode, setMode] = useState(readStoredThemeMode)

  useEffect(() => {
    applyThemeMode(mode)
  }, [mode])

  const nextMode = nextThemeMode(mode)
  return {
    mode,
    nextMode,
    cycleMode: () => {
      storeThemeMode(nextMode)
      setMode(nextMode)
    },
  }
}
