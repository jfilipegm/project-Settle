/**
 * Catalogue lookup (M3 plan, S11): a key, its `{name}` parameters, and
 * plurals through `Intl.PluralRules`. No translation library.
 */
import { en } from './en.ts'
import { pt } from './pt.ts'

/** The interface languages. */
export type Language = 'en' | 'pt'

export const LANGUAGES: readonly Language[] = ['en', 'pt']

/** A plural entry: chosen by the `count` parameter. */
export interface Plural {
  readonly one: string
  readonly other: string
}

/** The catalogue's shape, with English's keys and any text. */
export type CatalogueShape<T> = {
  readonly [K in keyof T]: T[K] extends string
    ? string
    : T[K] extends Plural
      ? Plural
      : CatalogueShape<T[K]>
}

export type Catalogue = CatalogueShape<typeof en>

type Leaf = string | Plural

/** Every dotted path to a text or a plural, such as `split.newBill`. */
type Paths<T> = {
  [K in keyof T & string]: T[K] extends Leaf ? K : `${K}.${Paths<T[K]>}`
}[keyof T & string]

export type MessageKey = Paths<typeof en>

export type Params = Readonly<Record<string, string | number>>

/** Translates a key in one language. */
export type Translate = (key: MessageKey, params?: Params) => string

const CATALOGUES: Record<Language, Catalogue> = { en, pt }

/** The locale `Intl.PluralRules` and `<html lang>` use for a language. */
export const LANGUAGE_LOCALES: Record<Language, string> = {
  en: 'en',
  pt: 'pt-PT',
}

function isPlural(value: unknown): value is Plural {
  return (
    typeof value === 'object' &&
    value !== null &&
    'one' in value &&
    'other' in value
  )
}

/** The text or plural at a key, or undefined for a key that isn't one. */
export function lookup(catalogue: Catalogue, key: string): Leaf | undefined {
  let node: unknown = catalogue
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined
    node = (node as Record<string, unknown>)[part]
  }
  return typeof node === 'string' || isPlural(node) ? node : undefined
}

/** `{name}` → the parameter's value; an unknown one stays as written. */
export function interpolate(text: string, params: Params = {}): string {
  return text.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in params ? String(params[name]) : whole,
  )
}

/** A translator for one language. */
export function translator(language: Language): Translate {
  const catalogue = CATALOGUES[language]
  const plurals = new Intl.PluralRules(LANGUAGE_LOCALES[language])
  return (key, params) => {
    const entry = lookup(catalogue, key)
    if (entry === undefined) return key
    if (typeof entry === 'string') return interpolate(entry, params)
    const count = Number(params?.count ?? 0)
    const form = plurals.select(count) === 'one' ? entry.one : entry.other
    return interpolate(form, params)
  }
}

/** The catalogue of a language, for tests and the parity check. */
export function catalogue(language: Language): Catalogue {
  return CATALOGUES[language]
}
