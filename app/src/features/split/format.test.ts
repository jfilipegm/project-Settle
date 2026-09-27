import { describe, expect, it } from 'vitest'
import { cents } from '../../lib/money.ts'
import { resultAsText } from './format.ts'
import { computeSplit } from './split.ts'
import type { Bill } from './model.ts'

const input: Bill = {
  people: [
    { id: 'a', name: 'Ana' },
    { id: 'b', name: '' },
    { id: 'c', name: 'Carla' },
  ],
  items: [
    {
      id: 'x',
      name: 'Pizza',
      quantity: { numerator: 1, denominator: 1 },
      unitPrice: cents(123456),
      assignees: [
        { personId: 'a', weight: 1 },
        { personId: 'b', weight: 1 },
      ],
    },
  ],
  tax: { kind: 'amount', value: cents(0) },
  taxMode: 'proportional',
  tip: { kind: 'amount', value: cents(0) },
  tipMode: 'proportional',
  discount: { kind: 'amount', value: cents(0) },
  payerId: 'a',
}

function text(region: Parameters<typeof resultAsText>[1]): string {
  const outcome = computeSplit(input)
  if (!outcome.ok) {
    throw new Error('test bill is invalid')
  }
  return resultAsText(outcome.result, region)
}

describe('resultAsText', () => {
  it('lists the total, each person and who owes whom, in pt-PT euros', () => {
    // Intl puts a no-break space before €; compare with plain spaces.
    expect(
      text({ locale: 'pt-PT', currency: 'EUR' }).replace(
        /[\u00a0\u202f]/g,
        ' ',
      ),
    ).toBe(
      [
        'Bill total: 1234,56 €',
        '',
        'Ana: 617,28 €',
        'Person 2: 617,28 €',
        'Carla: 0,00 €',
        '',
        'Person 2 owes Ana 617,28 €',
      ].join('\n'),
    )
  })

  it('uses the region locale and currency', () => {
    const result = text({ locale: 'en-GB', currency: 'GBP' })
    expect(result).toContain('Bill total: £1,234.56')
    expect(result).toContain('Person 2 owes Ana £617.28')
  })
})
