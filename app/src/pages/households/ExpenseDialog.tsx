import { IconListDetails, IconPencil, IconTrash } from '@tabler/icons-react'
import { useCallback, useId, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router'
import { useRegion } from '../../app/region.ts'
import { deleteExpense, getExpense } from '../../data/repository.ts'
import { CATEGORY_ICONS } from '../../features/household/categories.ts'
import { EXPENSE_PARAM } from '../../features/household/components/ExpenseRow.tsx'
import { SaveToHouseholdDialog } from '../../features/household/components/SaveToHouseholdDialog.tsx'
import { dateLocale, formatDate } from '../../features/household/format.ts'
import {
  useHouseholdData,
  useLoaded,
} from '../../features/household/householdData.ts'
import {
  isoDate,
  type Household,
  type Member,
} from '../../features/household/model.ts'
import {
  expenseAmount,
  expenseShares,
} from '../../features/household/shares.ts'
import { lineTotal } from '../../features/split/model.ts'
import { useLanguage } from '../../i18n/language.ts'
import { formatAmount } from '../../lib/money.ts'
import { Amount } from '../../ui/Amount.tsx'
import { Button } from '../../ui/Button.tsx'
import { ShareBar } from '../../ui/Charts.tsx'
import { Dialog } from '../../ui/Dialog.tsx'
import { Icon } from '../../ui/Icon.tsx'
import { PersonBadge } from '../../ui/PersonBadge.tsx'
import { personColorStyle } from '../../ui/personColor.ts'
import styles from './households.module.css'

/** Set on the history entry a row pushes, so closing can go Back. */
export interface ExpenseOpenedState {
  expenseOpened: true
}

function openedFromList(state: unknown): boolean {
  return (
    typeof state === 'object' &&
    state !== null &&
    (state as Partial<ExpenseOpenedState>).expenseOpened === true
  )
}

/**
 * One expense, in a dialog over the page it was opened from (M4, review
 * finding M-5): what, when, the category, who paid and each member's
 * share, drawn as a bar and listed, all derived from the stored expense
 * (H5), with Edit and Delete. `?expense=:eid` opens it, so the list
 * underneath keeps its month, filters and scroll. Closing goes Back when
 * a row opened it (so the browser's Back closes it too), else drops the
 * parameter.
 */
export function ExpenseDialog({
  household,
  members,
}: {
  household: Household
  members: readonly Member[]
}) {
  const { t, language } = useLanguage()
  const { region } = useRegion()
  const navigate = useNavigate()
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  const { db, changed } = useHouseholdData()
  const [deleting, setDeleting] = useState(false)
  const [editingDetails, setEditingDetails] = useState(false)
  const [failed, setFailed] = useState(false)
  const itemsId = useId()
  const sharesId = useId()
  const eid = params.get(EXPENSE_PARAM)
  const loaded = useLoaded(
    useCallback(
      (d: IDBDatabase) =>
        eid === null ? Promise.resolve(null) : getExpense(d, eid),
      [eid],
    ),
  )
  const base = `/households/${household.id}`

  const close = () => {
    setDeleting(false)
    setEditingDetails(false)
    setFailed(false)
    if (openedFromList(location.state)) {
      void navigate(-1)
      return
    }
    const next = new URLSearchParams(params)
    next.delete(EXPENSE_PARAM)
    setParams(next, { replace: true })
  }

  const open = eid !== null && loaded.state === 'ready'
  const expense =
    loaded.state === 'ready' &&
    loaded.value !== null &&
    loaded.value.householdId === household.id
      ? loaded.value
      : null

  if (!open || expense === null) {
    return (
      <Dialog
        open={open}
        title={t('expense.notFoundTitle')}
        onClose={close}
        closeLabel={t('expense.close')}
      >
        <p>{t('expense.notFound')}</p>
      </Dialog>
    )
  }

  const locale = dateLocale(language, region.locale)
  const byId = new Map(members.map((m) => [m.id, m]))
  const payer = byId.get(expense.payerId)
  const amount = expenseAmount(expense)
  const shares = [...(expenseShares(expense) ?? new Map<string, never>())]

  return (
    <Dialog
      open
      title={expense.description}
      onClose={close}
      closeLabel={t('expense.close')}
    >
      <div className={styles.expense}>
        <p className={styles.bigAmount}>
          {amount !== null && <Amount value={amount} region={region} />}
        </p>
        <dl className={styles.facts}>
          <dt>{t('expense.date')}</dt>
          <dd>
            <time dateTime={expense.date}>
              {formatDate(expense.date, locale)}
            </time>
          </dd>
          <dt>{t('expense.category')}</dt>
          <dd className={styles.inline}>
            <Icon icon={CATEGORY_ICONS[expense.category]} size={16} />
            {t(`categories.${expense.category}`)}
          </dd>
          <dt>{t('expense.paidBy')}</dt>
          <dd>
            {payer !== undefined && (
              <PersonBadge person={payer} index={payer.position} />
            )}
          </dd>
        </dl>

        {expense.split.kind === 'itemised' && (
          <section aria-labelledby={itemsId}>
            <h3 id={itemsId} className={styles.subTitle}>
              {t('itemised.items')}
            </h3>
            <ul className={styles.list}>
              {expense.split.bill.items.map((item) => (
                <li key={item.id} className={styles.row}>
                  <span className={styles.rowMain}>
                    <span className={styles.rowTitle}>{item.name}</span>
                    <span className={styles.rowMeta}>
                      {item.assignees
                        .map((a) => {
                          const mapped =
                            expense.split.kind === 'itemised'
                              ? expense.split.members.find(
                                  (m) => m.personId === a.personId,
                                )
                              : undefined
                          return byId.get(mapped?.memberId ?? '')?.name ?? ''
                        })
                        .filter(Boolean)
                        .join(', ')}
                    </span>
                  </span>
                  <Amount value={lineTotal(item)} region={region} />
                </li>
              ))}
            </ul>
          </section>
        )}

        <section aria-labelledby={sharesId}>
          <h3 id={sharesId} className={styles.subTitle}>
            {t('expense.sharedBy')}
          </h3>
          {shares.length > 0 && amount !== null && (
            <ShareBar
              label={t('expense.sharesChart', {
                amount: formatAmount(amount, region),
                shares: shares
                  .map(
                    ([memberId, share]) =>
                      `${byId.get(memberId)?.name ?? ''} ${formatAmount(share, region)}`,
                  )
                  .join(', '),
              })}
              segments={shares.map(([memberId, share]) => {
                const member = byId.get(memberId)
                return {
                  id: memberId,
                  value: share,
                  style: personColorStyle(member?.position ?? 0),
                  label: `${member?.name ?? ''}: ${formatAmount(share, region)}`,
                }
              })}
            />
          )}
          <ul className={styles.list}>
            {shares.map(([memberId, share]) => {
              const member = byId.get(memberId)
              return (
                <li key={memberId} className={styles.row}>
                  <span className={styles.rowMain}>
                    {member !== undefined && (
                      <PersonBadge person={member} index={member.position} />
                    )}
                  </span>
                  <Amount value={share} region={region} />
                </li>
              )
            })}
          </ul>
        </section>

        {failed && (
          <p className={styles.error} role="alert">
            {t('expense.errors.save')}
          </p>
        )}
        <div className={styles.actions}>
          {expense.split.kind === 'itemised' ? (
            <>
              <Button
                icon={IconListDetails}
                onClick={() =>
                  void navigate(`/split?expense=${expense.id}&step=items`)
                }
              >
                {t('itemised.editItems')}
              </Button>
              <Button icon={IconPencil} onClick={() => setEditingDetails(true)}>
                {t('itemised.editDetails')}
              </Button>
            </>
          ) : (
            <Button
              icon={IconPencil}
              onClick={() =>
                void navigate(`${base}/expenses/${expense.id}/edit`, {
                  state: { fromExpense: true },
                })
              }
            >
              {t('expense.edit')}
            </Button>
          )}
          <Button icon={IconTrash} onClick={() => setDeleting(true)}>
            {t('expense.delete')}
          </Button>
        </div>
      </div>

      {editingDetails && expense.split.kind === 'itemised' && (
        <SaveToHouseholdDialog
          bill={expense.split.bill}
          summary={null}
          editing={expense}
          today={isoDate(new Date())}
          onClose={() => setEditingDetails(false)}
          onSaved={() => setEditingDetails(false)}
        />
      )}
      <Dialog
        open={deleting}
        title={t('expense.deleteTitle', { name: expense.description })}
        onClose={() => setDeleting(false)}
      >
        <div className={styles.form}>
          <p>{t('expense.deleteBody')}</p>
          <div className={styles.formActions}>
            <Button onClick={() => setDeleting(false)}>
              {t('expense.cancel')}
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                if (db === null) return
                deleteExpense(db, expense.id).then(
                  () => {
                    changed()
                    close()
                  },
                  () => {
                    setDeleting(false)
                    setFailed(true)
                  },
                )
              }}
            >
              {t('expense.delete')}
            </Button>
          </div>
        </div>
      </Dialog>
    </Dialog>
  )
}
