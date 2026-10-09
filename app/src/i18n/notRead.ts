import { LANGUAGES, catalogue } from './t.ts'

/**
 * The stand-in item "Not read from the receipt" (M3 plan, S11, L2-I1) is
 * saved into the bill as an item name, in the language of the moment, like
 * any name a person types. It stays recognised by its name, in either
 * language: an import in English read after switching to Portuguese, and
 * the other way round. A renamed stand-in is a read item, as before.
 */
const NAMES: ReadonlySet<string> = new Set(
  LANGUAGES.map((language) => catalogue(language).receipt.notReadItem),
)

export function isNotReadItemName(name: string): boolean {
  return NAMES.has(name)
}
