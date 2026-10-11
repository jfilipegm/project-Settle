import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openDatabase } from '../../data/db.ts'
import {
  createHousehold,
  deleteMember,
  listSettlements,
  saveExpense,
  saveSettlement,
} from '../../data/repository.ts'
import { isoDate, maxExpenseDate } from '../../features/household/model.ts'
import { LANGUAGE_STORAGE_KEY } from '../../i18n/language.ts'
import { cents } from '../../lib/money.ts'
import {
  fourMembers,
  household,
  member,
  putRaw,
  quickExpense,
  settlement,
} from '../../test/households.ts'
import { english, shownText } from '../../test/portuguese.ts'
import { renderApp, stubIndexedDb } from '../../test/renderApp.tsx'

/*
 * The Balances tab, the payment dialog, explanations and the overview's
 * card (M5 plan, B5 to B7, CP4).
 */

const today = isoDate(new Date())
const month = today.slice(0, 7)
const later = maxExpenseDate(today)

let factory: IDBFactory

/** Exact amounts, in cents, paid by `payerId`, dated today. */
function exact(
  id: string,
  payerId: string,
  amounts: Record<string, number>,
  extra: Parameters<typeof quickExpense>[2] = {},
) {
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
    { payerId, date: today, description: `Expense ${id}`, ...extra },
  )
}

/** The canvas: Ana +91,15, Marta +30,05, João −22,40, Tiago −98,80. */
async function seedCanvas(
  extra: (db: IDBDatabase) => Promise<void> = () => Promise.resolve(),
) {
  const db = await openDatabase(factory)
  await createHousehold(db, household(), fourMembers())
  await saveExpense(db, exact('e1', 'ana', { tiago: 9115 }))
  await saveExpense(db, exact('e2', 'marta', { joao: 2240, tiago: 765 }))
  await extra(db)
  db.close()
}

function spaces(text: string | null | undefined): string {
  return (text ?? '').replace(/\s/g, ' ')
}

/** An exact accessible name, matching any space as the app's (no-break) one. */
function named(text: string): RegExp {
  return new RegExp(
    `^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s')}$`,
  )
}

/** Each listed member's row as "Name Word Amount" (the Paid line apart). */
function balanceRows(): string[] {
  return screen
    .getAllByRole('listitem')
    .filter((li) => li.querySelector('data[value]') !== null)
    .filter((li) => li.closest('section') === null)
    .map((li) => spaces(li.textContent))
}

async function openTab(path = '/households/h1/balances') {
  const view = renderApp(path)
  await screen.findByRole('heading', { level: 1, name: 'Balances' })
  return view
}

beforeEach(() => {
  factory = stubIndexedDb()
})

afterEach(() => {
  localStorage.clear()
  vi.unstubAllGlobals()
})

