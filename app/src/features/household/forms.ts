/**
 * Form helpers for the household pages (M4): field errors as catalogue
 * text, from the model's rules.
 */
import type { Translate } from '../../i18n/t.ts'
import { HOUSEHOLD_LIMITS } from './model.ts'

/** A name field's error, or `undefined`: 1 to 60 characters once trimmed. */
export function nameError(t: Translate, value: string): string | undefined {
  const name = value.trim()
  if (name === '') return t('households.errors.nameRequired')
  if (name.length > HOUSEHOLD_LIMITS.maxNameLength) {
    return t('households.errors.nameTooLong')
  }
  return undefined
}
