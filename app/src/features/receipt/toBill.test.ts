import { describe, expect, it } from 'vitest'
import { cents, type Cents } from '../../lib/money.ts'
import { createBill } from '../split/billReducer.ts'
import { lineTotal, validateBill, type Bill } from '../split/model.ts'
import { loadTextFixtures } from './fixtures/textFixtures.ts'
import { parseFiscalQr, type FiscalQr } from './fiscalQr.ts'
import type { ParsedItem, ParsedReceipt } from './model.ts'
import { parseReceiptText } from './parse/parseReceiptText.ts'
import { checkReceipt } from './reconcile.ts'
import { isNearTotal, receiptToBill } from './toBill.ts'

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

/** A Portuguese fiscal QR code (mainland) with total `total` (`12.40`). */
function ptQr(total: string, region = 'I1:PT'): FiscalQr {
  return qrOf(
    `A:123456789*B:999999990*C:PT*D:FS*F:20260928*${region}*O:${total}`,
  )
}

function item(
  name: string,
  total: number,
  extra: Partial<ParsedItem> = {},
): ParsedItem {
  return { ...parsedItem(name, total), ...extra }
}

/** The bill conversion, its line totals, discount, check and cut record. */
function convert(read: ParsedReceipt, qr?: FiscalQr) {
  const { bill, summary } = receiptToBill(read, qr, current(), counter())
  expect(validateBill(bill)).toEqual([])
  return {
    lines: bill.items.map((entry) => lineTotal(entry)),
    discount: bill.discount,
    check: checkReceipt(bill, summary).status,
    removed: summary.removedLines,
    summary,
  }
}

function text(...lines: string[]): ParsedReceipt {
  return parseReceiptText(lines.map((line) => ({ text: line, confidence: 95 })))
}

describe('R8: unsigned savings lines, decided with the trusted total', () => {
  it('drops the candidates when that closes the total', () => {
    const out = convert(
      receipt({
        items: [
          item('Pasta dentes', 174, { savingsCandidate: cents(175) }),
          item('Queijo', 239, { savingsCandidate: cents(60) }),
        ],
      }),
      ptQr('4.13'),
    )
    expect(out).toMatchObject({
      lines: [174, 239],
      discount: NONE,
      check: 'match',
    })
  })

  it('applies them when that closes the total', () => {
    const out = convert(
      receipt({
        items: [
          item('Fiambre', 200, { savingsCandidate: cents(50) }),
          item('Pão', 100),
        ],
      }),
      ptQr('2.50'),
    )
    expect(out).toMatchObject({ lines: [150, 100], check: 'match' })
  })

  it('applies them first when either reading would close', () => {
    // Dropped, 2,00 closes as it is; applied, 1,50 closes with the tax.
    const { bill } = receiptToBill(
      receipt({
        items: [item('Fiambre', 200, { savingsCandidate: cents(50) })],
        tax: cents(50),
      }),
      ptQr('2.00'),
      current(),
      counter(),
    )
    expect(bill.items.map((entry) => lineTotal(entry))).toEqual([150])
    expect(bill.tax).toEqual(amount(50))
  })

  it('applies them when neither closes, and the mismatch shows', () => {
    const out = convert(
      receipt({
        items: [
          item('Fiambre', 200, { savingsCandidate: cents(50) }),
          item('Pão', 100),
        ],
      }),
      ptQr('9.99'),
    )
    expect(out).toMatchObject({ lines: [150, 100], check: 'mismatch' })
    expect(out.removed).toBeUndefined()
  })

  it('applies them with no trusted total, as before (the no-total case)', () => {
    // The rule-7 receipt of parseReceiptText.test.ts, with no total line.
    const out = convert(
      text(
        'Iogurte Grego 1,99',
        'Desc. Cartão Continente -0,40',
        'Fiambre 2,00',
        'Desconto Cartão 0,50',
        'Pão 1,20',
      ),
    )
    expect(out.lines).toEqual([159, 150, 120])
  })

  it('always applies negative lines', () => {
    expect(
      convert(text('Queijo 3,00', 'Promoção -0,40', 'TOTAL 2,60')).lines,
    ).toEqual([260])
  })

  it('sends a candidate larger than its item to the bill discount when applied (rule 7)', () => {
    const out = convert(
      text('Pão 1,00', 'Leite 0,50', 'Desconto 0,80', 'TOTAL 0,70'),
    )
    expect(out).toMatchObject({
      lines: [100, 50],
      discount: amount(80),
      check: 'match',
    })
  })

  it('never subtracts a candidate’s overflow with the candidates dropped (revision 11)', () => {
    const out = convert(
      text('Pasta dentes 1,74', 'POUPANCA 1,75', 'Leite 1,00'),
      ptQr('2.74'),
    )
    expect(out).toMatchObject({
      lines: [174, 100],
      discount: NONE,
      check: 'match',
    })
  })
})

