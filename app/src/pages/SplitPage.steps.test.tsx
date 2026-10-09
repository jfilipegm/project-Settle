/**
 * The split as three steps (M3 plan, S9, CP5.5) and person-first
 * assignment (S10), at phone width unless a test says otherwise.
 */
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RegionProvider } from '../app/RegionProvider.tsx'
import type {
  ImportOptions,
  ImportResult,
} from '../features/receipt/importReceipt.ts'
import type { ParsedReceipt } from '../features/receipt/model.ts'
import {
  ReceiptImportContext,
  type ImportReceiptFn,
} from '../features/receipt/receiptImport.ts'
import {
  RECEIPT_STORAGE_KEY,
  loadReceiptSummary,
} from '../features/receipt/receiptStore.ts'
import { receiptToBill } from '../features/receipt/toBill.ts'
import { createBill } from '../features/split/billReducer.ts'
import { loadDraft, saveDraft } from '../features/split/draft.ts'
import { cents } from '../lib/money.ts'
import { currentStep, showStep, wideScreen } from '../test/splitSteps.tsx'
import { SplitPage } from './SplitPage.tsx'

const LOADED = { timeout: 10_000 }
vi.setConfig({ testTimeout: 30_000 })

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

const RECEIPT: ParsedReceipt = {
  merchant: 'Café Central',
  items: [
    {
      name: 'Bica',
      quantity: { numerator: 1, denominator: 1 },
      unitPrice: cents(80),
      lineTotal: cents(80),
      needsCheck: false,
    },
    {
      name: 'Tosta',
      quantity: { numerator: 1, denominator: 1 },
      unitPrice: cents(250),
      lineTotal: cents(250),
      needsCheck: false,
    },
  ],
  total: cents(330),
  warnings: [],
}

function importing(receipt: ParsedReceipt = RECEIPT) {
  return vi.fn<ImportReceiptFn>((_file, options: ImportOptions) => {
    const { bill, summary } = receiptToBill(
      receipt,
      undefined,
      options.currentBill,
      options.nextId,
    )
    const result: ImportResult = { ok: true, bill, summary }
    return Promise.resolve(result)
  })
}

/** The page in a memory router whose history the test can read and move. */
function renderAt(
  entries: string[] = ['/split'],
  importReceipt: ImportReceiptFn = importing(),
) {
  const router = createMemoryRouter(
    [
      {
        path: '/split',
        element: (
          <RegionProvider>
            <ReceiptImportContext value={importReceipt}>
              <SplitPage />
            </ReceiptImportContext>
          </RegionProvider>
        ),
      },
      { path: '/settings', element: <h1>Settings</h1> },
    ],
    { initialEntries: entries, initialIndex: entries.length - 1 },
  )
  const view = render(<RouterProvider router={router} />)
  const back = async () => {
    await act(async () => {
      await router.navigate(-1)
    })
  }
  const forward = async () => {
    await act(async () => {
      await router.navigate(1)
    })
  }
  const url = () =>
    `${router.state.location.pathname}${router.state.location.search}`
  return { ...view, router, back, forward, url }
}

async function scan() {
  fireEvent.change(screen.getByLabelText('Choose file'), {
    target: { files: [new File(['r'], 'r.jpg', { type: 'image/jpeg' })] },
  })
  await waitFor(
    () =>
      expect(
        screen.getByRole('region', { name: 'Receipt check' }),
      ).toBeInTheDocument(),
    LOADED,
  )
}

const heading = (name: string) => screen.getByRole('heading', { name })
const pricedBill = () => {
  const bill = createBill(['p1', 'p2', 'i1'])
  return {
    ...bill,
    items: bill.items.map((item) => ({ ...item, unitPrice: cents(1000) })),
  }
}

