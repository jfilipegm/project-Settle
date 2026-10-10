import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openDatabase } from '../../data/db.ts'
import {
  createHousehold,
  deleteMember,
  getExpense,
  listExpenses,
  listMembers,
  saveExpense,
  setMemberLeft,
} from '../../data/repository.ts'
import { saveReceiptSummary } from '../../features/receipt/receiptStore.ts'
import { createBill } from '../../features/split/billReducer.ts'
import { loadDraft, saveDraft } from '../../features/split/draft.ts'
import type { Bill } from '../../features/split/model.ts'
import { billHasContent } from '../../features/receipt/importUi.ts'
import { isoDate } from '../../features/household/model.ts'
import { cents } from '../../lib/money.ts'
import { NOW, fourMembers, household, member } from '../../test/households.ts'
import { renderApp, stubIndexedDb } from '../../test/renderApp.tsx'

let factory: IDBFactory
const today = isoDate(new Date())

/** Ana and Marta share bread; Ana's coffee is hers. Ana paid. */
function typedBill(names: [string, string] = ['Ana', 'Marta']): Bill {
  const bill = createBill(['p1', 'p2', 'i1'])
  bill.people = [
    { id: 'p1', name: names[0] },
    { id: 'p2', name: names[1] },
  ]
  bill.items = [
    {
      id: 'i1',
      name: 'Bread',
      quantity: { numerator: 1, denominator: 1 },
      unitPrice: cents(300),
      assignees: [
        { personId: 'p1', weight: 1 },
        { personId: 'p2', weight: 1 },
      ],
    },
    {
      id: 'i2',
      name: 'Coffee',
      quantity: { numerator: 1, denominator: 1 },
      unitPrice: cents(150),
      assignees: [{ personId: 'p1', weight: 1 }],
    },
  ]
  return bill
}