describe('R9: the QR total ends the items, with structural evidence', () => {
  it('cuts a garbled total line and the tax-table rows after it', () => {
    const out = convert(
      receipt({
        items: [
          item('Pão', 500),
          item('Queijo', 740),
          item('lozal', 1240, { endEvidence: 'totalLike' }),
          item('lVA 23%', 1230, { endEvidence: 'taxTable' }),
        ],
      }),
      ptQr('12.40'),
    )
    expect(out).toMatchObject({ lines: [500, 740], check: 'match' })
    expect(out.removed).toEqual([
      { name: 'lozal', amount: 1240 },
      { name: 'lVA 23%', amount: 1230 },
    ])
  })

  it('cuts on a totalLike match alone, with ordinary lines after it', () => {
    const out = convert(
      receipt({
        items: [
          item('Pão', 500),
          item('Queijo', 740),
          item('lozal', 1240, { endEvidence: 'totalLike' }),
          item('Café', 90),
        ],
      }),
      ptQr('12.40'),
    )
    expect(out).toMatchObject({ lines: [500, 740], check: 'match' })
  })

  it('keeps a first item that equals the total, as the only item', () => {
    const out = convert(
      receipt({
        items: [
          item('Menu', 1240),
          item('lVA 23%', 1230, { endEvidence: 'taxTable' }),
        ],
      }),
      ptQr('12.40'),
    )
    expect(out).toMatchObject({ lines: [1240], check: 'match' })
  })

  it('cuts nothing without a QR total, or when a printed total was found', () => {
    const items = [
      item('Pão', 500),
      item('Queijo', 740),
      item('lozal', 1240, { endEvidence: 'totalLike' }),
      item('lVA 23%', 1230, { endEvidence: 'taxTable' }),
    ]
    expect(convert(receipt({ items, total: cents(1240) })).lines).toHaveLength(
      4,
    )
    expect(
      convert(receipt({ items, total: cents(1240) }), ptQr('12.40')).lines,
    ).toHaveLength(4)
  })
})

describe('R18: the running sum ends the items, with structural evidence', () => {
  it('cuts the tax-table rows after the sum reaches the QR total', () => {
    const out = convert(
      receipt({
        items: [
          item('Pão', 500),
          item('Queijo', 740),
          item('lVA 23%', 1008, { endEvidence: 'taxTable' }),
          item('Base', 232, { endEvidence: 'taxTable' }),
        ],
      }),
      ptQr('12.40'),
    )
    expect(out).toMatchObject({ lines: [500, 740], check: 'match' })
    expect(out.removed).toHaveLength(2)
  })

  it('doesn’t cut when the sum reaches the total only at the last item', () => {
    const out = convert(
      receipt({
        items: [
          item('Pão', 500),
          item('lVA 23%', 300, { endEvidence: 'taxTable' }),
          item('Queijo', 440),
        ],
      }),
      ptQr('12.40'),
    )
    expect(out).toMatchObject({ lines: [500, 300, 440], check: 'match' })
    expect(out.removed).toBeUndefined()
  })

  it('drops nothing when the sum never equals the total', () => {
    const out = convert(
      receipt({
        items: [
          item('Pão', 500),
          item('Queijo', 700),
          item('lVA 23%', 300, { endEvidence: 'taxTable' }),
        ],
      }),
      ptQr('12.40'),
    )
    expect(out).toMatchObject({ lines: [500, 700, 300], check: 'mismatch' })
  })
})

