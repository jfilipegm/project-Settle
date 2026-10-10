import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openDatabase } from '../../data/db.ts'
import { createHousehold, saveExpense } from '../../data/repository.ts'
import {
  equalSplit,
  fourMembers,
  household,
  quickExpense,
} from '../../test/households.ts'
import { renderApp, stubIndexedDb } from '../../test/renderApp.tsx'

let factory: IDBFactory

beforeEach(async () => {
  factory = stubIndexedDb()
  const db = await openDatabase(factory)
  await createHousehold(db, household(), fourMembers())
  await saveExpense(
    db,
    quickExpense('a', equalSplit(8640, ['ana', 'marta']), {
      description: 'Eletricidade, setembro',
      category: 'utilities',
      date: '2026-10-12',
      payerId: 'marta',
    }),
  )
  await saveExpense(
    db,
    quickExpense('b', equalSplit(4290, ['joao']), {
      description: 'Takeaway',
      category: 'eatingOut',
      date: '2026-10-11',
      payerId: 'joao',
    }),
  )
  await saveExpense(
    db,
    quickExpense('c', equalSplit(3854, ['ana', 'tiago']), {
      description: 'Internet, setembro',
      category: 'internet',
      date: '2026-09-10',
      payerId: 'tiago',
    }),
  )
  db.close()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/** The expense rows' text, in order (links to an expense). */
function rows() {
  return within(screen.getByRole('main'))
    .getAllByRole('link')
    .filter((link) => /[?&]expense=[^&]+/.test(link.getAttribute('href') ?? ''))
    .map((link) => link.textContent ?? '')
}

describe('the Expenses tab (H12)', () => {
  it('lists every expense newest first, grouped by month', async () => {
    renderApp('/households/h1/expenses')
    expect(await screen.findByText('3 expenses')).toBeInTheDocument()
    const months = screen
      .getAllByRole('heading', { level: 2 })
      .map((h) => h.textContent)
    expect(months.slice(1).map((m) => m?.replace(/\s/g, ' '))).toEqual([
      'October 2026129,30 €',
      'September 202638,54 €',
    ])
    expect(
      rows().map((r) => r.match(/Eletricidade|Takeaway|Internet/)?.[0]),
    ).toEqual(['Eletricidade', 'Takeaway', 'Internet'])
  })

  it('filters by member and by category, and keeps the filters in the URL', async () => {
    renderApp('/households/h1/expenses')
    fireEvent.change(await screen.findByRole('combobox', { name: 'Person' }), {
      target: { value: 'tiago' },
    })
    expect(await screen.findByText('1 expense')).toBeInTheDocument()
    expect(rows()[0]).toMatch(/Internet/)

    fireEvent.change(screen.getByRole('combobox', { name: 'Category' }), {
      target: { value: 'rent' },
    })
    expect(
      await screen.findByText('No expense matches these filters.'),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('link', { name: 'Clear the filters' }))
    expect(await screen.findByText('3 expenses')).toBeInTheDocument()
  })

  it('searches ignoring accents, and keeps the search across a visit', async () => {
    renderApp('/households/h1/expenses?q=electricidade')
    expect(await screen.findByText('0 expenses')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search' }), {
      target: { value: 'ELETRICIDADE' },
    })
    expect(await screen.findByText('1 expense')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('link', { name: /Eletricidade/ }))
    await screen.findByRole('dialog', {
      name: 'Eletricidade, setembro',
    })
    fireEvent.click(screen.getByRole('link', { name: 'Expenses' }))
    // A tab link starts a fresh history view.
    expect(await screen.findByText('3 expenses')).toBeInTheDocument()
  })

  it('reloads with its filters from the URL', async () => {
    renderApp('/households/h1/expenses?member=joao&category=eatingOut')
    expect(await screen.findByText('1 expense')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Person' })).toHaveValue('joao')
    expect(screen.getByRole('combobox', { name: 'Category' })).toHaveValue(
      'eatingOut',
    )
  })
})

describe('1000 expenses (H12)', () => {
  it('render and filter within the budget', async () => {
    const db = await openDatabase(factory)
    for (let i = 0; i < 1000; i++) {
      const day = String((i % 28) + 1).padStart(2, '0')
      const month = String((i % 12) + 1).padStart(2, '0')
      await saveExpense(
        db,
        quickExpense(`bulk-${i}`, equalSplit(100 + i, ['ana', 'marta']), {
          description: `Item ${i}`,
          date: `2025-${month}-${day}`,
        }),
      )
    }
    db.close()
    const start = performance.now()
    renderApp('/households/h1/expenses')
    expect(
      await screen.findByText('1003 expenses', {}, { timeout: 20_000 }),
    ).toBeInTheDocument()
    const rendered = performance.now() - start

    const filterStart = performance.now()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search' }), {
      target: { value: 'item 512' },
    })
    await waitFor(() =>
      expect(screen.getByText('1 expense')).toBeInTheDocument(),
    )
    const filtered = performance.now() - filterStart

    // Generous for a busy CI runner under jsdom; a real browser is far quicker.
    expect(rendered).toBeLessThan(15_000)
    expect(filtered).toBeLessThan(5_000)
  }, 60_000)
})
