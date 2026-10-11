// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { DEFAULT_REGION } from '../../app/region.ts'
import { translator } from '../../i18n/t.ts'
import { cents } from '../../lib/money.ts'
import { fourMembers, quickExpense, settlement } from '../../test/households.ts'
import { balances, suggestSettlements, type LedgerInput } from './balances.ts'
import { IncompleteBalancesError, balanceText } from './balanceText.ts'
import type { Expense } from './model.ts'

/*
 * The settle-up text (M5 plan, B9): both languages, no date in the
 * header, the "dated after today" line, and no text over incomplete
 * balances (M-I-1).
 */

const NONE = { members: 0, expenses: 0, settlements: 0 }

function exact(
  id: string,
  payerId: string,
  amounts: Record<string, number>,
  extra: Partial<Expense> = {},
): Expense {
  const total = Object.values(amounts).reduce((a, b) => a + b, 0)
  return quickExpense(
    id,
    {
      kind: 'exact',
      amount: cents(total),
      amounts: Object.entries(amounts).map(([memberId, amount]) => ({
        memberId,
        amount: cents(amount),
      })),
    },
    { payerId, ...extra },
  )
}

const canvas: LedgerInput = {
  members: fourMembers(),
  expenses: [
    exact('e1', 'ana', { tiago: 9115 }),
    exact('e2', 'marta', { joao: 2240, tiago: 765 }),
  ],
  settlements: [],
  unreadable: NONE,
}

const names = new Map(fourMembers().map((m) => [m.id, m.name]))

function text(input: LedgerInput, language: 'en' | 'pt' = 'en'): string {
  const result = balances(input, { today: '2026-10-09' })
  return balanceText({
    t: translator(language),
    region: DEFAULT_REGION,
    householdName: 'Rua das Flores 12',
    result,
    rows: result.members,
    payments: suggestSettlements(result.members),
    nameOf: (id) => names.get(id) ?? '',
  }).replace(/[\u00a0\u202f]/g, ' ')
}

describe('balanceText (B9)', () => {
  it('writes the canvas’s balances and payments, with no date', () => {
    expect(text(canvas)).toBe(
      [
        'Rua das Flores 12, balances',
        'Ana gets back 91,15 €',
        'Marta gets back 30,05 €',
        'João owes 22,40 €',
        'Tiago owes 98,80 €',
        '',
        'To settle up, 3 payments:',
        'Tiago pays Ana 91,15 €',
        'João pays Marta 22,40 €',
        'Tiago pays Marta 7,65 €',
      ].join('\n'),
    )
  })

  it('writes it in Portuguese', () => {
    expect(text(canvas, 'pt')).toBe(
      [
        'Rua das Flores 12, saldos',
        'Ana recebe 91,15 €',
        'Marta recebe 30,05 €',
        'João deve 22,40 €',
        'Tiago deve 98,80 €',
        '',
        'Para acertar contas, 3 pagamentos:',
        'Tiago paga a Ana 91,15 €',
        'João paga a Marta 22,40 €',
        'Tiago paga a Marta 7,65 €',
      ].join('\n'),
    )
  })

  it('says everyone is settled up once the payments are in', () => {
    const settled = {
      ...canvas,
      settlements: [
        settlement('s1', 'tiago', 'ana', 9115),
        settlement('s2', 'joao', 'marta', 2240),
        settlement('s3', 'tiago', 'marta', 765),
      ],
    }
    expect(text(settled).split('\n').slice(-2)).toEqual([
      '',
      'Everyone is settled up.',
    ])
    expect(text(settled)).toContain('Ana is settled up')
  })

  it('says when it includes records dated after today (L2-I2)', () => {
    const ahead = {
      ...canvas,
      expenses: [
        ...canvas.expenses,
        exact('e3', 'ana', { tiago: 100 }, { date: '2026-12-01' }),
      ],
    }
    expect(text(ahead).split('\n').slice(0, 2)).toEqual([
      'Rua das Flores 12, balances',
      'Includes 1 expense dated after today.',
    ])
  })

  it('refuses incomplete balances (M-I-1)', () => {
    expect(() =>
      text({ ...canvas, unreadable: { ...NONE, expenses: 1 } }),
    ).toThrow(IncompleteBalancesError)
  })
})
