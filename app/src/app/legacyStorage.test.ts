import { afterEach, describe, expect, it, vi } from 'vitest'
import { DRAFT_STORAGE_KEY } from '../features/split/draft.ts'
import { LEGACY_STORAGE_KEYS, migrateLegacyStorage } from './legacyStorage.ts'
import { REGION_STORAGE_KEY } from './region.ts'
import { THEME_STORAGE_KEY } from './theme.ts'

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('migrateLegacyStorage', () => {
  it('maps each project-W key to its Settle key', () => {
    expect(LEGACY_STORAGE_KEYS).toEqual([
      ['project-w.theme', THEME_STORAGE_KEY],
      ['project-w.region', REGION_STORAGE_KEY],
      ['project-w.bill', DRAFT_STORAGE_KEY],
    ])
    expect([THEME_STORAGE_KEY, REGION_STORAGE_KEY, DRAFT_STORAGE_KEY]).toEqual([
      'settle.theme',
      'settle.region',
      'settle.bill',
    ])
  })

  it('moves every legacy value to its new key and removes the old one', () => {
    localStorage.setItem('project-w.theme', 'dark')
    localStorage.setItem('project-w.region', '{"locale":"en-GB"}')
    localStorage.setItem('project-w.bill', '{"version":1}')

    migrateLegacyStorage()

    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
    expect(localStorage.getItem(REGION_STORAGE_KEY)).toBe('{"locale":"en-GB"}')
    expect(localStorage.getItem(DRAFT_STORAGE_KEY)).toBe('{"version":1}')
    for (const [legacyKey] of LEGACY_STORAGE_KEYS) {
      expect(localStorage.getItem(legacyKey)).toBeNull()
    }
  })

  it('keeps a value already under the new key', () => {
    localStorage.setItem('project-w.theme', 'dark')
    localStorage.setItem(THEME_STORAGE_KEY, 'light')

    migrateLegacyStorage()

    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light')
    expect(localStorage.getItem('project-w.theme')).toBeNull()
  })

  it('does nothing without legacy values, and is safe to run twice', () => {
    localStorage.setItem(REGION_STORAGE_KEY, 'kept')

    migrateLegacyStorage()
    migrateLegacyStorage()

    expect(localStorage.length).toBe(1)
    expect(localStorage.getItem(REGION_STORAGE_KEY)).toBe('kept')
  })

  it('does not throw when storage is blocked', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })

    expect(migrateLegacyStorage).not.toThrow()
  })
})
