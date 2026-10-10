/**
 * Portuguese rendering (M3 plan, S11, acceptance targets layer 3): each
 * page in Portuguese with no English left, Settings' options asserted
 * exactly, and every message the plain modules build.
 */
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import { RegionProvider } from '../app/RegionProvider.tsx'
import { AppRoutes } from '../app/router.tsx'
import { DEFAULT_REGION } from '../app/region.ts'
import { ReceiptCheck } from '../features/receipt/components/ReceiptCheck.tsx'
import { ReceiptLines } from '../features/receipt/components/ReceiptLines.tsx'
import { ROLE_KEYS } from '../features/receipt/lineReview.ts'
import {
  photoAdvice,
  readErrorMessage,
  readerSupportNote,
  warningMessage,
} from '../features/receipt/messages.ts'
import type {
  LineRole,
  PhotoIssue,
  ReadErrorCode,
  ReceiptSummary,
  ReceiptWarning,
  ReviewLine,
} from '../features/receipt/model.ts'
import { ReceiptImportProvider } from '../features/receipt/ReceiptImportProvider.tsx'
import { checkReceipt } from '../features/receipt/reconcile.ts'
import { receiptNotices } from '../features/receipt/review.ts'
import { createBill } from '../features/split/billReducer.ts'
import {
  amountInputMessage,
  billErrorFieldLabel,
  billErrorMessage,
  ratioInputMessage,
} from '../features/split/components/fields.ts'
import { resultAsText } from '../features/split/format.ts'
import {
  displayName,
  type Bill,
  type BillError,
} from '../features/split/model.ts'
import { computeSplit } from '../features/split/split.ts'
import { cents } from '../lib/money.ts'
import { LANGUAGE_STORAGE_KEY } from './language.ts'
import { LanguageProvider } from './LanguageProvider.tsx'
import { translator } from './t.ts'
import { english, shownText } from '../test/portuguese.ts'

const pt = translator('pt')

beforeEach(() => {
  localStorage.setItem(LANGUAGE_STORAGE_KEY, 'pt')
})

function renderAt(path: string) {
  return render(
    <LanguageProvider>
      <RegionProvider>
        <ReceiptImportProvider>
          <MemoryRouter initialEntries={[path]}>
            <AppRoutes />
          </MemoryRouter>
        </ReceiptImportProvider>
      </RegionProvider>
    </LanguageProvider>,
  )
}

describe('the English sentinels', () => {
  it('catch English, as whole words only', () => {
    expect(english('Split a bill')).toEqual(['Split'])
    expect(english('2,00 € less than')).toEqual(['less'])
    expect(english('Dividir uma conta, Mais, Tema')).toEqual([])
  })
})

describe('every page in Portuguese', () => {
  it.each(['/', '/split', '/household', '/settings', '/nowhere'])(
    '%s shows no English',
    (path) => {
      const { container } = renderAt(path)
      expect(english(shownText(container))).toEqual([])
      expect(document.documentElement.lang).toBe('pt-PT')
    },
  )
})

