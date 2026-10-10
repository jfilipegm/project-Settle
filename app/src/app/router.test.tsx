import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { ReceiptImportProvider } from '../features/receipt/ReceiptImportProvider.tsx'
import { RegionProvider } from './RegionProvider.tsx'
import { AppRoutes } from './router.tsx'
import { routeTable } from './routes.tsx'

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

const NAV_LINK_NAMES = ['Split', 'Household', 'Settings']

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

  it('shows the Household tab’s storage message where IndexedDB is missing (M4, H3)', async () => {
    // jsdom has no IndexedDB: the household pages say so, and keep the
    // way to the split.
    renderAt('/household')

    expect(
      await screen.findByRole('heading', {
        name: 'Households can’t be saved here',
      }),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('link', { name: 'Split a bill' }))
    expect(
      screen.getByRole('heading', { level: 1, name: 'Split a bill' }),
    ).toBeInTheDocument()
  })

  it('redirects the old /finances to the Household tab', async () => {
    renderAt('/finances')

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Households' }),
    ).toBeInTheDocument()
    expect(
      within(mainNav()).getByRole('link', { name: 'Household' }),
    ).toHaveAttribute('aria-current', 'page')
  })

  it('marks Household current on a household’s own pages', () => {
    renderAt('/households/someone/members')

    expect(
      within(mainNav()).getByRole('link', { name: 'Household' }),
    ).toHaveAttribute('aria-current', 'page')
  })

  it('links the wordmark in the header to Home', () => {
    renderAt('/settings')

    const home = within(screen.getByRole('banner')).getByRole('link', {
      name: 'Settle, home',
    })
    expect(home).toHaveTextContent('Settle')
    fireEvent.click(home)
    expect(
      screen.getByRole('heading', { level: 1, name: 'Settle' }),
    ).toBeInTheDocument()
  })

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
    // The result is the third step (M3 plan, S9).
    fireEvent.click(screen.getByRole('link', { name: 'The split' }))
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
    ['/split', 'Split'],
    ['/household', 'Household'],
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

  it('gives each tab an icon and words', () => {
    renderAt('/split')

    for (const link of within(mainNav()).getAllByRole('link')) {
      expect(link.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
      expect(link.textContent).not.toBe('')
    }
  })

  it.each(['/', '/no/such/page'])('marks no tab as current at %s', (path) => {
    renderAt(path)

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

describe('the route table (M3 plan, S12)', () => {
  const paths = (dev: boolean) =>
    (routeTable({ dev })[0]?.children ?? []).map(
      (route) => route.path ?? (route.index === true ? '(index)' : ''),
    )

  it('has no gallery in production', () => {
    expect(paths(false)).toEqual([
      '(index)',
      'split',
      'household',
      'households',
      'households/:hid',
      'finances',
      'settings',
      '*',
    ])
  })

  it('adds the gallery at /_kit in development, before not found', () => {
    expect(paths(true)).toEqual([
      '(index)',
      'split',
      'household',
      'households',
      'households/:hid',
      'finances',
      'settings',
      '_kit',
      '*',
    ])
  })

  it('renders the gallery at /_kit in development', async () => {
    renderAt('/_kit')
    // A lazy import: allow for a busy machine running the whole suite.
    expect(
      await screen.findByRole(
        'heading',
        { level: 1, name: 'Kit' },
        { timeout: 10_000 },
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('region', { name: 'PersonBadge' }),
    ).toHaveTextContent('Person 8')
  })
})