describe('the Balances tab (B5)', () => {
  it('shows each balance and the fewest payments, as on the canvas', async () => {
    await seedCanvas()
    await openTab()
    expect(
      screen.getByRole('link', { name: 'Balances', current: 'page' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Settle up in 3 payments.')).toBeInTheDocument()
    const rows = await waitFor(() => {
      const found = balanceRows()
      expect(found).toHaveLength(4)
      return found
    })
    expect(rows[0]).toMatch(/Ana.*Paid 91,15 €.*Gets back\+91,15 €$/)
    expect(rows[1]).toMatch(/Marta.*Paid 30,05 €.*Gets back\+30,05 €$/)
    expect(rows[2]).toMatch(/João.*Paid 0,00 €.*Owes−22,40 €$/)
    expect(rows[3]).toMatch(/Tiago.*Owes−98,80 €$/)
    const settle = screen.getByRole('region', { name: 'Settle up' })
    expect(
      within(settle).getByText('3 payments clear every balance.'),
    ).toBeVisible()
    expect(
      within(settle)
        .getAllByRole('listitem')
        .map((li) => spaces(li.textContent)),
    ).toEqual([
      'Tiago pays Ana91,15 €Mark as paid',
      'João pays Marta22,40 €Mark as paid',
      'Tiago pays Marta7,65 €Mark as paid',
    ])
  })

  it('says everyone is settled up, with no Settle up', async () => {
    await seedCanvas(async (db) => {
      await saveSettlement(db, settlement('s1', 'tiago', 'ana', 9115))
      await saveSettlement(db, settlement('s2', 'joao', 'marta', 2240))
      await saveSettlement(db, settlement('s3', 'tiago', 'marta', 765))
    })
    await openTab()
    expect(await screen.findByText('Everyone is settled up.')).toBeVisible()
    expect(screen.queryByRole('region', { name: 'Settle up' })).toBeNull()
    expect(screen.getAllByText('Settled up')).toHaveLength(4)
  })

  it('lists a member who left while they owe, and not once settled', async () => {
    await seedCanvas(async (db) => {
      await putRaw(db, {
        households: [],
        members: [{ ...member('joao', 'João', 2), leftOn: '2026-01-31' }],
        expenses: [],
      })
    })
    await openTab()
    await waitFor(() => expect(balanceRows()).toHaveLength(4))
    expect(balanceRows()[2]).toMatch(/Left on 31 Jan/)
  })

  it('leaves out a member who left with a zero balance, who still has an explanation (L2-O4)', async () => {
    const db = await openDatabase(factory)
    await createHousehold(db, household(), [
      ...fourMembers(),
      member('eva', 'Eva', 4, { leftOn: '2026-01-31' }),
    ])
    await saveExpense(db, exact('e1', 'ana', { tiago: 9115 }))
    db.close()
    await openTab()
    await waitFor(() => expect(balanceRows()).toHaveLength(4))
    expect(screen.queryByText('Eva')).toBeNull()
    renderApp('/households/h1/balances/eva')
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Eva’s balance' }),
    ).toBeVisible()
    expect(
      screen.getByText('No expenses or payments for Eva yet.'),
    ).toBeVisible()
  })

  it('shows the empty states', async () => {
    const db = await openDatabase(factory)
    await createHousehold(db, household(), [])
    await createHousehold(db, household('h2', 'Algarve'), [
      member('rui', 'Rui', 0, { householdId: 'h2' }),
    ])
    db.close()
    const view = await openTab()
    expect(screen.getByRole('link', { name: 'Go to Members' })).toHaveAttribute(
      'href',
      '/households/h1/members',
    )
    view.unmount()
    await openTab('/households/h2/balances')
    expect(
      await screen.findByText('No expenses or payments yet.'),
    ).toBeVisible()
    expect(
      screen.getByRole('link', { name: 'Add an expense' }),
    ).toHaveAttribute('href', '/households/h2')
  })
})

describe('recording a payment (B6)', () => {
  it('Mark as paid fills the dialog, shows the outcome, and saves', async () => {
    await seedCanvas()
    await openTab()
    fireEvent.click(
      await screen.findByRole('button', {
        name: named('Mark as paid: Tiago pays Ana 91,15 €'),
      }),
    )
    const dialog = screen.getByRole('dialog', { name: 'Record a payment' })
    expect(within(dialog).getByLabelText('From')).toHaveValue('tiago')
    expect(within(dialog).getByLabelText('To')).toHaveValue('ana')
    expect(within(dialog).getByLabelText('Amount')).toHaveValue('91,15')
    expect(within(dialog).getByLabelText('Date')).toHaveValue(today)
    expect(spaces(within(dialog).getByRole('status').textContent)).toBe(
      'After this, Tiago owes 7,65 € and Ana is settled up.',
    )
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Save payment' }),
    )
    expect(await screen.findByText('Settle up in 2 payments.')).toBeVisible()
    expect(screen.getByText('Payment recorded.')).toBeInTheDocument()
    await waitFor(() =>
      expect(balanceRows()[0]).toMatch(/Ana.*Settled up\+?0,00 €$/),
    )
    expect(balanceRows()[3]).toMatch(/Owes−7,65 €$/)
  })

  it('records part of a suggestion: the rest stays owed', async () => {
    await seedCanvas()
    await openTab()
    fireEvent.click(
      await screen.findByRole('button', {
        name: named('Mark as paid: Tiago pays Ana 91,15 €'),
      }),
    )
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Amount'), {
      target: { value: '50' },
    })
    expect(spaces(within(dialog).getByRole('status').textContent)).toBe(
      'After this, Tiago owes 48,80 € and Ana gets back 41,15 €.',
    )
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Save payment' }),
    )
    await waitFor(() => expect(balanceRows()[0]).toMatch(/Gets back\+41,15 €$/))
    expect(
      screen.getByRole('button', {
        name: named('Mark as paid: Tiago pays Ana 41,15 €'),
      }),
    ).toBeVisible()
  })

  it('records a payment from an empty dialog, between any two members', async () => {
    await seedCanvas()
    await openTab()
    fireEvent.click(
      await screen.findByRole('button', { name: 'Record a payment' }),
    )
    const dialog = screen.getByRole('dialog', { name: 'Record a payment' })
    expect(within(dialog).getByLabelText('From')).toHaveValue('')
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Save payment' }),
    )
    expect(
      within(dialog).getAllByText('Choose who paid and who received.'),
    ).toHaveLength(2)
    expect(
      within(dialog).getByText('Enter an amount, like 12,50'),
    ).toBeVisible()
    fireEvent.change(within(dialog).getByLabelText('From'), {
      target: { value: 'joao' },
    })
    fireEvent.change(within(dialog).getByLabelText('To'), {
      target: { value: 'joao' },
    })
    fireEvent.change(within(dialog).getByLabelText('Amount'), {
      target: { value: '10' },
    })
    fireEvent.change(within(dialog).getByLabelText('Date'), {
      target: { value: '' },
    })
    expect(
      within(dialog).getByText('Choose two different people.'),
    ).toBeVisible()
    expect(within(dialog).getByText('Enter a date.')).toBeVisible()
    fireEvent.change(within(dialog).getByLabelText('To'), {
      target: { value: 'tiago' },
    })
    fireEvent.change(within(dialog).getByLabelText('Date'), {
      target: { value: today },
    })
    fireEvent.change(within(dialog).getByLabelText('Note'), {
      target: { value: 'Coffee' },
    })
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Save payment' }),
    )
    await waitFor(() => expect(balanceRows()[2]).toMatch(/Owes−12,40 €$/))
    const db = await openDatabase(factory)
    expect((await listSettlements(db, 'h1')).items).toMatchObject([
      { fromId: 'joao', toId: 'tiago', amount: 1000, note: 'Coffee' },
    ])
    db.close()
  })

  it('saves once when Save is pressed twice', async () => {
    await seedCanvas()
    await openTab()
    fireEvent.click(
      await screen.findByRole('button', {
        name: named('Mark as paid: João pays Marta 22,40 €'),
      }),
    )
    const save = within(screen.getByRole('dialog')).getByRole('button', {
      name: 'Save payment',
    })
    fireEvent.click(save)
    fireEvent.click(save)
    await screen.findByText('Settle up in 2 payments.')
    const db = await openDatabase(factory)
    expect((await listSettlements(db, 'h1')).items).toHaveLength(1)
    db.close()
  })

  it('keeps what was typed when the save fails', async () => {
    await seedCanvas(async (db) => {
      await putRaw(db, {
        households: [],
        members: [member('eva', 'Eva', 4)],
        expenses: [],
      })
    })
    await openTab()
    fireEvent.click(
      await screen.findByRole('button', { name: 'Record a payment' }),
    )
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('From'), {
      target: { value: 'eva' },
    })
    fireEvent.change(within(dialog).getByLabelText('To'), {
      target: { value: 'ana' },
    })
    fireEvent.change(within(dialog).getByLabelText('Amount'), {
      target: { value: '5' },
    })
    // Eva is deleted in another tab before the save.
    const other = await openDatabase(factory)
    await deleteMember(other, 'h1', 'eva')
    other.close()
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Save payment' }),
    )
    expect(
      await within(dialog).findByText(
        'Someone on this payment was removed in another tab. Check the people and save again.',
      ),
    ).toBeVisible()
    expect(within(dialog).getByLabelText('Amount')).toHaveValue('5')
  })
})

