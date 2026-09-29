/**
 * The Split page's receipt scan and check (M2 plan, CP4), with a fake
 * importer: the real pipeline is tested in features/receipt.
 */
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RegionProvider } from '../app/RegionProvider.tsx'
import { cents } from '../lib/money.ts'
import type {
  ImportOptions,
  ImportResult,
} from '../features/receipt/importReceipt.ts'
import { readErrorMessage } from '../features/receipt/messages.ts'
import type { ParsedReceipt, ReadErrorCode } from '../features/receipt/model.ts'
import {
  ReceiptImportContext,
  type ImportReceiptFn,
} from '../features/receipt/receiptImport.ts'
import { RECEIPT_STORAGE_KEY } from '../features/receipt/receiptStore.ts'
import { receiptToBill } from '../features/receipt/toBill.ts'
import { createBill } from '../features/split/billReducer.ts'
import { DRAFT_STORAGE_KEY, saveDraft } from '../features/split/draft.ts'
import { SplitPage } from './SplitPage.tsx'

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

const RECEIPT: ParsedReceipt = {
  merchant: 'Restaurante O Cantinho',
  merchantTaxId: '123456789',
  date: '2026-09-28',
  items: [
    {
      name: 'Bitoque',
      quantity: { numerator: 1, denominator: 1 },
      unitPrice: cents(950),
      lineTotal: cents(950),
      needsCheck: false,
    },
    {
      name: 'Imperial',
      quantity: { numerator: 2, denominator: 1 },
      unitPrice: cents(160),
      lineTotal: cents(320),
      needsCheck: true,
    },
  ],
  total: cents(1270),
  warnings: ['lowConfidence'],
}

/** An importer that reads RECEIPT with the real bill conversion. */
function importing(receipt: ParsedReceipt = RECEIPT, imageUrl?: string) {
  return vi.fn<ImportReceiptFn>((_file, options: ImportOptions) => {
    const { bill, summary } = receiptToBill(
      receipt,
      undefined,
      options.currentBill,
      options.nextId,
    )
    const result: ImportResult =
      imageUrl === undefined
        ? { ok: true, bill, summary }
        : { ok: true, bill, summary, imageUrl }
    return Promise.resolve(result)
  })
}

function failing(code: ReadErrorCode) {
  return vi.fn<ImportReceiptFn>(() =>
    Promise.resolve({ ok: false, error: { code } }),
  )
}

function renderPage(importReceipt: ImportReceiptFn) {
  return render(
    <RegionProvider>
      <ReceiptImportContext value={importReceipt}>
        <SplitPage />
      </ReceiptImportContext>
    </RegionProvider>,
  )
}

const receiptFile = () =>
  new File(['receipt'], 'receipt.jpg', { type: 'image/jpeg' })

function choose(file: File = receiptFile()) {
  fireEvent.change(screen.getByLabelText('Choose file'), {
    target: { files: [file] },
  })
}

function plain(text: string | null | undefined): string {
  return (text ?? '').replace(/[\u00a0\u202f]/g, ' ')
}

const panel = () => screen.getByRole('region', { name: 'Receipt check' })
const queryPanel = () => screen.queryByRole('region', { name: 'Receipt check' })
const itemNames = () =>
  screen
    .getAllByRole('textbox', { name: /^Item \d+ Name$/ })
    .map((input) => (input as HTMLInputElement).value)

