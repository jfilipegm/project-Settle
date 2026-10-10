import { useId, useMemo, useState } from 'react'
import { useRegion } from '../../../app/region.ts'
import {
  ExpenseNotFoundError,
  MissingReferenceError,
  saveExpense,
} from '../../../data/repository.ts'
import { useT } from '../../../i18n/language.ts'
import { formatAmount, negate } from '../../../lib/money.ts'
import { Amount } from '../../../ui/Amount.tsx'
import { Button } from '../../../ui/Button.tsx'
import { Checkbox } from '../../../ui/Checkbox.tsx'
import { SelectField, TextField } from '../../../ui/Field.tsx'
import { PersonBadge } from '../../../ui/PersonBadge.tsx'
import { newId } from '../../split/billReducer.ts'
import { useHouseholdData } from '../householdData.ts'
import {
  CATEGORY_IDS,
  HOUSEHOLD_LIMITS,
  isActiveOn,
  sortByPosition,
  type Expense,
  type Member,
} from '../model.ts'
import {
  QUICK_METHODS,
  buildQuickExpense,
  emptyQuickForm,
  percentText,
  quickFormFromExpense,
  type QuickFormState,
} from '../quickForm.ts'
import styles from './QuickExpenseForm.module.css'

/**
 * Add or edit a quick expense (M4 plan, H4 to H6, CP3): what, how much,
 * when, which category, who paid (anyone active that day, in the split or
 * not), and the split, with each member's share shown as it's typed.
 */