describe('balances on a date, and dated after today (B5, L1-I1, L2-I2)', () => {
  it('shows the balances on a past date, without the actions', async () => {
    await seedCanvas(async (db) => {
      await saveExpense(
        db,
        exact('old', 'joao', { ana: 1000 }, { date: '2026-01-15' }),
      )
    })
    await openTab('/households/h1/balances?on=2026-02-01')
    expect(
      await screen.findByText(/These are the balances on 1 Feb\./),
    ).toBeVisible()
    await waitFor(() => expect(balanceRows()[0]).toMatch(/Owes−10,00 €$/))
    expect(screen.getByLabelText('Balances on')).toHaveValue('2026-02-01')
    expect(screen.queryByRole('region', { name: 'Settle up' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Mark as paid/ })).toBeNull()
    expect(
      screen.queryByRole('button', { name: 'Record a payment' }),
    ).toBeNull()
    expect(screen.queryByText(/Settle up in/)).toBeNull()
    fireEvent.click(screen.getByRole('link', { name: 'Show all' }))
    expect(await screen.findByText('Settle up in 3 payments.')).toBeVisible()
  })

  it('keeps the date in the address, and ignores one after today', async () => {
    await seedCanvas()
    const view = await openTab()
    fireEvent.change(await screen.findByLabelText('Balances on'), {
      target: { value: '2026-02-01' },
    })
    expect(
      await screen.findByText(/These are the balances on 1 Feb\./),
    ).toBeVisible()
    expect(screen.getByLabelText('Balances on')).toHaveValue('2026-02-01')
    view.unmount()
    // A date after today is ignored: the default balances, with actions.
    await openTab(`/households/h1/balances?on=${later}`)
    expect(await screen.findByText('Settle up in 3 payments.')).toBeVisible()
    expect(screen.getByLabelText('Balances on')).toHaveValue('')
  })

  it('counts records dated after today by default, everywhere, and says so', async () => {
    await seedCanvas(async (db) => {
      await saveExpense(
        db,
        exact('future', 'ana', { tiago: 1000 }, { date: later }),
      )
      await saveSettlement(
        db,
        settlement('s1', 'tiago', 'ana', 500, { date: later }),
      )
    })
    const tab = await openTab()
    expect(
      await screen.findByText(
        'Includes 1 expense and 1 payment dated after today.',
      ),
    ).toBeVisible()
    // Ana: 91,15 + 10,00 − 5,00 = 96,15.
    await waitFor(() => expect(balanceRows()[0]).toMatch(/\+96,15 €$/))
    expect(
      screen.getByRole('button', {
        name: named('Mark as paid: Tiago pays Ana 96,15 €'),
      }),
    ).toBeVisible()
    // The dialog's outcome uses the same default.
    fireEvent.click(
      screen.getByRole('button', {
        name: named('Mark as paid: Tiago pays Ana 96,15 €'),
      }),
    )
    expect(
      spaces(
        within(screen.getByRole('dialog')).getByRole('status').textContent,
      ),
    ).toBe('After this, Tiago owes 7,65 € and Ana is settled up.')
    // The explanation too.
    tab.unmount()
    const detail = renderApp('/households/h1/balances/ana')
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Ana’s balance' }),
    ).toBeVisible()
    expect(
      spaces(screen.getAllByText('Balance')[0]?.parentElement?.textContent),
    ).toBe('Balance+96,15 €')
    // And the overview's card, labelled for that default, never "today".
    detail.unmount()
    renderApp(`/households/h1?month=${month}`)
    const card = await screen.findByRole('region', { name: 'Balances' })
    expect(spaces(within(card).getByText(/^Across/).textContent)).toBe(
      'Across all expenses and payments. Includes 1 expense and 1 payment dated after today.',
    )
    expect(card.textContent).not.toMatch(/as of today|balances today/i)
    expect(within(card).getByText('Settle up in 3 payments.')).toBeVisible()
  })

  it.each([
    ['only expenses', 1, 0, 'Includes 1 expense dated after today.'],
    ['only payments', 0, 2, 'Includes 2 payments dated after today.'],
    ['both', 2, 1, 'Includes 2 expenses and 1 payment dated after today.'],
  ])('counts %s dated after today (L3-O3)', async (_name, e, s, line) => {
    await seedCanvas(async (db) => {
      for (let i = 0; i < e; i++) {
        await saveExpense(
          db,
          exact(`f${String(i)}`, 'ana', { tiago: 100 }, { date: later }),
        )
      }
      for (let i = 0; i < s; i++) {
        await saveSettlement(
          db,
          settlement(`s${String(i)}`, 'tiago', 'ana', 100, { date: later }),
        )
      }
    })
    await openTab()
    expect(await screen.findByText(line)).toBeVisible()
  })

  it('shows the overview’s card on a past month, with the default balances', async () => {
    await seedCanvas()
    renderApp('/households/h1?month=2001-01')
    const card = await screen.findByRole('region', { name: 'Balances' })
    expect(within(card).getByText('Settle up in 3 payments.')).toBeVisible()
    expect(within(card).getByRole('link', { name: 'Details' })).toHaveAttribute(
      'href',
      '/households/h1/balances',
    )
  })

  it('has no balances card before the first expense or payment', async () => {
    const db = await openDatabase(factory)
    await createHousehold(db, household(), fourMembers())
    db.close()
    renderApp('/households/h1')
    await screen.findByRole('heading', { level: 1 })
    expect(screen.queryByRole('region', { name: 'Balances' })).toBeNull()
  })
})

