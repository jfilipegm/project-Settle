import { describe, expect, it } from 'vitest'
import { cents } from '../../lib/money.ts'
import { canAddAsItem, nameFromLine } from './lineReview.ts'
import type { ReviewLine } from './model.ts'

const line = (extra: Partial<ReviewLine>): ReviewLine => ({
  text: 'Taxa de servico 1,50',
  role: 'ignored',
  amount: cents(150),
  ...extra,
})

describe('nameFromLine', () => {
  it('drops the amount and its tax code', () => {
    expect(nameFromLine('Taxa de servico 1,50')).toBe('Taxa de servico')
    expect(nameFromLine('Deposito 0.20 0,20 F')).toBe('Deposito 0.20')
    expect(nameFromLine('Saco 0,15 €')).toBe('Saco')
  })
  it('keeps the text when it is only an amount, cut to 60', () => {
    expect(nameFromLine('1,50')).toBe('1,50')
    expect(nameFromLine(`${'A'.repeat(70)} 1,00`)).toHaveLength(60)
  })
})

describe('canAddAsItem', () => {
  it('offers an ignored line or an item detail with a positive amount', () => {
    expect(canAddAsItem(line({}), 3)).toBe(true)
    expect(canAddAsItem(line({ role: 'itemDetail' }), 3)).toBe(true)
  })
  it('never an item, a total, a line with no amount, or at 100 items', () => {
    expect(canAddAsItem(line({ role: 'item' }), 3)).toBe(false)
    expect(canAddAsItem(line({ role: 'total' }), 3)).toBe(false)
    expect(canAddAsItem(line({ amount: undefined }), 3)).toBe(false)
    expect(canAddAsItem(line({ amount: cents(-50) }), 3)).toBe(false)
    expect(canAddAsItem(line({}), 100)).toBe(false)
  })
})
