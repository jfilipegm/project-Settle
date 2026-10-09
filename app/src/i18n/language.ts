import { createContext, useContext } from 'react'
import {
  LANGUAGE_LOCALES,
  translator,
  type Language,
  type Translate,
} from './t.ts'

/**
 * The Language setting (M3 plan, S11): `system` follows the browser, or a
 * language is chosen. Separate from the Region setting, which formats
 * numbers and money.
 */
export type LanguageSetting = 'system' | Language

export const LANGUAGE_STORAGE_KEY = 'settle.language'

function isLanguageSetting(value: unknown): value is LanguageSetting {
  return value === 'system' || value === 'en' || value === 'pt'
}

/**
 * The stored setting. A missing or unknown value, or storage that can't be
 * read at all, means `system`, as the theme does.
 */
export function readStoredLanguageSetting(): LanguageSetting {
  try {
    const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY)
    return isLanguageSetting(stored) ? stored : 'system'
  } catch {
    return 'system'
  }
}

export function storeLanguageSetting(setting: LanguageSetting): void {
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, setting)
  } catch {
    // Storage is full, disabled or blocked. The language still applies
    // until the page is reloaded.
  }
}

/**
 * The browser's language: the first of `languages` that starts with `pt`
 * or `en`; anything else means English. Brazilian Portuguese gets the
 * European text.
 */
export function systemLanguage(languages: readonly string[]): Language {
  for (const tag of languages) {
    const primary = tag.toLowerCase().split('-')[0]
    if (primary === 'pt') return 'pt'
    if (primary === 'en') return 'en'
  }
  return 'en'
}

function browserLanguages(): readonly string[] {
  if (typeof navigator === 'undefined') return []
  return navigator.languages.length > 0
    ? navigator.languages
    : [navigator.language]
}

/** The language a setting means on this browser. */
export function resolveLanguage(
  setting: LanguageSetting,
  languages: readonly string[] = browserLanguages(),
): Language {
  return setting === 'system' ? systemLanguage(languages) : setting
}

/** `<html lang>`: `en` or `pt-PT`. */
export function applyDocumentLanguage(language: Language): void {
  document.documentElement.lang = LANGUAGE_LOCALES[language]
}

export interface LanguageContextValue {
  /** The language in use. */
  language: Language
  /** The setting it comes from. */
  setting: LanguageSetting
  /** Applies and stores a new setting. */
  setSetting: (setting: LanguageSetting) => void
  t: Translate
}

const ENGLISH: LanguageContextValue = {
  language: 'en',
  setting: 'en',
  setSetting: () => undefined,
  t: translator('en'),
}

/**
 * English outside a `LanguageProvider`, so a component rendered on its own
 * (in a test) reads the source catalogue.
 */
export const LanguageContext = createContext<LanguageContextValue>(ENGLISH)

/** The current language and its setting. */
export function useLanguage(): LanguageContextValue {
  return useContext(LanguageContext)
}

/** The translator for the current language. */
export function useT(): Translate {
  return useContext(LanguageContext).t
}
