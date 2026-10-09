import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  LanguageContext,
  applyDocumentLanguage,
  readStoredLanguageSetting,
  resolveLanguage,
  storeLanguageSetting,
  type LanguageSetting,
} from './language.ts'
import { translator } from './t.ts'

/**
 * Holds the Language setting for the whole app, read once from storage,
 * and keeps `<html lang>` in step. A change re-renders without a reload.
 * `useT` and `useLanguage` (in language.ts, so this file only exports a
 * component) read it.
 */
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [setting, setSettingState] = useState(readStoredLanguageSetting)
  const language = resolveLanguage(setting)

  useEffect(() => {
    applyDocumentLanguage(language)
  }, [language])

  const value = useMemo(
    () => ({
      language,
      setting,
      setSetting: (next: LanguageSetting) => {
        storeLanguageSetting(next)
        setSettingState(next)
      },
      t: translator(language),
    }),
    [language, setting],
  )

  return <LanguageContext value={value}>{children}</LanguageContext>
}
