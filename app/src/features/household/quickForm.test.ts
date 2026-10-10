// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { DEFAULT_REGION } from '../../app/region.ts'
import { translator } from '../../i18n/t.ts'
import { NOW, TODAY, fourMembers } from '../../test/households.ts'
import {
  buildQuickExpense,
  emptyQuickForm,
  percentText,
  quickFormFromExpense,
  type QuickFormState,
} from './quickForm.ts'

const t = translator('en')
const members = fourMembers()
const context = {
  t,
  region: DEFAULT_REGION,
  id: 'e1',
  householdId: 'h1',
  members,
  today: TODAY,
  createdAt: NOW,
  now: NOW,
}

function form(change: Partial<QuickFormState>): QuickFormState {
  return {
    ...emptyQuickForm(TODAY, ['ana', 'marta', 'joao']),
    description: 'Internet',
    amount: '30,00',
    ...change,
  }
}

describe('the quick-expense form (CP3)', () => {
  it('builds an equal split with a payer outside it (H6)', () => {
    const result = buildQuickExpense(form({ payerId: 'tiago' }), context)
    expect(result.errors).toEqual(new Map())
    expect(result.expense?.split).toEqual({
      kind: 'equal',
      amount: 3000,
      memberIds: ['ana', 'marta', 'joao'],
    })
    expect([...(result.preview?.values() ?? [])]).toEqual([1000, 1000, 1000])
  })

  it('builds shares, defaulting each member to 1', () => {
    const result = buildQuickExpense(
      form({ method: 'shares', weights: { ana: '2' } }),
      context,
    )
    expect(result.expense?.split).toMatchObject({
      kind: 'shares',
      shares: [
        { memberId: 'ana', weight: 2 },
        { memberId: 'marta', weight: 1 },
        { memberId: 'joao', weight: 1 },
      ],
    })
    expect(result.preview?.get('ana')).toBe(1500)
  })

  it('shows what exact amounts still have to place, then saves them', () => {
    let result = buildQuickExpense(
      form({ method: 'exact', exact: { ana: '10,00', marta: '5,00' } }),
      context,
    )
    expect(result.remaining).toEqual({ kind: 'amount', value: 1500 })
    expect(result.errors.get('split')?.replace(/\s/g, ' ')).toBe(
      'The amounts add up to 15,00 €, not 30,00 €.',
    )
    result = buildQuickExpense(
      form({
        method: 'exact',
        exact: { ana: '10,00', marta: '5,00', joao: '15' },
      }),
      context,
    )
    expect(result.errors).toEqual(new Map())
    expect(result.remaining).toEqual({ kind: 'amount', value: 0 })
  })

  it('takes percentages with up to three decimals, summing to exactly 100', () => {
    let result = buildQuickExpense(
      form({ method: 'percent', percents: { ana: '50', marta: '25' } }),
      context,
    )
    expect(result.remaining).toEqual({ kind: 'percent', units: 25_000 })
    expect(result.errors.get('split')).toBe(
      'The percentages add up to 75 %, not 100 %.',
    )
    result = buildQuickExpense(
      form({
        method: 'percent',
        percents: { ana: '33,333', marta: '33,333', joao: '33,334' },
      }),
      context,
    )
    expect(result.errors).toEqual(new Map())
    result = buildQuickExpense(
      form({ method: 'percent', percents: { ana: '33,3333' } }),
      context,
    )
    expect(result.errors.get('member:ana')).toBe(
      'Use a percentage from 0 to 100, with up to 3 decimals.',
    )
  })

  it('reports each field in words', () => {
    const result = buildQuickExpense(
      form({ description: '', amount: '', date: '2030-01-01', memberIds: [] }),
      context,
    )
    expect(result.expense).toBeNull()
    expect(percentText(33_333, DEFAULT_REGION)).toBe('33,333')
    expect(percentText(30_500, DEFAULT_REGION)).toBe('30,5')
    expect(Object.fromEntries(result.errors)).toEqual({
      amount: 'Enter an amount, like 12,50',
      description: 'Say what it was.',
      date: 'Use a date from 2000 to a year from today.',
      split: 'Choose at least one person.',
    })
  })

  it('reads an expense back into the form unchanged', () => {
    const saved = buildQuickExpense(
      form({
        method: 'percent',
        percents: { ana: '20', marta: '30,5', joao: '49,5' },
      }),
      context,
    ).expense
    expect(saved).not.toBeNull()
    if (saved === null || saved.split.kind === 'itemised') return
    const again = buildQuickExpense(
      quickFormFromExpense(saved, saved.split, DEFAULT_REGION),
      context,
    )
    expect(again.expense).toEqual(saved)
  })
})
