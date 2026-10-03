import { describe, expect, it } from 'vitest'
import { cents, type Cents } from '../../lib/money.ts'
import type { Adjustment, Bill } from '../split/model.ts'
import {
  amountCoverage,
  editDistance,
  maximumPairing,
  nameExact,
  nameMatches,
  normalizeName,
  scoreFailedImport,
  scoreImage,
  scoreSet,
  substringDistance,
  type ExpectedBill,
  type ImageScore,
} from './accuracy.ts'
import { NOT_READ_ITEM_NAME } from './messages.ts'
import type { ReceiptSummary } from './model.ts'

const none: Adjustment = { kind: 'amount', value: cents(0) }
const amount = (value: number): Adjustment => ({
  kind: 'amount',
  value: cents(value),
})

/** A bill of whole-quantity rows, each `[name, price]`, or `[name, qty, unit]`. */
function bill(
  rows: ([string, number] | [string, number, number])[],
  adjustments: Partial<Pick<Bill, 'tax' | 'tip' | 'discount'>> = {},
  modes: Partial<Pick<Bill, 'taxMode' | 'tipMode'>> = {},
): Bill {
  return {
    people: [{ id: 'p1', name: '' }],
    items: rows.map((row, index) => ({
      id: `i${index}`,
      name: row[0],
      quantity: { numerator: row.length === 3 ? row[1] : 1, denominator: 1 },
      unitPrice: cents(row.length === 3 ? row[2] : row[1]),
      assignees: [{ personId: 'p1', weight: 1 }],
    })),
    tax: none,
    taxMode: 'proportional',
    tip: none,
    tipMode: 'proportional',
    discount: none,
    payerId: 'p1',
    ...adjustments,
    ...modes,
  }
}

const summary = (total: number): ReceiptSummary => ({
  total: cents(total),
  totalSource: 'qr',
  warnings: [],
  flaggedItemIds: [],
})

function expected(
  total: number,
  items: [string, number][],
  adjustments: { discount?: number; tip?: number; tax?: number } = {},
): ExpectedBill {
  return {
    total: cents(total),
    items: items.map(([name, price]) => ({ name, price: cents(price) })),
    ...(adjustments.discount !== undefined && {
      discount: cents(adjustments.discount),
    }),
    ...(adjustments.tip !== undefined && { tip: cents(adjustments.tip) }),
    ...(adjustments.tax !== undefined && { tax: cents(adjustments.tax) }),
  }
}

const pair = (read: string, wanted: string) => nameMatches(read, wanted)

describe('normalizeName and the distances', () => {
  it('drops case, accents and punctuation, and keeps single spaces', () => {
    expect(normalizeName('  Pão  com CHOURIÇO, 1L ')).toBe(
      'pao com chourico 1l',
    )
  })

  it('counts edits and approximate substring edits', () => {
    expect(editDistance('cola', 'sopa')).toBe(2)
    expect(editDistance('', 'abc')).toBe(3)
    expect(substringDistance('zero', 'colazer')).toBe(1)
    expect(substringDistance('morango', 'iogurtemanga')).toBeGreaterThan(1)
  })
})

