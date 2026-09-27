import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_REGION,
  readStoredRegion,
  REGION_STORAGE_KEY,
  storeRegion,
  useRegion,
} from './region.ts'

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('stored region', () => {
  it('defaults to pt-PT / EUR with nothing stored', () => {
    expect(readStoredRegion()).toEqual({ locale: 'pt-PT', currency: 'EUR' })
    expect(DEFAULT_REGION).toEqual({ locale: 'pt-PT', currency: 'EUR' })
  })

  it('round-trips a stored region', () => {
    storeRegion({ locale: 'en-GB', currency: 'GBP' })

    expect(readStoredRegion()).toEqual({ locale: 'en-GB', currency: 'GBP' })
  })

  it('keeps only the locale and currency of a stored object', () => {
    localStorage.setItem(
      REGION_STORAGE_KEY,
      JSON.stringify({ locale: 'en-US', currency: 'USD', extra: 1 }),
    )

    expect(readStoredRegion()).toEqual({ locale: 'en-US', currency: 'USD' })
  })

  it.each([
    ['an unknown locale', '{"locale":"de-DE","currency":"EUR"}'],
    ['an unknown currency', '{"locale":"pt-PT","currency":"JPY"}'],
    ['a missing currency', '{"locale":"pt-PT"}'],
    ['bad JSON', '{locale'],
    ['a JSON string', '"pt-PT"'],
    ['JSON null', 'null'],
    ['an inherited property name', '{"locale":"toString","currency":"EUR"}'],
  ])('falls back to the default for %s', (_, stored) => {
    localStorage.setItem(REGION_STORAGE_KEY, stored)

    expect(readStoredRegion()).toEqual(DEFAULT_REGION)
  })

  it('falls back to the default when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })

    expect(readStoredRegion()).toEqual(DEFAULT_REGION)
  })

  it('ignores a storage error when saving', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })

    expect(() => {
      storeRegion({ locale: 'en-GB', currency: 'GBP' })
    }).not.toThrow()
  })
})

describe('useRegion', () => {
  it('throws outside a RegionProvider', () => {
    // React logs the thrown error; keep the test output clean.
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    expect(() => renderHook(() => useRegion())).toThrow(/RegionProvider/)
  })
})