describe('the step in the URL (S9)', () => {
  it('names the three steps, not "Step 1 of 3"', () => {
    renderAt()
    const nav = screen.getByRole('navigation', { name: 'Steps' })
    expect(
      within(nav)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Receipt', 'Who had what', 'The split'])
    expect(nav).not.toHaveTextContent(/of 3/)
  })

  it('opens on Receipt with no saved draft, and writes the step into the URL', async () => {
    const { url } = renderAt()
    expect(currentStep()).toBe('Receipt')
    await waitFor(() => expect(url()).toBe('/split?step=receipt'))
  })

  it('opens a saved fresh bill on Receipt: its one empty item isn’t content (L4-I1)', () => {
    saveDraft(createBill(['p1', 'p2', 'i1']))
    renderAt()
    expect(currentStep()).toBe('Receipt')
  })

  it('opens a saved draft with one priced item on Who had what', () => {
    saveDraft(pricedBill())
    renderAt()
    expect(currentStep()).toBe('Who had what')
  })

  it('keeps the step in the URL over a reload', () => {
    saveDraft(createBill(['p1', 'p2', 'i1']))
    const view = renderAt(['/split?step=split'])
    expect(currentStep()).toBe('The split')
    view.unmount()
    renderAt(['/split?step=split'])
    expect(currentStep()).toBe('The split')
  })

  it('moves between steps with Back and Forward, focusing each heading', async () => {
    const { back, forward, url } = renderAt(['/split?step=receipt'])
    showStep('Who had what')
    expect(url()).toBe('/split?step=items')
    expect(heading('People')).toHaveFocus()
    showStep('The split')
    expect(heading('Who owes what')).toHaveFocus()

    await back()
    expect(url()).toBe('/split?step=items')
    expect(currentStep()).toBe('Who had what')
    expect(heading('People')).toHaveFocus()
    await back()
    expect(currentStep()).toBe('Receipt')
    expect(heading('Scan a receipt')).toHaveFocus()
    await forward()
    expect(currentStep()).toBe('Who had what')
  })

  it('shows only the current step', () => {
    renderAt(['/split?step=receipt'])
    expect(heading('Scan a receipt')).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'People' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Who owes what' })).toBeNull()
  })

  it('goes from Receipt to Who had what with "Type it in"', () => {
    const { url } = renderAt(['/split?step=receipt'])
    fireEvent.click(screen.getByRole('button', { name: 'Type it in' }))
    expect(url()).toBe('/split?step=items')
    expect(heading('People')).toHaveFocus()
    // The fresh bill's one item, ready to fill.
    expect(
      screen.getByRole('textbox', { name: 'Item 1 Name' }),
    ).toBeInTheDocument()
  })

  it('at phone width, "See the split" shows The split on its own', () => {
    const { url } = renderAt(['/split?step=items'])
    expect(
      screen.queryByRole('region', { name: 'Who owes what' }),
    ).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'See the split' }))
    expect(url()).toBe('/split?step=split')
    expect(screen.getByRole('region', { name: 'Who owes what' })).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'People' })).toBeNull()
  })

  it('from 1024 px, shows The split beside the items, live, with no "See the split"', () => {
    wideScreen(vi.spyOn)
    renderAt(['/split?step=items'])
    expect(screen.getByRole('heading', { name: 'People' })).toBeVisible()
    expect(screen.getByRole('region', { name: 'Who owes what' })).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'See the split' }),
    ).not.toBeInTheDocument()
    fireEvent.change(
      screen.getByRole('textbox', { name: 'Item 1 Unit price' }),
      {
        target: { value: '10,00' },
      },
    )
    expect(
      within(screen.getByRole('region', { name: 'Who owes what' })).getByText(
        'Bill total',
      ).nextElementSibling,
    ).toHaveTextContent(/10,00/)
    // The third step is still reachable.
    showStep('The split')
    expect(currentStep()).toBe('The split')
  })

  it('takes an error link on The split to its field on Who had what', () => {
    renderAt(['/split?step=items'])
    const sharedBy = within(
      screen.getByRole('group', { name: 'Item 1: Shared by' }),
    )
    fireEvent.click(sharedBy.getByRole('button', { name: 'Person 1' }))
    fireEvent.click(sharedBy.getByRole('button', { name: 'Person 2' }))
    showStep('The split')

    fireEvent.click(screen.getByRole('link', { name: 'Item 1' }))

    expect(currentStep()).toBe('Who had what')
    expect(
      screen.getByRole('group', { name: 'Item 1: Shared by' }),
    ).toBeVisible()
  })
})

describe('the CI smoke test’s contract (S9, L1-I1), in jsdom', () => {
  it('renders a file input on an empty first load of /split', () => {
    renderAt()
    expect(document.querySelector('input[type=file]')).toBeInTheDocument()
  })

  it('ends an import on Who had what, the check rendered and its heading focused', async () => {
    const { url } = renderAt()
    await scan()
    expect(url()).toBe('/split?step=items')
    expect(document.querySelector('[data-receipt-check]')).toBeInTheDocument()
    expect(heading('Receipt check')).toHaveFocus()
  })
})

