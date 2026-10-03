import { describe, expect, it } from 'vitest'
import type { ParsedItem, TextLine } from '../model.ts'
import {
  classifyLine,
  joinPages,
  parseReceiptText,
  trimEdgeNoise,
  type LineGroup,
} from './parseReceiptText.ts'

function lines(...texts: string[]): TextLine[] {
  return texts.map((text) => ({ text, confidence: 95 }))
}

function parse(...texts: string[]) {
  return parseReceiptText(lines(...texts))
}

function item(
  name: string,
  quantity: string,
  unitPrice: number,
  lineTotal: number,
): Partial<ParsedItem> {
  const [whole = '', fraction = ''] = quantity.split('.')
  return {
    name,
    quantity: {
      numerator: Number(whole + fraction),
      denominator: 10 ** fraction.length,
    },
    unitPrice: unitPrice as ParsedItem['unitPrice'],
    lineTotal: lineTotal as ParsedItem['lineTotal'],
  }
}

function group(text: string, region?: 'header' | 'items' | 'after'): LineGroup {
  return classifyLine(text, region).group
}

describe('classifyLine (rule 3)', () => {
  it('checks the more specific group first (I-1)', () => {
    expect(group('SUB TOTAL 10,00')).toBe('subtotal')
    expect(group('SUB-TOTAL 10,00')).toBe('subtotal')
    expect(group('Subtotal 10,00')).toBe('subtotal')
    expect(group('Taxa de serviço 5,00')).toBe('tip')
    expect(group('Taxa extra 2,00')).toBe('item')
    expect(group('TOTAL 23,40')).toBe('total')
    expect(group('Total a pagar 23,40')).toBe('total')
  })

  it('reads tax summaries as tax, and "included" ones as totals (R2-I-1, R3-I-2)', () => {
    expect(group('Total IVA 4,38', 'after')).toBe('taxSummary')
    expect(group('IVA Total 4,38', 'after')).toBe('taxSummary')
    expect(group('Total VAT 3.90', 'after')).toBe('taxSummary')
    expect(group('Total tax 1.60', 'after')).toBe('taxSummary')
    expect(group('TOTAL (IVA incluído) 23,40')).toBe('total')
    expect(group('TOTAL IVA INCLUÍDO 23,40')).toBe('total')
    expect(group('Total VAT incl. 23.40')).toBe('total')
  })

  it('reads savings summaries, and negative totals, as savings (R3-O-3)', () => {
    expect(group('Total poupança 3,20', 'after')).toBe('savings')
    expect(group('Total descontos -3,20')).toBe('savings')
    expect(group('You saved 2.00', 'after')).toBe('savings')
  })

  it('reads pre-tax totals as subtotals (M-I-2)', () => {
    expect(group('Total s/ IVA 19,02')).toBe('subtotal')
    expect(group('Total sem IVA 19,02')).toBe('subtotal')
    expect(group('Net total 19.50')).toBe('subtotal')
    expect(group('Total c/ IVA 23,40')).toBe('total')
    expect(group('Total inc VAT 23.40')).toBe('total')
  })

  it('never reads a total as a payment line (O-EXT-1)', () => {
    expect(classifyLine('Total Multibanco 23,40')).toEqual({
      group: 'total',
      payment: false,
    })
    expect(classifyLine('Total paid 25.60')).toEqual({
      group: 'total',
      payment: false,
    })
  })

  it('reads payment lines as ignored payment lines (M-O-2)', () => {
    for (const text of [
      'Pago com Visa 23,40',
      'Pagamento Multibanco 23,40',
      'Pago com cartão 23,40',
      'CARD 23.40',
      'Troco 1,60',
      'Cash 30.00',
    ]) {
      expect(classifyLine(text)).toEqual({ group: 'ignore', payment: true })
    }
  })

  it('keeps loyalty-card lines as discounts, never payments (R5-I-1, R6-I-1)', () => {
    expect(classifyLine('Desc. Cartão Continente -0,40')).toEqual({
      group: 'discount',
      payment: false,
    })
    expect(group('Poupança Cartão Poupa Mais -0,30')).toBe('discount')
    expect(group('Desconto Cartão 0,50')).toBe('discount')
    expect(group('Desconto MB Way 0,50')).toBe('discount')
    // Change printed as a negative amount stays ignored.
    expect(classifyLine('Troco -1,60', 'after')).toEqual({
      group: 'ignore',
      payment: false,
    })
  })

  it('keeps an item an item when the keyword is inside its name (R3-O-1)', () => {
    expect(group('Menu Promoção 7,50')).toBe('item')
    expect(group('Menu Serviço 9,00')).toBe('item')
    expect(group('Gift card 10,00')).toBe('item')
    expect(group('Desconto 0,50')).toBe('discount')
    // After the items region, the keyword wins.
    expect(group('Menu Promoção 7,50', 'after')).toBe('discount')
  })

  it('reads tax-table lines as tax only outside the items or without a description (R2-I-2)', () => {
    expect(group('1 Bitoque 23% 9,50')).toBe('item')
    expect(group('Bitoque 9,50 23%')).toBe('item')
    expect(group('23% 10,16 2,34', 'after')).toBe('tax')
    expect(group('23% 10,16 2,34')).toBe('tax')
    expect(group('A 23% 19,02 4,38', 'after')).toBe('tax')
    expect(group('IVA 23% 4,38', 'items')).toBe('tax')
  })

  it('matches whole words only', () => {
    expect(group('Taxa extra 2,00')).toBe('item')
    expect(group('Tipo de pão 1,20')).toBe('item')
  })
})