beforeEach(async () => {
  factory = stubIndexedDb()
  const db = await openDatabase(factory)
  await createHousehold(db, household(), fourMembers())
  db.close()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

async function withDb<T>(run: (db: IDBDatabase) => Promise<T>): Promise<T> {
  const db = await openDatabase(factory)
  try {
    return await run(db)
  } finally {
    db.close()
  }
}

async function openSaveDialog() {
  renderApp('/split?step=split')
  fireEvent.click(
    await screen.findByRole('button', { name: 'Save to a household' }),
  )
  return screen.findByRole('dialog', { name: 'Save to a household' })
}

async function fillAndSave(dialog: HTMLElement, description = 'Pastelaria') {
  await within(dialog).findAllByRole('combobox', { name: /^Who is / })
  const what = await within(dialog).findByRole('textbox', {
    name: 'What was it?',
  })
  fireEvent.change(what, { target: { value: description } })
  fireEvent.click(
    within(dialog).getByRole('button', { name: 'Save to household' }),
  )
}

describe('saving a split into a household (H10)', () => {
  it('saves a typed bill, matching people by name, and clears the draft after', async () => {
    saveDraft(typedBill())
    const dialog = await openSaveDialog()
    expect(
      within(dialog).getByText(
        'The bill moves into the household. The split starts fresh after saving.',
      ),
    ).toBeInTheDocument()
    expect(
      await within(dialog).findByRole('combobox', { name: 'Who is Ana?' }),
    ).toHaveValue('ana')
    expect(
      within(dialog).getByRole('combobox', { name: 'Who is Marta?' }),
    ).toHaveValue('marta')
    await fillAndSave(dialog)

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Pastelaria' }),
    ).toBeInTheDocument()
    const [expense] = await withDb((db) => listExpenses(db, 'h1')).then(
      (listed) => listed.items,
    )
    expect(expense).toMatchObject({
      payerId: 'ana',
      category: 'other',
      split: {
        kind: 'itemised',
        members: [
          { personId: 'p1', memberId: 'ana' },
          { personId: 'p2', memberId: 'marta' },
        ],
      },
    })
    expect(screen.getByRole('region', { name: 'Items' })).toHaveTextContent(
      'Coffee',
    )
    // The bill became the expense: the draft starts fresh.
    expect(billHasContent(loadDraft() ?? typedBill())).toBe(false)
  })

  it('keeps a scanned receipt’s summary and key, and warns before a second save', async () => {
    saveDraft(typedBill())
    saveReceiptSummary({
      merchant: 'Continente',
      date: '2026-10-05',
      total: cents(450),
      totalSource: 'qr',
      warnings: [],
      flaggedItemIds: [],
      receiptKey: 'qr:502011475:ABC-1',
    })
    let dialog = await openSaveDialog()
    await within(dialog).findByRole('combobox', { name: 'Who is Ana?' })
    expect(
      within(dialog).getByRole('textbox', { name: 'What was it?' }),
    ).toHaveValue('Continente')
    expect(
      within(dialog).getByRole('combobox', { name: 'Category' }),
    ).toHaveValue('groceries')
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Save to household' }),
    )
    await screen.findByRole('heading', { level: 1, name: 'Continente' })
    const [saved] = (await withDb((db) => listExpenses(db, 'h1'))).items
    expect(saved).toMatchObject({
      date: '2026-10-05',
      receiptKey: 'qr:502011475:ABC-1',
      receipt: { merchant: 'Continente', total: 450, totalSource: 'qr' },
    })

    // The same receipt again: a warning, then "Save anyway".
    saveDraft(typedBill())
    saveReceiptSummary({
      merchant: 'Continente',
      date: '2026-10-05',
      warnings: [],
      flaggedItemIds: [],
      receiptKey: 'qr:502011475:ABC-1',
    })
    fireEvent.click(screen.getByRole('link', { name: 'Split' }))
    fireEvent.click(await screen.findByRole('link', { name: 'The split' }))
    fireEvent.click(
      await screen.findByRole('button', { name: 'Save to a household' }),
    )
    dialog = await screen.findByRole('dialog', { name: 'Save to a household' })
    await within(dialog).findByRole('combobox', { name: 'Who is Ana?' })
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Save to household' }),
    )
    expect(
      await within(dialog).findByText('This receipt looks already saved'),
    ).toBeInTheDocument()
    expect(
      within(dialog).getByRole('link', { name: 'Open that expense' }),
    ).toHaveAttribute('href', `/households/h1/expenses/${saved?.id ?? ''}`)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save anyway' }))
    await waitFor(async () =>
      expect((await withDb((db) => listExpenses(db, 'h1'))).items).toHaveLength(
        2,
      ),
    )
  })

  it('needs a choice for an unknown person, then adds them as a new member with the expense', async () => {
    saveDraft(typedBill(['Ana', 'Rui']))
    const dialog = await openSaveDialog()
    const rui = await within(dialog).findByRole('combobox', {
      name: 'Who is Rui?',
    })
    expect(rui).toHaveValue('')
    await fillAndSave(dialog)
    expect(within(dialog).getByText('Choose who this is.')).toBeInTheDocument()

    fireEvent.change(rui, { target: { value: 'new' } })
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Save to household' }),
    )
    await screen.findByRole('heading', { level: 1, name: 'Pastelaria' })
    const members = (await withDb((db) => listMembers(db, 'h1'))).items
    const added = members.find((m) => m.name === 'Rui')
    expect(added).toMatchObject({ position: 4 })
    const [expense] = (await withDb((db) => listExpenses(db, 'h1'))).items
    expect(expense?.split).toMatchObject({
      members: [
        { personId: 'p1', memberId: 'ana' },
        { personId: 'p2', memberId: added?.id },
      ],
    })
  })

  it('saves once when Save is pressed twice (H10)', async () => {
    saveDraft(typedBill(['Ana', 'Rui']))
    const dialog = await openSaveDialog()
    fireEvent.change(
      await within(dialog).findByRole('combobox', { name: 'Who is Rui?' }),
      { target: { value: 'new' } },
    )
    fireEvent.change(
      within(dialog).getByRole('textbox', { name: 'What was it?' }),
      { target: { value: 'Pastelaria' } },
    )
    const save = within(dialog).getByRole('button', {
      name: 'Save to household',
    })
    fireEvent.click(save)
    fireEvent.click(save)

    await screen.findByRole('heading', { level: 1, name: 'Pastelaria' })
    expect((await withDb((db) => listExpenses(db, 'h1'))).items).toHaveLength(1)
    const members = (await withDb((db) => listMembers(db, 'h1'))).items
    expect(members.filter((m) => m.name === 'Rui')).toHaveLength(1)
  })

  it('refuses two people as one member', async () => {
    saveDraft(typedBill())
    const dialog = await openSaveDialog()
    fireEvent.change(
      await within(dialog).findByRole('combobox', { name: 'Who is Marta?' }),
      { target: { value: 'ana' } },
    )
    await fillAndSave(dialog)
    expect(
      within(dialog).getByText('Two people can’t be the same member.'),
    ).toBeInTheDocument()
  })

  it('takes a payer outside the bill (H6)', async () => {
    saveDraft(typedBill())
    const dialog = await openSaveDialog()
    fireEvent.change(
      await within(dialog).findByRole('combobox', { name: /Who paid/ }),
      { target: { value: 'tiago' } },
    )
    await fillAndSave(dialog)
    await screen.findByRole('heading', { level: 1, name: 'Pastelaria' })
    const [expense] = (await withDb((db) => listExpenses(db, 'h1'))).items
    expect(expense?.payerId).toBe('tiago')
  })

  it('keeps the draft on Cancel, and when the save fails (L1-O1)', async () => {
    saveDraft(typedBill())
    let dialog = await openSaveDialog()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(loadDraft()).toEqual(typedBill())

    fireEvent.click(screen.getByRole('button', { name: 'Save to a household' }))
    dialog = await screen.findByRole('dialog', { name: 'Save to a household' })
    await within(dialog).findByRole('combobox', { name: 'Who is Marta?' })
    // Marta is deleted in another tab before the save.
    await withDb((db) => deleteMember(db, 'h1', 'marta'))
    await fillAndSave(dialog)
    expect(
      await within(dialog).findByText(
        'Someone on this expense was removed in another tab. Check the people and save again.',
      ),
    ).toBeInTheDocument()
    expect(loadDraft()).toEqual(typedBill())
    expect((await withDb((db) => listExpenses(db, 'h1'))).items).toEqual([])
  })
})

