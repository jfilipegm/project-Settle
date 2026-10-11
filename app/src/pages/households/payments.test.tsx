import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openDatabase } from '../../data/db.ts'
import {
  createHousehold,
  listSettlements,
  saveExpense,
  saveSettlement,
} from '../../data/repository.ts'
import { isoDate } from '../../features/household/model.ts'
import { LANGUAGE_STORAGE_KEY } from '../../i18n/language.ts'
import { cents } from '../../lib/money.ts'
import {
  fourMembers,
  household,
  putRaw,
  quickExpense,
  settlement,
} from '../../test/households.ts'
import { english, shownText } from '../../test/portuguese.ts'
import { renderApp, stubIndexedDb } from '../../test/renderApp.tsx'

/*
 * Payments in the history and the settle-up text (M5 plan, B8, B9, CP5).
 */

const today = isoDate(new Date())

let factory: IDBFactory

function exact(id: string, payerId: string, amounts: Record<string, number>) {
  const total = Object.values(amounts).reduce((a, b) => a + b, 0)
  return quickExpense(
    id,
    {
      kind: 'exact',
      amount: cents(total),
      amounts: Object.entries(amounts).map(([memberId, amount]) => ({
        memberId,
        amount: cents(amount),
      })),
    },
    { payerId, date: today, description: `Expense ${id}` },
  )
}

/** The canvas, plus Tiago's 91,15 to Ana, noted "Rent". */
beforeEach(async () => {
  factory = stubIndexedDb()
  const db = await openDatabase(factory)
  await createHousehold(db, household(), fourMembers())
  await saveExpense(db, exact('e1', 'ana', { tiago: 9115 }))
  await saveExpense(db, exact('e2', 'marta', { joao: 2240, tiago: 765 }))
  await saveSettlement(
    db,
    settlement('s1', 'tiago', 'ana', 9115, { date: today, note: 'Rent' }),
  )
  db.close()
})

/** Sets (or, with `undefined`, removes) a navigator property for one test. */
function setNavigator(name: 'clipboard' | 'share', value: unknown) {
  Object.defineProperty(navigator, name, { configurable: true, value })
}

afterEach(() => {
  localStorage.clear()
  vi.unstubAllGlobals()
  Reflect.deleteProperty(navigator, 'clipboard')
  Reflect.deleteProperty(navigator, 'share')
})

function spaces(text: string | null | undefined): string {
  return (text ?? '').replace(/\s/g, ' ')
}

const paymentLink = () =>
  screen.getByRole('link', { name: /^Payment, .*, Tiago paid Ana, 91,15\s€$/ })

describe('payments in the history (B8)', () => {
  it('lists a payment in its month, styled apart, outside the totals', async () => {
    renderApp('/households/h1/expenses')
    expect(await screen.findByText('2 expenses')).toBeVisible()
    const link = await waitFor(paymentLink)
    expect(link.closest('li')?.className).toMatch(/payment/)
    expect(spaces(link.textContent)).toMatch(/Tiago paid Ana.*Rent.*91,15 €$/)
    // The month's total is the expenses' alone: 91,15 + 30,05.
    const heading = screen.getAllByRole('heading', { level: 2 }).at(-1)
    expect(spaces(heading?.textContent)).toMatch(/121,20 €$/)
  })

  it('shows a member’s payments, sent or received, and hides them for a category', async () => {
    const view = renderApp('/households/h1/expenses?member=ana')
    expect(await waitFor(paymentLink)).toBeVisible()
    view.unmount()
    const marta = renderApp('/households/h1/expenses?member=marta')
    await screen.findByText('1 expense')
    expect(screen.queryByRole('link', { name: /^Payment/ })).toBeNull()
    marta.unmount()
    renderApp('/households/h1/expenses?category=groceries')
    await screen.findByText('2 expenses')
    expect(screen.queryByRole('link', { name: /^Payment/ })).toBeNull()
  })

  it.each([
    ['a name', 'tiago'],
    ['the other name', 'ANA'],
    ['the note', 'rent'],
  ])('finds a payment by %s', async (_name, query) => {
    renderApp(`/households/h1/expenses?q=${query}`)
    expect(await waitFor(paymentLink)).toBeVisible()
  })

  it('doesn’t find it by words it lacks', async () => {
    renderApp('/households/h1/expenses?q=marta')
    expect(await screen.findByText('0 expenses')).toBeVisible()
    expect(screen.queryByRole('link', { name: /^Payment/ })).toBeNull()
  })

  it('counts an unreadable payment, kept', async () => {
    const db = await openDatabase(factory)
    await putRaw(db, {
      households: [],
      members: [],
      expenses: [],
      settlements: [{ ...settlement('bad', 'ana', 'marta', 100), v: 99 }],
    })
    db.close()
    renderApp('/households/h1/expenses')
    expect(
      await screen.findByText(
        '1 payment couldn’t be read. It is kept as it was.',
      ),
    ).toBeVisible()
  })
})