describe('parseReceiptText: amounts and quantities (rules 2 and 6)', () => {
  it('reads `Arroz 1 100,00` as quantity 1 at 100,00, never 1 100,00 (I-2)', () => {
    const receipt = parse('Arroz 1 100,00', 'TOTAL 100,00')
    expect(receipt.items).toEqual([
      expect.objectContaining(item('Arroz', '1', 10000, 10000)),
    ])
  })

  it('makes an item 1 × L when round(Q × P) isn’t L', () => {
    const receipt = parse('2 x Imperial 2,20 4,50', 'TOTAL 4,50')
    expect(receipt.items).toEqual([
      expect.objectContaining(item('Imperial', '1', 450, 450)),
    ])
  })

  it('reads `N x Name P L`, `N un x P` and weighted items', () => {
    const receipt = parse(
      '2 x Imperial 2,20 4,40',
      'Agua 3 un x 0,80 2,40',
      'Bananas',
      '0,532 kg x 2,99 €/kg 1,59',
      'Uvas 0,500 kg x £3.00/kg 1,50',
      'TOTAL 9,89',
    )
    expect(receipt.items).toEqual([
      expect.objectContaining(item('Imperial', '2', 220, 440)),
      expect.objectContaining(item('Agua', '3', 80, 240)),
      expect.objectContaining(item('Bananas', '0.532', 299, 159)),
      expect.objectContaining(item('Uvas', '0.5', 300, 150)),
    ])
  })

  it('completes the item line before a quantity-only line', () => {
    const receipt = parse('Imperial 4,40', '2 x 2,20 4,40', 'TOTAL 4,40')
    expect(receipt.items).toEqual([
      expect.objectContaining(item('Imperial', '2', 220, 440)),
    ])
  })

  it('reads column and quantity-first layouts (R2-I-2)', () => {
    const receipt = parse(
      '2 Imperial 1,10 2,20',
      'Sumo 2 1,50 3,00',
      '1 Bitoque 23% 9,50',
      'Bitoque 9,50 23%',
      'TOTAL 24,20',
      '23% 10,16 2,34',
    )
    expect(receipt.items).toEqual([
      expect.objectContaining(item('Imperial', '2', 110, 220)),
      expect.objectContaining(item('Sumo', '2', 150, 300)),
      expect.objectContaining(item('Bitoque', '1', 950, 950)),
      expect.objectContaining(item('Bitoque', '1', 950, 950)),
    ])
    expect(receipt.tax).toBe(234)
  })

  it('keeps a leading number in the name without a quantity column (R3-O-2)', () => {
    const receipt = parse('3 Queijos 9,00', '7 Up 1,40', 'TOTAL 10,40')
    expect(receipt.items).toEqual([
      expect.objectContaining(item('3 Queijos', '1', 900, 900)),
      expect.objectContaining(item('7 Up', '1', 140, 140)),
    ])
  })

  it('reads `Q Name L` under a quantity column title (R3-O-2)', () => {
    const receipt = parse(
      'Tasca do Zé',
      'Qtd Descrição Total',
      '2 Imperial 2,20',
      '3 Pão 1,00',
      'TOTAL 3,20',
    )
    expect(receipt.items).toEqual([
      expect.objectContaining(item('Imperial', '2', 110, 220)),
      // 1,00 ÷ 3 isn't a whole number of cents.
      expect.objectContaining(item('3 Pão', '1', 100, 100)),
    ])
  })

  it('flags items with low confidence or a fixed amount (rule 9)', () => {
    const receipt = parseReceiptText([
      { text: 'Sopa 2,50', confidence: 59 },
      { text: 'Pão 1,2O', confidence: 90 },
      { text: 'Água 1,00', confidence: 60 },
      { text: 'TOTAL 4,70', confidence: 90 },
    ])
    expect(receipt.items.map((entry) => entry.needsCheck)).toEqual([
      true,
      true,
      false,
    ])
  })
})