describe('Settings in Portuguese', () => {
  const options = (label: string) =>
    within(screen.getByRole('combobox', { name: label }))
      .getAllByRole('option')
      .map((option) => option.textContent)

  it('labels every option of every select exactly', () => {
    renderAt('/settings')

    expect(options('Idioma')).toEqual(['Sistema', 'English', 'Português'])
    expect(options('Tema')).toEqual(['Sistema', 'Claro', 'Escuro'])
    expect(options('Formato dos números')).toEqual([
      'Português (Portugal)',
      'Inglês (Reino Unido)',
      'Inglês (EUA)',
    ])
    expect(options('Moeda')).toEqual([
      'Euro (€)',
      'Libra esterlina (£)',
      'Dólar americano ($)',
    ])
  })

  it('labels the navigation and the theme toggle exactly', () => {
    renderAt('/settings')
    const nav = screen.getByRole('navigation', { name: 'Principal' })

    expect(
      within(nav)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Dividir', 'Casa', 'Definições'])
    expect(
      screen.getByRole('button', {
        name: 'Tema: sistema. Mudar para claro.',
      }),
    ).toHaveTextContent('Tema: Sistema')
  })
})

describe('the split page in Portuguese', () => {
  it('names the adjustments and their hints exactly', () => {
    renderAt('/split?step=items')

    expect(screen.getByRole('group', { name: 'Imposto' })).toHaveTextContent(
      'Só o imposto que ainda não está incluído nos preços. Os preços em Portugal já incluem o IVA.',
    )
    expect(screen.getByRole('group', { name: 'Gorjeta' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Desconto' })).toHaveTextContent(
      'Dividido em proporção ao que cada pessoa consumiu.',
    )
    expect(screen.getByLabelText('Valor do imposto')).toBeInTheDocument()
    expect(
      screen.getByRole('radiogroup', { name: 'Dividir a gorjeta' }),
    ).toBeInTheDocument()
  })
})

const bill: Bill = {
  ...createBill(['p1', 'p2', 'i1']),
  items: [
    {
      id: 'i1',
      name: '',
      quantity: { numerator: 1, denominator: 1 },
      unitPrice: cents(1000),
      assignees: [
        { personId: 'p1', weight: 1 },
        { personId: 'p2', weight: 1 },
      ],
    },
  ],
}

describe('the plain modules in Portuguese', () => {
  const ERRORS: BillError[] = [
    {
      code: 'unassignedItem',
      field: { kind: 'item', itemId: 'i1', part: 'assignees' },
    },
    {
      code: 'discountAboveSubtotal',
      field: { kind: 'adjustment', adjustment: 'discount' },
    },
    {
      code: 'proportionalWithZeroSubtotal',
      field: { kind: 'adjustment', adjustment: 'tax' },
    },
    { code: 'limitExceeded', field: { kind: 'people' } },
    { code: 'limitExceeded', field: { kind: 'items' } },
    { code: 'limitExceeded', field: { kind: 'person', personId: 'p1' } },
    {
      code: 'amountOutOfRange',
      field: { kind: 'item', itemId: 'i1', part: 'unitPrice' },
    },
    {
      code: 'quantityOutOfRange',
      field: { kind: 'item', itemId: 'i1', part: 'quantity' },
    },
    {
      code: 'percentOutOfRange',
      field: { kind: 'adjustment', adjustment: 'tip' },
    },
    {
      code: 'shareOutOfRange',
      field: { kind: 'share', itemId: 'i1', personId: 'p2' },
    },
    { code: 'invalidReference', field: { kind: 'payer' } },
  ]

  it.each(
    ERRORS.map(
      (error) => [`${error.code} on ${error.field.kind}`, error] as const,
    ),
  )('validation message: %s', (_name, error) => {
    const message = billErrorMessage(pt, error, bill, DEFAULT_REGION)
    const label = billErrorFieldLabel(pt, error, bill)
    expect(message).not.toBe('')
    expect(english(`${message}\n${label}`)).toEqual([])
  })

  it('names a share error’s field and person in Portuguese', () => {
    expect(billErrorFieldLabel(pt, ERRORS[9] as BillError, bill)).toBe(
      'Artigo 1, parte de Pessoa 2',
    )
  })

  it('writes the input messages in Portuguese', () => {
    const messages = [
      ...(['subCent', 'negative', 'tooLarge', 'empty'] as const).map((e) =>
        amountInputMessage(pt, e, DEFAULT_REGION),
      ),
      ratioInputMessage(pt, 'quantity', 'empty'),
      ratioInputMessage(pt, 'quantity', 'range'),
      ratioInputMessage(pt, 'percent', 'empty'),
      ratioInputMessage(pt, 'percent', 'tooManyDecimals'),
    ]
    expect(english(messages.join('\n'))).toEqual([])
  })

  it.each<ReadErrorCode>([
    'unsupportedType',
    'tooLarge',
    'tooManyPixels',
    'decodeFailed',
    'ocrFailed',
    'assetsUnavailable',
    'readerUnsupported',
    'noItems',
    'cancelled',
  ])('read error: %s', (code) => {
    const message = readErrorMessage(pt, code)
    expect(message).toMatch(/Pode introduzir os artigos abaixo\.$/)
    expect(english(message)).toEqual([])
  })

  it.each<ReceiptWarning>([
    'noTotal',
    'totalMismatchQr',
    'itemsTruncated',
    'currencyDiffers',
    'creditNote',
    'lowConfidence',
  ])('receipt warning: %s', (warning) => {
    expect(english(warningMessage(pt, warning, 'GBP'))).toEqual([])
  })

  it.each<PhotoIssue>([
    'noText',
    'smallText',
    'blurred',
    'dark',
    'faint',
    'glare',
    'cutOff',
    'farAway',
  ])('photo advice: %s', (issue) => {
    expect(english(photoAdvice(pt, issue))).toEqual([])
  })

  it('reader support notes', () => {
    for (const support of ['noWebAssembly', 'noSimd'] as const) {
      // "Lockdown Mode" is Apple's name for it; the note gives the
      // Portuguese one.
      expect(english(readerSupportNote(pt, support))).toEqual([])
    }
  })

  it.each(Object.keys(ROLE_KEYS) as LineRole[])('line role: %s', (role) => {
    expect(english(pt(ROLE_KEYS[role]))).toEqual([])
  })

  it('receipt notices, both directions and both plurals', () => {
    const summary = (removed: number): ReceiptSummary => ({
      total: cents(500),
      warnings: [],
      flaggedItemIds: [],
      removedLines: Array.from({ length: removed }, () => ({
        name: 'X',
        amount: cents(100),
      })),
    })
    const notices = [
      ...receiptNotices(
        pt,
        checkReceipt(bill, summary(1)),
        summary(1),
        DEFAULT_REGION,
      ),
      ...receiptNotices(
        pt,
        checkReceipt(bill, { ...summary(2), total: cents(2000) }),
        summary(2),
        DEFAULT_REGION,
      ),
    ]
    expect(notices).toHaveLength(4)
    expect(notices[0]).toMatch(/a mais do que/)
    expect(notices[1]).toMatch(/^1 linha ficou de fora/)
    expect(notices[2]).toMatch(/a menos do que/)
    expect(notices[3]).toMatch(/^2 linhas ficaram de fora/)
    expect(english(notices.join('\n'))).toEqual([])
  })

  it('the copied summary', () => {
    const outcome = computeSplit(bill, (person, index) =>
      displayName(pt, person, index),
    )
    if (!outcome.ok) throw new Error('invalid test bill')
    const text = resultAsText(pt, outcome.result, DEFAULT_REGION)
    expect(text).toMatch(/^Total da conta: /)
    expect(text).toMatch(/Pessoa 2 deve a Pessoa 1 5,00/)
    expect(text).toContain('Pessoa 2: ')
    expect(english(text)).toEqual([])
  })
})

describe('the receipt panels in Portuguese', () => {
  const summary: ReceiptSummary = {
    merchant: 'Café Central',
    date: '2026-10-08',
    total: cents(2000),
    totalSource: 'qr',
    ivaTotal: cents(300),
    warnings: [
      'noTotal',
      'totalMismatchQr',
      'itemsTruncated',
      'creditNote',
      'lowConfidence',
    ],
    flaggedItemIds: [],
    removedLines: [{ name: 'Troco', amount: cents(50) }],
  }
  const lines: ReviewLine[] = (Object.keys(ROLE_KEYS) as LineRole[]).map(
    (role) => ({ text: `L ${role}`, role, amount: cents(100) }),
  )

  it('shows the receipt check with no English', () => {
    const { container } = render(
      <LanguageProvider>
        <ReceiptCheck
          bill={bill}
          summary={summary}
          imageUrl="blob:x"
          photoIssues={['blurred']}
          lines={lines}
          region={DEFAULT_REGION}
          onDismiss={() => undefined}
          onAddDifference={() => undefined}
          onConfirmRemoved={() => undefined}
          onPutBack={() => undefined}
        />
      </LanguageProvider>,
    )
    const text = shownText(container).replace(/L \w+/g, '')
    expect(english(text)).toEqual([])
    expect(
      screen.getByRole('heading', { name: 'Verificação do talão' }),
    ).toBeInTheDocument()
  })

  it('shows "Review lines" with no English, the bill full too', () => {
    const full: Bill = {
      ...bill,
      items: Array.from({ length: 100 }, (_, n) => ({
        ...(bill.items[0] as Bill['items'][number]),
        id: `i${String(n)}`,
      })),
    }
    for (const which of [bill, full]) {
      const { container, unmount } = render(
        <LanguageProvider>
          <ReceiptLines
            lines={lines}
            bill={which}
            region={DEFAULT_REGION}
            onAddItem={() => undefined}
            onSelectItem={() => undefined}
          />
        </LanguageProvider>,
      )
      const text = shownText(container).replace(/L \w+/g, '')
      expect(english(text)).toEqual([])
      unmount()
    }
  })
})
