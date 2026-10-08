/**
 * The stand-in item in two languages (M3 plan, S11, L1-I3, L2-I1): saved in
 * the language of the moment, recognised by its name in either, and scored
 * the same as before.
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { RegionProvider } from '../app/RegionProvider.tsx'
import {
  readRows,
  scoreImage,
  type ExpectedBill,
} from '../features/receipt/accuracy.ts'
import type { ReceiptSummary } from '../features/receipt/model.ts'
import { ReceiptImportProvider } from '../features/receipt/ReceiptImportProvider.tsx'
import { saveReceiptSummary } from '../features/receipt/receiptStore.ts'
import { isUnreadImport, readShare } from '../features/receipt/review.ts'
import { loadDraft, saveDraft } from '../features/split/draft.ts'
import type { Bill, Item } from '../features/split/model.ts'
import { cents } from '../lib/money.ts'
import { SplitPage } from '../pages/SplitPage.tsx'
import { LANGUAGE_STORAGE_KEY } from './language.ts'
import { LanguageProvider } from './LanguageProvider.tsx'
import { isNotReadItemName } from './notRead.ts'
import { catalogue, type Language } from './t.ts'

const STAND_IN = {
  en: catalogue('en').receipt.notReadItem,
  pt: catalogue('pt').receipt.notReadItem,
} as const

function item(id: string, name: string, price: number): Item {
  return {
    id,
    name,
    quantity: { numerator: 1, denominator: 1 },
    unitPrice: cents(price),
    assignees: [{ personId: 'a', weight: 1 }],
  }
}

function bill(...items: Item[]): Bill {
  return {
    people: [
      { id: 'a', name: '' },
      { id: 'b', name: '' },
    ],
    items,
    tax: { kind: 'amount', value: cents(0) },
    taxMode: 'proportional',
    tip: { kind: 'amount', value: cents(0) },
    tipMode: 'proportional',
    discount: { kind: 'amount', value: cents(0) },
    payerId: 'a',
  }
}

const summary = (flagged: string[] = []): ReceiptSummary => ({
  total: cents(2000),
  totalSource: 'qr',
  warnings: [],
  flaggedItemIds: flagged,
})

describe('isNotReadItemName', () => {
  it('recognises either language’s name, and nothing else', () => {
    expect(STAND_IN.en).toBe('Not read from the receipt')
    expect(STAND_IN.pt).toBe('Não lido do talão')
    expect(isNotReadItemName(STAND_IN.en)).toBe(true)
    expect(isNotReadItemName(STAND_IN.pt)).toBe(true)
    expect(isNotReadItemName('Pão')).toBe(false)
    expect(isNotReadItemName(`${STAND_IN.en} 2`)).toBe(false)
  })
})

describe.each(['en', 'pt'] as const)('a %s stand-in', (language: Language) => {
  const name = STAND_IN[language]

  it('scores like the English one: read share, read rows, accuracy', () => {
    const inLanguage = bill(item('p', 'Pão', 500), item('s', name, 1500))
    const inEnglish = bill(item('p', 'Pão', 500), item('s', STAND_IN.en, 1500))

    expect(readShare(inLanguage, summary())).toEqual(
      readShare(inEnglish, summary()),
    )
    expect(readShare(inLanguage, summary())?.read).toBe(500)
    expect(readRows(inLanguage)).toEqual([{ name: 'Pão', amount: 500 }])

    const expected: ExpectedBill = {
      total: cents(2000),
      items: [
        { name: 'Pão', price: cents(500) },
        { name: 'Queijo', price: cents(1500) },
      ],
    }
    expect(scoreImage(inLanguage, summary(), expected)).toEqual(
      scoreImage(inEnglish, summary(), expected),
    )
  })

  it('counts as read once renamed, but not after a price-only edit', () => {
    const renamed = bill(item('p', 'Pão', 500), item('s', 'Queijo', 1500))
    const repriced = bill(item('p', 'Pão', 500), item('s', name, 1400))

    expect(readShare(renamed, summary())?.read).toBe(2000)
    expect(readShare(repriced, summary())?.read).toBe(500)
  })

  it('marks an import that read no item', () => {
    expect(isUnreadImport(bill(item('s', name, 2000)), summary(['s']))).toBe(
      true,
    )
    expect(
      isUnreadImport(bill(item('s', 'Queijo', 2000)), summary(['s'])),
    ).toBe(false)
  })
})

describe('"Add the difference" in Portuguese', () => {
  it('saves the Portuguese stand-in, and an English one is still recognised', () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'pt')
    // A stand-in saved in English, before the switch, and a 5,00 € gap.
    saveDraft(bill(item('p', 'Pão', 500), item('s', STAND_IN.en, 1000)))
    saveReceiptSummary(summary())

    render(
      <LanguageProvider>
        <RegionProvider>
          <ReceiptImportProvider>
            <MemoryRouter>
              <SplitPage />
            </MemoryRouter>
          </ReceiptImportProvider>
        </RegionProvider>
      </LanguageProvider>,
    )
    // 5,00 € of 20,00 € read: the English stand-in isn't counted.
    expect(
      screen.getByText(/Só foram lidos 5,00 € dos 20,00 € do talão\./),
    ).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', {
        name: /^Adicionar a diferença \(5,00\s€\) como artigo$/u,
      }),
    )

    const saved = loadDraft()
    expect(saved?.items.map((i) => i.name)).toEqual([
      'Pão',
      STAND_IN.en,
      STAND_IN.pt,
    ])
    // Both stand-ins are left out: still 5,00 € read.
    expect(saved && readShare(saved, summary())?.read).toBe(500)
  })
})