describe('parseReceiptText: regions and header facts (rules 4 and 5)', () => {
  it('finds the merchant, a valid NIF and the date', () => {
    const receipt = parse(
      'FATURA SIMPLIFICADA',
      'Café Central',
      'Rua Augusta 10',
      '1100-053 Lisboa',
      'Tel. 21 123 45 67',
      'NIF: 123456789',
      'Data 28-09-2026',
      'Galão 1,40',
      'TOTAL 1,40',
    )
    expect(receipt).toMatchObject({
      merchant: 'Café Central',
      merchantTaxId: '123456789',
      date: '2026-09-28',
      total: 140,
    })
  })

  it('rejects a NIF with a bad check digit', () => {
    expect(parse('Loja', 'NIF 123456780', 'Pão 1,00').merchantTaxId).toBe(
      undefined,
    )
  })

  it('never reads a UK VAT number as the NIF (O-4)', () => {
    // 123456789 passes the Portuguese check digit.
    const receipt = parse('The Red Lion', 'VAT No 123456789', 'Ale 4.50')
    expect(receipt.merchantTaxId).toBeUndefined()
    expect(receipt.merchant).toBe('The Red Lion')
  })

  it('rejects an impossible date', () => {
    expect(parse('Loja', 'Data 31-02-2026', 'Pão 1,00').date).toBeUndefined()
  })

  it('never reads a date or a time as an amount (R2-I-3)', () => {
    const receipt = parse(
      'Pastelaria Doce',
      'Data 28.09.26',
      '28.09.2026 12.30',
      'Hora: 12.30',
      'Pastel de nata 1,30',
      'TOTAL 1,30',
    )
    expect(receipt.items).toEqual([
      expect.objectContaining(item('Pastel de nata', '1', 130, 130)),
    ])
    expect(receipt.merchant).toBe('Pastelaria Doce')
    expect(receipt.date).toBe('2026-09-28')
  })

  it('never reads `Capital social` as an item (R2-O-5)', () => {
    const receipt = parse(
      'Supermercado Bom Preço, S.A.',
      'Capital social 50.000,00 €',
      'Leite 0,89',
      'TOTAL 0,89',
    )
    expect(receipt.items).toHaveLength(1)
    expect(receipt.items[0]?.name).toBe('Leite')
  })

  it('joins several pages into one items region (O-5)', () => {
    const receipt = parseReceiptText(
      joinPages([
        lines('Loja', 'Pão 1,00', 'Leite 0,89'),
        lines('Ovos 2,10', 'TOTAL 3,99'),
      ]),
    )
    expect(receipt.items.map((entry) => entry.name)).toEqual([
      'Pão',
      'Leite',
      'Ovos',
    ])
    expect(receipt.total).toBe(399)
  })

  it('ignores item-shaped lines after the items region', () => {
    const receipt = parse('Pão 1,00', 'TOTAL 1,00', 'Artigos 1,00')
    expect(receipt.items).toHaveLength(1)
  })
})

describe('parseReceiptText: totals (rule 8)', () => {
  it('keeps the first total over an IVA table after it (R2-I-1)', () => {
    const receipt = parse(
      'Bitoque 9,50',
      'Imperial 13,90',
      'TOTAL 23,40',
      'Taxa Base IVA',
      'A 23% 19,02 4,38',
      'Total IVA 4,38',
      'Total poupança 3,20',
    )
    expect(receipt.total).toBe(2340)
    expect(receipt.tax).toBe(438)
  })

  it('reads an IVA-included total as the total (R2-I-1, R3-I-2)', () => {
    expect(parse('Bitoque 23,40', 'TOTAL (IVA incluído) 23,40').total).toBe(
      2340,
    )
    expect(parse('Bitoque 23,40', 'TOTAL IVA INCLUÍDO 23,40').total).toBe(2340)
    expect(parse('Ale 23.40', 'Total VAT incl. 23.40')).toMatchObject({
      total: 2340,
    })
  })

  it('reads IVA Total, Total VAT and Total tax as tax, never the total', () => {
    const receipt = parse('Bitoque 23,40', 'TOTAL 23,40', 'IVA Total 4,38')
    expect(receipt).toMatchObject({ total: 2340, tax: 438 })
    expect(parse('Ale 4.50', 'Total VAT 0.75').total).toBeUndefined()
    expect(parse('Ale 4.50', 'Total tax 0.75').tax).toBe(75)
  })

  it('reads a total paid by card as the total (O-EXT-1)', () => {
    expect(parse('Bitoque 23,40', 'Total Multibanco 23,40').total).toBe(2340)
    expect(parse('Burger 25.60', 'Total paid 25.60').total).toBe(2560)
  })

  it('takes a later total when a tip sits between them (R3-I-3)', () => {
    const receipt = parse(
      'Burger 12.00',
      'Fries 8.00',
      'Subtotal 20.00',
      'Sales tax 1.60',
      'Total 21.60',
      'Tip 4.00',
      'Total 25.60',
    )
    expect(receipt).toMatchObject({
      subtotal: 2000,
      tax: 160,
      tip: 400,
      total: 2560,
    })
  })

  it('leaves the total alone for a savings summary before it (R3-O-3)', () => {
    const receipt = parse(
      'Iogurtes 23,20',
      'Total descontos -3,20',
      'TOTAL 20,00',
    )
    expect(receipt.total).toBe(2000)
    expect(receipt.discount).toBeUndefined()
  })

  it('takes the inclusive total after a pre-tax one (M-I-2)', () => {
    expect(
      parse('Bitoque 23,40', 'Total s/ IVA 19,02', 'Total c/ IVA 23,40'),
    ).toMatchObject({ subtotal: 1902, total: 2340 })
    expect(
      parse('Bitoque 23,40', 'Total sem IVA 19,02', 'TOTAL 23,40'),
    ).toMatchObject({ subtotal: 1902, total: 2340 })
    expect(
      parse('Burger 23.40', 'Net total 19.50', 'Total inc VAT 23.40'),
    ).toMatchObject({ subtotal: 1950, total: 2340 })
  })

  it('ignores blank handwriting lines and suggested tips (M-O-1)', () => {
    const blank = parse('Burger 21.60', 'Total 21.60', 'Tip ____', 'Total ____')
    expect(blank.total).toBe(2160)
    expect(blank.tip).toBeUndefined()

    const suggested = parse(
      'Burger 21.60',
      'Total 21.60',
      'Suggested tip:',
      '15% 3.24',
      '18% 3.89',
      '20% 4.32',
      'Suggested gratuity 18% 3.89',
    )
    expect(suggested.tip).toBeUndefined()
    expect(suggested.tax).toBeUndefined()
    expect(suggested.total).toBe(2160)

    const service = parse(
      'Fish and chips 45.00',
      'Service charge 12.5% 5.63',
      'Total 50.63',
    )
    expect(service.tip).toBe(563)
    expect(service.total).toBe(5063)
  })

  it('never reads payment lines as items, and warns when the total is missing (M-O-2)', () => {
    for (const payment of [
      'Pago com Visa 23,40',
      'Pagamento Multibanco 23,40',
      'Pago com cartão 23,40',
      'CARD 23.40',
    ]) {
      const receipt = parse(
        'Bitoque 9,50',
        'Imperial 13,90',
        payment,
        'Obrigado',
      )
      expect(receipt.items.map((entry) => entry.name)).toEqual([
        'Bitoque',
        'Imperial',
      ])
      expect(receipt.total).toBeUndefined()
      expect(receipt.warnings).toContain('noTotal')
    }
  })
})

