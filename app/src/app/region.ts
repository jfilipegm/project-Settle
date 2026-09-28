import { createContext, useContext } from 'react'
import {
  DEFAULT_CURRENCY,
  DEFAULT_LOCALE,
  SUPPORTED_CURRENCIES,
  SUPPORTED_LOCALES,
  type MoneyCurrency,
  type MoneyLocale,
} from '../lib/money.ts'

/**
 * How amounts are read and shown: the locale sets the separators, the
 * currency sets the symbol. They are chosen independently, and changing the
 * currency only relabels amounts, never converts them.
 */
export interface Region {
  locale: MoneyLocale
  currency: MoneyCurrency
}

export const REGION_STORAGE_KEY = 'project-w.region'

export const DEFAULT_REGION: Region = {
  locale: DEFAULT_LOCALE,
  currency: DEFAULT_CURRENCY,
}

function isRegion(value: unknown): value is Region {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const { locale, currency } = value as Record<string, unknown>
  return (
    SUPPORTED_LOCALES.includes(locale as MoneyLocale) &&
    SUPPORTED_CURRENCIES.includes(currency as MoneyCurrency)
  )
}

/**
 * The stored region. A missing, unknown or malformed value, or storage that
 * can't be read at all (disabled, blocked, or throwing on access), means
 * the default, `pt-PT` / `EUR`.
 */
export function readStoredRegion(): Region {
  try {
    const stored = window.localStorage.getItem(REGION_STORAGE_KEY)
    if (stored === null) {
      return DEFAULT_REGION
    }
    const parsed: unknown = JSON.parse(stored)
    return isRegion(parsed)
      ? { locale: parsed.locale, currency: parsed.currency }
      : DEFAULT_REGION
  } catch {
    return DEFAULT_REGION
  }
}

export function storeRegion(region: Region): void {
  try {
    window.localStorage.setItem(REGION_STORAGE_KEY, JSON.stringify(region))
  } catch {
    // Storage is full, disabled or blocked. The region still applies until
    // the page is reloaded.
  }
}

export interface RegionContextValue {
  region: Region
  /** Applies and stores a new region. */
  setRegion: (region: Region) => void
}

export const RegionContext = createContext<RegionContextValue | null>(null)

/** The current region, from the nearest `RegionProvider`. */
export function useRegion(): RegionContextValue {
  const value = useContext(RegionContext)
  if (value === null) {
    throw new Error('useRegion must be used inside a RegionProvider')
  }
  return value
}