describe('nameMatches (P2’s recognisable product)', () => {
  it('passes ordinary OCR corruption of a long name', () => {
    expect(pair('COLA ZER0', 'Cola Zero')).toBe(true)
    expect(pair('C0LA ZER', 'Cola Zero')).toBe(true)
    expect(pair('COLAZERO', 'Cola Zero')).toBe(true)
  })

  it('pairs a short name with one OCR error', () => {
    expect(pair('BIGA', 'Bica')).toBe(true)
    expect(pair('PA0', 'Pão')).toBe(true)
  })

  it('never pairs unrelated short names within the old half-length allowance', () => {
    expect(pair('SOPA', 'Cola')).toBe(false)
    expect(pair('AZEITE', 'Leite')).toBe(false)
    expect(pair('BATIDA', 'Batata')).toBe(false)
  })

  it('never pairs two products sharing a distinctive word', () => {
    expect(pair('Iogurte Manga', 'Iogurte Morango')).toBe(false)
    expect(pair('Iogurte Natural', 'Iogurte Morango')).toBe(false)
  })

  it('never pairs a name with its longer, different variant (CP1)', () => {
    expect(pair('Gelado de Baunilha', 'Gelado de Baunilha com Co')).toBe(false)
    expect(pair('Gelado de Baunilha com Co', 'Gelado de Baunilha')).toBe(false)
  })

  it('lets a number be missing, but never a different one (2026-10-01)', () => {
    expect(pair('Garrafa tara', 'Garrafa tara 0.10')).toBe(true)
    expect(pair('Iogurte Grego', 'Iogurte Grego 4 x 125g')).toBe(true)
  })

  it('fails a number read differently, after folding (CP1)', () => {
    expect(pair('Garrafa tara 0.10', 'Garrafa tara 0.20')).toBe(false)
    expect(pair('Garrafa tara 0.20', 'Garrafa tara 0.10')).toBe(false)
    expect(pair('GARRAFA TARA 0.l0', 'Garrafa tara 0.10')).toBe(true)
    expect(pair('IOGURTE GREGO 4 X l25G', 'Iogurte Grego 4 x 125g')).toBe(true)
    expect(pair('IOGURTE GREGO 4 X 120G', 'Iogurte Grego 4 x 125g')).toBe(false)
  })

  it('never pairs names sharing only a stop-list word', () => {
    expect(pair('Tosta com queijo', 'Pão com chouriço')).toBe(false)
  })

  it('never pairs a garbled or unrelated name', () => {
    expect(pair('|||1 ,:', 'Cola Zero')).toBe(false)
    expect(pair('', 'Cola')).toBe(false)
    expect(pair('Gelado de Fruta Pera', 'Cola Zero')).toBe(false)
  })

  it('pairs a long name with a few OCR errors and a split or merged word', () => {
    expect(
      pair('B0LACHAS CH0COLEITE lNTEGRAL', 'BOLACHAS CHOCO LEITE INTEGRAL'),
    ).toBe(true)
    expect(pair('Queijo Fla mengo Fatiado', 'Queijo Flamengo Fatiado')).toBe(
      true,
    )
  })

  it('ignores accents and spacing', () => {
    expect(pair('  pao   COM chourico ', 'Pão com chouriço')).toBe(true)
  })
})

describe('nameExact (strict name accuracy)', () => {
  it('needs the normalised names equal, with no look-alike folding', () => {
    expect(nameExact('PÃO  com Chouriço', 'pão com chouriço')).toBe(true)
    expect(nameExact('C0LA ZERO', 'Cola Zero')).toBe(false)
  })
})

describe('maximumPairing', () => {
  it('finds a full pairing that greedy order would miss', () => {
    // Expected 0 could take read 0 or 1; expected 1 only read 0.
    const can = (e: number, r: number) => (e === 0 ? true : r === 0)
    expect(maximumPairing(2, 2, can)).toEqual([1, 0])
  })

  it('breaks ties by receipt order', () => {
    expect(maximumPairing(2, 2, () => true)).toEqual([0, 1])
  })
})