describe('Scanning a receipt on the Split page', () => {
  it('fills the items, shows the check panel, and compares it live', async () => {
    const importReceipt = importing()
    renderPage(importReceipt)

    choose()

    await waitFor(() => expect(queryPanel()).toBeInTheDocument())
    expect(itemNames()).toEqual(['Bitoque', 'Imperial'])
    expect(
      within(panel()).getByRole('heading', { name: 'Receipt check' }),
    ).toHaveFocus()
    expect(plain(panel().textContent)).toContain('Restaurante O Cantinho')
    expect(plain(panel().textContent)).toContain(
      '12,70 € (read from the receipt)',
    )
    expect(within(panel()).getByRole('status')).toHaveTextContent(
      'Matches the receipt total.',
    )
    expect(
      within(panel()).getByRole('list', { name: 'Warnings' }),
    ).toHaveTextContent('This photo was hard to read.')

    // The file and the options the importer was given.
    const [file, options] = importReceipt.mock.calls[0] ?? []
    expect(file?.name).toBe('receipt.jpg')
    expect(options?.regionCurrency).toBe('EUR')

    fireEvent.change(
      screen.getByRole('textbox', { name: 'Item 1 Unit price' }),
      {
        target: { value: '9,00' },
      },
    )
    expect(plain(within(panel()).getByRole('status').textContent)).toBe(
      '⚠ Items add up to 12,20 €, 0,50 € less than the receipt.',
    )
  })

  it.each<ReadErrorCode>([
    'unsupportedType',
    'tooLarge',
    'tooManyPixels',
    'decodeFailed',
    'ocrFailed',
    'assetsUnavailable',
    'noItems',
    'cancelled',
  ])('shows the %s message and leaves the bill alone', async (code) => {
    saveDraft({
      ...createBill(['p1', 'p2', 'i1']),
      items: [],
    })
    const before = localStorage.getItem(DRAFT_STORAGE_KEY)
    renderPage(failing(code))

    choose()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      readErrorMessage(code),
    )
    expect(readErrorMessage(code)).toMatch(/You can type the items in below\.$/)
    expect(localStorage.getItem(DRAFT_STORAGE_KEY)).toBe(before)
    expect(queryPanel()).not.toBeInTheDocument()
  })

  it('asks before replacing a bill with content, and declining changes nothing', async () => {
    const importReceipt = importing()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderPage(importReceipt)

    // A fresh bill has no content: no question.
    choose()
    await waitFor(() => expect(queryPanel()).toBeInTheDocument())
    expect(confirm).not.toHaveBeenCalled()

    // Now it has items: the question, and declining keeps everything.
    choose()
    expect(confirm).toHaveBeenCalledWith(
      'Replace the current items with the receipt’s? People stay as they are.',
    )
    expect(importReceipt).toHaveBeenCalledOnce()
    expect(itemNames()).toEqual(['Bitoque', 'Imperial'])

    confirm.mockReturnValue(true)
    choose()
    await waitFor(() => expect(importReceipt).toHaveBeenCalledTimes(2))
    // Let that import finish inside this test.
    await act(async () => {
      await importReceipt.mock.results[1]?.value
    })
  })

  it('shows the phase while reading, and Cancel aborts', async () => {
    let signal: AbortSignal | undefined
    const importReceipt = vi.fn<ImportReceiptFn>(
      (_file, options) =>
        new Promise((resolve) => {
          signal = options.signal
          options.onProgress?.({ phase: 'reading', progress: 0.42 })
          options.signal?.addEventListener('abort', () => {
            resolve({ ok: false, error: { code: 'cancelled' } })
          })
        }),
    )
    const { container } = renderPage(importReceipt)

    choose()

    const status = within(
      screen.getByRole('region', { name: 'Scan a receipt' }),
    ).getByRole('status')
    await act(() => Promise.resolve())
    expect(plain(status.textContent)).toBe('Reading the text… 42%')
    const busyEditor = container.querySelector('[aria-busy="true"]')
    expect(busyEditor).toHaveAttribute('inert')
    expect(
      within(busyEditor as HTMLElement).getByRole('heading', {
        name: 'Items',
        hidden: true,
      }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Choose file')).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(signal?.aborted).toBe(true)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Reading was cancelled.',
    )
    expect(container.querySelector('[inert]')).toBeNull()
    expect(container.querySelector('[aria-busy]')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Items' })).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'Cancel' }),
    ).not.toBeInTheDocument()
  })

  it('marks flagged items until they are edited, and keeps a cleared flag', async () => {
    const view = renderPage(importing())
    choose()
    await waitFor(() => expect(queryPanel()).toBeInTheDocument())

    expect(screen.getByText('Item 2: check this line')).toBeInTheDocument()
    expect(
      screen.queryByText('Item 1: check this line'),
    ).not.toBeInTheDocument()

    // Assigning people isn't an edit to the line.
    fireEvent.click(
      within(
        screen.getByRole('group', { name: 'Item 2: Shared by' }),
      ).getByRole('button', { name: 'Person 1' }),
    )
    expect(screen.getByText('Item 2: check this line')).toBeInTheDocument()

    fireEvent.change(screen.getByRole('textbox', { name: 'Item 2 Quantity' }), {
      target: { value: '3' },
    })
    expect(
      screen.queryByText('Item 2: check this line'),
    ).not.toBeInTheDocument()

    view.unmount()
    renderPage(importing())
    expect(queryPanel()).toBeInTheDocument()
    expect(
      screen.queryByText('Item 2: check this line'),
    ).not.toBeInTheDocument()
  })

  it('keeps the summary across a remount; Dismiss and New bill clear it', async () => {
    const revoke = vi.fn()
    URL.revokeObjectURL = revoke
    const view = renderPage(importing(RECEIPT, 'blob:receipt-1'))
    choose()
    await waitFor(() => expect(queryPanel()).toBeInTheDocument())

    // The image, in memory only.
    fireEvent.click(screen.getByText('Show receipt image'))
    expect(
      screen.getByRole('img', { name: 'The scanned receipt' }),
    ).toHaveAttribute('src', 'blob:receipt-1')
    expect(localStorage.getItem(RECEIPT_STORAGE_KEY)).not.toContain('blob:')

    view.unmount()
    expect(revoke).toHaveBeenCalledWith('blob:receipt-1')
    renderPage(importing())
    expect(plain(panel().textContent)).toContain('Restaurante O Cantinho')
    expect(screen.queryByText('Show receipt image')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(queryPanel()).not.toBeInTheDocument()
    expect(localStorage.getItem(RECEIPT_STORAGE_KEY)).toBeNull()
    expect(itemNames()).toEqual(['Bitoque', 'Imperial'])

    vi.spyOn(window, 'confirm').mockReturnValue(true)
    choose()
    await waitFor(() => expect(queryPanel()).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'New bill' }))
    expect(queryPanel()).not.toBeInTheDocument()
    expect(localStorage.getItem(RECEIPT_STORAGE_KEY)).toBeNull()
  })

  it('ignores a malformed saved summary and keeps the bill', () => {
    saveDraft({
      ...createBill(['p1', 'p2', 'i1']),
      items: [
        {
          id: 'i1',
          name: 'Bitoque',
          quantity: { numerator: 1, denominator: 1 },
          unitPrice: cents(950),
          assignees: [],
        },
      ],
    })
    localStorage.setItem(
      RECEIPT_STORAGE_KEY,
      JSON.stringify({ version: 1, receipt: { warnings: 'lots' } }),
    )
    renderPage(importing())

    expect(queryPanel()).not.toBeInTheDocument()
    expect(itemNames()).toEqual(['Bitoque'])
  })

  it('starts an import when a file is dropped on the section', async () => {
    const importReceipt = importing()
    renderPage(importReceipt)
    const section = screen.getByRole('region', { name: 'Scan a receipt' })
    const file = receiptFile()
    const dataTransfer = { files: [file], types: ['Files'], dropEffect: '' }

    fireEvent.dragEnter(section, { dataTransfer })
    expect(section).toHaveAttribute('data-dragging', 'true')
    fireEvent.drop(section, { dataTransfer })

    expect(section).toHaveAttribute('data-dragging', 'false')
    await waitFor(() => expect(queryPanel()).toBeInTheDocument())
    expect(importReceipt.mock.calls[0]?.[0]).toBe(file)
  })

  it('labels every control, and says the receipt stays on the device', () => {
    renderPage(importing())
    const section = screen.getByRole('region', { name: 'Scan a receipt' })

    const choose = within(section).getByLabelText('Choose file')
    expect(choose).toHaveAttribute('type', 'file')
    expect(choose.getAttribute('accept')).toContain('application/pdf')
    expect(choose.getAttribute('accept')).toContain('image/heic')
    const photo = within(section).getByLabelText('Take photo')
    expect(photo).toHaveAttribute('accept', 'image/*')
    expect(photo).toHaveAttribute('capture', 'environment')
    expect(within(section).getByRole('status')).toBeInTheDocument()
    expect(section).toHaveTextContent(
      'Read on this device. The receipt never leaves your browser.',
    )
  })

  it('stops a running scan when the page is left', async () => {
    let signal: AbortSignal | undefined
    const view = renderPage(
      vi.fn<ImportReceiptFn>((_file, options) => {
        signal = options.signal
        return new Promise(() => undefined)
      }),
    )
    choose()
    await waitFor(() => expect(signal).toBeDefined())

    act(() => {
      view.unmount()
    })
    expect(signal?.aborted).toBe(true)
  })
})