describe('parseReceiptText: discounts (rule 7, R8)', () => {
  it('reduces the item above with a negative loyalty-card discount, records an unsigned one as a candidate, and keeps the items after it (R5-I-1)', () => {
    const receipt = parse(
      'Iogurte Grego 1,99',
      'Desc. Cartão Continente -0,40',
      'Queijo 3,49',
      'Poupança Cartão Poupa Mais -0,30',
      'Fiambre 2,00',
      'Desconto Cartão 0,50',
      'Pão 1,20',
      'TOTAL 7,48',
      'Troco -1,60',
    )
    expect(receipt.items).toEqual([
      expect.objectContaining(item('Iogurte Grego', '1', 159, 159)),
      expect.objectContaining(item('Queijo', '1', 319, 319)),
      // R8: unsigned, so it may already be in the price; the bill
      // conversion decides (toBill.test.ts applies it with no total).
      expect.objectContaining({
        ...item('Fiambre', '1', 200, 200),
        savingsCandidate: 50,
      }),
      expect.objectContaining(item('Pão', '1', 120, 120)),
    ])
    expect(receipt.items[3]?.savingsCandidate).toBeUndefined()
    expect(receipt.discount).toBeUndefined()
    expect(receipt.total).toBe(748)
  })

  it('keeps items with a keyword inside their name (R3-O-1)', () => {
    const receipt = parse(
      'Menu Promoção 7,50',
      'Gift card 10,00',
      'Desconto 0,50',
      'TOTAL 17,00',
    )
    expect(receipt.items).toEqual([
      expect.objectContaining(item('Menu Promoção', '1', 750, 750)),
      expect.objectContaining({
        ...item('Gift card', '1', 1000, 1000),
        savingsCandidate: 50,
      }),
    ])
  })

  it('keeps an unsigned discount larger than its item on the item, never in the bill discount (R8)', () => {
    const receipt = parse(
      'Pão 1,00',
      'Leite 0,50',
      'Desconto 0,80',
      'TOTAL 0,70',
    )
    expect(receipt.items.map((entry) => entry.lineTotal)).toEqual([100, 50])
    expect(receipt.items[1]?.savingsCandidate).toBe(80)
    expect(receipt.discount).toBeUndefined()
  })

  it('sends a negative discount larger than its item to the bill discount', () => {
    const receipt = parse(
      'Pão 1,00',
      'Leite 0,50',
      'Desconto -0,80',
      'TOTAL 0,70',
    )
    expect(receipt.items.map((entry) => entry.lineTotal)).toEqual([100, 50])
    expect(receipt.discount).toBe(80)
  })

  it('sums several unsigned lines under one item, and measures them after its negative lines (R8, revision 11)', () => {
    for (const order of [
      ['Promoção -0,40', 'POUPANCA 0,30', 'POUPANCA 0,20'],
      ['POUPANCA 0,30', 'Promoção -0,40', 'POUPANCA 0,20'],
    ]) {
      const receipt = parse('Queijo 3,00', ...order, 'Pão 1,00', 'TOTAL 3,10')
      expect(receipt.items[0]).toMatchObject({
        lineTotal: 260,
        savingsCandidate: 50,
      })
      expect(receipt.discount).toBeUndefined()
    }
  })
})

describe('parseReceiptText: warnings and robustness', () => {
  it('warns when the text was hard to read', () => {
    const receipt = parseReceiptText([
      { text: 'Pão 1,00', confidence: 40 },
      { text: 'TOTAL 1,00', confidence: 55 },
    ])
    expect(receipt.warnings).toContain('lowConfidence')
  })

  it('reads the currency from the receipt', () => {
    expect(parse('Pão 1,00 €', 'TOTAL 1,00').currencyHint).toBe('EUR')
    expect(parse('Ale £4.50', 'Total 4.50').currencyHint).toBe('GBP')
    expect(parse('Burger 4.50', 'Total USD 4.50').currencyHint).toBe('USD')
  })

  it('reads empty input as a receipt with nothing on it', () => {
    expect(parseReceiptText([])).toEqual({ items: [], warnings: ['noTotal'] })
  })

  it('never throws on absurd numbers', () => {
    expect(() =>
      parse('Pão 99999999999999999 x 99999999999999,99', 'TOTAL 1,00'),
    ).not.toThrow()
    expect(() =>
      parse(
        'A 90071992547409,91',
        'B 90071992547409,91',
        'TOTAL 90071992547409,91',
      ),
    ).not.toThrow()
  })
})

