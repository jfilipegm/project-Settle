/**
 * The row-by-row review (M2.5 plan, P15, CP5) on the Split page, with a
 * fake importer that runs the real parser and bill conversion on invented
 * lines.
 */
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RegionProvider } from '../app/RegionProvider.tsx'
import type {
  ImportOptions,
  ImportResult,
} from '../features/receipt/importReceipt.ts'
import type { TextLine } from '../features/receipt/model.ts'
import { parseReceiptText } from '../features/receipt/parse/parseReceiptText.ts'
import {
  ReceiptImportContext,
  type ImportReceiptFn,
} from '../features/receipt/receiptImport.ts'
import { RECEIPT_STORAGE_KEY } from '../features/receipt/receiptStore.ts'
import { receiptToBill } from '../features/receipt/toBill.ts'
import { DRAFT_STORAGE_KEY } from '../features/split/draft.ts'
import { SplitPage } from './SplitPage.tsx'

const LOADED = { timeout: 10_000 }
vi.setConfig({ testTimeout: 30_000 })

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

/** Invented OCR lines, each with its box on page 0. */
const box = (y: number) => ({ page: 0, x: 10, y, width: 300, height: 20 })
const OCR: TextLine[] = [
  { text: 'Cafe Central', confidence: 95, box: box(10) },
  { text: 'Bica 0,80', confidence: 95, box: box(40) },
  { text: 'Tosta mista 2,50', confidence: 95, box: box(70) },
  { text: 'Taxa de servico 1,00', confidence: 95, box: box(100) },
  { text: 'TOTAL 4,30', confidence: 95, box: box(130) },
]