describe('R22: reconciliation, the manual review’s counterexamples', () => {
  const early = [item('Menu', 1000), item('Sobremesa', 500), item('Café', 500)]
  const running = [
    item('Pão', 400),
    item('Queijo', 600),
    item('Café', 300),
    item('Água', 200),
  ]

  it.each([
    ['an early item equal to the total', early, 1000],
    ['an early running sum equal to the total', running, 500],
  ])(
    'keeps everything with %s and a read discount that closes it',
    (_, items, discount) => {
      const out = convert(
        receipt({
          items,
          discount: cents(discount),
          itemsEndedBy: 'separator',
        }),
        ptQr('10.00'),
      )
      expect(out.lines).toHaveLength(items.length)
      expect(out).toMatchObject({ discount: amount(discount), check: 'match' })
      expect(out.removed).toBeUndefined()
    },
  )

  it.each([
    ['misread', early, 900],
    ['misread', running, 400],
    ['missing', early, undefined],
    ['missing', running, undefined],
  ])('cuts nothing when the discount is %s', (_, items, discount) => {
    const out = convert(
      receipt(
        discount === undefined
          ? { items }
          : { items, discount: cents(discount) },
      ),
      ptQr('10.00'),
    )
    expect(out.lines).toHaveLength(items.length)
    expect(out.check).toBe('mismatch')
    expect(out.removed).toBeUndefined()
  })

  it('cuts nothing when the structural evidence is taken away', () => {
    for (const items of [
      [
        item('Pão', 500),
        item('Queijo', 740),
        item('Bolo', 1240),
        item('Café', 1230),
      ],
      [
        item('Pão', 500),
        item('Queijo', 740),
        item('Café', 1008),
        item('Chá', 232),
      ],
    ]) {
      const out = convert(receipt({ items }), ptQr('12.40'))
      expect(out.lines).toHaveLength(4)
      expect(out.check).toBe('mismatch')
    }
  })

  it('never makes a cut that would close only with an adjustment', () => {
    const out = convert(
      receipt({
        items: [
          item('Pão', 500),
          item('Queijo', 640),
          item('lozal', 1240, { endEvidence: 'totalLike' }),
          item('lVA 23%', 1230, { endEvidence: 'taxTable' }),
        ],
        tax: cents(100),
      }),
      ptQr('12.40'),
    )
    expect(out.lines).toHaveLength(4)
    expect(out.check).toBe('mismatch')
  })

  it('never cuts a list that closes whole, even when a prefix closes too', () => {
    const out = convert(
      receipt({
        items: [
          item('Menu', 1000),
          item('lozal', 1000, { endEvidence: 'totalLike' }),
        ],
      }),
      ptQr('20.00'),
    )
    expect(out).toMatchObject({ lines: [1000, 1000], check: 'match' })
    expect(out.removed).toBeUndefined()
  })
})

