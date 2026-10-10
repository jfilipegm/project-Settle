import { fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openDatabase } from '../../data/db.ts'
import { createHousehold, saveExpense } from '../../data/repository.ts'
import { formatMonth } from '../../features/household/format.ts'
import { isoDate } from '../../features/household/model.ts'
import { shiftMonth } from '../../features/household/totals.ts'
import { LANGUAGE_STORAGE_KEY } from '../../i18n/language.ts'
import {
  equalSplit,
  fourMembers,
  household,
  quickExpense,
} from '../../test/households.ts'
import { english, shownText } from '../../test/portuguese.ts'
import { renderApp, stubIndexedDb } from '../../test/renderApp.tsx'

/*
 * The overview's charts (review finding M-7), drawn on top of the numbers:
 * each chart's text alternative carries the values the figures show.
 */

const month = isoDate(new Date()).slice(0, 7)
const previous = shiftMonth(month, -1)

beforeEach(async () => {
  stubIndexedDb()
  const db = await openDatabase(indexedDB)
  await createHousehold(db, household(), fourMembers())
  await saveExpense(
    db,
    quickExpense('a', equalSplit(2550, ['ana']), {
      description: 'Rent share',
      date: `${month}-01`,
      category: 'rent',
    }),
  )
  await saveExpense(
    db,
    quickExpense('b', equalSplit(450, ['ana']), {
      description: 'Bread',
      date: `${month}-02`,
    }),
  )
  await saveExpense(
    db,
    quickExpense('c', equalSplit(9000, ['ana']), {
      description: 'Last month',
      date: `${previous}-15`,
    }),
  )
  db.close()
})

afterEach(() => {
  localStorage.clear()
  vi.unstubAllGlobals()
})

function spaces(text: string | null | undefined): string {
  return (text ?? '').replace(/\s/g, ' ')
}

describe('the overview’s charts (M-7)', () => {
  it('draws where it went as a donut, with the list as its legend', async () => {
    renderApp('/households/h1')
    const where = await screen.findByRole('region', { name: 'Where it went' })
    const donut = within(where).getByRole('img')
    expect(spaces(donut.getAttribute('aria-label'))).toBe(
      'Where it went: Rent 25,50 € (85 %), Groceries 4,50 € (15 %).',
    )
    // The month's total in the hole; the figures stay in the list.
    expect(spaces(donut.textContent)).toMatch(/30,00 €$/)
    expect(
      within(where)
        .getAllByRole('listitem')
        .map((li) => spaces(li.textContent)),
    ).toEqual(['Rent85 %25,50 €', 'Groceries15 %4,50 €'])
  })

  it('draws the month day by day', async () => {
    renderApp('/households/h1')
    const byDay = await screen.findByRole('region', { name: 'Day by day' })
    const chart = within(byDay).getByRole('img')
    const label = spaces(chart.getAttribute('aria-label'))
    expect(label).toMatch(
      new RegExp(`^Spending each day in ${formatMonth(month, 'en-GB')}: `),
    )
    expect(label).toMatch(/1 \S+ 25,50 €, 2 \S+ 4,50 €\.$/)
    expect(spaces(chart.textContent)).toMatch(/^Up to 25,50 €/)
  })

  it('draws the last six months, each bar opening its month', async () => {
    renderApp('/households/h1')
    const trend = await screen.findByRole('region', {
      name: 'The last six months',
    })
    const links = within(trend).getAllByRole('link')
    expect(links).toHaveLength(6)
    const current = links[5]
    expect(current).toHaveAttribute('aria-current', 'date')
    expect(spaces(current?.getAttribute('aria-label'))).toBe(
      `${formatMonth(month, 'en-GB')}: 30,00 €`,
    )
    expect(spaces(links[4]?.getAttribute('aria-label'))).toBe(
      `${formatMonth(previous, 'en-GB')}: 90,00 €`,
    )
    fireEvent.click(links[4]!)
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: formatMonth(previous, 'en-GB'),
      }),
    ).toBeInTheDocument()
    const now = screen
      .getAllByRole('link')
      .find((link) => link.getAttribute('aria-current') === 'date')
    expect(spaces(now?.getAttribute('aria-label'))).toBe(
      `${formatMonth(previous, 'en-GB')}: 90,00 €`,
    )
  })

  it('draws no chart for months with nothing in them', async () => {
    renderApp('/households/h1?month=2000-01')
    expect(await screen.findByText(/shared across/)).toBeInTheDocument()
    expect(
      screen.queryByRole('region', { name: 'Day by day' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('region', { name: 'Where it went' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('region', { name: 'The last six months' }),
    ).not.toBeInTheDocument()
  })

  it('heads the latest expenses’ columns', async () => {
    renderApp('/households/h1')
    const latest = await screen.findByRole('region', {
      name: 'Latest expenses',
    })
    expect(
      spaces(
        (await within(latest).findByTestId('expense-columns')).textContent,
      ),
    ).toBe('DateDescriptionCategoryPaid byAmount')
  })

  it('names them in Portuguese', async () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'pt')
    const { container } = renderApp('/households/h1')
    const where = await screen.findByRole('region', {
      name: 'Onde foi o dinheiro',
    })
    expect(
      spaces(within(where).getByRole('img').getAttribute('aria-label')),
    ).toBe(
      'Onde foi o dinheiro: Renda 25,50 € (85 %), Supermercado 4,50 € (15 %).',
    )
    expect(
      screen.getByRole('region', { name: 'Dia a dia' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('region', { name: 'Os últimos seis meses' }),
    ).toBeInTheDocument()
    expect(english(shownText(container))).toEqual([])
  })
})
