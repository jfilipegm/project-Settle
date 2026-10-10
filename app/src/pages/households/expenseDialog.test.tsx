import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openDatabase } from '../../data/db.ts'
import {
  createHousehold,
  getExpense,
  saveExpense,
} from '../../data/repository.ts'
import { isoDate } from '../../features/household/model.ts'
import {
  equalSplit,
  fourMembers,
  household,
  quickExpense,
} from '../../test/households.ts'
import { renderApp, stubIndexedDb } from '../../test/renderApp.tsx'

/*
 * An expense opens in a dialog over the list it came from (review finding
 * M-5): the list stays underneath with its filters, closing returns to it,
 * and a link to the old expense page still opens it.
 */

let factory: IDBFactory
const today = isoDate(new Date())

beforeEach(async () => {
  factory = stubIndexedDb()
  const db = await openDatabase(factory)
  await createHousehold(db, household(), fourMembers())
  await saveExpense(
    db,
    quickExpense('e1', equalSplit(3000, ['ana', 'marta']), {
      description: 'Groceries run',
      date: today,
      payerId: 'ana',
    }),
  )
  await saveExpense(
    db,
    quickExpense('e2', equalSplit(1000, ['joao']), {
      description: 'Takeaway',
      category: 'eatingOut',
      date: today,
      payerId: 'joao',
    }),
  )
  db.close()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function spaces(text: string | null | undefined): string {
  return (text ?? '').replace(/\s/g, ' ')
}

describe('an expense in a dialog (M-5)', () => {
  it('opens over the list, which keeps its filters, and closes back to it', async () => {
    renderApp('/households/h1/expenses?member=ana')
    expect(await screen.findByText('1 expense')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('link', { name: /Groceries run/ }))

    const dialog = await screen.findByRole('dialog', { name: 'Groceries run' })
    // The list is still there underneath, filtered.
    expect(
      screen.getByRole('heading', { level: 1, name: 'Expenses' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Person' })).toHaveValue('ana')
    expect(within(dialog).getByRole('button', { name: 'Close' })).toHaveFocus()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )
    expect(screen.getByRole('combobox', { name: 'Person' })).toHaveValue('ana')
    expect(screen.getByText('1 expense')).toBeInTheDocument()
  })

  it('opens over the overview, and Escape closes it there', async () => {
    renderApp('/households/h1')
    const latest = await screen.findByRole('region', {
      name: 'Latest expenses',
    })
    fireEvent.click(
      await within(latest).findByRole('link', { name: /Takeaway/ }),
    )
    const dialog = await screen.findByRole('dialog', { name: 'Takeaway' })
    expect(
      screen.getByRole('region', { name: 'Latest expenses' }),
    ).toBeInTheDocument()
    fireEvent.keyDown(dialog, { key: 'Escape' })
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )
    expect(
      screen.getByRole('region', { name: 'Latest expenses' }),
    ).toBeInTheDocument()
  })

  it('opens from a link to the expense’s own page, over the Expenses list', async () => {
    renderApp('/households/h1/expenses/e1')
    const dialog = await screen.findByRole('dialog', { name: 'Groceries run' })
    expect(
      screen.getByRole('heading', { level: 1, name: 'Expenses' }),
    ).toBeInTheDocument()
    // Opened directly, closing drops the parameter and keeps the list.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )
    expect(screen.getByText('2 expenses')).toBeInTheDocument()
  })

  it('shows the shares as a bar and as a list', async () => {
    renderApp('/households/h1/expenses?expense=e1')
    const dialog = await screen.findByRole('dialog', { name: 'Groceries run' })
    const bar = within(dialog)
      .getAllByRole('img')
      .map((img) => spaces(img.getAttribute('aria-label')))
    expect(bar).toContain('Each share of 30,00 €: Ana 15,00 €, Marta 15,00 €.')
    const shared = within(dialog).getByRole('region', { name: 'Shared by' })
    expect(spaces(shared.textContent)).toMatch(/Ana.*15,00 €.*Marta.*15,00 €/)
  })

  it('says so for an expense that isn’t there', async () => {
    renderApp('/households/h1/expenses?expense=nope')
    const dialog = await screen.findByRole('dialog', {
      name: 'Expense not found',
    })
    expect(dialog).toHaveTextContent('This expense isn’t here any more.')
  })

  it('edits from the dialog and comes back to it', async () => {
    renderApp('/households/h1/expenses')
    fireEvent.click(await screen.findByRole('link', { name: /Groceries run/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Groceries run' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Edit' }))
    const amount = await screen.findByRole('textbox', { name: 'Amount' })
    fireEvent.change(amount, { target: { value: '42,00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save expense' }))

    const back = await screen.findByRole('dialog', { name: 'Groceries run' })
    await waitFor(() => expect(back).toHaveTextContent('42,00 €'))
    fireEvent.click(within(back).getByRole('button', { name: 'Close' }))
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )
    expect(
      screen.getByRole('heading', { level: 1, name: 'Expenses' }),
    ).toBeInTheDocument()
  })

  it('deletes from the dialog: it closes and the row goes', async () => {
    renderApp('/households/h1/expenses')
    fireEvent.click(await screen.findByRole('link', { name: /Takeaway/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Takeaway' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))
    const confirm = screen.getByRole('dialog', { name: 'Delete Takeaway?' })
    fireEvent.click(within(confirm).getByRole('button', { name: 'Delete' }))

    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    )
    expect(await screen.findByText('1 expense')).toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: /Takeaway/ }),
    ).not.toBeInTheDocument()
    const db = await openDatabase(factory)
    expect(await getExpense(db, 'e2')).toBeNull()
    db.close()
  })

  it('keeps the expense open when its delete is cancelled with Escape', async () => {
    renderApp('/households/h1/expenses?expense=e2')
    const dialog = await screen.findByRole('dialog', { name: 'Takeaway' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))
    const confirm = screen.getByRole('dialog', { name: 'Delete Takeaway?' })
    fireEvent.keyDown(within(confirm).getByRole('button', { name: 'Cancel' }), {
      key: 'Escape',
    })
    expect(
      screen.queryByRole('dialog', { name: 'Delete Takeaway?' }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Takeaway' })).toBeInTheDocument()
  })
})
