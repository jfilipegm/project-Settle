import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { THEME_COLORS, THEME_STORAGE_KEY } from './theme.ts'
import { ThemeToggle } from './ThemeToggle.tsx'
import {
  addThemeColorMetas,
  resetThemeDom,
  themeColorMetas,
} from '../test/themeDom.ts'

function toggle() {
  return screen.getByRole('button', { name: /^Theme:/ })
}

beforeEach(() => {
  addThemeColorMetas()
})

afterEach(() => {
  vi.restoreAllMocks()
  resetThemeDom()
})

describe('theme toggle', () => {
  it('starts in system mode with nothing stored', () => {
    render(<ThemeToggle />)

    expect(toggle()).toHaveAccessibleName('Theme: system. Switch to light.')
    expect(document.documentElement).not.toHaveAttribute('data-theme')
  })

  it('cycles system → light → dark → system, applying and storing each mode', () => {
    render(<ThemeToggle />)

    fireEvent.click(toggle())
    expect(document.documentElement).toHaveAttribute('data-theme', 'light')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light')

    fireEvent.click(toggle())
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')

    fireEvent.click(toggle())
    expect(document.documentElement).not.toHaveAttribute('data-theme')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('system')
  })

  it('names the current mode and the next one', () => {
    render(<ThemeToggle />)

    const names = [toggle().getAttribute('aria-label')]
    for (let i = 0; i < 3; i++) {
      fireEvent.click(toggle())
      names.push(toggle().getAttribute('aria-label'))
    }

    expect(names).toEqual([
      'Theme: system. Switch to light.',
      'Theme: light. Switch to dark.',
      'Theme: dark. Switch to system.',
      'Theme: system. Switch to light.',
    ])
  })

  it.each(['light', 'dark'] as const)('restores a stored %s mode', (mode) => {
    localStorage.setItem(THEME_STORAGE_KEY, mode)

    render(<ThemeToggle />)

    expect(toggle()).toHaveAccessibleName(
      expect.stringContaining(`Theme: ${mode}.`) as string,
    )
    expect(document.documentElement).toHaveAttribute('data-theme', mode)
  })

  it.each(['', 'Dark', 'blue', '"dark"'])(
    'treats the unknown stored value %j as system',
    (value) => {
      localStorage.setItem(THEME_STORAGE_KEY, value)

      render(<ThemeToggle />)

      expect(toggle()).toHaveAccessibleName('Theme: system. Switch to light.')
      expect(document.documentElement).not.toHaveAttribute('data-theme')
    },
  )

  it('falls back to system, and still cycles, when storage methods throw', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })

    render(<ThemeToggle />)
    expect(toggle()).toHaveAccessibleName('Theme: system. Switch to light.')

    fireEvent.click(toggle())
    expect(toggle()).toHaveAccessibleName('Theme: light. Switch to dark.')
    expect(document.documentElement).toHaveAttribute('data-theme', 'light')
  })

  it('falls back to system when reading localStorage itself throws', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })

    render(<ThemeToggle />)
    expect(toggle()).toHaveAccessibleName('Theme: system. Switch to light.')

    fireEvent.click(toggle())
    expect(document.documentElement).toHaveAttribute('data-theme', 'light')
  })
})

describe('theme-color metas', () => {
  it('sets both metas to the forced palette, and system restores each', () => {
    render(<ThemeToggle />)
    expect(themeColorMetas()).toEqual(THEME_COLORS)

    fireEvent.click(toggle())
    expect(themeColorMetas()).toEqual({
      light: THEME_COLORS.light,
      dark: THEME_COLORS.light,
    })

    fireEvent.click(toggle())
    expect(themeColorMetas()).toEqual({
      light: THEME_COLORS.dark,
      dark: THEME_COLORS.dark,
    })

    fireEvent.click(toggle())
    expect(themeColorMetas()).toEqual(THEME_COLORS)
  })
})
