// @vitest-environment node
/** The catalogues (M3 plan, S11): parity, parameters, plurals, lookup. */
import { describe, expect, it } from 'vitest'
import {
  catalogue,
  interpolate,
  lookup,
  translator,
  type Catalogue,
  type Plural,
} from './t.ts'

type Entry = [key: string, value: string | Plural]

/** Every text and plural in a catalogue, by dotted key. */
function entries(node: unknown, prefix = ''): Entry[] {
  return Object.entries(node as Record<string, unknown>).flatMap(
    ([key, value]): Entry[] => {
      const path = prefix === '' ? key : `${prefix}.${key}`
      if (typeof value === 'string') return [[path, value]]
      const record = value as Record<string, unknown>
      if (typeof record.one === 'string' && typeof record.other === 'string') {
        return [[path, value as Plural]]
      }
      return entries(value, path)
    },
  )
}

/** The `{name}` parameters a text or plural uses. */
function params(value: string | Plural): string[] {
  const texts = typeof value === 'string' ? [value] : [value.one, value.other]
  return [...new Set(texts.flatMap((text) => [...text.matchAll(/\{(\w+)\}/g)]))]
    .map((match) => match[1] ?? '')
    .filter((name, index, all) => all.indexOf(name) === index)
    .sort()
}

const en = new Map(entries(catalogue('en')))
const pt = new Map(entries(catalogue('pt')))

/**
 * Texts that are the same in both languages, each for a reason: names of
 * languages and products, codes, and pure formats.
 */
const SAME_IN_BOTH = new Map([
  ['settings.language.option.en', 'a language’s own name'],
  ['settings.language.option.pt', 'a language’s own name'],
  ['settings.region.currencyName.EUR', 'the currency’s name is the same'],
  ['receipt.check.taxId', 'NIF is the Portuguese tax number'],
  ['split.copyText.person', 'a format: name and amount'],
  ['split.adjustments.tip.hint', 'empty: the tip has no hint'],
])

describe('the catalogues', () => {
  it('have the same keys, plurals in the same places', () => {
    expect([...pt.keys()].sort()).toEqual([...en.keys()].sort())
    for (const [key, value] of en) {
      expect(typeof pt.get(key), key).toBe(typeof value)
    }
  })

  it('use the same parameters for every key', () => {
    for (const [key, value] of en) {
      const other = pt.get(key)
      expect(other, key).toBeDefined()
      if (other !== undefined) {
        expect(params(other), key).toEqual(params(value))
      }
    }
  })

  it('give every plural a count', () => {
    for (const [key, value] of en) {
      if (typeof value !== 'string') {
        expect(params(value), key).toContain('count')
      }
    }
  })

  it('translate every text into Portuguese, apart from the named exceptions', () => {
    const untranslated = [...en]
      .filter(([key, value]) => {
        const other = pt.get(key)
        return JSON.stringify(other) === JSON.stringify(value)
      })
      .map(([key]) => key)
    expect(untranslated.sort()).toEqual([...SAME_IN_BOTH.keys()].sort())
  })

  it('use no em dash in the interface copy (S7)', () => {
    for (const [language, map] of [
      ['en', en],
      ['pt', pt],
    ] as const) {
      for (const [key, value] of map) {
        expect(JSON.stringify(value), `${language} ${key}`).not.toContain('—')
      }
    }
  })
})

describe('translator', () => {
  const t = translator('en')
  const tPt = translator('pt')

  it('interpolates parameters', () => {
    expect(t('split.people.defaultName', { n: 3 })).toBe('Person 3')
    expect(tPt('split.people.defaultName', { n: 3 })).toBe('Pessoa 3')
  })

  it('keeps an unknown parameter as written', () => {
    expect(interpolate('{a} and {b}', { a: 1 })).toBe('1 and {b}')
  })

  it.each([
    ['en', 1, '1 line was left out'],
    ['en', 2, '2 lines were left out'],
    ['en', 0, '0 lines were left out'],
    ['pt', 1, '1 linha ficou de fora'],
    ['pt', 2, '2 linhas ficaram de fora'],
    // pt-PT, unlike Brazilian Portuguese, puts 0 in "other".
    ['pt', 0, '0 linhas ficaram de fora'],
  ] as const)('chooses the %s plural for %i', (language, count, start) => {
    expect(translator(language)('receipt.notice.leftOut', { count })).toMatch(
      new RegExp(`^${start}`),
    )
  })

  it('finds texts and plurals, and nothing at a branch', () => {
    const en: Catalogue = catalogue('en')
    expect(lookup(en, 'split.newBill')).toBe('New bill')
    expect(lookup(en, 'receipt.notice.leftOut')).toHaveProperty('one')
    expect(lookup(en, 'split')).toBeUndefined()
    expect(lookup(en, 'split.nothing.here')).toBeUndefined()
  })
})