describe('incomplete balances fail closed (M-I-1)', () => {
  // The reviewer's case: Ana paid 100,00 for both; Tiago's 100,00 for
  // both is unreadable. Readable: Ana +50,00, Tiago −50,00. In truth both
  // are settled: no surface may suggest "Tiago pays Ana 50,00".
  async function seedAnaTiago(kind: 'expense' | 'payment' | 'member') {
    const db = await openDatabase(factory)
    await createHousehold(db, household(), [
      member('ana', 'Ana', 0),
      member('tiago', 'Tiago', 1),
      member('rui', 'Rui', 2),
    ])
    await saveExpense(
      db,
      quickExpense(
        'e1',
        { kind: 'equal', amount: cents(10000), memberIds: ['ana', 'tiago'] },
        { date: today },
      ),
    )
    const tiagos = quickExpense(
      'e2',
      { kind: 'equal', amount: cents(10000), memberIds: ['ana', 'tiago'] },
      { date: today, payerId: 'tiago' },
    )
    if (kind === 'expense') {
      await putRaw(db, {
        households: [],
        members: [],
        expenses: [{ ...tiagos, v: 99 }],
      })
    } else if (kind === 'payment') {
      await putRaw(db, {
        households: [],
        members: [],
        expenses: [],
        settlements: [{ ...settlement('s1', 'tiago', 'ana', 5000), v: 99 }],
      })
    } else {
      await putRaw(db, {
        households: [],
        members: [{ ...member('rui', 'Rui', 2), v: 99 }],
        expenses: [],
      })
    }
    db.close()
    return tiagos
  }

  it.each(['expense', 'payment', 'member'] as const)(
    'with an unreadable %s: figures only, no suggestion, no settled up',
    async (kind) => {
      await seedAnaTiago(kind)
      const tab = await openTab()
      expect(
        await screen.findByText(
          '1 record couldn’t be read, so these balances leave something out. Settle up isn’t suggested until it can be read.',
        ),
      ).toBeVisible()
      expect(
        screen.getByText('Balances from the records that could be read.'),
      ).toBeVisible()
      await waitFor(() =>
        expect(balanceRows()[0]).toMatch(/Ana.*Gets back\+50,00 €$/),
      )
      expect(screen.queryByRole('region', { name: 'Settle up' })).toBeNull()
      expect(screen.queryByRole('button', { name: /Mark as paid/ })).toBeNull()
      expect(screen.queryByText(/Settle up in/)).toBeNull()
      expect(screen.queryByText('Everyone is settled up.')).toBeNull()

      // Record a payment still saves, with the notice in place of the
      // outcome.
      fireEvent.click(screen.getByRole('button', { name: 'Record a payment' }))
      const dialog = screen.getByRole('dialog')
      fireEvent.change(within(dialog).getByLabelText('From'), {
        target: { value: 'tiago' },
      })
      fireEvent.change(within(dialog).getByLabelText('To'), {
        target: { value: 'ana' },
      })
      fireEvent.change(within(dialog).getByLabelText('Amount'), {
        target: { value: '50' },
      })
      expect(within(dialog).getByRole('status')).toHaveTextContent(
        '1 record couldn’t be read, so the outcome isn’t shown.',
      )
      expect(within(dialog).queryByText(/After this/)).toBeNull()
      fireEvent.click(
        within(dialog).getByRole('button', { name: 'Save payment' }),
      )
      // Readable balances now all zero: still no "settled up".
      expect(
        await screen.findByText(
          'No balance in the records that could be read.',
        ),
      ).toBeVisible()
      expect(screen.queryByText('Everyone is settled up.')).toBeNull()

      // The overview's card: the notice, no settle-up line.
      tab.unmount()
      const overview = renderApp('/households/h1')
      const card = await screen.findByRole('region', { name: 'Balances' })
      expect(within(card).getByText('1 record couldn’t be read.')).toBeVisible()
      expect(within(card).queryByText(/Settle up in|settled up/)).toBeNull()

      // The notice stays with a date set.
      overview.unmount()
      await openTab(`/households/h1/balances?on=${today}`)
      expect(
        await screen.findByText(/1 record couldn’t be read, so these balances/),
      ).toBeVisible()
    },
  )

  it('comes back to the ordinary page once the record reads again', async () => {
    const tiagos = await seedAnaTiago('expense')
    const view = await openTab()
    expect(
      await screen.findByText('Balances from the records that could be read.'),
    ).toBeVisible()
    view.unmount()
    const db = await openDatabase(factory)
    await putRaw(db, { households: [], members: [], expenses: [tiagos] })
    db.close()
    await openTab()
    expect(await screen.findByText('Everyone is settled up.')).toBeVisible()
    expect(screen.queryByText(/couldn’t be read/)).toBeNull()
  })
})

