import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { REGION_STORAGE_KEY, type Region } from '../app/region.ts'
import { RegionProvider } from '../app/RegionProvider.tsx'
import { ReceiptImportProvider } from '../features/receipt/ReceiptImportProvider.tsx'
import { createBill } from '../features/split/billReducer.ts'
import { DRAFT_STORAGE_KEY, saveDraft } from '../features/split/draft.ts'
import { SplitPage } from './SplitPage.tsx'
import {
  inRouter,
  openEditors,
  showStep,
  wideScreen,
} from '../test/splitSteps.tsx'

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
  Reflect.deleteProperty(navigator, 'clipboard')
})

/** jsdom has no Clipboard API: install a stub `writeText`. */
function stubClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  })
}

function renderSplit(region?: Region) {
  if (region) {
    localStorage.setItem(REGION_STORAGE_KEY, JSON.stringify(region))
  }
  // The split beside the items, on Who had what (harness, L4-I2).
  wideScreen(vi.spyOn)
  const view = render(
    inRouter(
      <RegionProvider>
        <ReceiptImportProvider>
          <SplitPage />
        </ReceiptImportProvider>
      </RegionProvider>,
    ),
  )
  showStep('Who had what')
  return view
}

/** Intl separates the amount and symbol with a no-break space. */
function plain(text: string | null): string {
  return (text ?? '').replace(/[\u00a0\u202f]/g, ' ')
}

function resultSection() {
  // Beside the items on a wide screen (harness, L4-I2).
  showStep('Who had what')
  return screen.getByRole('region', { name: 'Who owes what' })
}

/** Each person's card heading, as "Name total". */
function totals(): string[] {
  return within(resultSection())
    .getAllByRole('heading', { level: 3 })
    .filter((heading) => heading.textContent !== 'Settle up')
    .map((heading) =>
      plain(
        Array.from(heading.children)
          .map((span) => span.textContent)
          .join(' '),
      ),
    )
}

function textbox(name: string) {
  openEditors()
  return screen.getByRole('textbox', { name })
}

function type(name: string, value: string) {
  fireEvent.change(textbox(name), { target: { value } })
}

function chip(name: string, item = 1) {
  openEditors()
  const group = screen.getByRole('group', { name: `Item ${item}: Shared by` })
  return within(group).getByRole('button', { name })
}