describe('R23: the footer anchor', () => {
  const lidl = (...footer: ParsedItem[]) => [
    item('Coca Cola', 1000),
    item('Monster', 677),
    ...footer,
  ]

  it('drops the Total and payment lines near the QR total', () => {
    const out = convert(
      receipt({
        items: lidl(item('Tazal', 1877), item('MULT IBANCO', 1677)),
        itemsEndedBy: 'taxTableHeader',
      }),
      ptQr('16.77'),
    )
    expect(out).toMatchObject({ lines: [1000, 677], check: 'match' })
    expect(out.removed).toEqual([
      { name: 'Tazal', amount: 1877 },
      { name: 'MULT IBANCO', amount: 1677 },
    ])
  })

  it('drops the one line above a recognised payment line', () => {
    const out = convert(
      receipt({
        items: [item('Pão', 120), item('Leite', 130), item('Tu.ul', 250)],
        itemsEndedBy: 'payment',
      }),
      ptQr('2.50'),
    )
    expect(out).toMatchObject({ lines: [120, 130], check: 'match' })
  })

  it.each([
    [
      'a trailing amount two digits off',
      lidl(item('Tazal', 1878), item('MULT IBANCO', 1677)),
    ],
    [
      'a third trailing near amount',
      lidl(item('Extra', 1679), item('Tazal', 1877), item('MULT IBANCO', 1677)),
    ],
    [
      'items that don’t close after the drop',
      [
        item('Coca Cola', 1000),
        item('Monster', 600),
        item('Tazal', 1877),
        item('MULT IBANCO', 1677),
      ],
    ],
  ])('cuts nothing with %s', (_, items) => {
    const out = convert(
      receipt({ items, itemsEndedBy: 'taxTableHeader' }),
      ptQr('16.77'),
    )
    expect(out.lines).toHaveLength(items.length)
    expect(out.check).toBe('mismatch')
  })

  it('cuts nothing with no anchor, or a read discount that doesn’t close', () => {
    const items = lidl(item('Tazal', 1877), item('MULT IBANCO', 1677))
    expect(convert(receipt({ items }), ptQr('16.77')).lines).toHaveLength(4)
    expect(
      convert(
        receipt({
          items,
          itemsEndedBy: 'taxTableHeader',
          discount: cents(100),
        }),
        ptQr('16.77'),
      ).lines,
    ).toHaveLength(4)
  })

  it('never cuts a list that closes whole', () => {
    const out = convert(
      receipt({
        items: [item('Menu', 1000), item('Vinho', 1677)],
        itemsEndedBy: 'payment',
      }),
      ptQr('26.77'),
    )
    expect(out).toMatchObject({ lines: [1000, 1677], check: 'match' })
  })

  it('counts one digit different at the same length as near, and nothing else', () => {
    expect(isNearTotal(cents(1677), cents(1677))).toBe(true)
    expect(isNearTotal(cents(1877), cents(1677))).toBe(true)
    expect(isNearTotal(cents(1878), cents(1677))).toBe(false)
    expect(isNearTotal(cents(677), cents(1677))).toBe(false)
  })

  it('anchors on the separator, or on the header when the separator is too short', () => {
    const lines = (separator: string) =>
      text(
        'Coca Cola 10,00',
        'Monster 6,77',
        'Tazal 18,77',
        separator,
        'MULT IBANCO 16,77',
        'Taxa Base Inc. Val.Total Val. IVA',
      )
    const withSeparator = convert(lines('=========='), ptQr('16.77'))
    expect(withSeparator).toMatchObject({ lines: [1000, 677], check: 'match' })
    expect(withSeparator.removed?.map((line) => line.name)).toEqual(['Tazal'])
    const withHeader = convert(lines('======'), ptQr('16.77'))
    expect(withHeader).toMatchObject({ lines: [1000, 677], check: 'match' })
    expect(withHeader.removed?.map((line) => line.name)).toEqual([
      'Tazal',
      'MULT IBANCO',
    ])
  })

  it('closes a cut with an orphaned negative discount, and only then', () => {
    const lines = [
      'Coca Cola 10,00',
      'xx',
      'Promoção -1,00',
      'Monster 2,00',
      'Tazal 11,00',
      'MULT IBANCO 11,00',
      'Taxa Base Inc. Val.Total Val. IVA',
    ]
    expect(convert(text(...lines), ptQr('11.00'))).toMatchObject({
      lines: [1000, 200],
      discount: amount(100),
      check: 'match',
    })
    expect(convert(text(...lines), ptQr('12.00')).check).toBe('mismatch')
  })

  it('pins the residual: a real last item one digit from the total, with its discount missing, is dropped, and recorded (M-I-7)', () => {
    const out = convert(
      text('Pão 4,00', 'Queijo 6,00', 'Vinho 20,00', '----------'),
      ptQr('10.00'),
    )
    expect(out).toMatchObject({ lines: [400, 600], check: 'match' })
    expect(out.removed).toEqual([{ name: 'Vinho', amount: 2000 }])
  })
})