describe('parseReceiptText: real layouts (remediation R3–R7, R10, R11)', () => {
  it('reads a price-first quantity when the arithmetic holds (R3)', () => {
    for (const line of [
      'Refrigerante Zero 1,35 x 6 8,10 A',
      'Refrigerante Zero 1,35 a 6 8,10 A',
      'Refrigerante Zero 1,35 x6 8,10 A',
      'Refrigerante Zero 1,35 X 6 8,10',
    ]) {
      expect(parse(line, 'TOTAL 8,10').items, line).toEqual([
        expect.objectContaining(item('Refrigerante Zero', '6', 135, 810)),
      ])
    }
  })

  it('takes no quantity when a price-first line doesn’t close (R3)', () => {
    for (const line of [
      'Refrigerante Zero 1,35 x 6 8,20',
      'Massa 1,00 s 2 7,00',
    ]) {
      const [read] = parse(line, 'TOTAL 1,00').items
      expect(read?.quantity, line).toEqual({ numerator: 1, denominator: 1 })
      expect(read?.lineTotal, line).toBe(read?.unitPrice)
    }
  })

  it('joins a name line and the quantity line under it (R4)', () => {
    expect(
      parse('Take Away:', '(B) Box Veggie', '2 X 6,50 13,00', 'TOTAL 13,00')
        .items,
    ).toEqual([expect.objectContaining(item('Box Veggie', '2', 650, 1300))])
  })

  it('completes a name line with a garbled quantity line as 1 × the total, flagged (R4)', () => {
    expect(parse('Baguete 250G', '1X0,8 0,89', 'TOTAL 0,89').items).toEqual([
      { ...item('Baguete 250G', '1', 89, 89), needsCheck: true },
    ])
  })

  it('never takes a category header as an item or a name (R4)', () => {
    expect(
      parse('Padaria:', 'Pão 1,00', 'TOTAL 1,00').items.map((i) => i.name),
    ).toEqual(['Pão'])
    expect(parse('Padaria:', '2 X 1,00 2,00', 'TOTAL 2,00').items).toEqual([])
    // A lone colon after a name is a photo's noise, not a header.
    expect(
      parse('(B) Box Veggie :', '2 X 6,50 13,00', 'TOTAL 13,00').items,
    ).toEqual([expect.objectContaining(item('Box Veggie :', '2', 650, 1300))])
  })

  it('leaves tax codes and barcodes out of the name (R5)', () => {
    const names = (line: string) =>
      parse(line, 'TOTAL 1,00').items.map((i) => i.name)
    expect(names('(C) Bolachas Maria 1,15')).toEqual(['Bolachas Maria'])
    expect(names('NS Taras 0,10')).toEqual(['Taras'])
    expect(names('5601234567890 Polo S/S 17,99')).toEqual(['Polo S/S'])
    // A bare leading letter may be an article: it stays.
    expect(names('A Vaca Que Ri 2,49')).toEqual(['A Vaca Que Ri'])
  })

  it('ignores a code-and-size line and an informational promotion under an item (R5, R7)', () => {
    const receipt = parse(
      '5601234567890 Polo S/S 17,99',
      '71014475 C10 M',
      'Promoção (25.99-8.00)',
      'Calças 20,00',
      'Promoção (6,00)',
      'TOTAL 37,99',
    )
    expect(receipt.items).toEqual([
      expect.objectContaining(item('Polo S/S', '1', 1799, 1799)),
      expect.objectContaining(item('Calças', '1', 2000, 2000)),
    ])
    expect(receipt.items.map((i) => i.savingsCandidate)).toEqual([
      undefined,
      undefined,
    ])
    expect(receipt.discount).toBeUndefined()
    expect(group('Promoção (25.99-6.00)')).toBe('ignore')
    expect(group('71014475 C10 M')).toBe('ignore')
  })

  it('takes a total whose amount is on the next line (R6)', () => {
    expect(parse('Polo 17,99', 'Total (Euro):', '17,99').total).toBe(1799)
    expect(parse('Polo 17,99', 'Subtotal', '17,99').subtotal).toBe(1799)
  })

  it('never takes a lone amount after an item as a total (R6)', () => {
    const receipt = parse('Pão 1,00', '2,00')
    expect(receipt.total).toBeUndefined()
    expect(receipt.items.map((i) => i.lineTotal)).toEqual([100])
  })

  it('counts a currency mark only when it’s attached to an amount (R10)', () => {
    expect(parse('Loja $ Centro', 'Pão 1,00', 'TOTAL 1,00').currencyHint).toBe(
      undefined,
    )
    expect(parse('Ale £3.20', 'Total 3.20').currencyHint).toBe('GBP')
    expect(parse('Pão 1,00 €', 'TOTAL 1,00').currencyHint).toBe('EUR')
  })

  it('reads a total label one OCR substitution away as a total, not two (R11)', () => {
    expect(group('T0TAL 12,50')).toBe('total')
    expect(group('tota1 12,50')).toBe('total')
    expect(group('lotal 12,50')).toBe('total')
    expect(group('Lozal 12,50')).toBe('item')
    expect(parse('Pão 12,50', 'T0TAL 12,50').total).toBe(1250)
  })
})

