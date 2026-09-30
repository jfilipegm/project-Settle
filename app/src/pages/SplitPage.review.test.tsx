/**
 * The review step after a receipt import (M2 remediation, CP4): the gap
 * can't pass silently (R12), one click adds the difference (R13), an
 * unread receipt imports its total (R14), an incomplete read is called
 * out (R15), and lines a cut left out are shown until they're confirmed
 * (R24). With a fake importer and the real bill conversion.
 */
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RegionProvider } from '../app/RegionProvider.tsx'
import { cents } from '../lib/money.ts'
import { parseFiscalQr, type FiscalQr } from '../features/receipt/fiscalQr.ts'
import type {
  ImportOptions,
  ImportResult,
} from '../features/receipt/importReceipt.ts'
import type { ParsedItem, ParsedReceipt } from '../features/receipt/model.ts'
import { parseReceiptText } from '../features/receipt/parse/parseReceiptText.ts'
import {
  ReceiptImportContext,
  type ImportReceiptFn,
} from '../features/receipt/receiptImport.ts'
import { RECEIPT_STORAGE_KEY } from '../features/receipt/receiptStore.ts'
import { receiptToBill } from '../features/receipt/toBill.ts'
import { SplitPage } from './SplitPage.tsx'

/**
 * The waits' limit: the fake import is instant, but when the real-OCR
 * tests load the machine in the same run, a render can take over the
 * default 1 s.
 */
const LOADED = { timeout: 10_000 }

/**
 * Each test's limit, above the waits': vitest's default 5 s would cut a
 * test off while one of its waits still had time left.
 */
vi.setConfig({ testTimeout: 30_000 })

