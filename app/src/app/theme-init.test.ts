import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import initScript from '../../public/theme-init.js?raw'
import {
  addThemeColorMetas,
  resetThemeDom,
  themeColorMetas,
} from '../test/themeDom.ts'
import {
  THEME_STORAGE_KEY,
  applyThemeMode,
  readStoredThemeMode,
} from './theme.ts'

/** Runs public/theme-init.js as the browser would: a classic script. */
function runThemeInit(): void {
  // eslint-disable-next-line @typescript-eslint/no-implied-eval -- the script under test, from this repo
  const script = new Function(initScript) as () => void
  script()
}

/** What theme.ts does with the same storage, on a fresh DOM. */
function runThemeTs(): { dataTheme: string | null; metas: object } {
  resetThemeDomKeepingStorage()
  applyThemeMode(readStoredThemeMode())
  return snapshot()
}

function resetThemeDomKeepingStorage(): void {
  document.documentElement.removeAttribute('data-theme')
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
    meta.remove()
  }
  addThemeColorMetas()
}

function snapshot() {
  return {
    dataTheme: document.documentElement.getAttribute('data-theme'),
    metas: themeColorMetas(),
  }
}

beforeEach(() => {
  addThemeColorMetas()
})

afterEach(() => {
  vi.restoreAllMocks()
  resetThemeDom()
})

describe('public/theme-init.js', () => {
  it.each([
    ['light', 'light'],
    ['dark', 'dark'],
    ['system', null],
    ['blue', null],
    [null, null],
  ])('with %j stored, sets data-theme to %j', (stored, expected) => {
    if (stored !== null) localStorage.setItem(THEME_STORAGE_KEY, stored)

    runThemeInit()

    expect(document.documentElement.getAttribute('data-theme')).toBe(expected)
  })

  it('leaves data-theme unset when getItem throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })

    expect(runThemeInit).not.toThrow()
    expect(document.documentElement).not.toHaveAttribute('data-theme')
  })

  it('leaves data-theme unset when reading localStorage itself throws', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })

    expect(runThemeInit).not.toThrow()
    expect(document.documentElement).not.toHaveAttribute('data-theme')
  })

  it.each(['light', 'dark', 'system', 'blue', ''])(
    'matches theme.ts exactly with %j stored',
    (stored) => {
      localStorage.setItem(THEME_STORAGE_KEY, stored)

      runThemeInit()
      const fromScript = snapshot()

      expect(fromScript).toEqual(runThemeTs())
    },
  )
})