describe('person-first assignment (S10)', () => {
  const picker = () => screen.getByRole('group', { name: 'Assign to' })
  const row = (name: RegExp) => screen.getByRole('button', { name })

  async function imported() {
    renderAt()
    await scan()
  }

  it('picks one person at a time, the first by default', async () => {
    await imported()
    const radios = within(picker()).getAllByRole('radio')
    // Each chip: the person's colour and initial (their number when
    // unnamed), and their name.
    expect(radios.map((radio) => radio.closest('label')?.textContent)).toEqual([
      '1Person 1',
      '2Person 2',
    ])
    expect(
      within(picker()).getByRole('radio', { name: 'Person 1' }),
    ).toBeChecked()
  })

  it('toggles the chosen person on an item row, and announces it', async () => {
    await imported()
    fireEvent.click(within(picker()).getByRole('radio', { name: 'Person 2' }))
    const bica = row(/^Bica/)
    expect(bica).toHaveAttribute('aria-pressed', 'true')
    expect(bica).toHaveAccessibleDescription('Shared by Person 1, Person 2')

    fireEvent.click(bica)
    expect(row(/^Bica/)).toHaveAttribute('aria-pressed', 'false')
    expect(row(/^Bica/)).toHaveAccessibleDescription('Shared by Person 1')
    expect(screen.getByText('Person 2 no longer shares Bica')).toHaveAttribute(
      'role',
      'status',
    )
    expect(
      loadDraft()?.items[0]?.assignees.map((a) => a.personId),
    ).toHaveLength(1)

    fireEvent.click(row(/^Bica/))
    expect(row(/^Bica/)).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Person 2 now shares Bica')).toBeInTheDocument()
  })

  it('works from the keyboard: rows are buttons, the picker native radios', async () => {
    await imported()
    // Enter and Space on a native button click it, and arrows move a
    // native radio group; jsdom runs neither, so check the elements.
    const bica = row(/^Bica/)
    expect(bica.tagName).toBe('BUTTON')
    expect(bica).toHaveAttribute('type', 'button')
    bica.focus()
    expect(bica).toHaveFocus()
    for (const radio of within(picker()).getAllByRole('radio')) {
      expect(radio).toHaveAttribute('type', 'radio')
    }
    // One group: arrows move between its radios.
    const names = within(picker())
      .getAllByRole('radio')
      .map((radio) => radio.getAttribute('name'))
    expect(new Set(names).size).toBe(1)
  })

  it('shares an item with everyone in one action', async () => {
    await imported()
    fireEvent.click(row(/^Bica/))
    fireEvent.click(row(/^Bica/)) // Person 1 off then on: still both.
    fireEvent.click(within(picker()).getByRole('radio', { name: 'Person 1' }))
    fireEvent.click(row(/^Tosta/)) // Person 1 off Tosta.
    expect(row(/^Tosta/)).toHaveAccessibleDescription('Shared by Person 2')

    fireEvent.click(screen.getByRole('button', { name: 'Everyone for Tosta' }))
    expect(row(/^Tosta/)).toHaveAccessibleDescription(
      'Shared by Person 1, Person 2',
    )
    expect(
      screen.getByRole('button', { name: 'Everyone for Tosta' }),
    ).toBeDisabled()
    expect(screen.getByText('Everyone shares Tosta')).toBeInTheDocument()
  })

  it('keeps today’s editor behind Edit, and both ways of assigning agree', async () => {
    await imported()
    const edit = screen.getByRole('button', { name: 'Edit Tosta' })
    expect(edit).toHaveAttribute('aria-expanded', 'false')
    expect(
      screen.queryByRole('textbox', { name: 'Item 2 Name' }),
    ).not.toBeInTheDocument()

    fireEvent.click(edit)
    expect(screen.getByRole('button', { name: 'Done Tosta' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    expect(screen.getByRole('textbox', { name: 'Item 2 Name' })).toHaveValue(
      'Tosta',
    )
    const sharedBy = within(
      screen.getByRole('group', { name: 'Item 2: Shared by' }),
    )
    fireEvent.click(sharedBy.getByRole('button', { name: 'Person 1' }))
    // The row reads the same bill: Person 1 (chosen) is off it.
    expect(row(/^Tosta/)).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(row(/^Tosta/))
    expect(sharedBy.getByRole('button', { name: 'Person 1' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('keeps a flagged row’s flag as an icon and words', async () => {
    renderAt(
      ['/split'],
      importing({
        ...RECEIPT,
        items: RECEIPT.items.map((item, i) => ({
          ...item,
          needsCheck: i === 1,
        })),
      }),
    )
    await scan()
    const flag = screen.getByText('Item 2: check this line').parentElement
    expect(flag).toHaveTextContent('Check')
    expect(flag?.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it('keeps focus in a field after the current step’s own link is chosen', async () => {
    renderAt(
      ['/split'],
      importing({
        ...RECEIPT,
        items: RECEIPT.items.map((item, i) => ({
          ...item,
          needsCheck: i === 1,
        })),
      }),
    )
    await scan()
    fireEvent.click(
      within(screen.getByRole('navigation', { name: 'Steps' })).getByRole(
        'link',
        { name: 'Who had what' },
      ),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Edit Tosta' }))
    const name = screen.getByRole('textbox', { name: 'Item 2 Name' })
    name.focus()
    // The first edit clears the flag, which changes the receipt summary.
    fireEvent.change(name, { target: { value: 'Tosta mista' } })
    expect(screen.queryByText('Item 2: check this line')).toBeNull()
    expect(name).toHaveFocus()
  })
})

describe('New bill on every step (S9, M-I-1)', () => {
  const SAVED_HINT =
    'This bill is saved on this device until you start a new one.'

  async function withReceipt(from: 'Who had what' | 'The split') {
    const view = renderAt(['/settings', '/split?step=receipt'])
    await scan()
    showStep(from)
    return view
  }

  it.each(['Who had what', 'The split'] as const)(
    'from %s, asks first, and cancelling changes nothing',
    async (from) => {
      const { url } = await withReceipt(from)
      const bill = localStorage.getItem('settle.bill')
      const receipt = localStorage.getItem(RECEIPT_STORAGE_KEY)
      const before = url()
      const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)

      fireEvent.click(screen.getByRole('button', { name: 'New bill' }))

      expect(confirm).toHaveBeenCalledWith(
        'Start a new bill? This clears the current one.',
      )
      expect(localStorage.getItem('settle.bill')).toBe(bill)
      expect(localStorage.getItem(RECEIPT_STORAGE_KEY)).toBe(receipt)
      expect(url()).toBe(before)
      expect(currentStep()).toBe(from)
      expect(screen.getByText(SAVED_HINT)).toBeInTheDocument()
    },
  )

  it.each([
    ['Who had what', '/split?step=receipt'],
    ['The split', '/split?step=items'],
  ] as const)(
    'from %s, confirming leaves a fresh bill on Receipt, replacing the history entry',
    async (from, entryBefore) => {
      const { url, back } = await withReceipt(from)
      const oldIds = loadDraft()?.people.map((p) => p.id)
      vi.spyOn(window, 'confirm').mockReturnValue(true)

      fireEvent.click(screen.getByRole('button', { name: 'New bill' }))

      // createBill's fresh bill: new ids, two unnamed people, one empty item.
      const fresh = loadDraft()
      expect(fresh?.people.map((p) => p.name)).toEqual(['', ''])
      expect(fresh?.people.map((p) => p.id)).not.toEqual(oldIds)
      expect(fresh?.items).toHaveLength(1)
      expect(fresh?.items[0]).toMatchObject({ name: '', unitPrice: 0 })
      // No receipt summary, check, image or read lines.
      expect(loadReceiptSummary()).toBeNull()
      expect(document.querySelector('[data-receipt-check]')).toBeNull()
      expect(screen.queryByText('Review lines')).toBeNull()
      // Receipt is active, its heading focused, by a replace.
      expect(url()).toBe('/split?step=receipt')
      expect(currentStep()).toBe('Receipt')
      expect(heading('Scan a receipt')).toHaveFocus()
      expect(screen.getByText(SAVED_HINT)).toBeInTheDocument()

      // One Back goes to the entry before the step, never the cleared one
      // (L4-O3), and that entry shows the fresh bill.
      await back()
      expect(url()).toBe(entryBefore)
      expect(loadDraft()?.items[0]).toMatchObject({ name: '', unitPrice: 0 })
      expect(document.querySelector('[data-receipt-check]')).toBeNull()
    },
  )
})
