/** The Language setting (M3 plan, S11): storage, System, `<html lang>`. */
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SettingsPage } from '../pages/SettingsPage.tsx'
import { RegionProvider } from '../app/RegionProvider.tsx'
import {
  LANGUAGE_STORAGE_KEY,
  readStoredLanguageSetting,
  resolveLanguage,
  systemLanguage,
  useT,
} from './language.ts'
import { LanguageProvider } from './LanguageProvider.tsx'

afterEach(() => {
  vi.restoreAllMocks()
  document.documentElement.lang = 'en'
})

describe('systemLanguage', () => {
  it.each([
    [['pt-PT'], 'pt'],
    [['pt-BR'], 'pt'],
    [['pt'], 'pt'],
    [['en-GB'], 'en'],
    [['fr-FR'], 'en'],
    [['fr-FR', 'pt-PT', 'en-US'], 'pt'],
    [['fr-FR', 'en-US', 'pt-PT'], 'en'],
    [[], 'en'],
  ] as const)('%j means %s', (languages, expected) => {
    expect(systemLanguage(languages)).toBe(expected)
  })

  it('applies only to System; a chosen language stays', () => {
    expect(resolveLanguage('system', ['pt-PT'])).toBe('pt')
    expect(resolveLanguage('en', ['pt-PT'])).toBe('en')
    expect(resolveLanguage('pt', ['en-GB'])).toBe('pt')
  })
})

describe('the stored setting', () => {
  it('is System with nothing stored or something unknown', () => {
    expect(readStoredLanguageSetting()).toBe('system')
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'fr')
    expect(readStoredLanguageSetting()).toBe('system')
  })

  it('is System when storage can’t be read', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(readStoredLanguageSetting()).toBe('system')
  })

  it('reads a stored language', () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'pt')
    expect(readStoredLanguageSetting()).toBe('pt')
  })
})

function Probe() {
  const t = useT()
  return <p>{t('split.newBill')}</p>
}

function renderSettings() {
  return render(
    <LanguageProvider>
      <RegionProvider>
        <Probe />
        <SettingsPage />
      </RegionProvider>
    </LanguageProvider>,
  )
}

describe('LanguageProvider', () => {
  it('follows the browser with System, and sets <html lang>', () => {
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['pt-PT'])
    renderSettings()

    expect(screen.getByText('Nova conta')).toBeInTheDocument()
    expect(document.documentElement.lang).toBe('pt-PT')
  })

  it('switches language from Settings without a reload, and stores it', () => {
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['en-GB'])
    renderSettings()
    expect(screen.getByText('New bill')).toBeInTheDocument()
    expect(document.documentElement.lang).toBe('en')

    fireEvent.change(screen.getByRole('combobox', { name: 'Language' }), {
      target: { value: 'pt' },
    })

    expect(screen.getByText('Nova conta')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Idioma' })).toHaveValue('pt')
    expect(document.documentElement.lang).toBe('pt-PT')
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('pt')
  })

  it('keeps working when storage can’t be written', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full')
    })
    renderSettings()

    fireEvent.change(screen.getByRole('combobox', { name: 'Language' }), {
      target: { value: 'pt' },
    })

    expect(screen.getByText('Nova conta')).toBeInTheDocument()
  })

  it('reads English outside a provider', () => {
    render(<Probe />)
    expect(screen.getByText('New bill')).toBeInTheDocument()
  })
})
