import { THEME_COLORS } from '../app/theme.ts'

/** Adds the two theme-color metas index.html ships, in their system state. */
export function addThemeColorMetas(): void {
  for (const scheme of ['light', 'dark'] as const) {
    const meta = document.createElement('meta')
    meta.name = 'theme-color'
    meta.setAttribute('media', `(prefers-color-scheme: ${scheme})`)
    meta.content = THEME_COLORS[scheme]
    document.head.append(meta)
  }
}

/** Each theme-color meta's current content, keyed by its media scheme. */
export function themeColorMetas(): Record<'light' | 'dark', string> {
  const content = (scheme: string) =>
    document
      .querySelector(
        `meta[name="theme-color"][media="(prefers-color-scheme: ${scheme})"]`,
      )
      ?.getAttribute('content') ?? ''
  return { light: content('light'), dark: content('dark') }
}

/** Clears stored mode, data-theme and the theme-color metas. */
export function resetThemeDom(): void {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
    meta.remove()
  }
}
