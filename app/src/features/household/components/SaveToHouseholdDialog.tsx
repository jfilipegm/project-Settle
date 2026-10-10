import { useCallback, useState } from 'react'
import { Link } from 'react-router'
import { useRegion } from '../../../app/region.ts'
import { readHouseholdPointer } from '../../../data/pointer.ts'
import {
  MemberLimitError,
  MissingReferenceError,
  expensesWithReceiptKey,
  listHouseholds,
  listMembers,
  saveExpense,
} from '../../../data/repository.ts'
import { useLanguage } from '../../../i18n/language.ts'
import { formatAmount } from '../../../lib/money.ts'
import { Button } from '../../../ui/Button.tsx'
import { Dialog } from '../../../ui/Dialog.tsx'
import { SelectField, TextField } from '../../../ui/Field.tsx'
import { foldText, receiptKeyForSave } from '../../receipt/receiptKey.ts'
import type { ReceiptSummary } from '../../receipt/model.ts'
import { newId } from '../../split/billReducer.ts'
import { displayName, type Bill } from '../../split/model.ts'
import { dateLocale, formatDate } from '../format.ts'
import { useHouseholdData, useLoaded } from '../householdData.ts'
import {
  CATEGORY_IDS,
  HOUSEHOLD_LIMITS,
  RECORD_VERSION,
  isActiveOn,
  isIsoDate,
  sortByPosition,
  validateExpense,
  type CategoryId,
  type Expense,
  type ExpenseReceipt,
  type Member,
} from '../model.ts'
import { expenseAmount } from '../shares.ts'
import styles from './SaveToHouseholdDialog.module.css'

/** A bill person's choice: a member's id, "new", or not chosen yet. */
type Choice = string

const NEW = 'new'

function receiptOf(summary: ReceiptSummary | null): ExpenseReceipt | undefined {
  if (summary === null) return undefined
  const receipt: ExpenseReceipt = {}
  if (summary.merchant !== undefined) receipt.merchant = summary.merchant
  if (summary.merchantTaxId !== undefined) {
    receipt.merchantTaxId = summary.merchantTaxId
  }
  if (summary.date !== undefined) receipt.date = summary.date
  if (summary.total !== undefined) receipt.total = summary.total
  if (summary.totalSource !== undefined) {
    receipt.totalSource = summary.totalSource
  }
  return Object.keys(receipt).length > 0 ? receipt : undefined
}

/** A household's members in position order ('' reads as none). */
function useMembersOf(householdId: string) {
  return useLoaded(
    useCallback(
      (db: IDBDatabase) =>
        householdId === ''
          ? Promise.resolve<Member[]>([])
          : listMembers(db, householdId).then((listed) =>
              sortByPosition(listed.items),
            ),
      [householdId],
    ),
  )
}

/** Each bill person's default member (H10): an id match, else a name match. */
function defaultChoices(
  bill: Bill,
  members: readonly Member[],
  previous: ReadonlyMap<string, string> | undefined,
): Record<string, Choice> {
  const used = new Set<string>()
  const choices: Record<string, Choice> = {}
  for (const person of bill.people) {
    const known = previous?.get(person.id)
    const byId = members.find((m) => m.id === person.id)
    const byName = members.find(
      (m) =>
        !used.has(m.id) &&
        person.name.trim() !== '' &&
        foldText(m.name) === foldText(person.name),
    )
    const pick =
      (known !== undefined && members.some((m) => m.id === known)
        ? known
        : undefined) ??
      byId?.id ??
      byName?.id ??
      (members.length === 0 ? NEW : '')
    if (pick !== '' && pick !== NEW) used.add(pick)
    choices[person.id] = pick
  }
  return choices
}

/**
 * "Save to a household" (M4 plan, H10, H11): the household, who each bill
 * person is, who paid, what, when and which category, then the
 * duplicate-receipt check. Saving writes the expense and any new members in
 * one transaction (R3-O1); the caller clears the draft only after that
 * (L1-O1). Editing an itemised expense reuses it with the household fixed.
 */
