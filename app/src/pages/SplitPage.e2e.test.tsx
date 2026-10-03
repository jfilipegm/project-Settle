/**
 * End to end through the UI: a real 12-item restaurant bill split between
 * three people, typed in as a user would (M1); and a scanned receipt, read
 * by the real parser, split between three people (M2, CP5). The expected totals were computed
 * by hand from the plan's split algorithm, independently of the engine.
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
import { createPaddleReader } from '../features/receipt/paddleReader.ts'
import { parseFiscalQr } from '../features/receipt/fiscalQr.ts'
import sample1 from '../features/receipt/fixtures/receipts/01-pt-restaurante-qr.expected.json'
import {
  importReceipt,
  type ImportDeps,
} from '../features/receipt/importReceipt.ts'
import type { TextLine } from '../features/receipt/model.ts'
import { ReceiptImportContext } from '../features/receipt/receiptImport.ts'
import { ReceiptImportProvider } from '../features/receipt/ReceiptImportProvider.tsx'
import { SplitPage } from './SplitPage.tsx'

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
  Reflect.deleteProperty(navigator, 'clipboard')
})

const PEOPLE = ['Ana', 'Rui', 'Maria'] as const
type Who = (typeof PEOPLE)[number]

// name, quantity, unit price, who shares it (weights default to 1).
const RECEIPT: [string, string, string, Who[]][] = [
  ['Bacalhau à Brás', '1', '14,50', ['Ana']],
  ['Bitoque', '1', '12,90', ['Rui']],
  ['Polvo à lagareiro', '1', '18,50', ['Maria']],
  ['Salada mista', '1', '4,50', ['Ana', 'Rui', 'Maria']],
  ['Pão e azeitonas', '1', '3,20', ['Ana', 'Rui', 'Maria']],
  ['Vinho da casa', '1', '12,00', ['Ana', 'Rui']], // 2 : 1, set below
  ['Água', '1', '2,80', ['Maria']],
  ['Sumo de laranja', '2', '3,20', ['Rui']],
  ['Batatas fritas', '1', '3,90', ['Rui', 'Maria']],
  ['Arroz de tomate', '1', '5,50', ['Ana', 'Maria']],
  ['Café', '3', '0,90', ['Ana', 'Rui', 'Maria']],
  ['Pudim', '1', '4,20', ['Ana', 'Rui']],
]

function plain(text: string | null | undefined): string {
  return (text ?? '').replace(/[\u00a0\u202f]/g, ' ')
}

function type(name: string, value: string) {
  fireEvent.change(screen.getByRole('textbox', { name }), {
    target: { value },
  })
}

function setSharedBy(item: number, who: readonly Who[]) {
  const group = screen.getByRole('group', { name: `Item ${item}: Shared by` })
  for (const person of PEOPLE) {
    const chip = within(group).getByRole('button', { name: person })
    const pressed = chip.getAttribute('aria-pressed') === 'true'
    if (pressed !== who.includes(person)) {
      fireEvent.click(chip)
    }
  }
}

// About 60 UI interactions, each re-rendering the whole page: roughly 2 s
// locally, but more than Vitest's 5 s default on a slower CI runner.
const E2E_TIMEOUT_MS = 30_000

describe('Split page, end to end', () => {
  it(
    'splits a 12-item receipt between 3 people',
    async () => {
      const writeText = vi.fn().mockResolvedValue(undefined)
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText },
      })
      render(
        <RegionProvider>
          <ReceiptImportProvider>
            <SplitPage />
          </ReceiptImportProvider>
        </RegionProvider>,
      )

      // Three people; Ana (the first) paid.
      fireEvent.click(screen.getByRole('button', { name: 'Add a person' }))
      PEOPLE.forEach((name, index) => {
        type(`Name of Person ${index + 1}`, name)
      })

      RECEIPT.forEach(([name, quantity, price, who], index) => {
        const item = index + 1
        if (item > 1) {
          fireEvent.click(screen.getByRole('button', { name: 'Add item' }))
        }
        type(`Item ${item} Name`, name)
        type(`Item ${item} Quantity`, quantity)
        type(`Item ${item} Unit price`, price)
        setSharedBy(item, who)
      })

      // The wine is shared 2 : 1 between Ana and Rui.
      fireEvent.click(
        screen.getByRole('button', {
          name: "Increase Ana's share of Vinho da casa",
        }),
      )

      // A 10 % tip, split by what each person had, and 5,00 € off.
      const tip = screen.getByRole('group', { name: 'Tip' })
      fireEvent.click(within(tip).getByRole('radio', { name: 'Percentage' }))
      type('Tip percentage (%)', '10')
      type('Discount amount', '5,00')

      const result = screen.getByRole('region', { name: 'Who owes what' })
      // Items 91,10 € + tip 9,11 € − discount 5,00 € = 95,21 €.
      const terms = within(result).getAllByRole('term')
      const values = within(result).getAllByRole('definition')
      expect(
        terms.map(
          (term, i) => `${term.textContent} ${plain(values[i]?.textContent)}`,
        ),
      ).toEqual([
        'Items subtotal 91,10 €',
        'Tip 9,11 €',
        'Discount −5,00 €',
        'Bill total 95,21 €',
      ])

      // Exact shares: Ana 3220,70, Rui 3220,70, Maria 3079,61 cents. Floors
      // sum to 9519, and the 2 leftover cents go to the largest remainders
      // (Ana and Rui, .697 each; Maria has .606).
      const cards = within(result)
        .getAllByRole('heading', { level: 3 })
        .filter((heading) => heading.textContent !== 'Settle up')
        .map((heading) =>
          plain(
            Array.from(heading.children, (span) => span.textContent).join(' '),
          ),
        )
      expect(cards).toEqual(['Ana 32,21 €', 'Rui 32,21 €', 'Maria 30,79 €'])
      expect(3221 + 3221 + 3079).toBe(9521)

      const settleUp = within(result)
        .getAllByRole('listitem')
        .map((item) => plain(item.textContent))
        .filter((text) => text.includes(' owes '))
      expect(settleUp).toEqual([
        'Rui owes Ana 32,21 €',
        'Maria owes Ana 30,79 €',
      ])

      fireEvent.click(
        within(result).getByRole('button', { name: 'Copy as text' }),
      )
      await waitFor(() => {
        expect(within(result).getByRole('status')).toHaveTextContent('Copied.')
      })
      expect(plain(writeText.mock.calls[0]?.[0] as string)).toBe(
        [
          'Bill total: 95,21 €',
          '',
          'Ana: 32,21 €',
          'Rui: 32,21 €',
          'Maria: 30,79 €',
          '',
          'Rui owes Ana 32,21 €',
          'Maria owes Ana 30,79 €',
        ].join('\n'),
      )
    },
    E2E_TIMEOUT_MS,
  )
})

// Sample 1's real OCR transcript (Tesseract.js 7, por + eng, after the
// clean-up), one `[c=NN] text` line per recognised line.
const SAMPLE_1_OCR = Object.values(
  import.meta.glob<string>(
    '../features/receipt/fixtures/receipts/01-pt-restaurante-qr.ocr.txt',
    { query: '?raw', import: 'default', eager: true },
  ),
)[0]

function ocrLines(text: string): TextLine[] {
  return text
    .split('\n')
    .map((line) => /^\[c=(\d+)\] (.*)$/.exec(line))
    .filter((match) => match !== null)
    .map((match) => ({ text: match[2] ?? '', confidence: Number(match[1]) }))
}

describe('Scan to split, end to end (M2)', () => {
  it(
    'imports sample 1 with the real parser, then splits it between 3 people',
    async () => {
      const lines = ocrLines(SAMPLE_1_OCR ?? '')
      expect(lines.length).toBeGreaterThan(20)
      const qr = parseFiscalQr(sample1.qr)
      if (!qr.ok) throw new Error('sample 1 has no fiscal QR payload')

      // Fake decoding and QR scanning; the reader, the parser, the import
      // and the bill conversion are the real ones.
      const deps: ImportDeps = {
        decode: (file) =>
          Promise.resolve({
            ok: true,
            source: {
              pages: [{ width: 1, height: 1, data: new Uint8ClampedArray(4) }],
              textLayer: lines,
              file: { name: file.name, type: file.type, size: file.size },
            },
          }),
        // A text layer is parsed with no OCR: no worker starts.
        reader: createPaddleReader({
          createBackend: () => {
            throw new Error('no OCR in this test')
          },
        }),
        scanQr: () => Promise.resolve(qr.qr),
      }
      render(
        <RegionProvider>
          <ReceiptImportContext
            value={(file, options) => importReceipt(file, deps, options)}
          >
            <SplitPage />
          </ReceiptImportContext>
        </RegionProvider>,
      )

      fireEvent.change(screen.getByLabelText('Choose file'), {
        target: {
          files: [new File(['jpeg'], 'sample-1.jpg', { type: 'image/jpeg' })],
        },
      })

      const check = await screen.findByRole('region', { name: 'Receipt check' })
      expect(within(check).getByRole('status')).toHaveTextContent(
        'Matches the receipt total.',
      )
      expect(plain(check.textContent)).toContain(
        '20,00 € (from the fiscal QR code)',
      )
      const items = screen
        .getAllByRole('textbox', { name: /^Item \d+ Name$/ })
        .map((input) => (input as HTMLInputElement).value)
      expect(items).toEqual([
        'Imperial',
        'Bitoque',
        'Salada Mista',
        'Café',
        'Água das Pedras',
      ])

      // Three people; Ana (the first) paid.
      fireEvent.click(screen.getByRole('button', { name: 'Add a person' }))
      PEOPLE.forEach((name, index) => {
        type(`Name of Person ${index + 1}`, name)
      })
      setSharedBy(1, ['Ana', 'Rui', 'Maria']) // Imperial, 2 × 1,60
      setSharedBy(2, ['Rui']) // Bitoque 9,50
      setSharedBy(3, ['Ana', 'Rui', 'Maria']) // Salada Mista 4,20
      setSharedBy(4, ['Ana', 'Maria']) // Café, 2 × 0,80
      setSharedBy(5, ['Maria']) // Água das Pedras 1,50

      // By hand, in cents: Ana 320/3 + 140 + 80 = 326.67, Rui 320/3 + 950
      // + 140 = 1196.67, Maria 320/3 + 140 + 80 + 150 = 476.67. Floors sum
      // to 1998; the 2 leftover cents go to the largest remainders, all
      // equal, so to the first people: Ana and Rui.
      const result = screen.getByRole('region', { name: 'Who owes what' })
      const cards = within(result)
        .getAllByRole('heading', { level: 3 })
        .filter((heading) => heading.textContent !== 'Settle up')
        .map((heading) =>
          plain(
            Array.from(heading.children, (span) => span.textContent).join(' '),
          ),
        )
      expect(cards).toEqual(['Ana 3,27 €', 'Rui 11,97 €', 'Maria 4,76 €'])
      expect(327 + 1197 + 476).toBe(2000)
      const settleUp = within(result)
        .getAllByRole('listitem')
        .map((item) => plain(item.textContent))
        .filter((text) => text.includes(' owes '))
      expect(settleUp).toEqual([
        'Rui owes Ana 11,97 €',
        'Maria owes Ana 4,76 €',
      ])
      expect(within(check).getByRole('status')).toHaveTextContent(
        'Matches the receipt total.',
      )
    },
    E2E_TIMEOUT_MS,
  )
})
