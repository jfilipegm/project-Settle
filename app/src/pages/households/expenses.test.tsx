import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openDatabase } from '../../data/db.ts'
import {
  createHousehold,
  getExpense,
  listExpenses,
  saveExpense,
} from '../../data/repository.ts'
import { isoDate } from '../../features/household/model.ts'
import { LANGUAGE_STORAGE_KEY } from '../../i18n/language.ts'
import {
  equalSplit,
  fourMembers,
  household,
  quickExpense,
} from '../../test/households.ts'
import { english, shownText } from '../../test/portuguese.ts'
import { renderApp, stubIndexedDb } from '../../test/renderApp.tsx'

let factory: IDBFactory
const today = isoDate(new Date())
const month = today.slice(0, 7)

beforeEach(async () => {
  factory = stubIndexedDb()
  const db = await openDatabase(factory)
  await createHousehold(db, household(), fourMembers())
  db.close()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

async function stored() {
  const db = await openDatabase(factory)
  const { items } = await listExpenses(db, 'h1')
  db.close()
  return items
}

function spaces(text: string | null): string {
  return (text ?? '').replace(/\s/g, ' ')
}

async function openNewExpense() {
  renderApp('/households/h1/expenses/new')
  return screen.findByRole('textbox', { name: 'What was it?' })
}

describe('a quick expense (CP3)', () => {
  it('saves an equal split, with a payer outside it, and shows it', async () => {
    fireEvent.change(await openNewExpense(), {
      target: { value: 'Electricity, September' },
    })
    fireEvent.change(screen.getByRole('textbox', { name: 'Amount' }), {
      target: { value: '86,40' },
    })
    fireEvent.change(screen.getByRole('combobox', { name: 'Category' }), {
      target: { value: 'utilities' },
    })
    fireEvent.change(screen.getByRole('combobox', { name: /Who paid/ }), {
      target: { value: 'tiago' },
    })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Tiago' }))
    // The live preview: 86,40 three ways.
    expect(
      spaces(screen.getByRole('group', { name: 'Split' }).textContent),
    ).toMatch(/28,80 €.*28,80 €.*28,80 €/)
    fireEvent.click(screen.getByRole('button', { name: 'Save expense' }))

    expect(
      await screen.findByRole('dialog', {
        name: 'Electricity, September',
      }),
    ).toBeInTheDocument()
    const [expense] = await stored()
    expect(expense).toMatchObject({
      payerId: 'tiago',
      category: 'utilities',
      split: {
        kind: 'equal',
        amount: 8640,
        memberIds: ['ana', 'marta', 'joao'],
      },
    })
    const shared = screen.getByRole('region', { name: 'Shared by' })
    expect(within(shared).queryByText('Tiago')).not.toBeInTheDocument()
  })

  it.each([
    ['By shares', 'Shares for Ana', '2', { kind: 'shares' }],
    ['Exact amounts', 'Amount for Ana', '40,00', { kind: 'exact' }],
    ['By percentage', 'Percentage for Ana', '100', { kind: 'percent' }],
  ])('saves a split %s', async (method, label, value, kind) => {
    fireEvent.change(await openNewExpense(), { target: { value: 'Dinner' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Amount' }), {
      target: { value: '40' },
    })
    fireEvent.click(screen.getByRole('radio', { name: method }))
    for (const name of ['Marta', 'João', 'Tiago']) {
      fireEvent.click(screen.getByRole('checkbox', { name }))
    }
    fireEvent.change(screen.getByRole('textbox', { name: label }), {
      target: { value },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save expense' }))
    await screen.findByRole('dialog', { name: 'Dinner' })
    const [expense] = await stored()
    expect(expense?.split).toMatchObject(kind)
  })

  it('shows what is left to split, and refuses to save until it adds up', async () => {
    fireEvent.change(await openNewExpense(), { target: { value: 'Dinner' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Amount' }), {
      target: { value: '40' },
    })
    fireEvent.click(screen.getByRole('radio', { name: 'Exact amounts' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Amount for Ana' }), {
      target: { value: '10' },
    })
    expect(spaces(screen.getByRole('status').textContent)).toBe(
      '30,00 € left to split',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Save expense' }))
    expect(spaces(screen.getByRole('alert').textContent)).toBe(
      'The amounts add up to 10,00 €, not 40,00 €.',
    )
    expect(await stored()).toEqual([])
  })

  it('edits and deletes an expense', async () => {
    const db = await openDatabase(factory)
    await saveExpense(
      db,
      quickExpense('e1', equalSplit(1000, ['ana', 'marta']), { date: today }),
    )
    db.close()
    renderApp('/households/h1/expenses/e1')

    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }))
    const amount = await screen.findByRole('textbox', { name: 'Amount' })
    expect(amount).toHaveValue('10,00')
    fireEvent.change(amount, { target: { value: '12,00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save expense' }))
    await screen.findByRole('dialog', { name: 'Groceries' })
    await waitFor(async () =>
      expect((await stored())[0]?.split).toMatchObject({ amount: 1200 }),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    const dialog = screen.getByRole('dialog', { name: 'Delete Groceries?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Expenses' }),
    ).toBeInTheDocument()
    const check = await openDatabase(factory)
    expect(await getExpense(check, 'e1')).toBeNull()
    check.close()
  })
})

describe('the overview (H13)', () => {
  beforeEach(async () => {
    const db = await openDatabase(factory)
    await saveExpense(
      db,
      quickExpense('a', equalSplit(2550, ['ana']), {
        date: `${month}-01`,
        category: 'rent',
      }),
    )
    await saveExpense(
      db,
      quickExpense('b', equalSplit(450, ['ana']), {
        date: today,
        description: 'Bread',
      }),
    )
    db.close()
  })

  it('shows the month’s total, latest expenses and where it went', async () => {
    renderApp('/households/h1')

    expect(spaces((await screen.findByText(/shared across/)).textContent)).toBe(
      '30,00 € shared across 2 expenses.',
    )
    const latest = screen.getByRole('region', { name: 'Latest expenses' })
    expect(
      within(latest)
        .getAllByRole('link')
        .map((l) => l.textContent),
    ).toEqual(expect.arrayContaining([expect.stringContaining('Bread')]))
    const where = screen.getByRole('region', { name: 'Where it went' })
    expect(
      within(where)
        .getAllByRole('listitem')
        .map((li) => spaces(li.textContent)),
    ).toEqual(['Rent85 %25,50 €', 'Groceries15 %4,50 €'])
  })

  it('moves to the previous month, which is empty', async () => {
    renderApp('/households/h1')
    fireEvent.click(await screen.findByRole('link', { name: 'Previous month' }))
    expect(
      await screen.findByText('No expenses this month.'),
    ).toBeInTheDocument()
  })

  it('offers a quick expense from Add expense', async () => {
    renderApp('/households/h1')
    fireEvent.click(await screen.findByRole('button', { name: 'Add expense' }))
    const dialog = screen.getByRole('dialog', { name: 'Add expense' })
    fireEvent.click(within(dialog).getByRole('link', { name: /Quick expense/ }))
    expect(
      await screen.findByRole('heading', { level: 1, name: 'New expense' }),
    ).toBeInTheDocument()
  })
})

describe('expenses in Portuguese', () => {
  beforeEach(() => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'pt')
  })

  it('shows the form’s validation messages in Portuguese, with no English', async () => {
    const { container } = renderApp('/households/h1/expenses/new')
    fireEvent.click(
      await screen.findByRole('button', { name: 'Guardar a despesa' }),
    )
    expect(screen.getByText('Diga o que foi.')).toBeInTheDocument()
    expect(english(shownText(container))).toEqual([])
  })

  it('shows the overview with no English', async () => {
    const db = await openDatabase(factory)
    await saveExpense(
      db,
      quickExpense('a', equalSplit(2550, ['ana']), { date: today }),
    )
    db.close()
    const { container } = renderApp('/households/h1')
    await screen.findByText(/partilhados em/)
    expect(english(shownText(container))).toEqual([])
  })
})

describe('the tabs on an expense’s pages', () => {
  it('keep Expenses as the current tab on the expense, its edit and a new one', async () => {
    const db = await openDatabase(factory)
    await saveExpense(
      db,
      quickExpense('e1', equalSplit(1000, ['ana', 'marta']), { date: today }),
    )
    db.close()
    for (const path of [
      '/households/h1/expenses/e1',
      '/households/h1/expenses/e1/edit',
      '/households/h1/expenses/new',
    ]) {
      const { unmount } = renderApp(path)
      const tabs = await screen.findByRole('navigation', {
        name: 'Household',
      })
      expect(
        within(tabs).getByRole('link', { name: 'Expenses' }),
      ).toHaveAttribute('aria-current', 'page')
      expect(
        within(tabs).getByRole('link', { name: 'Overview' }),
      ).not.toHaveAttribute('aria-current')
      unmount()
    }
  })
})

describe('the labels of an expense row (M-3)', () => {
  it('heads the columns and names every value of a row with its label', async () => {
    const db = await openDatabase(factory)
    await saveExpense(
      db,
      quickExpense('e1', equalSplit(1000, ['ana', 'marta']), {
        description: 'Roomba',
        date: today,
        category: 'household',
        payerId: 'marta',
      }),
    )
    db.close()
    renderApp('/households/h1/expenses')

    const row = await screen.findByRole('link', { name: /Roomba/ })
    expect(spaces(row.getAttribute('aria-label'))).toMatch(
      /^Date \d+ \S+, Description Roomba, Category Household, Paid by Marta, Amount 10,00 €$/,
    )
    // The column headings, shown from 640 px, above the rows.
    const headings = screen.getByTestId('expense-columns')
    expect(spaces(headings.textContent)).toBe(
      'DateDescriptionCategoryPaid byAmount',
    )
    expect(headings).toHaveAttribute('aria-hidden', 'true')
  })

  it('names them in Portuguese', async () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'pt')
    const db = await openDatabase(factory)
    await saveExpense(
      db,
      quickExpense('e1', equalSplit(1000, ['ana', 'marta']), {
        description: 'Roomba',
        date: today,
      }),
    )
    db.close()
    renderApp('/households/h1/expenses')
    const headings = await screen.findByTestId('expense-columns')
    expect(spaces(headings.textContent)).toBe(
      'DataDescriçãoCategoriaPago porValor',
    )
  })
})