describe('R22: which bill-level discount (revisions 10 and 11)', () => {
  it('closes a Continente-shaped receipt with the candidates dropped, without the overflow', () => {
    const out = convert(
      text(
        'Pasta dentes 1,74',
        'POUPANCA 1,75',
        'Coca Cola 1,39',
        'Queijo 2,39',
        'POUPANCA 0,60',
        'Tazal 5,52',
        '==========',
      ),
      ptQr('5.52'),
    )
    expect(out).toMatchObject({
      lines: [174, 139, 239],
      discount: NONE,
      check: 'match',
    })
  })

  it('ignores the overflow of a candidate on a dropped line', () => {
    const out = convert(
      text(
        'Pão 2,00',
        'Leite 3,52',
        'Tazal 5,52',
        'POUPANCA 6,00',
        '==========',
      ),
      ptQr('5.52'),
    )
    expect(out).toMatchObject({
      lines: [200, 352],
      discount: NONE,
      check: 'match',
    })
  })

  it('still counts a negative line larger than a dropped item (the stated asymmetry)', () => {
    const out = convert(
      text(
        'Pão 5,00',
        'Leite 6,00',
        'Tazal 10,00',
        'Promoção -12,00',
        '==========',
      ),
      ptQr('11.00'),
    )
    expect(out.lines).toEqual([500, 600, 1000])
    expect(out.check).toBe('mismatch')
  })
})

describe('R24: a cut is recorded', () => {
  it('never records anything when nothing was cut', () => {
    expect(convert(receipt({ total: cents(950) })).removed).toBeUndefined()
    expect(
      convert(text('Pão 1,00', '----------', 'TOTAL 1,00'), ptQr('1.00'))
        .summary,
    ).not.toHaveProperty('removedLines')
  })

  it('never reaches a cut on an ordinary receipt with a separator and a readable total', () => {
    const read = text('Pão 5,00', 'Queijo 7,40', '----------', 'TOTAL 12,40')
    expect(read.itemsEndedBy).toBe('separator')
    expect(read.total).toBe(1240)
    const out = convert(read, ptQr('12.40'))
    expect(out).toMatchObject({ lines: [500, 740], check: 'match' })
    expect(out.removed).toBeUndefined()
  })
})

describe('R10 and R14', () => {
  it('reads euros from a Portuguese QR code over a stray symbol', () => {
    const stray = receipt({ currencyHint: 'USD', total: cents(950) })
    expect(convert(stray, ptQr('9.50')).summary.currency).toBe('EUR')
    expect(convert(stray, ptQr('9.50', 'J1:PT-AC')).summary.currency).toBe(
      'EUR',
    )
    expect(convert(stray).summary.currency).toBe('USD')
    const { summary } = receiptToBill(
      stray,
      ptQr('9.50'),
      current(),
      counter(),
      {
        regionCurrency: 'EUR',
      },
    )
    expect(summary.warnings).not.toContain('currencyDiffers')
  })

  it('imports the QR total as one flagged item when no item was read', () => {
    const { bill, summary } = receiptToBill(
      receipt({ items: [] }),
      ptQr('12.70'),
      current(),
      counter(),
    )
    expect(bill.items).toEqual([
      expect.objectContaining({
        name: 'Not read from the receipt',
        unitPrice: 1270,
        quantity: { numerator: 1, denominator: 1 },
      }),
    ])
    expect(summary.flaggedItemIds).toEqual([bill.items[0]?.id])
    expect(checkReceipt(bill, summary).status).toBe('match')
  })
})