describe('explaining a balance (B7)', () => {
  it('lists what makes a balance, summing to it, and opens an expense over the page', async () => {
    await seedCanvas(async (db) => {
      await saveSettlement(
        db,
        settlement('s1', 'tiago', 'marta', 500, { date: today }),
      )
    })
    await openTab()
    fireEvent.click(await screen.findByRole('link', { name: 'Tiago' }))
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Tiago’s balance' }),
    ).toBeVisible()
    expect(spaces(screen.getByText(/^Paid .* · Share/).textContent)).toBe(
      'Paid 0,00 € · Share 98,80 € · Sent 5,00 € · Received 0,00 €',
    )
    const lines = screen
      .getAllByRole('listitem')
      .filter(
        (li) => li.closest('section[aria-labelledby^="explain-"]') !== null,
      )
      .map((li) => spaces(li.textContent))
    expect(lines).toHaveLength(3)
    expect(lines.some((l) => /^Paid Marta.*\+5,00 €$/.test(l))).toBe(true)
    expect(
      lines.some((l) =>
        /^Expense e1.*Paid 0,00 € · Share 91,15 €−91,15 €$/.test(l),
      ),
    ).toBe(true)
    expect(spaces(screen.getByText('Balance').parentElement?.textContent)).toBe(
      'Balance−93,80 €',
    )
    fireEvent.click(screen.getByRole('link', { name: 'Expense e1' }))
    expect(
      await screen.findByRole('dialog', { name: 'Expense e1' }),
    ).toBeVisible()
    expect(
      screen.getByRole('heading', { level: 1, name: 'Tiago’s balance' }),
    ).toBeInTheDocument()
  })

  it('shows Not found for someone who isn’t a member', async () => {
    await seedCanvas()
    renderApp('/households/h1/balances/ghost')
    expect(
      await screen.findByRole('heading', { level: 1, name: /not found/i }),
    ).toBeVisible()
  })

  it('respects the date', async () => {
    await seedCanvas(async (db) => {
      await saveExpense(
        db,
        exact('old', 'joao', { ana: 1000 }, { date: '2026-01-15' }),
      )
    })
    renderApp('/households/h1/balances/ana?on=2026-02-01')
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Ana’s balance' }),
    ).toBeVisible()
    expect(spaces(screen.getByText('Balance').parentElement?.textContent)).toBe(
      'Balance−10,00 €',
    )
  })
})

describe('in Portuguese', () => {
  it('shows the tab, the dialog and the explanation with no English', async () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'pt')
    await seedCanvas()
    const view = renderApp('/households/h1/balances')
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Saldos' }),
    ).toBeVisible()
    expect(
      await screen.findByText('Acertar contas em 3 pagamentos.'),
    ).toBeVisible()
    expect(screen.getByRole('link', { name: 'Saldos' })).toBeVisible()
    expect(english(shownText(view.container))).toEqual([])
    fireEvent.click(
      screen.getByRole('button', {
        name: named('Marcar como pago: Tiago paga a Ana 91,15 €'),
      }),
    )
    const dialog = screen.getByRole('dialog', {
      name: 'Registar um pagamento',
    })
    expect(spaces(within(dialog).getByRole('status').textContent)).toBe(
      'Depois disto, Tiago deve 7,65 € e Ana fica com as contas certas.',
    )
    expect(english(shownText(dialog))).toEqual([])
    view.unmount()
    const detail = renderApp('/households/h1/balances/ana')
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Saldo de Ana' }),
    ).toBeVisible()
    expect(english(shownText(detail.container))).toEqual([])
  })
})