describe('parseReceiptText: where the items end (R18, R23)', () => {
  it.each(['Taxa Base Inc. Val.Total Val. IVA', '%IVA Total Liq. IVA Total'])(
    'ends the items at a tax-table header, %s',
    (header) => {
      const receipt = parse(
        'Pão 1,00',
        header,
        'A 23% 0,81 0,19 1,00',
        'Queijo 2,00',
      )
      expect(receipt.items.map((i) => i.name)).toEqual(['Pão'])
      expect(receipt.itemsEndedBy).toBe('taxTableHeader')
    },
  )

  it('never ends anything at a column header above the items', () => {
    const receipt = parse(
      'IVA DESCRICAO VALOR',
      'Pão 1,00',
      'Leite 0,80',
      'TOTAL 1,80',
    )
    expect(receipt.items.map((i) => i.name)).toEqual(['Pão', 'Leite'])
    expect(receipt.itemsEndedBy).toBeUndefined()
  })

  it('ends the items at a separator row after an item, not before one', () => {
    const receipt = parse('==========', 'Pão 1,00', '----------', 'Leite 0,80')
    expect(receipt.items.map((i) => i.name)).toEqual(['Pão'])
    expect(receipt.itemsEndedBy).toBe('separator')
  })

  it.each([
    ['..... ......', true],
    ['.... ....', true],
    ['======', false],
  ])('counts “%s” as a separator row: %s', (row, ends) => {
    const receipt = parse('Pão 1,00', row, 'Leite 0,80')
    expect(receipt.items.length).toBe(ends ? 1 : 2)
  })

  it('records the payment line that ended the items, unchanged as a payment (R23)', () => {
    for (const payment of ['Multibanco 12,40', 'Pago com cartao 12,40']) {
      expect(classifyLine(payment)).toEqual({ group: 'ignore', payment: true })
      const receipt = parse('Pão 1,00', payment, 'Queijo 2,00')
      expect(receipt.items.map((i) => i.name)).toEqual(['Pão'])
      expect(receipt.itemsEndedBy).toBe('payment')
    }
  })

  it('records nothing when a total or the end of the text ends the items (R23)', () => {
    expect(parse('Pão 1,00', 'TOTAL 1,00').itemsEndedBy).toBeUndefined()
    expect(parse('Pão 1,00', 'Leite 0,80').itemsEndedBy).toBeUndefined()
  })
})

describe('parseReceiptText: structural evidence on item lines (R22)', () => {
  function evidence(line: string) {
    const items = parse('Pão 1,00', line).items
    const read = items.at(-1)
    // The line must reach the item list for its flag to mean anything.
    expect(items, line).toHaveLength(2)
    return read?.endEvidence
  }

  it('marks a one-word label two substitutions from “total” as totalLike', () => {
    expect(evidence('lozal 12,40')).toBe('totalLike')
    expect(evidence('Tazal 12,40')).toBe('totalLike')
    // R22's stated residual, pinned so a change shows.
    expect(evidence('Natal 10,00')).toBe('totalLike')
    expect(evidence('Salada 12,40')).toBeUndefined()
    expect(evidence('Bolo lozal 12,40')).toBeUndefined()
  })

  it('marks a rate or two column words as taxTable', () => {
    expect(evidence('lVA 23% 10,00 2,30 12,30')).toBe('taxTable')
    expect(evidence('Taxa Base 10,00')).toBe('taxTable')
    // The residual again.
    expect(evidence('Iogurte 0% 1,20')).toBe('taxTable')
    expect(evidence('Queijo 2,00')).toBeUndefined()
  })

  it('leaves lines that never reach the list as they were', () => {
    expect(group('IVA 23% 2,30')).toBe('tax')
    expect(group('A 23% 10,00 2,30 12,30')).toBe('text')
  })
})

