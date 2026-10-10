/**
 * The quick-expense form's logic (M4 plan, H4, H5, CP3): text in, an
 * expense (or field errors) out, with a live preview of each member's
 * share. Pure: the page renders it.
 */
import type { Region } from '../../app/region.ts'
import type { Translate } from '../../i18n/t.ts'
import {
  formatAmount,
  parseAmount,
  subtract,
  sum,
  type Cents,
} from '../../lib/money.ts'
import {
  amountInputMessage,
  amountText,
  ratioText,
} from '../split/components/fields.ts'
import { toBillRatio } from '../split/model.ts'
import {
  RECORD_VERSION,
  validateExpense,
  type CategoryId,
  type Expense,
  type ExpenseError,
  type Member,
  type QuickSplit,
  type QuickSplitKind,
} from './model.ts'
import { expenseShares } from './shares.ts'

export const QUICK_METHODS: readonly QuickSplitKind[] = [
  'equal',
  'shares',
  'exact',
  'percent',
]

export interface QuickFormState {
  description: string
  amount: string
  date: string
  category: CategoryId
  payerId: string
  method: QuickSplitKind
  /** The ticked members. */
  memberIds: string[]
  /** Per member, the text typed for the current method's input. */
  weights: Record<string, string>
  exact: Record<string, string>
  percents: Record<string, string>
}

/** A field's key: `member:<id>` for a member's own input. */
export type FieldKey =
  | 'description'
  | 'amount'
  | 'date'
  | 'category'
  | 'payer'
  | 'split'
  | `member:${string}`

export interface QuickFormResult {
  /** The expense to save, when nothing is wrong. */
  expense: Expense | null
  errors: Map<FieldKey, string>
  /** Each ticked member's share, when it can be worked out. */
  preview: Map<string, Cents> | null
  /** What exact amounts or percentages still have to place. */
  remaining:
    { kind: 'amount'; value: Cents } | { kind: 'percent'; units: number } | null
}

/** A new form: equal split among `memberIds`, the first one paying. */
export function emptyQuickForm(
  today: string,
  memberIds: readonly string[],
): QuickFormState {
  return {
    description: '',
    amount: '',
    date: today,
    category: 'other',
    payerId: memberIds[0] ?? '',
    method: 'equal',
    memberIds: [...memberIds],
    weights: {},
    exact: {},
    percents: {},
  }
}

/** An existing quick expense as form text, for editing. */
export function quickFormFromExpense(
  expense: Expense,
  split: QuickSplit,
  region: Region,
): QuickFormState {
  const state = emptyQuickForm(expense.date, [])
  state.description = expense.description
  state.amount = amountText(split.amount, region.locale)
  state.category = expense.category
  state.payerId = expense.payerId
  state.method = split.kind
  switch (split.kind) {
    case 'equal':
      state.memberIds = [...split.memberIds]
      break
    case 'shares':
      state.memberIds = split.shares.map((s) => s.memberId)
      for (const s of split.shares) state.weights[s.memberId] = String(s.weight)
      break
    case 'exact':
      state.memberIds = split.amounts.map((s) => s.memberId)
      for (const s of split.amounts) {
        state.exact[s.memberId] = amountText(s.amount, region.locale)
      }
      break
    case 'percent':
      state.memberIds = split.percents.map((s) => s.memberId)
      for (const s of split.percents) {
        state.percents[s.memberId] = ratioText(s.ratio, region.locale)
      }
      break
  }
  return state
}

/**
 * A percentage in thousandths as text in the region's format, without
 * trailing zeros: 75 000 → "75", 33 333 → "33,333".
 */
export function percentText(units: number, region: Region): string {
  let numerator = units
  let denominator = 1000
  while (denominator > 1 && numerator % 10 === 0) {
    numerator /= 10
    denominator /= 10
  }
  return ratioText({ numerator, denominator }, region.locale)
}

function modelErrorText(
  t: Translate,
  error: ExpenseError,
  state: QuickFormState,
  region: Region,
  amount: Cents | null,
): [FieldKey, string] {
  const at = (field: ExpenseError['field']): FieldKey =>
    field.kind === 'member' ? `member:${field.memberId}` : field.kind
  switch (error.code) {
    case 'descriptionInvalid':
      return [
        'description',
        state.description.trim() === ''
          ? t('expense.errors.description')
          : t('expense.errors.descriptionLength'),
      ]
    case 'dateInvalid':
      return ['date', t('expense.errors.date')]
    case 'dateOutOfRange':
      return ['date', t('expense.errors.dateRange')]
    case 'categoryUnknown':
      return ['category', t('expense.errors.save')]
    case 'amountOutOfRange':
      return ['amount', amountInputMessage(t, 'outOfRange', region)]
    case 'unknownMember':
      return error.field.kind === 'payer'
        ? ['payer', t('expense.errors.payer')]
        : [at(error.field), t('expense.errors.gone')]
    case 'noMembers':
    case 'duplicateMember':
      return ['split', t('expense.errors.noMembers')]
    case 'shareOutOfRange':
      return [at(error.field), t('expense.errors.share')]
    case 'exactOutOfRange':
      return [at(error.field), amountInputMessage(t, 'outOfRange', region)]
    case 'percentOutOfRange':
      return [at(error.field), t('expense.errors.percent')]
    case 'exactSumMismatch': {
      const total =
        state.method === 'exact'
          ? sumOf(state.exact, state.memberIds, region)
          : 0
      return [
        'split',
        t('expense.errors.exactSum', {
          total: formatAmount(total as Cents, region),
          amount: formatAmount(amount ?? (0 as Cents), region),
        }),
      ]
    }
    case 'percentSumMismatch':
      return [
        'split',
        t('expense.errors.percentSum', {
          total: percentText(percentUnitsOf(state), region),
        }),
      ]
    case 'billInvalid':
    case 'mappingInvalid':
      return ['split', t('expense.errors.save')]
  }
}