let copied = ''
beforeEach(() => {
  copied = ''
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: (text: string) => {
        copied = text
        return Promise.resolve()
      },
    },
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

function qr(total: string): FiscalQr {
  const parsed = parseFiscalQr(
    `A:123456789*B:999999990*C:PT*D:FS*F:20260928*I1:PT*O:${total}`,
  )
  if (!parsed.ok) throw new Error('not a fiscal QR')
  return parsed.qr
}

function item(name: string, total: number): ParsedItem {
  return {
    name,
    quantity: { numerator: 1, denominator: 1 },
    unitPrice: cents(total),
    lineTotal: cents(total),
    needsCheck: false,
  }
}

/** An importer that reads `receipt` (and its QR) with the real conversion. */
function importing(receipt: ParsedReceipt, fiscal?: FiscalQr) {
  return vi.fn<ImportReceiptFn>((_file, options: ImportOptions) => {
    const { bill, summary } = receiptToBill(
      receipt,
      fiscal,
      options.currentBill,
      options.nextId,
    )
    const result: ImportResult = { ok: true, bill, summary }
    return Promise.resolve(result)
  })
}

/** Items 12,40 € short of a 20,00 € QR total. */
const SHORT: ParsedReceipt = {
  items: [item('Pão', 500), item('Queijo', 260)],
  warnings: [],
}

/** M-I-7's counterexample (CP2): 20,00 left out to match 10,00. */
const CUT = parseReceiptText(
  ['Pão 4,00', 'Queijo 6,00', 'Vinho 20,00', '----------'].map((text) => ({
    text,
    confidence: 95,
  })),
)

function renderPage(importReceipt: ImportReceiptFn) {
  return render(
    <RegionProvider>
      <ReceiptImportContext value={importReceipt}>
        <SplitPage />
      </ReceiptImportContext>
    </RegionProvider>,
  )
}

async function scan(importReceipt: ImportReceiptFn) {
  const view = renderPage(importReceipt)
  fireEvent.change(screen.getByLabelText('Choose file'), {
    target: { files: [new File(['r'], 'r.jpg', { type: 'image/jpeg' })] },
  })
  await waitFor(() => expect(queryPanel()).toBeInTheDocument(), LOADED)
  return view
}

const plain = (text: string | null | undefined) =>
  (text ?? '')
    .replace(/[\u00a0\u202f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
const queryPanel = () => screen.queryByRole('region', { name: 'Receipt check' })
const panel = () => screen.getByRole('region', { name: 'Receipt check' })
/** The status paragraphs' text, the decorative icons left out. */
const status = () =>
  Array.from(
    within(panel()).getByRole('status').querySelectorAll('p'),
    (paragraph) => plain(paragraph.textContent).replace(/^[✓⚠]\s*/, ''),
  ).join(' ')
const result = () => screen.getByRole('region', { name: 'Who owes what' })
const prices = () =>
  screen
    .getAllByRole('textbox', { name: /^Item \d+ Unit price$/ })
    .map((input) => (input as HTMLInputElement).value)
const price = (n: number, value: string) => {
  fireEvent.change(
    screen.getByRole('textbox', { name: `Item ${String(n)} Unit price` }),
    { target: { value } },
  )
}
const copy = async () => {
  fireEvent.click(
    within(result()).getByRole('button', { name: 'Copy as text' }),
  )
  await waitFor(() => expect(copied).not.toBe(''), LOADED)
  return copied
}

const GAP =
  'These totals don’t match the receipt: the items add up to 7,60 €, 12,40 € less than the receipt’s 20,00 €.'

describe('R12: the gap shows in the result', () => {
  it('shows the gap above the totals, links to the check, and copies it', async () => {
    await scan(importing(SHORT, qr('20.00')))
    expect(plain(result().textContent)).toContain(GAP)
    expect(
      within(result()).getByRole('link', { name: 'Go to the receipt check' }),
    ).toHaveAttribute('href', '#receipt-check-heading')
    expect(plain(await copy())).toContain(GAP)
  })

  it('shows nothing on a match, or with no receipt', async () => {
    const view = await scan(importing(SHORT, qr('7.60')))
    expect(plain(result().textContent)).not.toContain('match the receipt')
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(plain(result().textContent)).not.toContain('⚠')
    view.unmount()
  })
})

describe('R13: add the difference in one click', () => {
  it('adds a flagged item shared by everyone, and the check matches', async () => {
    const view = await scan(importing(SHORT, qr('20.00')))
    fireEvent.click(
      within(panel()).getByRole('button', {
        name: /^Add the difference \(12,40\s€\) as an item$/,
      }),
    )
    expect(prices()).toEqual(['5,00', '2,60', '12,40'])
    expect(screen.getByRole('textbox', { name: 'Item 3 Name' })).toHaveValue(
      'Not read from the receipt',
    )
    expect(screen.getByText('Item 3: check this line')).toBeInTheDocument()
    expect(status()).toBe('Matches the receipt total.')
    expect(plain(result().textContent)).not.toContain(GAP)

    // The flag survives a reload.
    view.unmount()
    renderPage(importing(SHORT))
    expect(screen.getByText('Item 3: check this line')).toBeInTheDocument()
  })

  it('still closes with a fixed tip', async () => {
    await scan(importing(SHORT, qr('20.00')))
    fireEvent.change(screen.getByRole('textbox', { name: 'Tip amount' }), {
      target: { value: '1,00' },
    })
    fireEvent.click(
      within(panel()).getByRole('button', { name: /Add the difference/ }),
    )
    expect(status()).toBe('Matches the receipt total.')
  })

  it('offers a sentence instead with a percentage tip', async () => {
    await scan(importing(SHORT, qr('20.00')))
    const tip = screen.getByRole('group', { name: 'Tip' })
    fireEvent.click(within(tip).getByRole('radio', { name: 'Percentage' }))
    fireEvent.change(
      screen.getByRole('textbox', { name: 'Tip percentage (%)' }),
      { target: { value: '10' } },
    )
    expect(
      within(panel()).queryByRole('button', { name: /Add the difference/ }),
    ).not.toBeInTheDocument()
    expect(plain(panel().textContent)).toContain(
      'Add the missing items, or change the tax or tip to an amount, to match the receipt.',
    )
  })

  it('isn’t offered when the items add up to more, or at 100 items', async () => {
    const view = await scan(importing(SHORT, qr('5.00')))
    expect(
      within(panel()).queryByRole('button', { name: /Add the difference/ }),
    ).not.toBeInTheDocument()
    view.unmount()
    localStorage.clear()

    const hundred = Array.from({ length: 100 }, (_, i) =>
      item(`Item ${String(i)}`, 1),
    )
    await scan(importing({ items: hundred, warnings: [] }, qr('9.99')))
    expect(
      within(panel()).queryByRole('button', { name: /Add the difference/ }),
    ).not.toBeInTheDocument()
  })
})

describe('R14: no item read, but a QR total', () => {
  it('imports the total as one item, says so, and editing it clears the flag', async () => {
    await scan(importing({ items: [], warnings: [] }, qr('12.70')))
    expect(prices()).toEqual(['12,70'])
    expect(status()).toBe(
      'None of the items could be read. The receipt’s total was added as one item: split it as it is, or type the items in.',
    )
    expect(screen.getByText('Item 1: check this line')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('textbox', { name: 'Item 1 Name' }), {
      target: { value: 'Jantar' },
    })
    expect(
      screen.queryByText('Item 1: check this line'),
    ).not.toBeInTheDocument()
    expect(status()).toBe('Matches the receipt total.')
  })
})

describe('R15: an incomplete read is called out', () => {
  it('says how little was read under 80 %, and the plain gap at or over it', async () => {
    const view = await scan(importing(SHORT, qr('20.00')))
    expect(status()).toBe(
      'Only 7,60 € of the receipt’s 20,00 € was read. Add the missing items, or add the difference as one item.',
    )
    const saved = localStorage.getItem(RECEIPT_STORAGE_KEY)
    price(1, '14,00')
    // 16,60 of 20,00: 83 %.
    expect(status()).toBe(
      'Items add up to 16,60 €, 3,40 € less than the receipt.',
    )
    // Computed live: the saved summary doesn't change.
    expect(localStorage.getItem(RECEIPT_STORAGE_KEY)).toBe(saved)
    view.unmount()
  })

  it('never counts the “Not read from the receipt” item', async () => {
    await scan(
      importing(
        {
          items: [item('Pão', 500), item('Not read from the receipt', 1100)],
          warnings: [],
        },
        qr('20.00'),
      ),
    )
    expect(status()).toContain('Only 5,00 € of the receipt’s 20,00 € was read.')
  })
})

describe('R24: lines left out by a cut', () => {
  const LEFT_OUT =
    '1 line was left out of this receipt to match its total. Check them before settling up.'

  it('shows the cut, not a plain match, in the panel and the result', async () => {
    const view = await scan(importing(CUT, qr('10.00')))
    expect(prices()).toEqual(['4,00', '6,00'])
    expect(status()).toBe(
      'Matches after leaving out 1 line read below the items as the receipt’s footer. Check they aren’t items:',
    )
    expect(
      plain(
        within(panel()).getByRole('list', { name: 'Lines left out' })
          .textContent,
      ),
    ).toBe('Vinho 20,00 €')
    expect(plain(result().textContent)).toContain(LEFT_OUT)
    expect(plain(await copy())).toContain(LEFT_OUT)

    // It survives an edit to an item, and a reload.
    fireEvent.change(screen.getByRole('textbox', { name: 'Item 1 Name' }), {
      target: { value: 'Pão de forma' },
    })
    view.unmount()
    renderPage(importing(CUT))
    expect(plain(result().textContent)).toContain(LEFT_OUT)
  })

  it('“They aren’t items” gives the plain match, for good', async () => {
    const view = await scan(importing(CUT, qr('10.00')))
    fireEvent.click(
      within(panel()).getByRole('button', { name: 'They aren’t items' }),
    )
    expect(status()).toBe('Matches the receipt total.')
    expect(plain(result().textContent)).not.toContain('left out')
    view.unmount()
    renderPage(importing(CUT))
    expect(status()).toBe('Matches the receipt total.')
  })

  it('“Put them back” adds them as flagged items, and the gap shows instead', async () => {
    await scan(importing(CUT, qr('10.00')))
    fireEvent.click(
      within(panel()).getByRole('button', { name: 'Put them back' }),
    )
    expect(prices()).toEqual(['4,00', '6,00', '20,00'])
    expect(screen.getByText('Item 3: check this line')).toBeInTheDocument()
    expect(status()).toBe(
      'Items add up to 30,00 €, 20,00 € more than the receipt.',
    )
    expect(plain(result().textContent)).toContain(
      'These totals don’t match the receipt: the items add up to 30,00 €, 20,00 € more than the receipt’s 10,00 €.',
    )
    expect(plain(result().textContent)).not.toContain('left out')
  })

  it('hides “Put them back” when the lines wouldn’t fit', async () => {
    const many = Array.from({ length: 99 }, (_, i) =>
      item(`I${String(i)}`, 100),
    )
    await scan(
      importing(
        {
          ...CUT,
          // Two trailing lines near the total, cut to close 99,00.
          items: [...many, item('Vinho', 9800), item('Queijo', 9901)],
          itemsEndedBy: 'separator',
        },
        qr('99.00'),
      ),
    )
    expect(
      within(panel()).queryByRole('list', { name: 'Lines left out' }),
    ).toBeInTheDocument()
    expect(
      within(panel()).queryByRole('button', { name: 'Put them back' }),
    ).not.toBeInTheDocument()
  })

  it('keeps the live status and the list after an edit breaks the match', async () => {
    await scan(importing(CUT, qr('10.00')))
    const followUp =
      '1 line was left out below the items as the receipt’s footer. Check they aren’t items:'

    price(2, '6,50')
    expect(status()).toBe(
      `Items add up to 10,50 €, 0,50 € more than the receipt. ${followUp}`,
    )
    expect(
      within(panel()).getByRole('list', { name: 'Lines left out' }),
    ).toBeInTheDocument()
    const text = plain(result().textContent)
    expect(text.indexOf('These totals don’t match')).toBeLessThan(
      text.indexOf('was left out'),
    )
    expect(plain(await copy())).toContain('was left out of this receipt')

    price(2, '5,50')
    expect(
      within(panel()).getByRole('button', { name: /Add the difference/ }),
    ).toBeInTheDocument()

    // An item nobody shares: the bill can't be split.
    const sharedBy = () =>
      screen.getByRole('group', { name: 'Item 2: Shared by' })
    for (const person of ['Person 1', 'Person 2']) {
      fireEvent.click(within(sharedBy()).getByRole('button', { name: person }))
    }
    expect(status()).toBe(
      `Fix the bill’s errors to compare it with the receipt. ${followUp}`,
    )
    for (const person of ['Person 1', 'Person 2']) {
      fireEvent.click(within(sharedBy()).getByRole('button', { name: person }))
    }

    price(2, '6,00')
    expect(status()).toContain('Matches after leaving out 1 line')
  })

  it('shows neither notice after a new import without a cut', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const importReceipt = vi
      .fn<ImportReceiptFn>()
      .mockImplementationOnce(importing(CUT, qr('10.00')))
      .mockImplementationOnce(importing(SHORT, qr('7.60')))
    await scan(importReceipt)
    fireEvent.change(screen.getByLabelText('Choose file'), {
      target: { files: [new File(['r'], 'r.jpg', { type: 'image/jpeg' })] },
    })
    await waitFor(() => expect(prices()).toEqual(['5,00', '2,60']), LOADED)
    expect(status()).toBe('Matches the receipt total.')
    expect(plain(result().textContent)).not.toContain('⚠')
  })
})

describe('the review step’s accessibility', () => {
  it('labels its buttons, and puts the notices in the result as text', async () => {
    await scan(importing(CUT, qr('10.00')))
    for (const name of ['They aren’t items', 'Put them back']) {
      expect(within(panel()).getByRole('button', { name })).toBeVisible()
    }
    // The icon is decoration; the notice is text inside the result region.
    const notice = within(result()).getByText(/was left out of this receipt/)
    expect(notice.textContent).toContain('1 line was left out')
    expect(result()).toContainElement(notice)
  })
})