describe('a payment in a dialog (B8)', () => {
  it('opens over the filtered list and closes back to it, by Close, Escape and Back', async () => {
    renderApp('/households/h1/expenses?member=ana')
    fireEvent.click(await waitFor(paymentLink))
    const dialog = await screen.findByRole('dialog', { name: 'Tiago paid Ana' })
    expect(spaces(dialog.textContent)).toMatch(/91,15 €/)
    expect(within(dialog).getByText('Rent')).toBeVisible()
    expect(screen.getByRole('combobox', { name: 'Person' })).toHaveValue('ana')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByRole('combobox', { name: 'Person' })).toHaveValue('ana')

    fireEvent.click(paymentLink())
    fireEvent.keyDown(await screen.findByRole('dialog'), { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    fireEvent.click(paymentLink())
    const again = await screen.findByRole('dialog')
    fireEvent.pointerDown(again)
    fireEvent.click(again)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByRole('combobox', { name: 'Person' })).toHaveValue('ana')
  })

  it('says so for a payment that isn’t there', async () => {
    renderApp('/households/h1/expenses?settlement=ghost')
    expect(
      await screen.findByRole('dialog', { name: 'Payment not found' }),
    ).toBeVisible()
  })

  it('edits a payment, its outcome leaving the original out (L2-I1)', async () => {
    renderApp('/households/h1/expenses')
    fireEvent.click(await waitFor(paymentLink))
    const view = await screen.findByRole('dialog', { name: 'Tiago paid Ana' })
    fireEvent.click(within(view).getByRole('button', { name: 'Edit' }))
    const form = await screen.findByRole('dialog', { name: 'Edit payment' })
    expect(within(form).getByLabelText('Amount')).toHaveValue('91,15')
    // As recorded, 91,15 settles Ana: the original isn't counted twice.
    expect(spaces(within(form).getByRole('status').textContent)).toBe(
      'After this, Tiago owes 7,65 € and Ana is settled up.',
    )
    fireEvent.change(within(form).getByLabelText('Amount'), {
      target: { value: '50' },
    })
    expect(spaces(within(form).getByRole('status').textContent)).toBe(
      'After this, Tiago owes 48,80 € and Ana gets back 41,15 €.',
    )
    // Changing who paid names the new pair, still without the original.
    fireEvent.change(within(form).getByLabelText('From'), {
      target: { value: 'joao' },
    })
    expect(spaces(within(form).getByRole('status').textContent)).toBe(
      'After this, João gets back 27,60 € and Ana gets back 41,15 €.',
    )
    fireEvent.change(within(form).getByLabelText('From'), {
      target: { value: 'tiago' },
    })
    fireEvent.click(within(form).getByRole('button', { name: 'Save payment' }))
    const saved = await screen.findByRole('dialog', { name: 'Tiago paid Ana' })
    await waitFor(() => expect(saved).toHaveTextContent(/50,00/))
    const db = await openDatabase(factory)
    expect((await listSettlements(db, 'h1')).items).toMatchObject([
      { id: 's1', amount: 5000, note: 'Rent' },
    ])
    db.close()
  })

  it('deletes a payment after a confirmation: the balances change back', async () => {
    renderApp('/households/h1/expenses')
    fireEvent.click(await waitFor(paymentLink))
    const view = await screen.findByRole('dialog', { name: 'Tiago paid Ana' })
    fireEvent.click(within(view).getByRole('button', { name: 'Delete' }))
    const confirm = screen.getByRole('dialog', { name: 'Delete this payment?' })
    expect(within(confirm).getByText('The balances change back.')).toBeVisible()
    fireEvent.click(
      within(confirm).getByRole('button', { name: 'Delete payment' }),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() =>
      expect(screen.queryByRole('link', { name: /^Payment/ })).toBeNull(),
    )
    const db = await openDatabase(factory)
    expect((await listSettlements(db, 'h1')).items).toEqual([])
    db.close()
  })

  it('opens from a payment line of an explanation, and Back returns there (L3-O2)', async () => {
    renderApp('/households/h1/balances/tiago')
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Tiago’s balance' }),
    ).toBeVisible()
    fireEvent.click(await screen.findByRole('link', { name: 'Paid Ana' }))
    const dialog = await screen.findByRole('dialog', { name: 'Tiago paid Ana' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(
      screen.getByRole('heading', { level: 1, name: 'Tiago’s balance' }),
    ).toBeVisible()
  })
})

describe('Copy as text and Share (B9)', () => {
  let copied = ''
  const writeText = (text: string) => {
    copied = text.replace(/[\u00a0\u202f]/g, ' ')
    return Promise.resolve()
  }

  it('copies the default balances’ text, and says so', async () => {
    setNavigator('clipboard', { writeText })
    renderApp('/households/h1/balances')
    fireEvent.click(await screen.findByRole('button', { name: 'Copy as text' }))
    expect(await screen.findByText('Copied.')).toBeVisible()
    expect(copied).toBe(
      [
        'Rua das Flores 12, balances',
        'Ana is settled up',
        'Marta gets back 30,05 €',
        'João owes 22,40 €',
        'Tiago owes 7,65 €',
        '',
        'To settle up, 2 payments:',
        'João pays Marta 22,40 €',
        'Tiago pays Marta 7,65 €',
      ].join('\n'),
    )
  })

  it('says when the browser refuses the clipboard', async () => {
    setNavigator('clipboard', {
      writeText: () => Promise.reject(new Error('denied')),
    })
    renderApp('/households/h1/balances')
    fireEvent.click(await screen.findByRole('button', { name: 'Copy as text' }))
    expect(
      await screen.findByText('Couldn’t copy. Your browser blocked it.'),
    ).toBeVisible()
  })

  it('shares where the browser can, and a cancelled share is no error', async () => {
    const share = vi.fn(() =>
      Promise.reject(new DOMException('cancelled', 'AbortError')),
    )
    setNavigator('share', share)
    renderApp('/households/h1/balances')
    fireEvent.click(await screen.findByRole('button', { name: 'Share' }))
    await waitFor(() => expect(share).toHaveBeenCalledOnce())
    expect(
      String((share.mock.calls[0] as unknown as [{ text: string }])[0].text),
    ).toMatch(/^Rua das Flores 12, balances\n/)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('offers no Share where the browser has none', async () => {
    setNavigator('share', undefined)
    renderApp('/households/h1/balances')
    expect(
      await screen.findByRole('button', { name: 'Copy as text' }),
    ).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Share' })).toBeNull()
  })

  it('offers neither with a date set, nor over incomplete balances (L2-I2, M-I-1)', async () => {
    const view = renderApp(`/households/h1/balances?on=${today}`)
    await screen.findByText(/These are the balances on/)
    expect(screen.queryByRole('button', { name: 'Copy as text' })).toBeNull()
    view.unmount()
    const db = await openDatabase(factory)
    await putRaw(db, {
      households: [],
      members: [],
      expenses: [{ ...exact('bad', 'ana', { marta: 1 }), v: 99 }],
    })
    db.close()
    renderApp('/households/h1/balances')
    await screen.findByText('Balances from the records that could be read.')
    expect(screen.queryByRole('button', { name: 'Copy as text' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Share' })).toBeNull()
  })
})

describe('in Portuguese', () => {
  it('shows a payment in the history and its dialog with no English', async () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'pt')
    const view = renderApp('/households/h1/expenses')
    const link = await screen.findByRole('link', {
      name: /^Pagamento, .*, Tiago pagou a Ana, 91,15\s€$/,
    })
    expect(english(shownText(view.container))).toEqual([])
    fireEvent.click(link)
    const dialog = await screen.findByRole('dialog', {
      name: 'Tiago pagou a Ana',
    })
    expect(english(shownText(dialog))).toEqual([])
  })
})