function sumOf(
  texts: Record<string, string>,
  ids: readonly string[],
  region: Region,
): number {
  let total = 0
  for (const id of ids) {
    const parsed = parseAmount(texts[id] ?? '', region.locale, region.currency)
    if (parsed.ok) total += parsed.value
  }
  return total
}

function percentUnitsOf(state: QuickFormState): number {
  let total = 0
  for (const id of state.memberIds) {
    const parsed = toBillRatio(state.percents[id] ?? '')
    if (parsed.ok) {
      total += parsed.ratio.numerator * (1000 / parsed.ratio.denominator)
    }
  }
  return total
}

/**
 * Builds the expense the form describes. Inputs that don't parse are
 * field errors before the model's own validation (`validateExpense`)
 * runs on the rest.
 */
export function buildQuickExpense(
  state: QuickFormState,
  context: {
    t: Translate
    region: Region
    id: string
    householdId: string
    members: readonly Member[]
    today: string
    createdAt: string
    now: string
  },
): QuickFormResult {
  const { t, region } = context
  const errors = new Map<FieldKey, string>()
  const parsedAmount = parseAmount(state.amount, region.locale, region.currency)
  if (!parsedAmount.ok) {
    errors.set('amount', amountInputMessage(t, parsedAmount.error, region))
  } else if (parsedAmount.value <= 0) {
    errors.set('amount', amountInputMessage(t, 'empty', region))
  }
  const amount = parsedAmount.ok ? parsedAmount.value : (0 as Cents)

  const ids = state.memberIds
  let split: QuickSplit
  let remaining: QuickFormResult['remaining'] = null
  switch (state.method) {
    case 'equal':
      split = { kind: 'equal', amount, memberIds: [...ids] }
      break
    case 'shares': {
      const shares = ids.map((memberId) => {
        const text = (state.weights[memberId] ?? '1').trim()
        const weight = /^\d{1,2}$/.test(text) ? Number(text) : Number.NaN
        if (!(weight >= 1 && weight <= 99)) {
          errors.set(`member:${memberId}`, t('expense.errors.share'))
        }
        return { memberId, weight: Number.isNaN(weight) ? 0 : weight }
      })
      split = { kind: 'shares', amount, shares }
      break
    }
    case 'exact': {
      const amounts = ids.map((memberId) => {
        const parsed = parseAmount(
          state.exact[memberId] ?? '',
          region.locale,
          region.currency,
        )
        if (!parsed.ok && parsed.error !== 'empty') {
          errors.set(
            `member:${memberId}`,
            amountInputMessage(t, parsed.error, region),
          )
        } else if (parsed.ok && parsed.value < 0) {
          errors.set(
            `member:${memberId}`,
            amountInputMessage(t, 'negative', region),
          )
        }
        return {
          memberId,
          amount: parsed.ok ? parsed.value : (0 as Cents),
        }
      })
      split = { kind: 'exact', amount, amounts }
      remaining = {
        kind: 'amount',
        value: subtract(amount, sum(amounts.map((entry) => entry.amount))),
      }
      break
    }
    case 'percent': {
      let units = 0
      const percents = ids.map((memberId) => {
        const text = state.percents[memberId] ?? ''
        const parsed = toBillRatio(text)
        if (!parsed.ok && parsed.error !== 'empty') {
          errors.set(`member:${memberId}`, t('expense.errors.percent'))
        }
        const ratio = parsed.ok
          ? parsed.ratio
          : { numerator: 0, denominator: 1 }
        units += ratio.numerator * (1000 / ratio.denominator)
        return { memberId, ratio }
      })
      split = { kind: 'percent', amount, percents }
      remaining = { kind: 'percent', units: 100_000 - units }
      break
    }
  }

  const expense: Expense = {
    v: RECORD_VERSION,
    id: context.id,
    householdId: context.householdId,
    description: state.description.trim(),
    date: state.date,
    category: state.category,
    payerId: state.payerId,
    split,
    createdAt: context.createdAt,
    updatedAt: context.now,
  }
  for (const error of validateExpense(
    expense,
    context.members,
    context.today,
  )) {
    const [key, text] = modelErrorText(
      t,
      error,
      state,
      region,
      parsedAmount.ok ? amount : null,
    )
    if (!errors.has(key)) errors.set(key, text)
  }
  const shares = parsedAmount.ok && amount > 0 ? expenseShares(expense) : null
  return {
    expense: errors.size === 0 ? expense : null,
    errors,
    preview: shares,
    remaining,
  }
}
