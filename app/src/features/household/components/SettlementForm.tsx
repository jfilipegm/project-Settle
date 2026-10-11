import { useState } from 'react'
import { useRegion } from '../../../app/region.ts'
import {
  MissingReferenceError,
  SettlementNotFoundError,
  saveSettlement,
} from '../../../data/repository.ts'
import { useT } from '../../../i18n/language.ts'
import { parseAmount, type Cents } from '../../../lib/money.ts'
import { Button } from '../../../ui/Button.tsx'
import { SelectField, TextField } from '../../../ui/Field.tsx'
import { newId } from '../../split/billReducer.ts'
import {
  amountInputMessage,
  amountText,
} from '../../split/components/fields.ts'
import { displayName } from '../../split/model.ts'
import { paymentOutcome, type LedgerInput } from '../balances.ts'
import { hasLeft, outcomeLine } from '../balanceWords.ts'
import { useHouseholdData } from '../householdData.ts'
import {
  RECORD_VERSION,
  SETTLEMENT_LIMITS,
  sortByPosition,
  validateSettlement,
  type Member,
  type Settlement,
  type SettlementField,
} from '../model.ts'
import styles from './QuickExpenseForm.module.css'

/** What Mark as paid fills in: a suggested payment. */
export interface PaymentPrefill {
  fromId: string
  toId: string
  amount: Cents
}

/**
 * Record or edit a payment (M5 plan, B6): from, to, the amount, the date
 * (today by default) and an optional note. Under the fields, both
 * members' outcome over the default balances, before saving; an edit
 * leaves the original payment out (L2-I1). Over incomplete balances the
 * outcome isn't computed (M-I-1); saving still works, since a payment
 * that was made can always be written down.
 */
