import { IconPencil, IconTrash } from '@tabler/icons-react'
import { useCallback, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router'
import { useRegion } from '../../app/region.ts'
import { deleteSettlement, getSettlement } from '../../data/repository.ts'
import { SettlementForm } from '../../features/household/components/SettlementForm.tsx'
import { paidWords } from '../../features/household/balanceWords.ts'
import { SETTLEMENT_PARAM } from '../../features/household/components/SettlementRow.tsx'
import { dateLocale, formatDate } from '../../features/household/format.ts'
import {
  useHouseholdData,
  useLedger,
  useLoaded,
} from '../../features/household/householdData.ts'
import {
  isoDate,
  type Household,
  type Member,
} from '../../features/household/model.ts'
import { useLanguage } from '../../i18n/language.ts'
import { Amount } from '../../ui/Amount.tsx'
import { Button } from '../../ui/Button.tsx'
import { Dialog } from '../../ui/Dialog.tsx'
import { PersonBadge } from '../../ui/PersonBadge.tsx'
import styles from './households.module.css'

function openedFromList(state: unknown): boolean {
  return (
    typeof state === 'object' &&
    state !== null &&
    (state as { settlementOpened?: unknown }).settlementOpened === true
  )
}

/**
 * One payment, in a dialog over the page it was opened from (M5 plan,
 * B8), as an expense is (M4, M-5): from, to, the amount, the date and the
 * note, then Edit (the payment form, filled in) and Delete (confirmed).
 * `?settlement=:sid` opens it; Close, Escape, a click outside and Back
 * return to the page underneath.
 */
export function SettlementDialog({
  household,
  members,
  unreadableMembers,
}: {
  household: Household
  members: readonly Member[]
  unreadableMembers: number
}) {
  const { t, language } = useLanguage()
  const { region } = useRegion()
  const navigate = useNavigate()
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  const { db, changed } = useHouseholdData()
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [failed, setFailed] = useState(false)
  const [today] = useState(() => isoDate(new Date()))
  const sid = params.get(SETTLEMENT_PARAM)
  const loaded = useLoaded(
    useCallback(
      (d: IDBDatabase) =>
        sid === null ? Promise.resolve(null) : getSettlement(d, sid),
      [sid],
    ),
  )
  const ledger = useLedger(household.id, members, unreadableMembers)

  const close = () => {
    setEditing(false)
    setDeleting(false)
    setFailed(false)
    if (openedFromList(location.state)) {
      void navigate(-1)
      return
    }
    const next = new URLSearchParams(params)
    next.delete(SETTLEMENT_PARAM)
    setParams(next, { replace: true })
  }

  const open = sid !== null && loaded.state === 'ready'
  const settlement =
    loaded.state === 'ready' &&
    loaded.value !== null &&
    loaded.value.householdId === household.id
      ? loaded.value
      : null

  if (!open || settlement === null) {
    return (
      <Dialog
        open={open}
        title={t('paymentView.notFoundTitle')}
        onClose={close}
        closeLabel={t('paymentView.close')}
      >
        <p>{t('paymentView.notFound')}</p>
      </Dialog>
    )
  }

  const locale = dateLocale(language, region.locale)
  const byId = new Map(members.map((m) => [m.id, m]))
  const from = byId.get(settlement.fromId)
  const to = byId.get(settlement.toId)

  if (editing && ledger.state === 'ready') {
    return (
      <Dialog
        open
        title={t('payment.editTitle')}
        onClose={() => setEditing(false)}
      >
        <SettlementForm
          householdId={household.id}
          members={members}
          ledger={ledger.value}
          today={today}
          initial={settlement}
          onSaved={() => setEditing(false)}
          onCancel={() => setEditing(false)}
        />
      </Dialog>
    )
  }

  return (
    <>
      <Dialog
        open
        title={paidWords(t, settlement, byId)}
        onClose={close}
        closeLabel={t('paymentView.close')}
      >
        <div className={styles.expense}>
          <p className={styles.bigAmount}>
            <Amount value={settlement.amount} region={region} />
          </p>
          <dl className={styles.facts}>
            <dt>{t('paymentView.from')}</dt>
            <dd>
              {from !== undefined && (
                <PersonBadge person={from} index={from.position} />
              )}
            </dd>
            <dt>{t('paymentView.to')}</dt>
            <dd>
              {to !== undefined && (
                <PersonBadge person={to} index={to.position} />
              )}
            </dd>
            <dt>{t('paymentView.date')}</dt>
            <dd>
              <time dateTime={settlement.date}>
                {formatDate(settlement.date, locale)}
              </time>
            </dd>
            {settlement.note !== undefined && (
              <>
                <dt>{t('paymentView.note')}</dt>
                <dd>{settlement.note}</dd>
              </>
            )}
          </dl>
          {failed && (
            <p className={styles.error} role="alert">
              {t('paymentView.deleteFailed')}
            </p>
          )}
          <div className={styles.actions}>
            <Button icon={IconPencil} onClick={() => setEditing(true)}>
              {t('paymentView.edit')}
            </Button>
            <Button icon={IconTrash} onClick={() => setDeleting(true)}>
              {t('paymentView.delete')}
            </Button>
          </div>
        </div>
      </Dialog>
      <Dialog
        open={deleting}
        title={t('paymentView.deleteTitle')}
        onClose={() => setDeleting(false)}
      >
        <p>{t('paymentView.deleteBody')}</p>
        <div className={styles.formActions}>
          <Button onClick={() => setDeleting(false)}>
            {t('paymentView.cancel')}
          </Button>
          <Button
            variant="primary"
            icon={IconTrash}
            onClick={() => {
              if (db === null) return
              deleteSettlement(db, settlement.id).then(
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
            {t('paymentView.deleteConfirm')}
          </Button>
        </div>
      </Dialog>
    </>
  )
}
