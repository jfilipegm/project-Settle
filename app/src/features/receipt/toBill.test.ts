import { describe, expect, it } from 'vitest'
import { cents, type Cents } from '../../lib/money.ts'
import { createBill } from '../split/billReducer.ts'
import { validateBill, type Bill } from '../split/model.ts'
import { loadTextFixtures } from './fixtures/textFixtures.ts'
import { parseFiscalQr, type FiscalQr } from './fiscalQr.ts'
import type { ParsedItem, ParsedReceipt } from './model.ts'
import { parseReceiptText } from './parse/parseReceiptText.ts'
import { receiptToBill } from './toBill.ts'

function counter(prefix = 'item'): () => string {
  let n = 0
  return () => `${prefix}-${++n}`
}

function current(): Bill {
  const bill = createBill(['alice', 'bob', 'old-item'])
  return {
    ...bill,
    people: [
      { id: 'alice', name: 'Alice' },
      { id: 'bob', name: 'Bob' },
      { id: 'carol', name: 'Carol' },
    ],
    payerId: 'bob',
    taxMode: 'equal',
    tipMode: 'proportional',
  }
}

function parsedItem(
  name: string,
  total: number,
  needsCheck = false,
): ParsedItem {
  return {
    name,
    quantity: { numerator: 1, denominator: 1 },
    unitPrice: cents(total),
    lineTotal: cents(total),
    needsCheck,
  }
}

function receipt(overrides: Partial<ParsedReceipt>): ParsedReceipt {
  return { items: [parsedItem('Bitoque', 950)], warnings: [], ...overrides }
}

function qrOf(text: string): FiscalQr {
  const result = parseFiscalQr(text)
  if (!result.ok) {
    throw new Error(`Not a fiscal QR: ${text}`)
  }
  return result.qr
}

const amount = (value: number) => ({ kind: 'amount', value: value as Cents })
const NONE = amount(0)

describe('receiptToBill', () => {
  it('keeps the people, payer and modes, and assigns every item to everyone', () => {
    const { bill } = receiptToBill(
      receipt({
        items: [parsedItem('Bitoque', 950), parsedItem('Imperial', 320)],
        total: cents(1270),
      }),
      undefined,
      current(),
      counter(),
    )
    expect(bill.people).toEqual(current().people)
    expect(bill.payerId).toBe('bob')
    expect(bill.taxMode).toBe('equal')
    expect(bill.tipMode).toBe('proportional')
    expect(bill.items).toEqual([
      {
        id: 'item-1',
        name: 'Bitoque',
        quantity: { numerator: 1, denominator: 1 },
        unitPrice: 950,
        assignees: [
          { personId: 'alice', weight: 1 },
          { personId: 'bob', weight: 1 },
          { personId: 'carol', weight: 1 },
        ],
      },
      expect.objectContaining({ id: 'item-2', name: 'Imperial' }),
    ])
    expect(validateBill(bill)).toEqual([])
  })

  it('applies no tax to a PT receipt, where IVA is included', () => {
    const { bill } = receiptToBill(
      receipt({
        items: [parsedItem('Bitoque', 950), parsedItem('Imperial', 1390)],
        tax: cents(438),
        total: cents(2340),
      }),
      undefined,
      current(),
      counter(),
    )
    expect(bill.tax).toEqual(NONE)
    expect(bill.tip).toEqual(NONE)
    expect(bill.discount).toEqual(NONE)
  })

  it('applies tax and tip to a US receipt, where subtotal + tax + tip = total (R3-I-3)', () => {
    const parsed = parseReceiptText(
      [
        'Burger 12.00',
        'Fries 8.00',
        'Subtotal 20.00',
        'Sales tax 1.60',
        'Total 21.60',
        'Tip 4.00',
        'Total 25.60',
      ].map((text) => ({ text, confidence: 95 })),
    )
    const { bill } = receiptToBill(parsed, undefined, current(), counter())
    expect(bill.tax).toEqual(amount(160))
    expect(bill.tip).toEqual(amount(400))
    expect(bill.discount).toEqual(NONE)
  })

  it('applies the bill discount when it closes the arithmetic', () => {
    const { bill } = receiptToBill(
      receipt({
        items: [parsedItem('Maçãs', 120), parsedItem('Peras', 150)],
        discount: cents(150),
        total: cents(120),
      }),
      undefined,
      current(),
      counter(),
    )
    expect(bill.discount).toEqual(amount(150))
  })

  it('leaves every adjustment at none when none closes the arithmetic', () => {
    const { bill } = receiptToBill(
      receipt({ tax: cents(100), tip: cents(50), total: cents(2000) }),
      undefined,
      current(),
      counter(),
    )
    expect([bill.tax, bill.tip, bill.discount]).toEqual([NONE, NONE, NONE])
  })

  it('tries the combinations in order: tax wins over tip (R2-O-2)', () => {
    const { bill } = receiptToBill(
      receipt({ tax: cents(50), tip: cents(50), total: cents(1000) }),
      undefined,
      current(),
      counter(),
    )
    expect(bill.tax).toEqual(amount(50))
    expect(bill.tip).toEqual(NONE)
    expect(bill.taxMode).toBe('equal')
    expect(bill.tipMode).toBe('proportional')
  })

  it('never applies an adjustment that fails validateBill', () => {
    // A proportional tip on a zero items subtotal would be invalid.
    const { bill } = receiptToBill(
      receipt({
        items: [parsedItem('Oferta', 0)],
        tip: cents(200),
        total: cents(200),
      }),
      undefined,
      current(),
      counter(),
    )
    expect(bill.tip).toEqual(NONE)
    expect(validateBill(bill)).toEqual([])
  })

  it('keeps the first 100 of 101 items, with itemsTruncated', () => {
    const items = Array.from({ length: 101 }, (_, i) =>
      parsedItem(`Item ${i}`, 100),
    )
    const { bill, summary } = receiptToBill(
      receipt({ items, total: cents(10100) }),
      undefined,
      current(),
      counter(),
    )
    expect(bill.items).toHaveLength(100)
    expect(summary.warnings).toContain('itemsTruncated')
    expect(validateBill(bill)).toEqual([])
  })

  it('cuts a 70-character name to 60', () => {
    const { bill } = receiptToBill(
      receipt({ items: [parsedItem('x'.repeat(70), 100)] }),
      undefined,
      current(),
      counter(),
    )
    expect(bill.items[0]?.name).toBe('x'.repeat(60))
  })

  it('never splits a surrogate pair when cutting a name', () => {
    const { bill } = receiptToBill(
      receipt({ items: [parsedItem(`${'x'.repeat(59)}😀 tail`, 100)] }),
      undefined,
      current(),
      counter(),
    )
    expect(bill.items[0]?.name).toBe('x'.repeat(59))
    expect(validateBill(bill)).toEqual([])
  })

  it('makes an item 1 × its line total when its quantity is out of range', () => {
    const { bill } = receiptToBill(
      receipt({
        items: [
          {
            name: 'Parafusos',
            quantity: { numerator: 20000, denominator: 1 },
            unitPrice: cents(1),
            lineTotal: cents(20000),
            needsCheck: false,
          },
        ],
      }),
      undefined,
      current(),
      counter(),
    )
    expect(bill.items[0]).toMatchObject({
      quantity: { numerator: 1, denominator: 1 },
      unitPrice: 20000,
    })
  })

  it('gives a receipt with no items one empty item, so the bill stays valid', () => {
    const { bill } = receiptToBill(
      receipt({ items: [], total: cents(320) }),
      undefined,
      current(),
      counter(),
    )
    expect(bill.items).toEqual([
      expect.objectContaining({ name: '', unitPrice: 0 }),
    ])
    expect(validateBill(bill)).toEqual([])
  })

  it('lists the flagged items by id', () => {
    const { summary } = receiptToBill(
      receipt({
        items: [
          parsedItem('Sopa', 250, true),
          parsedItem('Pão', 120),
          parsedItem('Vinho', 600, true),
        ],
      }),
      undefined,
      current(),
      counter(),
    )
    expect(summary.flaggedItemIds).toEqual(['item-1', 'item-3'])
  })
})