describe('splitting a bill from a household (H10, M-I-2)', () => {
  it('starts a bill with the household’s active members', async () => {
    renderApp('/split?household=h1')
    expect(
      await screen.findByRole('textbox', { name: 'Name of Person 4' }),
    ).toHaveValue('Tiago')
    expect(
      screen.getByRole('textbox', { name: 'Name of Person 1' }),
    ).toHaveValue('Ana')
    await waitFor(() =>
      expect(loadDraft()?.people.map((p) => p.id)).toEqual([
        'ana',
        'marta',
        'joao',
        'tiago',
      ]),
    )
  })

  it('asks before replacing a bill with content, and keeps it on No', async () => {
    saveDraft(typedBill())
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderApp('/split?household=h1')
    await waitFor(() => expect(confirm).toHaveBeenCalled())
    expect(loadDraft()).toEqual(typedBill())
  })

  it('starts a one-member bill, and offers nothing with no active member', async () => {
    await withDb(async (db) => {
      await createHousehold(db, household('h2', 'Solo'), [
        member('solo', 'Solo', 0, { householdId: 'h2' }),
      ])
      await createHousehold(db, household('h3', 'Empty'), [
        member('gone', 'Gone', 0, { householdId: 'h3', leftOn: '2026-01-31' }),
      ])
    })
    renderApp('/split?household=h2')
    await waitFor(() =>
      expect(loadDraft()?.people.map((p) => p.id)).toEqual(['solo']),
    )

    await withDb((db) => setMemberLeft(db, 'h2', 'solo', '2026-02-01'))
    const view = renderApp('/households/h3')
    expect(
      await within(view.container).findByRole('button', {
        name: 'Add expense',
      }),
    ).toBeDisabled()
  })
})

describe('editing an itemised expense’s items (H10)', () => {
  beforeEach(async () => {
    const bill = typedBill()
    await withDb((db) =>
      saveExpense(db, {
        v: 1,
        id: 'e1',
        householdId: 'h1',
        description: 'Pastelaria',
        date: today,
        category: 'eatingOut',
        payerId: 'ana',
        split: {
          kind: 'itemised',
          bill,
          members: [
            { personId: 'p1', memberId: 'ana' },
            { personId: 'p2', memberId: 'marta' },
          ],
        },
        createdAt: NOW,
        updatedAt: NOW,
      }),
    )
  })

  it('edits a working copy and saves it, leaving the draft untouched', async () => {
    const draft = typedBill(['Draft', 'Person'])
    saveDraft(draft)
    renderApp('/households/h1/expenses/e1')
    fireEvent.click(await screen.findByRole('button', { name: 'Edit items' }))

    expect(await screen.findByText(/Editing Pastelaria\./)).toBeInTheDocument()
    // New bill is hidden while editing an expense.
    expect(screen.queryByRole('button', { name: 'New bill' })).toBeNull()
    fireEvent.change(
      screen.getByRole('textbox', { name: 'Name of Person 2' }),
      {
        target: { value: 'Marta R.' },
      },
    )
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    const dialog = await screen.findByRole('dialog', { name: 'Save changes' })
    expect(
      await within(dialog).findByRole('combobox', { name: 'Who is Marta R.?' }),
    ).toHaveValue('marta')
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Save changes' }),
    )

    await screen.findByRole('heading', { level: 1, name: 'Pastelaria' })
    const saved = await withDb((db) => getExpense(db, 'e1'))
    expect(
      saved?.split.kind === 'itemised'
        ? saved.split.bill.people[1]?.name
        : null,
    ).toBe('Marta R.')
    expect(loadDraft()).toEqual(draft)
  })

  it('cancels without saving', async () => {
    renderApp('/split?expense=e1&step=items')
    fireEvent.change(
      await screen.findByRole('textbox', { name: 'Name of Person 2' }),
      { target: { value: 'Nobody' } },
    )
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await screen.findByRole('heading', { level: 1, name: 'Pastelaria' })
    const saved = await withDb((db) => getExpense(db, 'e1'))
    expect(
      saved?.split.kind === 'itemised'
        ? saved.split.bill.people[1]?.name
        : null,
    ).toBe('Marta')
  })
})
