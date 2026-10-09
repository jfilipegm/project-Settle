import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { RegionProvider } from '../app/RegionProvider.tsx'
import { AppRoutes } from '../app/router.tsx'
import { THEME_STORAGE_KEY } from '../app/theme.ts'
import { ThemeProvider } from '../app/ThemeProvider.tsx'
import { ReceiptImportProvider } from '../features/receipt/ReceiptImportProvider.tsx'
import { resetThemeDom } from '../test/themeDom.ts'

afterEach(() => {
  resetThemeDom()
})

describe('the Theme field in Settings (M3 plan, S8)', () => {
  it('applies and stores the mode, and the header toggle follows', () => {
    render(
      <ThemeProvider>
        <RegionProvider>
          <ReceiptImportProvider>
            <MemoryRouter initialEntries={['/settings']}>
              <AppRoutes />
            </MemoryRouter>
          </ReceiptImportProvider>
        </RegionProvider>
      </ThemeProvider>,
    )
    const field = screen.getByRole('combobox', { name: 'Theme' })
    expect(field).toHaveValue('system')
    expect(
      screen.getByRole('button', { name: 'Theme: system. Switch to light.' }),
    ).toBeInTheDocument()

    fireEvent.change(field, { target: { value: 'dark' } })

    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
    expect(
      screen.getByRole('button', { name: 'Theme: dark. Switch to system.' }),
    ).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', { name: 'Theme: dark. Switch to system.' }),
    )
    expect(field).toHaveValue('system')
    expect(document.documentElement).not.toHaveAttribute('data-theme')
  })
})