describe('receiptToBill: the trusted total and the summary (D12, D15)', () => {
  const QR = 'A:509442013*D:FS*F:20260928*H:JJ3PKKP3-123*N:8.57*O:53.50'

  it('trusts the fiscal QR total, and warns when the printed one differs', () => {
    const { summary } = receiptToBill(
      receipt({
        total: cents(5300),
        merchantTaxId: '123456789',
        date: '2026-09-01',
      }),
      qrOf(QR),
      current(),
      counter(),
    )
    expect(summary).toMatchObject({
      total: 5350,
      totalSource: 'qr',
      merchantTaxId: '509442013',
      date: '2026-09-28',
      ivaTotal: 857,
    })
    expect(summary.warnings).toContain('totalMismatchQr')
  })

  it('uses the printed total without a QR', () => {
    const { summary } = receiptToBill(
      receipt({ merchant: 'Tasca', total: cents(950), date: '2026-09-28' }),
      undefined,
      current(),
      counter(),
    )
    expect(summary).toEqual({
      merchant: 'Tasca',
      date: '2026-09-28',
      total: 950,
      totalSource: 'printed',
      warnings: [],
      flaggedItemIds: [],
    })
  })

  it('drops noTotal when the QR supplies the total', () => {
    const { summary } = receiptToBill(
      receipt({ warnings: ['noTotal'] }),
      qrOf('A:509442013*F:20260928*O:9.50'),
      current(),
      counter(),
    )
    expect(summary.warnings).toEqual([])
    expect(summary.total).toBe(950)
  })

  it('keeps noTotal when there is no total at all', () => {
    const { summary } = receiptToBill(
      receipt({ warnings: ['noTotal'] }),
      undefined,
      current(),
      counter(),
    )
    expect(summary.warnings).toEqual(['noTotal'])
    expect(summary.total).toBeUndefined()
  })

  it('carries the credit-note warning from the QR', () => {
    const { summary } = receiptToBill(
      receipt({ total: cents(950) }),
      qrOf('A:509442013*D:NC*F:20260928*O:9.50'),
      current(),
      counter(),
    )
    expect(summary.warnings).toEqual(['creditNote'])
  })

  it('warns when the receipt’s currency differs from the region’s (D18)', () => {
    const run = (regionCurrency: 'EUR' | 'GBP') =>
      receiptToBill(
        receipt({ currencyHint: 'GBP', total: cents(950) }),
        undefined,
        current(),
        counter(),
        { regionCurrency },
      ).summary
    expect(run('EUR').warnings).toEqual(['currencyDiffers'])
    expect(run('GBP').warnings).toEqual([])
    expect(run('GBP').currency).toBe('GBP')
  })
})

describe('receiptToBill on every text fixture', () => {
  it.each(
    loadTextFixtures().map((fixture) => [fixture.name, fixture] as const),
  )('%s gives a valid bill', (_, fixture) => {
    const { bill } = receiptToBill(
      parseReceiptText(fixture.lines),
      undefined,
      current(),
      counter(),
    )
    expect(validateBill(bill)).toEqual([])
  })
})
