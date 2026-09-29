import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { ReceiptImportProvider } from '../features/receipt/ReceiptImportProvider.tsx'
import { RegionProvider } from './RegionProvider.tsx'
import { AppRoutes } from './router.tsx'

function renderAt(path: string) {
  return render(
    <RegionProvider>
      <ReceiptImportProvider>
        <MemoryRouter initialEntries={[path]}>
          <AppRoutes />
        </MemoryRouter>
      </ReceiptImportProvider>
    </RegionProvider>,
  )
}

const NAV_LINK_NAMES = ['Home', 'Split', 'Finances', 'Settings']

function mainNav() {
  return screen.getByRole('navigation', { name: 'Main' })
}

afterEach(() => {
  // The theme toggle in the header stores and applies the mode.
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
})

describe('routes', () => {
  it('renders the home page at /', () => {
    renderAt('/')

    expect(
      screen.getByRole('heading', { level: 1, name: 'Settle' }),
    ).toBeInTheDocument()
  })

  it.each([
    [
      '/finances',
      'Finances',
      'Coming in M5: Finance file import and dashboards.',
    ],
  ])(
    'renders the %s placeholder with its heading and milestone',
    (path, heading, milestone) => {
      renderAt(path)

      expect(
        screen.getByRole('heading', { level: 1, name: heading }),
      ).toBeInTheDocument()
      expect(screen.getByText(milestone)).toBeInTheDocument()
    },
  )

  it('links from the home page to the split page', () => {
    renderAt('/')

    fireEvent.click(
      within(screen.getByRole('main')).getByRole('link', {
        name: 'Split a bill',
      }),
    )

    expect(
      screen.getByRole('heading', { level: 1, name: 'Split a bill' }),
    ).toBeInTheDocument()
  })

  it('renders the split page at /split', () => {
    renderAt('/split')

    expect(
      screen.getByRole('heading', { level: 1, name: 'Split a bill' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 2, name: 'Who owes what' }),
    ).toBeInTheDocument()
  })

  it('renders the settings page at /settings', () => {
    renderAt('/settings')

    expect(
      screen.getByRole('heading', { level: 1, name: 'Settings' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 2, name: 'Region' }),
    ).toBeInTheDocument()
  })

  it('renders not found for an unknown path, with a working link home', () => {
    renderAt('/no/such/page')

    expect(
      screen.getByRole('heading', { level: 1, name: 'Page not found' }),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('link', { name: 'Go to the home page' }))

    expect(
      screen.getByRole('heading', { level: 1, name: 'Settle' }),
    ).toBeInTheDocument()
  })

  it('renders every page inside the shell', () => {
    renderAt('/no/such/page')

    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(mainNav()).toBeInTheDocument()
    expect(
      within(screen.getByRole('main')).getByRole('heading', { level: 1 }),
    ).toHaveTextContent('Page not found')
  })
})

describe('shell accessibility', () => {
  it('gives every nav link an accessible name', () => {
    renderAt('/')

    const links = within(mainNav()).getAllByRole('link')
    expect(links).toHaveLength(NAV_LINK_NAMES.length)
    for (const link of links) {
      expect(link).toHaveAccessibleName()
    }
    for (const name of NAV_LINK_NAMES) {
      expect(within(mainNav()).getByRole('link', { name })).toBeInTheDocument()
    }
  })

  it.each([
    ['/', 'Home'],
    ['/split', 'Split'],
    ['/finances', 'Finances'],
    ['/settings', 'Settings'],
  ])(
    'marks only the active link at %s with aria-current="page"',
    (path, active) => {
      renderAt(path)

      for (const name of NAV_LINK_NAMES) {
        const link = within(mainNav()).getByRole('link', { name })
        if (name === active) {
          expect(link).toHaveAttribute('aria-current', 'page')
        } else {
          expect(link).not.toHaveAttribute('aria-current')
        }
      }
    },
  )

  it('marks no nav link as current on the not-found page', () => {
    renderAt('/no/such/page')

    for (const link of within(mainNav()).getAllByRole('link')) {
      expect(link).not.toHaveAttribute('aria-current')
    }
  })

  it('has a skip link to the main landmark', () => {
    renderAt('/split')

    const skip = screen.getByRole('link', { name: 'Skip to content' })
    const main = screen.getByRole('main')

    expect(skip).toHaveAttribute('href', '#main')
    expect(main).toHaveAttribute('id', 'main')
    // Focusable by script, so following the skip link moves focus there.
    expect(main).toHaveAttribute('tabindex', '-1')
  })
})