export function SaveToHouseholdDialog({
  bill,
  summary,
  editing,
  preferredHouseholdId,
  today,
  onSaved,
  onClose,
}: {
  bill: Bill
  summary: ReceiptSummary | null
  /** The itemised expense being edited, if any. */
  editing?: Expense | undefined
  preferredHouseholdId?: string | null | undefined
  today: string
  onSaved: (householdId: string, expenseId: string) => void
  onClose: () => void
}) {
  const { t, language } = useLanguage()
  const { region } = useRegion()
  const { db, changed } = useHouseholdData()
  const locale = dateLocale(language, region.locale)
  const households = useLoaded(useCallback((d) => listHouseholds(d), []))
  const active =
    households.state === 'ready'
      ? households.value.items
          .filter((h) => h.archivedAt === undefined)
          .sort((a, b) => a.name.localeCompare(b.name))
      : []

  // The household: the one being edited, else the user's choice, else
  // the preferred one, the last used or the only one (when still active).
  const [chosenHousehold, setChosenHousehold] = useState<string | null>(null)
  const isActive = (id: string | null | undefined): id is string =>
    id !== null && id !== undefined && active.some((h) => h.id === id)
  const pointer = readHouseholdPointer()
  const householdId =
    editing?.householdId ??
    chosenHousehold ??
    (isActive(preferredHouseholdId)
      ? preferredHouseholdId
      : isActive(pointer)
        ? pointer
        : active.length === 1
          ? (active[0]?.id ?? '')
          : '')

  const membersLoaded = useMembersOf(householdId)
  const members = membersLoaded.state === 'ready' ? membersLoaded.value : []

  const previous =
    editing?.split.kind === 'itemised'
      ? new Map(editing.split.members.map((m) => [m.personId, m.memberId]))
      : undefined
  // Each person's member: the defaults (H10), with the user's own choices
  // on top; a new household starts from its own defaults.
  const [edits, setEdits] = useState<Record<string, Choice>>({})
  const choices =
    membersLoaded.state === 'ready'
      ? { ...defaultChoices(bill, membersLoaded.value, previous), ...edits }
      : null

  const [description, setDescription] = useState(
    editing?.description ?? summary?.merchant?.trim().slice(0, 80) ?? '',
  )
  const [date, setDate] = useState(
    editing?.date ??
      (summary?.date !== undefined && isIsoDate(summary.date)
        ? summary.date
        : today),
  )
  const [category, setCategory] = useState<CategoryId>(
    editing?.category ?? (summary !== null ? 'groceries' : 'other'),
  )
  const [payer, setPayer] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [duplicate, setDuplicate] = useState<Expense | null>(null)
  const [failure, setFailure] = useState<string>()
  // A save in progress: a second press is ignored, so the bill can't be
  // saved twice (H10).
  const [saving, setSaving] = useState(false)

  const people = bill.people.map((person, index) => ({
    person,
    name: displayName(t, person, index),
  }))
  const current = choices ?? {}
  // Members a person can be: active on the date, or already chosen.
  const candidates = members.filter(
    (m) => isActiveOn(m, date) || Object.values(current).includes(m.id),
  )
  const payerOf = (choice: Choice | undefined, personId: string) =>
    choice === NEW ? `${NEW}:${personId}` : (choice ?? '')
  const payerValue =
    payer ??
    (editing !== undefined
      ? editing.payerId
      : payerOf(current[bill.payerId], bill.payerId))
  const payerOptions = [
    ...members
      .filter((m) => isActiveOn(m, date) || m.id === payerValue)
      .map((m) => ({ value: m.id, label: m.name })),
    ...people
      .filter(({ person }) => current[person.id] === NEW)
      .map(({ person, name }) => ({
        value: `${NEW}:${person.id}`,
        label: name,
      })),
  ]

  // The expense these choices describe, and its new members.
  const newMembers: Omit<Member, 'position'>[] = people
    .filter(({ person }) => current[person.id] === NEW)
    .map(({ person, name }) => ({
      v: RECORD_VERSION,
      id: `${NEW}-${person.id}`,
      householdId,
      name: person.name.trim() === '' ? name : person.name.trim(),
      joinedOn: date < today ? date : today,
    }))
  const memberIdOf = (personId: string): string => {
    const choice = current[personId]
    return choice === NEW ? `${NEW}-${personId}` : (choice ?? '')
  }
  const now = new Date().toISOString()
  const receipt = editing?.receipt ?? receiptOf(summary)
  const receiptKey =
    editing !== undefined ? editing.receiptKey : receiptKeyForSave(summary)
  const draft: Expense = {
    v: RECORD_VERSION,
    id: editing?.id ?? 'pending',
    householdId,
    description: description.trim(),
    date,
    category,
    payerId: payerValue.startsWith(`${NEW}:`)
      ? `${NEW}-${payerValue.slice(NEW.length + 1)}`
      : payerValue,
    split: {
      kind: 'itemised',
      bill,
      members: bill.people.map((person) => ({
        personId: person.id,
        memberId: memberIdOf(person.id),
      })),
    },
    createdAt: editing?.createdAt ?? now,
    updatedAt: now,
  }
  if (receipt !== undefined) draft.receipt = receipt
  if (receiptKey !== undefined) draft.receiptKey = receiptKey

  // Field errors, in words.
  const personErrors = new Map<string, string>()
  const seen = new Map<string, string>()
  for (const { person } of people) {
    const choice = current[person.id] ?? ''
    if (choice === '')
      personErrors.set(person.id, t('saveToHousehold.errors.choose'))
    else if (choice !== NEW) {
      if (seen.has(choice)) {
        personErrors.set(person.id, t('saveToHousehold.errors.same'))
      }
      seen.set(choice, person.id)
    }
  }
  const modelErrors = validateExpense(
    draft,
    [
      ...members,
      ...newMembers.map((m, i) => ({ ...m, position: members.length + i })),
    ],
    today,
  )
  const fieldError = (kind: string) => {
    const error = modelErrors.find((e) => e.field.kind === kind)
    if (error === undefined) return undefined
    switch (error.code) {
      case 'descriptionInvalid':
        return description.trim() === ''
          ? t('expense.errors.description')
          : t('expense.errors.descriptionLength')
      case 'dateInvalid':
        return t('expense.errors.date')
      case 'dateOutOfRange':
        return t('expense.errors.dateRange')
      case 'unknownMember':
        return t('expense.errors.payer')
      default:
        return t('expense.errors.save')
    }
  }
  const householdError =
    householdId === '' ? t('saveToHousehold.errors.household') : undefined
  const valid =
    householdError === undefined &&
    personErrors.size === 0 &&
    modelErrors.length === 0

  const save = (confirmedDuplicate: boolean) => {
    if (saving) return
    setSubmitted(true)
    setFailure(undefined)
    if (!valid || db === null) return
    setSaving(true)
    const run = async () => {
      if (!confirmedDuplicate && receiptKey !== undefined) {
        const matches = (
          await expensesWithReceiptKey(db, householdId, receiptKey)
        ).filter((e) => e.id !== editing?.id)
        if (matches.length > 0) {
          setDuplicate(matches[0] ?? null)
          setSaving(false)
          return
        }
      }
      // Real ids for the new members, the same in the mapping and payer.
      const ids = new Map(newMembers.map((m) => [m.id, newId()]))
      const real = (id: string) => ids.get(id) ?? id
      const expense: Expense = {
        ...draft,
        id: editing?.id ?? newId(),
        payerId: real(draft.payerId),
        split: {
          kind: 'itemised',
          bill,
          members: bill.people.map((person) => ({
            personId: person.id,
            memberId: real(memberIdOf(person.id)),
          })),
        },
      }
      await saveExpense(
        db,
        expense,
        newMembers.map((m) => ({ ...m, id: real(m.id) })),
      )
      changed()
      onSaved(householdId, expense.id)
    }
    run().catch((error: unknown) => {
      setSaving(false)
      setFailure(
        error instanceof MemberLimitError
          ? t('members.errors.limit')
          : error instanceof MissingReferenceError
            ? t('expense.errors.gone')
            : t('expense.errors.save'),
      )
    })
  }

  const shown = (text: string | undefined) => (submitted ? text : undefined)
  const duplicateAmount = duplicate === null ? null : expenseAmount(duplicate)

  return (
    <Dialog
      open
      title={
        editing !== undefined
          ? t('editingExpense.save')
          : t('saveToHousehold.title')
      }
      onClose={onClose}
    >
      {households.state === 'ready' &&
      active.length === 0 &&
      editing === undefined ? (
        <div className={styles.form}>
          <p>{t('saveToHousehold.noHouseholds')}</p>
          <p>
            <Link to="/households">{t('saveToHousehold.createOne')}</Link>
          </p>
          <div className={styles.actions}>
            <Button onClick={onClose}>{t('households.cancel')}</Button>
          </div>
        </div>
      ) : duplicate !== null ? (
        <div className={styles.form} role="alert">
          <p className={styles.strong}>
            {t('saveToHousehold.duplicate.title')}
          </p>
          <p>
            {t('saveToHousehold.duplicate.body', {
              description: duplicate.description,
              date: formatDate(duplicate.date, locale),
              amount:
                duplicateAmount === null
                  ? ''
                  : formatAmount(duplicateAmount, region),
            })}
          </p>
          <p className={styles.hint}>{t('saveToHousehold.duplicate.hint')}</p>
          <p>
            <Link
              to={`/households/${duplicate.householdId}/expenses/${duplicate.id}`}
            >
              {t('saveToHousehold.duplicate.open')}
            </Link>
          </p>
          <div className={styles.actions}>
            <Button onClick={onClose}>{t('households.cancel')}</Button>
            <Button
              variant="primary"
              disabled={saving}
              onClick={() => save(true)}
            >
              {t('saveToHousehold.duplicate.saveAnyway')}
            </Button>
          </div>
        </div>
      ) : (
        <form
          className={styles.form}
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            save(false)
          }}
        >
          {editing === undefined && (
            <SelectField
              label={t('saveToHousehold.household')}
              value={householdId}
              error={shown(householdError)}
              onChange={(event) => {
                setChosenHousehold(event.target.value)
                setEdits({})
                setPayer(null)
              }}
            >
              <option value="">{t('saveToHousehold.choose')}</option>
              {active.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </SelectField>
          )}
          {householdId !== '' &&
            choices !== null &&
            people.map(({ person, name }) => (
              <SelectField
                key={person.id}
                label={t('saveToHousehold.whoIs', { name })}
                value={current[person.id] ?? ''}
                error={shown(personErrors.get(person.id))}
                onChange={(event) =>
                  setEdits({ ...edits, [person.id]: event.target.value })
                }
              >
                <option value="">{t('saveToHousehold.choose')}</option>
                {candidates.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
                <option value={NEW}>{t('saveToHousehold.newMember')}</option>
              </SelectField>
            ))}
          {householdId !== '' && choices !== null && (
            <SelectField
              label={t('expense.payer')}
              hint={t('expense.payerHint')}
              value={payerValue}
              error={shown(fieldError('payer'))}
              onChange={(event) => setPayer(event.target.value)}
            >
              <option value="">{t('saveToHousehold.choose')}</option>
              {payerOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </SelectField>
          )}
          <TextField
            label={t('expense.description')}
            value={description}
            maxLength={HOUSEHOLD_LIMITS.maxDescriptionLength}
            error={shown(fieldError('description'))}
            onChange={(event) => setDescription(event.target.value)}
          />
          <div className={styles.pair}>
            <TextField
              type="date"
              label={t('expense.date')}
              value={date}
              error={shown(fieldError('date'))}
              onChange={(event) => setDate(event.target.value)}
            />
            <SelectField
              label={t('expense.category')}
              value={category}
              onChange={(event) =>
                setCategory(event.target.value as CategoryId)
              }
            >
              {CATEGORY_IDS.map((id) => (
                <option key={id} value={id}>
                  {t(`categories.${id}`)}
                </option>
              ))}
            </SelectField>
          </div>
          {editing === undefined && (
            <p className={styles.hint}>{t('saveToHousehold.moves')}</p>
          )}
          {failure !== undefined && (
            <p className={styles.error} role="alert">
              {failure}
            </p>
          )}
          <div className={styles.actions}>
            <Button onClick={onClose}>{t('households.cancel')}</Button>
            <Button
              type="submit"
              variant="primary"
              // Not before the household's members have loaded.
              disabled={saving || (householdId !== '' && choices === null)}
            >
              {editing !== undefined
                ? t('editingExpense.save')
                : t('saveToHousehold.save')}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  )
}