describe('Split page', () => {
  it('opens on a valid fresh bill with a zero result', () => {
    renderSplit()

    expect(
      screen.getByRole('heading', { level: 1, name: 'Split a bill' }),
    ).toBeInTheDocument()
    expect(totals()).toEqual(['Person 1 0,00 €', 'Person 2 0,00 €'])
  })

  it('adds, edits and removes items', () => {
    renderSplit()

    type('Item 1 Unit price', '10,00')
    expect(totals()).toEqual(['Person 1 5,00 €', 'Person 2 5,00 €'])

    fireEvent.click(screen.getByRole('button', { name: 'Add item' }))
    expect(textbox('Item 2 Name')).toHaveFocus()
    type('Item 2 Name', 'Wine')
    type('Item 2 Quantity', '2')
    type('Item 2 Unit price', '3,50')
    expect(
      plain(screen.getAllByText(/Line total/)[1]?.textContent ?? ''),
    ).toContain('7,00 €')
    expect(totals()).toEqual(['Person 1 8,50 €', 'Person 2 8,50 €'])

    fireEvent.click(screen.getByRole('button', { name: 'Remove Wine' }))
    expect(
      screen.queryByRole('textbox', { name: 'Item 2 Name' }),
    ).not.toBeInTheDocument()
    expect(totals()).toEqual(['Person 1 5,00 €', 'Person 2 5,00 €'])
  })

  it('shows an invalid price error and never changes the result', () => {
    renderSplit()
    type('Item 1 Unit price', '10,00')

    type('Item 1 Unit price', '12,5,0')

    expect(textbox('Item 1 Unit price')).toHaveValue('12,5,0')
    expect(textbox('Item 1 Unit price')).toHaveAccessibleDescription(
      'Enter an amount, like 12,50',
    )
    expect(totals()).toEqual(['Person 1 5,00 €', 'Person 2 5,00 €'])

    type('Item 1 Unit price', '12,505')
    expect(textbox('Item 1 Unit price')).toHaveAccessibleDescription(
      'Use at most 2 decimal places',
    )
    expect(totals()).toEqual(['Person 1 5,00 €', 'Person 2 5,00 €'])
  })

  it('shows typed errors for inputs past the limits', () => {
    renderSplit()

    type('Item 1 Unit price', '1000000,01')
    expect(plain(screen.getByText(/^At most 1/).textContent)).toBe(
      'At most 1 000 000,00 €',
    )
    type('Item 1 Unit price', '-3')
    expect(textbox('Item 1 Unit price')).toHaveAccessibleDescription(
      "Can't be negative",
    )

    type('Item 1 Quantity', '0')
    expect(textbox('Item 1 Quantity')).toHaveAccessibleDescription(
      'Quantity must be more than 0 and at most 10000',
    )
    type('Item 1 Quantity', '0,0001')
    expect(textbox('Item 1 Quantity')).toHaveAccessibleDescription(
      'Use at most 3 decimal places',
    )
    type('Item 1 Quantity', '1,0000')
    expect(textbox('Item 1 Quantity')).not.toHaveAccessibleDescription()
  })

  it('updates totals when chips and shares change', () => {
    renderSplit()
    type('Item 1 Unit price', '10,00')

    expect(chip('Person 2')).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(chip('Person 2'))
    expect(chip('Person 2')).toHaveAttribute('aria-pressed', 'false')
    expect(totals()).toEqual(['Person 1 10,00 €', 'Person 2 0,00 €'])

    fireEvent.click(chip('Person 2'))
    fireEvent.click(
      screen.getByRole('button', {
        name: "Increase Person 1's share of Item 1",
      }),
    )
    expect(totals()).toEqual(['Person 1 6,67 €', 'Person 2 3,33 €'])
  })

  it('switches adjustments between amount and percentage, and between modes', () => {
    renderSplit()
    type('Item 1 Unit price', '20,00')
    fireEvent.click(chip('Person 2'))
    fireEvent.click(screen.getByRole('button', { name: 'Add item' }))
    type('Item 2 Unit price', '10,00')
    fireEvent.click(chip('Person 1', 2))
    // Person 1 has 20,00 €, Person 2 has 10,00 €.

    const tip = screen.getByRole('group', { name: 'Tip' })
    fireEvent.click(within(tip).getByRole('radio', { name: 'Percentage' }))
    type('Tip percentage (%)', '10')
    expect(totals()).toEqual(['Person 1 22,00 €', 'Person 2 11,00 €'])

    fireEvent.click(within(tip).getByRole('radio', { name: 'Equally' }))
    expect(totals()).toEqual(['Person 1 21,50 €', 'Person 2 11,50 €'])

    fireEvent.click(within(tip).getByRole('radio', { name: 'Amount' }))
    expect(totals()).toEqual(['Person 1 20,00 €', 'Person 2 10,00 €'])
    type('Tip amount', '1,00')
    expect(totals()).toEqual(['Person 1 20,50 €', 'Person 2 10,50 €'])

    type('Discount amount', '3,00')
    expect(totals()).toEqual(['Person 1 18,50 €', 'Person 2 9,50 €'])
  })

  it('updates the settle-up when the payer changes', () => {
    renderSplit()
    type('Name of Person 1', 'Ana')
    type('Item 1 Unit price', '10,00')

    const settleUp = () =>
      plain(
        within(resultSection()).getAllByRole('listitem').at(-1)?.textContent ??
          '',
      )
    expect(settleUp()).toBe('Person 2 owes Ana 5,00 €')

    fireEvent.click(
      within(screen.getByRole('group', { name: 'Who paid?' })).getByRole(
        'radio',
        { name: 'Person 2' },
      ),
    )
    expect(settleUp()).toBe('Ana owes Person 2 5,00 €')
  })

  it('reads and shows amounts in the region, e.g. en-GB / GBP', () => {
    renderSplit({ locale: 'en-GB', currency: 'GBP' })

    type('Item 1 Unit price', '12.50')
    expect(totals()).toEqual(['Person 1 £6.25', 'Person 2 £6.25'])

    type('Item 1 Unit price', '£12.50')
    expect(textbox('Item 1 Unit price')).not.toHaveAccessibleDescription()

    type('Item 1 Unit price', '€12,50')
    expect(textbox('Item 1 Unit price')).toHaveAccessibleDescription(
      'Enter an amount, like 12.50',
    )
    expect(totals()).toEqual(['Person 1 £6.25', 'Person 2 £6.25'])
  })

  it('copies the result as text', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    stubClipboard(writeText)
    renderSplit()
    type('Item 1 Unit price', '10,00')

    fireEvent.click(screen.getByRole('button', { name: 'Copy as text' }))

    await waitFor(() => {
      expect(within(resultSection()).getByRole('status')).toHaveTextContent(
        'Copied.',
      )
    })
    expect(plain(writeText.mock.calls[0]?.[0] as string)).toBe(
      [
        'Bill total: 10,00 €',
        '',
        'Person 1: 5,00 €',
        'Person 2: 5,00 €',
        '',
        'Person 2 owes Person 1 5,00 €',
      ].join('\n'),
    )
  })

  it('reports a failed copy', async () => {
    stubClipboard(vi.fn().mockRejectedValue(new Error('denied')))
    renderSplit()

    fireEvent.click(screen.getByRole('button', { name: 'Copy as text' }))

    await waitFor(() => {
      expect(within(resultSection()).getByRole('status')).toHaveTextContent(
        "Couldn't copy. Your browser blocked it.",
      )
    })
  })

  it('shows validation errors instead of the result, linked to their fields', () => {
    renderSplit()
    fireEvent.click(chip('Person 1'))
    fireEvent.click(chip('Person 2'))

    expect(
      within(resultSection()).queryByRole('heading', { level: 3 }),
    ).not.toBeInTheDocument()
    const link = within(resultSection()).getByRole('link', { name: 'Item 1' })
    const target = document.getElementById(
      link.getAttribute('href')?.slice(1) ?? '',
    )
    expect(target).toHaveAccessibleName('Item 1: Shared by')
    expect(resultSection()).toHaveTextContent('Choose who shares this item')
    expect(
      screen.queryByRole('button', { name: 'Copy as text' }),
    ).not.toBeInTheDocument()
  })

  it('renders a saved draft with out-of-range values as editable errors', () => {
    const bill = createBill(['p1', 'p2', 'i1'])
    saveDraft({
      ...bill,
      items: [
        {
          ...bill.items[0]!,
          unitPrice: 1.5 as never,
          assignees: [{ personId: 'p1', weight: 0 }],
        },
      ],
    })

    renderSplit()

    expect(resultSection()).toHaveTextContent('Fix these to see the split')
    expect(resultSection()).toHaveTextContent(
      'Shares are whole numbers from 1 to 99',
    )
    expect(textbox('Item 1 Unit price')).toHaveAccessibleDescription(
      /Enter an amount from 0 to/,
    )

    openEditors()
    fireEvent.click(screen.getByText('Shares', { selector: 'summary' }))
    fireEvent.click(
      screen.getByRole('button', {
        name: "Increase Person 1's share of Item 1",
      }),
    )
    type('Item 1 Unit price', '4,00')
    expect(totals()).toEqual(['Person 1 4,00 €', 'Person 2 0,00 €'])
  })

  it('renders a saved draft whose line total would overflow', () => {
    const bill = createBill(['p1', 'p2', 'i1'])
    saveDraft({
      ...bill,
      items: [
        {
          ...bill.items[0]!,
          unitPrice: 9_000_000_000_000_000 as never,
          quantity: { numerator: 10, denominator: 1 },
        },
      ],
    })

    renderSplit()

    expect(resultSection()).toHaveTextContent('Fix these to see the split')
    expect(screen.getByText(/Line total/)).toHaveTextContent('—')
  })

  it('asks before starting a new bill', () => {
    renderSplit()
    type('Item 1 Unit price', '10,00')
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)

    fireEvent.click(screen.getByRole('button', { name: 'New bill' }))
    expect(confirm).toHaveBeenCalled()
    expect(totals()).toEqual(['Person 1 5,00 €', 'Person 2 5,00 €'])

    confirm.mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: 'New bill' }))
    expect(totals()).toEqual(['Person 1 0,00 €', 'Person 2 0,00 €'])
    expect(textbox('Item 1 Unit price')).toHaveValue('')
    expect(
      JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY) ?? ''),
    ).toMatchObject({ version: 1 })
    expect(
      screen.getByText(
        'This bill is saved on this device until you start a new one.',
      ),
    ).toBeInTheDocument()
  })

  it('resets the tax, tip and discount inputs on a new bill', () => {
    renderSplit()
    type('Item 1 Unit price', '20,00')
    // Tax and discount stay "amount" across the new bill, so their inputs
    // aren't remounted by a kind change: the path that kept stale text.
    type('Tax amount', '10,00')
    type('Discount amount', 'abc')
    expect(textbox('Discount amount')).toHaveAccessibleDescription(
      'Enter an amount, like 12,50',
    )
    const tip = screen.getByRole('group', { name: 'Tip' })
    fireEvent.click(within(tip).getByRole('radio', { name: 'Percentage' }))
    type('Tip percentage (%)', '10')
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    fireEvent.click(screen.getByRole('button', { name: 'New bill' }))

    expect(textbox('Tax amount')).toHaveValue('')
    expect(textbox('Discount amount')).toHaveValue('')
    expect(textbox('Discount amount')).not.toHaveAccessibleDescription()
    expect(textbox('Tip amount')).toHaveValue('')
    expect(totals()).toEqual(['Person 1 0,00 €', 'Person 2 0,00 €'])
  })

  it('changes the number of people', () => {
    renderSplit()

    fireEvent.click(screen.getByRole('button', { name: 'Add a person' }))
    expect(
      screen.getByRole('group', { name: 'Number of people' }),
    ).toHaveTextContent('3')
    expect(textbox('Name of Person 3')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Remove Person 1' }))
    expect(
      screen.queryByRole('textbox', { name: 'Name of Person 3' }),
    ).not.toBeInTheDocument()
    expect(totals()).toHaveLength(2)
  })

  it('labels every input and marks chips with aria-pressed', () => {
    renderSplit()
    fireEvent.click(screen.getByRole('button', { name: 'Add item' }))

    for (const input of [
      ...screen.getAllByRole('textbox'),
      ...screen.getAllByRole('radio'),
    ]) {
      expect(input).toHaveAccessibleName()
    }
    for (const button of within(
      screen.getByRole('group', { name: 'Item 2: Shared by' }),
    ).getAllByRole('button')) {
      expect(button).toHaveAttribute('aria-pressed')
    }
  })
})
