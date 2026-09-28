import { describe, expect, it } from 'vitest'
import type { ParsedItem, TextLine } from '../model.ts'
import {
  classifyLine,
  joinPages,
  parseReceiptText,
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

describe('parseReceiptText: discounts (rule 7)', () => {
  it('reduces the item above with a loyalty-card discount, and keeps the items after it (R5-I-1)', () => {
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
      expect.objectContaining(item('Fiambre', '1', 150, 150)),
      expect.objectContaining(item('Pão', '1', 120, 120)),
    ])
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
      expect.objectContaining(item('Gift card', '1', 950, 950)),
    ])
  })

  it('sends a discount larger than its item to the bill discount', () => {
    const receipt = parse(
      'Pão 1,00',
      'Leite 0,50',
      'Desconto 0,80',
      'TOTAL 0,70',
    )
    expect(receipt.items.map((entry) => entry.lineTotal)).toEqual([100, 50])
    expect(receipt.discount).toBe(80)
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
