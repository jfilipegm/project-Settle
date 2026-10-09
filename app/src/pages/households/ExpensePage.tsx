import { IconListDetails, IconPencil, IconTrash } from '@tabler/icons-react'
import { useCallback, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useRegion } from '../../app/region.ts'
import { deleteExpense, getExpense } from '../../data/repository.ts'
import { CATEGORY_ICONS } from '../../features/household/categories.ts'
import { SaveToHouseholdDialog } from '../../features/household/components/SaveToHouseholdDialog.tsx'
import { isoDate } from '../../features/household/model.ts'
import { lineTotal } from '../../features/split/model.ts'
import { dateLocale, formatDate } from '../../features/household/format.ts'
import {
  useHouseholdData,
  useLoaded,
} from '../../features/household/householdData.ts'
import {
  expenseAmount,
  expenseShares,
} from '../../features/household/shares.ts'
import { useLanguage } from '../../i18n/language.ts'
import { Amount } from '../../ui/Amount.tsx'
import { Button } from '../../ui/Button.tsx'
import { Card } from '../../ui/Card.tsx'
import { Dialog } from '../../ui/Dialog.tsx'
import { Icon } from '../../ui/Icon.tsx'
import { PersonBadge } from '../../ui/PersonBadge.tsx'
import { useHouseholdContext } from './householdContext.ts'
import styles from './households.module.css'

/**
 * One expense (M4 plan, CP3): what, when, the category, who paid and each
 * member's share, all derived from the stored expense (H5), with Edit and
 * Delete.
 */
export function ExpensePage() {
  const { t, language } = useLanguage()
  const { region } = useRegion()
  const navigate = useNavigate()
  const { eid = '' } = useParams()
  const { household, members } = useHouseholdContext()
  const { db, changed } = useHouseholdData()
  const [deleting, setDeleting] = useState(false)
  const [editingDetails, setEditingDetails] = useState(false)
  const [failed, setFailed] = useState(false)
  const loaded = useLoaded(useCallback((d) => getExpense(d, eid), [eid]))
  const base = `/households/${household.id}`

  if (loaded.state !== 'ready') return null
  const expense = loaded.value
  if (expense === null || expense.householdId !== household.id) {
    return (
      <Card>
        <p>{t('expense.notFound')}</p>
        <p>
          <Link to={`${base}/expenses`}>{t('expense.back')}</Link>
        </p>
      </Card>
    )
  }
  const locale = dateLocale(language, region.locale)
  const byId = new Map(members.map((m) => [m.id, m]))
  const payer = byId.get(expense.payerId)
  const amount = expenseAmount(expense)
  const shares = expenseShares(expense)

  return (
    <>
      <h1>{expense.description}</h1>
      <Card>
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
      </Card>
      {expense.split.kind === 'itemised' && (
        <Card title={t('itemised.items')}>
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
        </Card>
      )}
      <Card title={t('expense.sharedBy')}>
        <ul className={styles.list}>
          {[...(shares ?? new Map<string, never>())].map(
            ([memberId, share]) => {
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
            },
          )}
        </ul>
      </Card>
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
            onClick={() => void navigate(`${base}/expenses/${expense.id}/edit`)}
          >
            {t('expense.edit')}
          </Button>
        )}
        <Button icon={IconTrash} onClick={() => setDeleting(true)}>
          {t('expense.delete')}
        </Button>
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
                    void navigate(`${base}/expenses`, { replace: true })
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
    </>
  )
}
