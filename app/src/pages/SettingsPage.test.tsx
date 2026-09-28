import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { RegionProvider } from '../app/RegionProvider.tsx'
import { REGION_STORAGE_KEY } from '../app/region.ts'
import { SettingsPage } from './SettingsPage.tsx'

function renderSettings() {
  return render(
    <RegionProvider>
      <SettingsPage />
    </RegionProvider>,
  )
}

function localeSelect() {
  return screen.getByRole('combobox', { name: 'Number format' })
}

function currencySelect() {
  return screen.getByRole('combobox', { name: 'Currency' })
}

function example() {
  return screen.getByRole('status')
}

afterEach(() => {
  localStorage.clear()
})

describe('settings: region', () => {
  it('labels both selects', () => {
    renderSettings()

    expect(localeSelect()).toHaveAccessibleName('Number format')
    expect(currencySelect()).toHaveAccessibleName('Currency')
  })

  it('starts at pt-PT / EUR with the example in euros', () => {
    renderSettings()

    expect(localeSelect()).toHaveValue('pt-PT')
    expect(currencySelect()).toHaveValue('EUR')
    expect(example().textContent).toMatch(/^1234,56\s€$/)
  })

  it('updates the example when the locale or currency changes', () => {
    renderSettings()

    fireEvent.change(localeSelect(), { target: { value: 'en-GB' } })
    expect(example()).toHaveTextContent('€1,234.56')

    fireEvent.change(currencySelect(), { target: { value: 'GBP' } })
    expect(example()).toHaveTextContent('£1,234.56')

    fireEvent.change(localeSelect(), { target: { value: 'en-US' } })
    fireEvent.change(currencySelect(), { target: { value: 'USD' } })
    expect(example()).toHaveTextContent('$1,234.56')
  })

  it('stores the choice, so a fresh render restores it', () => {
    const { unmount } = renderSettings()
    fireEvent.change(localeSelect(), { target: { value: 'en-GB' } })
    fireEvent.change(currencySelect(), { target: { value: 'GBP' } })
    unmount()

    expect(JSON.parse(localStorage.getItem(REGION_STORAGE_KEY) ?? '')).toEqual({
      locale: 'en-GB',
      currency: 'GBP',
    })

    renderSettings()
    expect(localeSelect()).toHaveValue('en-GB')
    expect(currencySelect()).toHaveValue('GBP')
    expect(example()).toHaveTextContent('£1,234.56')
  })

  it('says that changing the currency does not convert amounts', () => {
    renderSettings()

    expect(screen.getByText(/amounts are never converted/)).toBeInTheDocument()
  })

  it('says receipt reading comes in M3', () => {
    renderSettings()

    expect(
      screen.getByText('Coming in M3: Bring-your-own-key receipt reading.'),
    ).toBeInTheDocument()
  })
})