function importing(lines: TextLine[] = OCR, imageUrl = 'blob:receipt') {
  return vi.fn<ImportReceiptFn>((_file, options: ImportOptions) => {
    const converted = receiptToBill(
      parseReceiptText(lines),
      undefined,
      options.currentBill,
      options.nextId,
    )
    const result: ImportResult = {
      ok: true,
      bill: converted.bill,
      summary: converted.summary,
      imageUrl,
      ...(converted.lines !== undefined && { lines: converted.lines }),
    }
    return Promise.resolve(result)
  })
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

async function scanAndOpenReview(importReceipt: ImportReceiptFn) {
  const view = renderPage(importReceipt)
  fireEvent.change(screen.getByLabelText('Choose file'), {
    target: { files: [new File(['r'], 'r.jpg', { type: 'image/jpeg' })] },
  })
  await waitFor(
    () => expect(screen.getByText('Review lines')).toBeInTheDocument(),
    LOADED,
  )
  fireEvent.click(screen.getByText('Review lines'))
  return view
}

const list = () =>
  screen.getByRole('list', { name: 'Lines read from the receipt' })
const lineButtons = () =>
  within(list()).getAllByRole('button', { pressed: false })
const plain = (text: string | null) =>
  (text ?? '').replace(/[\u00a0\u202f]/g, ' ')

/** jsdom loads no image: give it a size and fire its load. */
function loadImage() {
  const image = screen.getByAltText(
    'The scanned receipt, with a box over each line read',
  )
  Object.defineProperty(image, 'naturalWidth', { value: 400 })
  Object.defineProperty(image, 'naturalHeight', { value: 200 })
  fireEvent.load(image)
  return image
}

describe('Review lines (M2.5, P15)', () => {
  it('lists every line in order, with its role and amount', async () => {
    await scanAndOpenReview(importing())
    expect(
      within(list())
        .getAllByRole('listitem')
        .map((item) => plain(item.textContent)),
    ).toEqual([
      'IgnoredCafe Central',
      'ItemBica 0,800,80 €',
      'ItemTosta mista 2,502,50 €',
      'TipTaxa de servico 1,001,00 €',
      'Total or subtotalTOTAL 4,304,30 €',
    ])
  })

  it('draws a box per line on the image; selecting a line highlights its box and bill row', async () => {
    const { container } = await scanAndOpenReview(importing())
    loadImage()
    const rects = container.querySelectorAll('svg rect')
    expect(rects).toHaveLength(5)
    expect(rects[1]).toHaveAttribute('data-role', 'item')

    fireEvent.click(lineButtons()[2] as HTMLElement)
    expect(
      within(list()).getByRole('button', { pressed: true }),
    ).toHaveTextContent('Tosta mista')
    expect(rects[2]).toHaveAttribute('data-selected', 'true')
    const highlighted = container.querySelector('li[data-highlighted]')
    expect(highlighted).toHaveAttribute('aria-current', 'true')
    expect(
      within(highlighted as HTMLElement).getByDisplayValue('Tosta mista'),
    ).toBeInTheDocument()

    // Selecting it again clears it.
    fireEvent.click(within(list()).getByRole('button', { pressed: true }))
    expect(container.querySelector('li[data-highlighted]')).toBeNull()
  })

  it('adds an ignored line with an amount as a flagged, shared item, and the check follows', async () => {
    // A service charge on a line the parser ignores, after the total.
    await scanAndOpenReview(
      importing([
        { text: 'Bica 0,80', confidence: 95, box: box(10) },
        { text: 'TOTAL 1,80', confidence: 95, box: box(40) },
        { text: 'Couvert 1,00', confidence: 95, box: box(70) },
      ]),
    )
    const panel = screen.getByRole('region', { name: 'Receipt check' })
    expect(within(panel).getByText(/of the receipt’s/)).toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('button', { name: 'Add as item: Couvert 1,00' }),
    )
    expect(
      screen.getByRole('button', { name: 'Added: Couvert 1,00' }),
    ).toBeDisabled()
    const names = screen
      .getAllByRole('textbox', { name: /^Item \d+ Name$/ })
      .map((input) => (input as HTMLInputElement).value)
    expect(names).toEqual(['Bica', 'Couvert'])
    expect(screen.getByText('Item 2: check this line')).toBeInTheDocument()
    expect(
      within(
        screen.getByRole('group', { name: 'Item 2: Shared by' }),
      ).getAllByRole('button', { pressed: true }),
    ).toHaveLength(2)
    expect(
      within(panel).getByText(/Matches the receipt total/),
    ).toBeInTheDocument()
  })

  it('adds a missed line, checking the name and price like the bill editor', async () => {
    await scanAndOpenReview(importing())
    const form = screen.getByRole('group', { name: 'Add a missed line' })
    const add = within(form).getByRole('button', {
      name: 'Add the missed line',
    })
    fireEvent.click(add)
    expect(within(form).getByText('Enter a name')).toBeInTheDocument()
    expect(within(form).getByLabelText('Name')).toHaveAttribute(
      'aria-invalid',
      'true',
    )

    fireEvent.change(within(form).getByLabelText('Name'), {
      target: { value: 'Agua' },
    })
    fireEvent.change(within(form).getByLabelText('Price'), {
      target: { value: '1,234' },
    })
    fireEvent.click(add)
    expect(
      within(form).getByText('Use at most 2 decimal places'),
    ).toBeInTheDocument()

    fireEvent.change(within(form).getByLabelText('Price'), {
      target: { value: '1,20' },
    })
    fireEvent.click(add)
    const names = screen
      .getAllByRole('textbox', { name: /^Item \d+ Name$/ })
      .map((input) => (input as HTMLInputElement).value)
    expect(names.at(-1)).toBe('Agua')
    expect(within(form).getByLabelText('Name')).toHaveValue('')
  })

  it('offers neither action when the bill is at 100 items', async () => {
    const many: TextLine[] = [
      ...Array.from({ length: 100 }, (_, i) => ({
        text: `Artigo ${i + 1} 1,00`,
        confidence: 95,
      })),
      { text: 'TOTAL 100,00', confidence: 95 },
      { text: 'Couvert 1,00', confidence: 95 },
    ]
    await scanAndOpenReview(importing(many))
    expect(
      screen.queryByRole('button', { name: /^Add as item/ }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('group', { name: 'Add a missed line' }),
    ).not.toBeInTheDocument()
    expect(screen.getByText(/the most it can hold/)).toBeInTheDocument()
  })

  it('shows a PDF text layer’s lines as a list, with no image boxes', async () => {
    const { container } = await scanAndOpenReview(
      importing(OCR.map(({ text, confidence }) => ({ text, confidence }))),
    )
    expect(lineButtons()).toHaveLength(5)
    expect(container.querySelector('svg rect')).toBeNull()
    expect(
      screen.queryByAltText(
        'The scanned receipt, with a box over each line read',
      ),
    ).not.toBeInTheDocument()
  })

  it('saves nothing of the review: a reload shows the panel without it', async () => {
    const view = await scanAndOpenReview(importing())
    const saved = `${localStorage.getItem(RECEIPT_STORAGE_KEY)}${localStorage.getItem(DRAFT_STORAGE_KEY)}`
    expect(saved).not.toContain('Tosta mista 2,50')
    expect(saved).not.toContain('"role"')
    view.unmount()
    renderPage(importing())
    expect(
      screen.getByRole('region', { name: 'Receipt check' }),
    ).toBeInTheDocument()
    expect(screen.queryByText('Review lines')).not.toBeInTheDocument()
  })
})