describe('trimEdgeNoise (CP3: a photo’s background at the line ends)', () => {
  it.each([
    ['é. POUPANCA 0,60', 'POUPANCA 0,60'],
    ['| Queijo Fatias 3,69 ;', 'Queijo Fatias 3,69'],
    ['Baguete 0,89 aE', 'Baguete 0,89'],
    ['T-shirt Basica 9,99 3', 'T-shirt Basica 9,99'],
    ['Iogurte 2,39 A É', 'Iogurte 2,39 A'],
    ['Iogurte 2,39 E ;', 'Iogurte 2,39 E'],
    ['E 1 X 0,89 0,89 Sa', '1 X 0,89 0,89'],
    ['EL 2 X 2,50 5,00 |', '2 X 2,50 5,00'],
  ])('trims “%s”', (line, trimmed) => {
    expect(trimEdgeNoise(line)).toBe(trimmed)
  })

  it.each([
    // A bare leading capital may be an article or a code (R5).
    'A Vaca Que Ri 2,49',
    'NS Taras 0,10',
    'TV Box 29,99',
    // Tax codes and currency marks after the amount.
    'Queijo 2,49 B',
    'Pão 1,00 €',
    // A name is never cut short: the line doesn't end in an amount.
    'Pão de Forma de',
    // Separator rows.
    '..... ......',
    '==========',
    // Quantities stay, and a unit after the price.
    '2 X 6,50 13,00',
    '1 Bitoque 9,50',
    '0,532 kg x 1,29 €/kg',
    'Pão 1,00 un',
  ])('leaves “%s” alone', (line) => {
    expect(trimEdgeNoise(line)).toBe(line)
  })

  it('drops up to two at the start, three before a quantity, four after the amount', () => {
    expect(trimEdgeNoise('| ; Queijo 3,69 ; |')).toBe('Queijo 3,69')
    expect(trimEdgeNoise('(C) Amendoim 200G 1,15 : : Gi,')).toBe(
      '(C) Amendoim 200G 1,15',
    )
    expect(trimEdgeNoise('; z z 1 X 0,89 0,89 : :')).toBe('1 X 0,89 0,89')
    expect(trimEdgeNoise('5 - 2 X 6,50 13,00 :')).toBe('2 X 6,50 13,00')
    // Five after the amount, or a long one, isn't background.
    expect(trimEdgeNoise('Queijo 3,69 a ; | e i')).toBe('Queijo 3,69 a ; | e i')
    expect(trimEdgeNoise('Queijo 3,69 Serra')).toBe('Queijo 3,69 Serra')
  })

  it('reads the items of a noisy photo transcript', () => {
    const receipt = parse(
      'é Mercearia Doce:',
      '| (C) Bolacha Digestive 1,74 §',
      'a POUPANCA 1,75 ;',
      '(A) Baguete Rustica 250G',
      'E 1 X 0,89 0,89 Sa',
      'TOTAL A PAGAR 2,63 i',
    )
    expect(receipt.items).toEqual([
      expect.objectContaining({
        ...item('Bolacha Digestive', '1', 174, 174),
        savingsCandidate: 175,
      }),
      expect.objectContaining(item('Baguete Rustica 250G', '1', 89, 89)),
    ])
    expect(receipt.total).toBe(263)
  })
})