describe('scoreImage (P2)', () => {
  const cafe = expected(1000, [
    ['Coffee', 250],
    ['Croissant', 250],
    ['Orange juice', 500],
  ])

  it('passes an exact read', () => {
    const score = scoreImage(
      bill([
        ['Coffee', 250],
        ['Croissant', 250],
        ['Orange juice', 500],
      ]),
      summary(1000),
      cafe,
    )
    expect(score).toMatchObject({
      noEditNeeded: true,
      pairedRows: 3,
      extraRows: 0,
      exactNames: 3,
      check: 'match',
      falseMatch: false,
      amountCoverage: 1,
    })
  })

  it('fails a missing row', () => {
    const score = scoreImage(
      bill([
        ['Coffee', 250],
        ['Orange juice', 500],
      ]),
      summary(1000),
      cafe,
    )
    expect(score).toMatchObject({
      noEditNeeded: false,
      pairedRows: 2,
      extraRows: 0,
      check: 'mismatch',
      falseMatch: false,
    })
  })

  it('fails an extra row', () => {
    const score = scoreImage(
      bill([
        ['Coffee', 250],
        ['Croissant', 250],
        ['Orange juice', 500],
        ['IVA 23%', 187],
      ]),
      summary(1000),
      cafe,
    )
    expect(score).toMatchObject({
      noEditNeeded: false,
      rowsRight: false,
      pairedRows: 3,
      extraRows: 1,
    })
  })

  it('fails a wrong price', () => {
    const score = scoreImage(
      bill([
        ['Coffee', 250],
        ['Croissant', 280],
        ['Orange juice', 500],
      ]),
      summary(1000),
      cafe,
    )
    expect(score).toMatchObject({ noEditNeeded: false, pairedRows: 2 })
  })

  it('counts a quantity row as one row, at its line total', () => {
    const score = scoreImage(
      bill([['ARROZ DE PATO', 2, 404]]),
      summary(808),
      expected(808, [['ARROZ DE PATO', 808]]),
    )
    expect(score).toMatchObject({ noEditNeeded: true, pairedRows: 1 })
  })

  it('fails a same-price substitution', () => {
    // Coffee and Croissant at 2,50 expected; Coffee and an unrelated 2,50.
    const score = scoreImage(
      bill([
        ['Coffee', 250],
        ['Water', 250],
        ['Orange juice', 500],
      ]),
      summary(1000),
      cafe,
    )
    expect(score).toMatchObject({
      noEditNeeded: false,
      pairedRows: 2,
      extraRows: 1,
      pricePairedRows: 3,
      // The money is right, so the check's "match" isn't a false one.
      check: 'match',
      falseMatch: false,
    })
  })

  it('pairs duplicate same-price rows in order', () => {
    const score = scoreImage(
      bill([
        ['Bica', 80],
        ['Bica', 80],
        ['Pão', 30],
      ]),
      summary(190),
      expected(190, [
        ['Bica', 80],
        ['Bica', 80],
        ['Pão', 30],
      ]),
    )
    expect(score).toMatchObject({ noEditNeeded: true, pairedRows: 3 })
  })

  it('passes recognisable OCR names, counting them against name accuracy only', () => {
    const score = scoreImage(
      bill([
        ['C0LA ZER0', 150],
        ['BIGA', 80],
      ]),
      summary(230),
      expected(230, [
        ['Cola Zero', 150],
        ['Bica', 80],
      ]),
    )
    expect(score).toMatchObject({
      noEditNeeded: true,
      pairedRows: 2,
      exactNames: 0,
    })
  })

  it('fails a garbled name at the right price, without a false match', () => {
    const score = scoreImage(
      bill([
        ['|||1 ,:', 150],
        ['Bica', 80],
      ]),
      summary(230),
      expected(230, [
        ['Cola Zero', 150],
        ['Bica', 80],
      ]),
    )
    expect(score).toMatchObject({
      noEditNeeded: false,
      pairedRows: 1,
      extraRows: 1,
      check: 'match',
      falseMatch: false,
    })
  })

  describe('the bill-level adjustments (b)', () => {
    const diner = expected(1300, [['Burger', 1000]], { tip: 200, tax: 100 })
    const items: [string, number][] = [['Burger', 1000]]

    it('passes the right tip and tax', () => {
      const score = scoreImage(
        bill(items, { tip: amount(200), tax: amount(100) }),
        summary(1300),
        diner,
      )
      expect(score).toMatchObject({ noEditNeeded: true, falseMatch: false })
    })

    it('compares a percentage as its amount', () => {
      const score = scoreImage(
        bill(items, {
          tip: { kind: 'percent', ratio: { numerator: 20, denominator: 1 } },
          tax: amount(100),
        }),
        summary(1300),
        diner,
      )
      expect(score.adjustmentsRight).toBe(true)
    })

    it('fails the wrong tip amount', () => {
      const score = scoreImage(
        bill(items, { tip: amount(150), tax: amount(100) }),
        summary(1300),
        diner,
      )
      expect(score).toMatchObject({
        noEditNeeded: false,
        adjustmentsRight: false,
      })
    })

    it('fails the tip read as a discount', () => {
      const score = scoreImage(
        bill([['Burger', 1000]], { discount: amount(200) }),
        summary(800),
        expected(800, [['Burger', 1000]], { tip: 200 }),
      )
      expect(score).toMatchObject({
        noEditNeeded: false,
        adjustmentsRight: false,
      })
    })

    it('fails a service charge read as the tax, though the total closes', () => {
      const score = scoreImage(
        bill(items, { tax: amount(300) }),
        summary(1300),
        expected(1300, [['Burger', 1000]], { tip: 300 }),
      )
      expect(score).toMatchObject({
        noEditNeeded: false,
        adjustmentsRight: false,
        check: 'match',
        falseMatch: true,
      })
    })

    it('fails the wrong discount', () => {
      const score = scoreImage(
        bill(items, { discount: amount(50) }),
        summary(900),
        expected(900, [['Burger', 1000]], { discount: 100 }),
      )
      expect(score).toMatchObject({
        noEditNeeded: false,
        adjustmentsRight: false,
      })
    })

    it('never compares the split modes', () => {
      const score = scoreImage(
        bill(
          items,
          { tip: amount(200), tax: amount(100) },
          { taxMode: 'equal', tipMode: 'equal' },
        ),
        summary(1300),
        diner,
      )
      expect(score.noEditNeeded).toBe(true)
    })

    it('fails an adjustment read as an item row, though the total closes', () => {
      const score = scoreImage(
        bill([
          ['Burger', 1000],
          ['Service charge', 200],
        ]),
        summary(1200),
        expected(1200, [['Burger', 1000]], { tip: 200 }),
      )
      expect(score).toMatchObject({
        noEditNeeded: false,
        rowsRight: false,
        adjustmentsRight: false,
        check: 'match',
        falseMatch: true,
      })
    })

    it('fails an item row absorbed into an adjustment, though the total closes', () => {
      const score = scoreImage(
        bill([['Burger', 1000]], { tip: amount(300) }),
        summary(1300),
        expected(1300, [
          ['Burger', 1000],
          ['Dessert', 300],
        ]),
      )
      expect(score).toMatchObject({
        noEditNeeded: false,
        rowsRight: false,
        adjustmentsRight: false,
        falseMatch: true,
      })
    })
  })

  it('counts a missing and an extra item that cancel out as a false match', () => {
    const score = scoreImage(
      bill([
        ['Coffee', 250],
        ['Croissant', 250],
        ['Garbled', 500],
      ]),
      summary(1000),
      expected(1000, [
        ['Coffee', 250],
        ['Croissant', 250],
        ['Orange juice', 300],
        ['Toast', 200],
      ]),
    )
    expect(score).toMatchObject({
      noEditNeeded: false,
      check: 'match',
      falseMatch: true,
    })
  })

  it('fails a name-only failure without counting a false match', () => {
    const score = scoreImage(
      bill([
        ['Coffee', 250],
        ['Sopa', 250],
      ]),
      summary(500),
      expected(500, [
        ['Coffee', 250],
        ['Cola', 250],
      ]),
    )
    expect(score).toMatchObject({
      noEditNeeded: false,
      totalRight: true,
      adjustmentsRight: true,
      check: 'match',
      falseMatch: false,
    })
  })

  it('fails the wrong trusted total', () => {
    const score = scoreImage(
      bill([['Coffee', 250]]),
      summary(250),
      expected(260, [['Coffee', 250]]),
    )
    expect(score).toMatchObject({
      noEditNeeded: false,
      totalRight: false,
      falseMatch: true,
    })
  })

  it('scores a failed import as every row missing, never a false match', () => {
    expect(scoreFailedImport(cafe)).toMatchObject({
      noEditNeeded: false,
      expectedRows: 3,
      pairedRows: 0,
      extraRows: 0,
      check: 'importFailed',
      falseMatch: false,
    })
  })

  it('never counts the “Not read from the receipt” item as a read row', () => {
    const score = scoreImage(
      bill([
        ['Coffee', 250],
        [NOT_READ_ITEM_NAME, 750],
      ]),
      summary(1000),
      expected(1000, [
        ['Coffee', 250],
        ['Orange juice', 750],
      ]),
    )
    expect(score).toMatchObject({
      noEditNeeded: false,
      pairedRows: 1,
      extraRows: 0,
      // The stand-in closes the total: the check matches, the rows don't.
      check: 'match',
      falseMatch: true,
    })
  })
})