export function SettlementForm({
  householdId,
  members,
  ledger,
  today,
  initial,
  prefill,
  onSaved,
  onCancel,
}: {
  householdId: string
  /** Every member, in position order. */
  members: readonly Member[]
  /** The household's ledger, for the outcome line. */
  ledger: LedgerInput
  today: string
  /** The payment being edited. */
  initial?: Settlement
  /** A suggestion's payment (Mark as paid). */
  prefill?: PaymentPrefill
  onSaved: (settlement: Settlement) => void
  onCancel: () => void
}) {
  const t = useT()
  const { region } = useRegion()
  const { db, changed } = useHouseholdData()
  const [id] = useState(() => initial?.id ?? newId())
  const [createdAt] = useState(
    () => initial?.createdAt ?? new Date().toISOString(),
  )
  const start = initial ?? prefill
  const [fromId, setFromId] = useState(start?.fromId ?? '')
  const [toId, setToId] = useState(start?.toId ?? '')
  const [amount, setAmount] = useState(
    start === undefined ? '' : amountText(start.amount, region.locale),
  )
  const [date, setDate] = useState(initial?.date ?? today)
  const [note, setNote] = useState(initial?.note ?? '')
  const [submitted, setSubmitted] = useState(false)
  const [saveError, setSaveError] = useState<string>()
  // A save in progress: a second press is ignored (one payment).
  const [saving, setSaving] = useState(false)

  // Those who have left come last, marked (B6).
  const ordered = [
    ...sortByPosition(members.filter((m) => !hasLeft(m, today))),
    ...sortByPosition(members.filter((m) => hasLeft(m, today))),
  ]
  const label = (member: Member) => {
    const name = displayName(t, member, member.position)
    return hasLeft(member, today) ? t('payment.left', { name }) : name
  }

  const parsed = parseAmount(amount, region.locale, region.currency)
  const trimmedNote = note.trim()
  const settlement: Settlement = {
    v: RECORD_VERSION,
    id,
    householdId,
    fromId,
    toId,
    amount: parsed.ok ? parsed.value : (0 as Cents),
    date,
    createdAt,
    updatedAt: new Date().toISOString(),
    ...(trimmedNote === '' ? {} : { note: trimmedNote }),
  }
  const errors = new Map<SettlementField, string>()
  if (fromId === '') errors.set('from', t('payment.errors.choose'))
  if (toId === '') errors.set('to', t('payment.errors.choose'))
  if (!parsed.ok) {
    errors.set(
      'amount',
      amountInputMessage(
        t,
        amount.trim() === '' ? 'empty' : parsed.error,
        region,
      ),
    )
  }
  for (const error of validateSettlement(settlement, members, today)) {
    if (errors.has(error.field)) continue
    switch (error.code) {
      case 'sameMember':
        errors.set(error.field, t('payment.errors.same'))
        break
      case 'amountOutOfRange':
        errors.set(error.field, amountInputMessage(t, 'outOfRange', region))
        break
      case 'dateInvalid':
        errors.set(error.field, t('payment.errors.date'))
        break
      case 'dateOutOfRange':
        errors.set(error.field, t('payment.errors.dateRange'))
        break
      case 'noteInvalid':
        errors.set(error.field, t('payment.errors.note'))
        break
      case 'unknownMember':
        errors.set(error.field, t('payment.errors.choose'))
        break
    }
  }
  const error = (field: SettlementField) =>
    submitted ? errors.get(field) : undefined

  // The outcome, once the payment reads: never over incomplete balances.
  const unreadable =
    ledger.unreadable.members +
    ledger.unreadable.expenses +
    ledger.unreadable.settlements
  const complete = unreadable === 0
  const outcome =
    complete && errors.size === 0
      ? paymentOutcome(ledger, settlement, { replacing: initial?.id })
      : null
  const byId = new Map(members.map((m) => [m.id, m]))
  const from = byId.get(fromId)
  const to = byId.get(toId)

  const submit = () => {
    if (saving) return
    setSubmitted(true)
    setSaveError(undefined)
    if (errors.size > 0 || db === null) return
    setSaving(true)
    saveSettlement(db, settlement, { replacing: initial !== undefined }).then(
      () => {
        setSaving(false)
        changed()
        onSaved(settlement)
      },
      (failure: unknown) => {
        setSaving(false)
        setSaveError(
          failure instanceof MissingReferenceError
            ? t('payment.errors.gone')
            : failure instanceof SettlementNotFoundError
              ? t('payment.errors.deleted')
              : t('payment.errors.save'),
        )
      },
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
      <div className={styles.pair}>
        <SelectField
          label={t('payment.from')}
          value={fromId}
          error={error('from')}
          onChange={(event) => setFromId(event.target.value)}
        >
          <option value="" disabled>
            {t('payment.choose')}
          </option>
          {ordered.map((member) => (
            <option key={member.id} value={member.id}>
              {label(member)}
            </option>
          ))}
        </SelectField>
        <SelectField
          label={t('payment.to')}
          value={toId}
          error={error('to')}
          onChange={(event) => setToId(event.target.value)}
        >
          <option value="" disabled>
            {t('payment.choose')}
          </option>
          {ordered.map((member) => (
            <option key={member.id} value={member.id}>
              {label(member)}
            </option>
          ))}
        </SelectField>
      </div>
      <div className={styles.pair}>
        <TextField
          label={t('payment.amount')}
          inputMode="decimal"
          value={amount}
          error={error('amount')}
          onChange={(event) => setAmount(event.target.value)}
        />
        <TextField
          type="date"
          label={t('payment.date')}
          value={date}
          error={error('date')}
          onChange={(event) => setDate(event.target.value)}
        />
      </div>
      <TextField
        label={t('payment.note')}
        hint={t('payment.noteHint')}
        value={note}
        maxLength={SETTLEMENT_LIMITS.maxNoteLength}
        error={error('note')}
        onChange={(event) => setNote(event.target.value)}
      />
      {!complete ? (
        <p className={styles.remaining} role="status">
          {t('payment.incomplete', { count: unreadable })}
        </p>
      ) : (
        outcome !== null &&
        from !== undefined &&
        to !== undefined && (
          <p className={styles.remaining} role="status">
            {outcomeLine(t, region, outcome, {
              from: displayName(t, from, from.position),
              to: displayName(t, to, to.position),
            })}
          </p>
        )
      )}
      {saveError !== undefined && (
        <p className={styles.error} role="alert">
          {saveError}
        </p>
      )}
      <div className={styles.actions}>
        <Button onClick={onCancel}>{t('payment.cancel')}</Button>
        <Button type="submit" variant="primary" disabled={saving}>
          {t('payment.save')}
        </Button>
      </div>
    </form>
  )
}