describe('parseReceiptText: layouts from the local set (M2.5 CP3, P9)', () => {
  it('reads a VAT rate printed against the quantity (`13%3`)', () => {
    const receipt = parse(
      'Descrição IVA Qtd Preço Valor',
      'Menu almoço 13%2 9.50 19.00',
      'Agua 50cl 23%3 1.20 3.60',
      'Cafe 23%1 0.90 0.90',
      'Total 23.50',
    )
    expect(receipt.items).toEqual([
      expect.objectContaining(item('Menu almoço', '2', 950, 1900)),
      expect.objectContaining(item('Agua 50cl', '3', 120, 360)),
      expect.objectContaining(item('Cafe', '1', 90, 90)),
    ])
    expect(receipt.total).toBe(2350)
  })

  it('reads a quantity line printed above its item, when the arithmetic agrees', () => {
    const receipt = parse(
      'DESCRIZIONE IVA PREZZO',
      '6 X 0,22',
      'ACQUA NATURALE 22,00% 1,32',
      '0,720 KG × 11,49',
      'GULASCH 8,27 E',
      '0,5484kg x E 2,79/kg',
      'MELE GRANNY SMITH 4,00% 1,53',
      'TOTALE COMPLESSIVO 11,12',
    )
    expect(receipt.items).toEqual([
      expect.objectContaining(item('ACQUA NATURALE', '6', 22, 132)),
      expect.objectContaining(item('GULASCH', '0.72', 1149, 827)),
      expect.objectContaining({ name: 'MELE GRANNY SMITH', lineTotal: 153 }),
    ])
    expect(receipt.total).toBe(1112)
  })

  it('never lets a unit-price-only line replace the price of the item above it', () => {
    const receipt = parse(
      'Pao 1,10',
      'MERLOT 1,39 V',
      '0.682 KG × 2,49',
      'KARTOFFELN L0SE 6:78',
      'SUMME EUR 2,49',
    )
    expect(receipt.items).toEqual([
      expect.objectContaining(item('Pao', '1', 110, 110)),
      expect.objectContaining(item('MERLOT', '1', 139, 139)),
    ])
  })

  it('still completes a name-only line with the quantity line under it', () => {
    const receipt = parse('Pao 1,10', 'BANANA', '0,535 kg x 1,99', 'Total 2,16')
    expect(receipt.items.map((entry) => entry.name)).toEqual(['Pao', 'BANANA'])
  })

  it('keeps a quantity line with the name-only line above, whatever follows', () => {
    const receipt = parse('BANANA', '1 X 0,99', 'LEITE 0,99', 'Total 1,98')
    expect(receipt.items).toEqual([
      expect.objectContaining(item('BANANA', '1', 99, 99)),
      expect.objectContaining(item('LEITE', '1', 99, 99)),
    ])
  })

  it('takes the total after a bill-level discount between two totals', () => {
    const receipt = parse(
      'Ersatzfilter 9,99',
      'Ersatzpumpe 9,99',
      'Multicat 14,99',
      'Summe [ 3] Eur 34,97',
      'MwSt. -Senkung -0,88',
      'Summe EUR 34,09',
      'Bar Euro EUR 50,09',
      'Rückgeld EU -16,00',
    )
    expect(receipt.items).toHaveLength(3)
    expect(receipt.total).toBe(3409)
    expect(receipt.discount).toBe(88)
  })

  it('knows German and Italian totals, payments and tax tables', () => {
    expect(group('Summe 23.50 EUR', 'items')).toBe('total')
    expect(group('TOTALE COMPLESSIVO 11,85', 'items')).toBe('total')
    expect(group('Zwischensumme 10,00', 'items')).toBe('subtotal')
    expect(classifyLine('BAR GEGEBEN: 23.50 EUR', 'after').payment).toBe(true)
    expect(classifyLine('Importo pagato 11,85', 'after').payment).toBe(true)
    expect(group('Rückgeld EUR -16,00', 'after')).toBe('ignore')
    expect(group('MwSt D 16,00% 29,39 4,70', 'items')).toBe('tax')
    const receipt = parse(
      '1 0,4 Schorle 3.60 3.60',
      '1 T-RINDERSTEAK 19.90 19.90',
      'MWST Netto Steuer Brutto',
      '16.00% 3.10 0.50 3.60',
      'Summe 23.50 EUR',
      'BAR GEGEBEN: 23.50 EUR',
    )
    expect(receipt.items.map((entry) => entry.lineTotal)).toEqual([360, 1990])
    expect(receipt.itemsEndedBy).toBe('taxTableHeader')
    expect(receipt.total).toBe(2350)
  })

  it('gives a name-only line the price on the line under it', () => {
    const receipt = parse(
      '(C) BOCADOS MEDITERRANEOS HEURA',
      '04 8,08',
      'POUPANCA 0,90',
      'PAO 1,10',
      'TOTAL A PAGAR 9,18',
    )
    expect(receipt.items).toEqual([
      expect.objectContaining({
        name: 'BOCADOS MEDITERRANEOS HEURA',
        lineTotal: 808,
        savingsCandidate: 90,
      }),
      expect.objectContaining(item('PAO', '1', 110, 110)),
    ])
  })

  it('never gives a price line to a category header or a keyword line', () => {
    expect(parse('Padaria:', '1,10', 'Total 1,10').items).toEqual([])
    expect(parse('PAO 1,10', 'Total', '1,10').total).toBe(110)
  })

  it('reads the code-then-description layout with attribute lines (P9)', () => {
    const receipt = parse(
      'Codigo Qtd. IVA Preço',
      '1792212 1 23,0% 153,30',
      'THW CLARK 44 GREY IP BLUE/GREY IP',
      'Marca : TH Watches',
      'Classificação AT : Joias e Relógios',
      'Total do documento 153,30',
      'Total a pagar 153,30',
    )
    expect(receipt.items).toEqual([
      expect.objectContaining(
        item('THW CLARK 44 GREY IP BLUE/GREY IP', '1', 15330, 15330),
      ),
    ])
    expect(receipt.total).toBe(15330)
  })

  it('takes a quantity from the code line', () => {
    const receipt = parse(
      'Codigo Qtd. IVA Preço',
      '1792212 2 23,0% 30,00',
      'MEIAS ALGODAO',
      'Total 30,00',
    )
    expect(receipt.items).toEqual([
      expect.objectContaining(item('MEIAS ALGODAO', '2', 1500, 3000)),
    ])
  })

  it('reads a misread first word of a longer total phrase as a total', () => {
    expect(group('Totai do documento 153.30', 'items')).toBe('total')
    expect(group('T0TAL A PAGAR 9,10', 'items')).toBe('total')
    // A product that only starts like one stays a product.
    expect(group('Tonal do cabelo 4,99', 'items')).toBe('item')
    expect(group('Totai 4,99', 'items')).toBe('total')
  })

  it('reads a price whose tax code was glued on as a digit, after another amount', () => {
    expect(trimEdgeNoise('Deposito 0.20 0.201')).toBe('Deposito 0.20 0.20')
    const receipt = parse(
      'Cola Zero 3,69 A',
      'Deposito 0.20 0.201',
      'Total 3,89',
    )
    expect(receipt.items.map((entry) => entry.lineTotal)).toEqual([369, 20])
    // Alone, a three-decimal number is a weight, not a price.
    expect(trimEdgeNoise('BANANA 0,535')).toBe('BANANA 0,535')
  })

  it('reads a price with its tax code or a stray quote glued on', () => {
    const receipt = parse(
      "Gelado Morango com Chocolat '3,29 A",
      'PANQUÉCAS SIMPLES 2,69A',
      'AGUA 1,50L 0,45 A',
      'Total 6,43',
    )
    expect(receipt.items).toEqual([
      expect.objectContaining(
        item('Gelado Morango com Chocolat', '1', 329, 329),
      ),
      expect.objectContaining(item('PANQUÉCAS SIMPLES', '1', 269, 269)),
      expect.objectContaining({ name: 'AGUA 1,50L', lineTotal: 45 }),
    ])
  })

  it('attaches a promotion under a weighed item’s weight line to that item', () => {
    const receipt = parse(
      'ESPETADAS FRANGO MARINADAS 2,66 C',
      '0,190 kg × 13,99 EUR/kg',
      'Promocao Happy hour -0,80',
      'AGUA 0,96 C',
      'Total 2,82',
    )
    expect(receipt.items).toEqual([
      expect.objectContaining({
        name: 'ESPETADAS FRANGO MARINADAS',
        lineTotal: 186,
      }),
      expect.objectContaining(item('AGUA', '1', 96, 96)),
    ])
    expect(receipt.discount).toBeUndefined()
  })
})