describe('amountCoverage (R19, kept from M2R1)', () => {
  const rows = (...items: [string, number][]) =>
    items.map(([name, value]) => ({ name, amount: cents(value) }))
  const prices = (...values: number[]): Cents[] => values.map(cents)

  it('gives the matched items’ sum over the total', () => {
    expect(
      amountCoverage(
        rows(['Pão', 100], ['Queijo', 300]),
        prices(100, 300, 600),
        cents(1000),
      ),
    ).toBe(0.4)
  })

  it('matches a price read twice only once', () => {
    expect(
      amountCoverage(
        rows(['Pão', 100], ['Pão', 100]),
        prices(100, 900),
        cents(1000),
      ),
    ).toBe(0.1)
  })

  it('never exceeds 100 %', () => {
    expect(
      amountCoverage(
        rows(['A', 500], ['B', 700]),
        prices(500, 700),
        cents(1000),
      ),
    ).toBe(1)
  })
})

describe('scoreSet', () => {
  const score = (
    noEditNeeded: boolean,
    paired: number,
    expectedRows: number,
    extra = 0,
    exact = paired,
    falseMatch = false,
  ): ImageScore => ({
    noEditNeeded,
    rowsRight: noEditNeeded,
    adjustmentsRight: true,
    totalRight: true,
    expectedRows,
    pairedRows: paired,
    extraRows: extra,
    exactNames: exact,
    pricePairedRows: paired,
    check: 'match',
    falseMatch,
    amountCoverage: 1,
  })

  it('fails a receipt when one of its images fails', () => {
    const result = scoreSet([
      { name: 'photo1', receipt: 'photo1', score: score(true, 3, 3) },
      { name: 'photo2', receipt: 'photo1', score: score(false, 2, 3, 1) },
      { name: 'cafe', receipt: 'cafe', score: score(true, 2, 2, 0, 1) },
    ])
    expect(result).toEqual({
      images: 3,
      receipts: 2,
      receiptAccuracy: 2 / 3,
      distinctReceiptAccuracy: 1 / 2,
      rowAccuracy: 7 / 8,
      extraRows: 1,
      priceRowAccuracy: 7 / 8,
      rowPrecision: 7 / 8,
      checkMatches: 1,
      nameAccuracy: 6 / 7,
      falseMatches: 0,
    })
  })

  it('tells a misread price from a misread name, and counts false items', () => {
    const misnamed = { ...score(false, 1, 3, 2), pricePairedRows: 3 }
    const result = scoreSet([
      { name: 'a', receipt: 'a', score: misnamed },
      {
        name: 'b',
        receipt: 'b',
        score: { ...score(false, 0, 2), check: 'mismatch' },
      },
    ])
    expect(result.rowAccuracy).toBe(1 / 5)
    expect(result.priceRowAccuracy).toBe(3 / 5)
    expect(result.rowPrecision).toBe(1 / 3)
    expect(result.checkMatches).toBe(1 / 2)
  })

  it('counts false matches', () => {
    expect(
      scoreSet([
        { name: 'a', receipt: 'a', score: score(false, 1, 2, 1, 1, true) },
      ]).falseMatches,
    ).toBe(1)
  })
})
