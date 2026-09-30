import { describe, expect, it } from 'vitest'
import {
  fold,
  normalizeLine,
  readAmountToken,
  readDateToken,
  tokenizeLine,
  type LineToken,
} from './amounts.ts'
import { findPhrase, hasPhrase, startsWithPhrase, TOTAL } from './keywords.ts'

function kinds(text: string): string[] {
  return tokenizeLine(text).map((token) => `${token.kind}:${token.text}`)
}

function amounts(text: string): number[] {
  return tokenizeLine(text)
    .filter(
      (token): token is Extract<LineToken, { kind: 'amount' }> =>
        token.kind === 'amount',
    )
    .map((token) => token.value)
}

describe('readAmountToken (rule 2)', () => {
  it.each([
    ['1.234,56', 123456],
    ['1,234.56', 123456],
    ['12,50', 1250],
    ['12.50', 1250],
    ['0,05', 5],
    ['-0,50', -50],
    ['€12.50', 1250],
    ['12,50€', 1250],
    ['-€3,20', -320],
    ['€-3,20', -320],
    ['US$4.00', 400],
    ['£9.99', 999],
    ['12.345.678,90', 1234567890],
  ])('%s is %i cents', (token, expected) => {
    expect(readAmountToken(token)?.value).toBe(expected)
  })

  it('records the currency', () => {
    expect(readAmountToken('€12.50')?.currency).toBe('EUR')
    expect(readAmountToken('12,50€')?.currency).toBe('EUR')
    expect(readAmountToken('£9.99')?.currency).toBe('GBP')
    expect(readAmountToken('$9.99')?.currency).toBe('USD')
    expect(readAmountToken('US$9.99')?.currency).toBe('USD')
    expect(readAmountToken('12,50')?.currency).toBeUndefined()
  })

  it.each([
    '12,5',
    '12',
    '1,2345',
    '1 100,00',
    '1.23.45',
    '12,50,00',
    'abc',
    '',
  ])('%j is not an amount', (token) => {
    expect(readAmountToken(token)).toBeUndefined()
  })

  it('never reads a negative zero', () => {
    expect(Object.is(readAmountToken('-0,00')?.value, -0)).toBe(false)
  })
})

describe('amounts on a line', () => {
  it('reads a currency symbol or code before or after the amount', () => {
    expect(amounts('Total 12,50 €')).toEqual([1250])
    expect(amounts('Total EUR 12,50')).toEqual([1250])
    expect(amounts('Total €12.50')).toEqual([1250])
  })

  it('takes a tax-code letter after an amount as a tax code', () => {
    expect(kinds('Imperial 4,40 A')).toEqual([
      'word:Imperial',
      'amount:4,40',
      'taxCode:A',
    ])
    expect(kinds('Pão 1,20 (C)')).toEqual([
      'word:Pão',
      'amount:1,20',
      'taxCode:(C)',
    ])
  })

  it('never reads spaces as a thousands separator (I-2)', () => {
    expect(kinds('Arroz 1 100,00')).toEqual([
      'word:Arroz',
      'number:1',
      'amount:100,00',
    ])
  })

  it('never matches an amount inside a longer run (R2-I-3)', () => {
    expect(amounts('Data 28.09.26')).toEqual([])
    expect(kinds('Data 28.09.26')).toEqual(['word:Data', 'date:28.09.26'])
  })

  it('never reads a time as an amount (R2-I-3)', () => {
    expect(kinds('28.09.2026 12.30')).toEqual(['date:28.09.2026', 'time:12.30'])
    expect(kinds('Hora: 12.30')).toEqual(['word:Hora:', 'time:12.30'])
    expect(kinds('12:30')).toEqual(['time:12:30'])
    // Without a date or `hora` next to it, it's an amount.
    expect(amounts('Sopa 12.30')).toEqual([1230])
  })

  it('reads rates, with or without a space before the sign', () => {
    expect(kinds('23% 10,16 2,34')).toEqual([
      'rate:23%',
      'amount:10,16',
      'amount:2,34',
    ])
    expect(kinds('IVA 12,5 % 4,00')).toEqual([
      'word:IVA',
      'rate:12,5%',
      'amount:4,00',
    ])
  })

  it('never takes a multiplication X for a tax code', () => {
    expect(kinds('2 X 2,20')).toEqual(['number:2', 'word:X', 'amount:2,20'])
  })
})

describe('OCR fixes (rule 1)', () => {
  it('fixes O/o → 0, l/I/| → 1 and S → 5 between digits in amounts', () => {
    const [fixed] = tokenizeLine('1O,5O')
    expect(fixed).toMatchObject({ kind: 'amount', value: 1050, fixed: true })
    expect(amounts('Cafe l,50')).toEqual([150])
    expect(amounts('Cafe |,50')).toEqual([150])
    expect(amounts('Cafe I,5o')).toEqual([150])
    expect(amounts('Vinho 1S0,00')).toEqual([15000])
    // Not between two digits: stays an S, so no amount.
    expect(amounts('Vinho 1S,00')).toEqual([])
  })

  it('marks only fixed amounts as fixed', () => {
    const [plain] = tokenizeLine('10,50')
    expect(plain).toMatchObject({ kind: 'amount', fixed: false })
  })

  it('leaves words alone', () => {
    expect(kinds('SOLO Oil IVA')).toEqual(['word:SOLO', 'word:Oil', 'word:IVA'])
    // An S that isn't between digits stays a letter.
    expect(amounts('S,50')).toEqual([])
  })

  it('closes up `1, 50` and collapses whitespace', () => {
    expect(normalizeLine('  Cafe \t 1, 50  ')).toBe('Cafe 1,50')
    expect(amounts('Cafe    1, 50')).toEqual([150])
    expect(normalizeLine('Arroz 1 100,00')).toBe('Arroz 1 100,00')
  })
})

describe('readDateToken (rule 5)', () => {
  it.each([
    ['28-09-2026', '2026-09-28'],
    ['28/09/2026', '2026-09-28'],
    ['28.09.26', '2026-09-28'],
    ['28.09.2026', '2026-09-28'],
    ['2026-09-28', '2026-09-28'],
    ['29-02-2028', '2028-02-29'],
  ])('%s is %s', (token, iso) => {
    expect(readDateToken(token)).toBe(iso)
  })

  it.each([
    '31-02-2026',
    '29-02-2026',
    '32-01-2026',
    '12-13-2026',
    '28-09-26',
    '2026-13-01',
    '28-09/2026',
  ])('%s is not a date', (token) => {
    expect(readDateToken(token)).toBeUndefined()
  })
})

describe('keywords', () => {
  it('folds case and accents', () => {
    expect(fold('SERVIÇO Incluído')).toBe('servico incluido')
  })

  it('matches whole words and phrases only', () => {
    expect(findPhrase(['total', 'a', 'pagar'], 'a pagar')).toBe(1)
    expect(findPhrase(['subtotal'], 'total')).toBe(-1)
    expect(hasPhrase(['taxa', 'extra'], ['tax'])).toBe(false)
    expect(hasPhrase(['total', 'a', 'pagar'], TOTAL)).toBe(true)
    expect(startsWithPhrase(['menu', 'promocao'], ['promocao'])).toBe(false)
  })
})