export function QuickExpenseForm({
  householdId,
  members,
  initial,
  today,
  onSaved,
  onCancel,
}: {
  householdId: string
  /** Every member, in position order. */
  members: readonly Member[]
  initial?: Expense
  today: string
  onSaved: (expenseId: string) => void
  onCancel: () => void
}) {
  const t = useT()
  const { region } = useRegion()
  const { db, changed } = useHouseholdData()
  const methodName = useId()
  const [id] = useState(() => initial?.id ?? newId())
  const [createdAt] = useState(
    () => initial?.createdAt ?? new Date().toISOString(),
  )
  const [state, setState] = useState<QuickFormState>(() =>
    initial !== undefined && initial.split.kind !== 'itemised'
      ? quickFormFromExpense(initial, initial.split, region)
      : emptyQuickForm(
          today,
          sortByPosition(members.filter((m) => isActiveOn(m, today))).map(
            (m) => m.id,
          ),
        ),
  )
  const [submitted, setSubmitted] = useState(false)
  const [saveError, setSaveError] = useState<string>()

  // Offered: whoever is active on the expense's date, and anyone already
  // on it, so a member who has left stays on their past expenses (H6).
  const candidates = useMemo(
    () =>
      sortByPosition(
        members.filter(
          (m) =>
            isActiveOn(m, state.date) ||
            state.memberIds.includes(m.id) ||
            m.id === state.payerId,
        ),
      ),
    [members, state.date, state.memberIds, state.payerId],
  )

  const result = buildQuickExpense(state, {
    t,
    region,
    id,
    householdId,
    members,
    today,
    createdAt,
    now: new Date().toISOString(),
  })
  const error = (key: Parameters<typeof result.errors.get>[0]) =>
    submitted ? result.errors.get(key) : undefined

  const update = (change: Partial<QuickFormState>) =>
    setState((current) => ({ ...current, ...change }))

  const toggleMember = (memberId: string, on: boolean) =>
    setState((current) => ({
      ...current,
      memberIds: on
        ? sortByPosition(
            members.filter(
              (m) => current.memberIds.includes(m.id) || m.id === memberId,
            ),
          ).map((m) => m.id)
        : current.memberIds.filter((other) => other !== memberId),
    }))

  const memberInput = (member: Member) => {
    const key = `member:${member.id}` as const
    switch (state.method) {
      case 'equal':
        return null
      case 'shares':
        return (
          <TextField
            className={styles.memberInput}
            label={t('expense.sharesFor', { name: member.name })}
            inputMode="numeric"
            value={state.weights[member.id] ?? '1'}
            error={error(key)}
            onChange={(event) =>
              update({
                weights: { ...state.weights, [member.id]: event.target.value },
              })
            }
          />
        )
      case 'exact':
        return (
          <TextField
            className={styles.memberInput}
            label={t('expense.exactFor', { name: member.name })}
            inputMode="decimal"
            value={state.exact[member.id] ?? ''}
            error={error(key)}
            onChange={(event) =>
              update({
                exact: { ...state.exact, [member.id]: event.target.value },
              })
            }
          />
        )
      case 'percent':
        return (
          <TextField
            className={styles.memberInput}
            label={t('expense.percentFor', { name: member.name })}
            inputMode="decimal"
            value={state.percents[member.id] ?? ''}
            error={error(key)}
            onChange={(event) =>
              update({
                percents: {
                  ...state.percents,
                  [member.id]: event.target.value,
                },
              })
            }
          />
        )
    }
  }

  const remaining = result.remaining
  const remainingText =
    remaining === null
      ? null
      : remaining.kind === 'amount'
        ? remaining.value === 0
          ? null
          : remaining.value > 0
            ? t('expense.leftToSplit', {
                amount: formatAmount(remaining.value, region),
              })
            : t('expense.overSplit', {
                amount: formatAmount(negate(remaining.value), region),
              })
        : remaining.units === 0
          ? null
          : remaining.units > 0
            ? t('expense.percentLeft', {
                percent: percentText(remaining.units, region),
              })
            : t('expense.percentOver', {
                percent: percentText(-remaining.units, region),
              })

  const submit = () => {
    setSubmitted(true)
    setSaveError(undefined)
    if (result.expense === null || db === null) return
    const expense = result.expense
    saveExpense(db, expense, [], { replacing: initial !== undefined }).then(
      () => {
        changed()
        onSaved(expense.id)
      },
      (failure: unknown) =>
        setSaveError(
          failure instanceof MissingReferenceError
            ? t('expense.errors.gone')
            : failure instanceof ExpenseNotFoundError
              ? t('expense.errors.deleted')
              : t('expense.errors.save'),
        ),
    )
  }

  return (
    <form
      className={styles.form}
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <TextField
        label={t('expense.description')}
        hint={t('expense.descriptionHint')}
        value={state.description}
        maxLength={HOUSEHOLD_LIMITS.maxDescriptionLength}
        error={error('description')}
        onChange={(event) => update({ description: event.target.value })}
      />
      <div className={styles.pair}>
        <TextField
          label={t('expense.amount')}
          inputMode="decimal"
          value={state.amount}
          error={error('amount')}
          onChange={(event) => update({ amount: event.target.value })}
        />
        <TextField
          type="date"
          label={t('expense.date')}
          value={state.date}
          error={error('date')}
          onChange={(event) => update({ date: event.target.value })}
        />
      </div>
      <div className={styles.pair}>
        <SelectField
          label={t('expense.category')}
          value={state.category}
          onChange={(event) =>
            update({
              category: event.target.value as QuickFormState['category'],
            })
          }
        >
          {CATEGORY_IDS.map((category) => (
            <option key={category} value={category}>
              {t(`categories.${category}`)}
            </option>
          ))}
        </SelectField>
        <SelectField
          label={t('expense.payer')}
          hint={t('expense.payerHint')}
          value={state.payerId}
          error={error('payer')}
          onChange={(event) => update({ payerId: event.target.value })}
        >
          {candidates.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name}
            </option>
          ))}
        </SelectField>
      </div>

      <fieldset className={styles.split}>
        <legend className={styles.legend}>{t('expense.split')}</legend>
        <div className={styles.methods}>
          {QUICK_METHODS.map((method) => (
            <label key={method} className={styles.method}>
              <input
                type="radio"
                name={methodName}
                checked={state.method === method}
                onChange={() => update({ method })}
              />
              <span>{t(`expense.method.${method}`)}</span>
            </label>
          ))}
        </div>
        <ul className={styles.members}>
          {candidates.map((member) => {
            const ticked = state.memberIds.includes(member.id)
            const share = result.preview?.get(member.id)
            return (
              <li key={member.id} className={styles.member}>
                <Checkbox
                  className={styles.memberCheck}
                  label={
                    <PersonBadge person={member} index={member.position} />
                  }
                  checked={ticked}
                  onChange={(event) =>
                    toggleMember(member.id, event.target.checked)
                  }
                />
                {ticked && memberInput(member)}
                <span className={styles.share}>
                  {ticked && share !== undefined && (
                    <Amount value={share} region={region} />
                  )}
                </span>
              </li>
            )
          })}
        </ul>
        {remainingText !== null && (
          <p className={styles.remaining} role="status">
            {remainingText}
          </p>
        )}
        {error('split') !== undefined && (
          <p className={styles.error} role="alert">
            {error('split')}
          </p>
        )}
      </fieldset>

      {saveError !== undefined && (
        <p className={styles.error} role="alert">
          {saveError}
        </p>
      )}
      <div className={styles.actions}>
        <Button onClick={onCancel}>{t('expense.cancel')}</Button>
        <Button type="submit" variant="primary">
          {t('expense.save')}
        </Button>
      </div>
    </form>
  )
}
