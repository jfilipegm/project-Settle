import { useCallback } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router'
import { getExpense } from '../../data/repository.ts'
import { QuickExpenseForm } from '../../features/household/components/QuickExpenseForm.tsx'
import { useLoaded } from '../../features/household/householdData.ts'
import { isoDate } from '../../features/household/model.ts'
import { useT } from '../../i18n/language.ts'
import { Card } from '../../ui/Card.tsx'
import { EXPENSE_PARAM } from '../../features/household/components/ExpenseRow.tsx'
import { useHouseholdContext } from './householdContext.ts'

/** A new quick expense, or editing one (M4 plan, CP3). */
export function NewExpensePage() {
  const t = useT()
  const navigate = useNavigate()
  const { household, members } = useHouseholdContext()
  const base = `/households/${household.id}`
  return (
    <>
      <h1>{t('expense.newTitle')}</h1>
      <Card>
        <QuickExpenseForm
          householdId={household.id}
          members={members}
          today={isoDate(new Date())}
          onSaved={(id) =>
            void navigate(`${base}/expenses?${EXPENSE_PARAM}=${id}`, {
              replace: true,
            })
          }
          onCancel={() => void navigate(-1)}
        />
      </Card>
    </>
  )
}

export function EditExpensePage() {
  const t = useT()
  const navigate = useNavigate()
  const location = useLocation()
  const { eid = '' } = useParams()
  const { household, members } = useHouseholdContext()
  const loaded = useLoaded(useCallback((db) => getExpense(db, eid), [eid]))
  if (loaded.state !== 'ready') return null
  const expense = loaded.value
  if (expense === null || expense.householdId !== household.id) {
    return (
      <Card>
        <p>{t('expense.notFound')}</p>
      </Card>
    )
  }
  // Back to the expense's dialog it was opened from; on a direct load,
  // to the dialog over the Expenses list.
  const back = () => {
    const fromExpense =
      typeof location.state === 'object' &&
      location.state !== null &&
      'fromExpense' in location.state
    if (fromExpense) void navigate(-1)
    else
      void navigate(
        `/households/${household.id}/expenses?${EXPENSE_PARAM}=${expense.id}`,
        { replace: true },
      )
  }
  return (
    <>
      <h1>{t('expense.editTitle')}</h1>
      <Card>
        <QuickExpenseForm
          householdId={household.id}
          members={members}
          initial={expense}
          today={isoDate(new Date())}
          onSaved={back}
          onCancel={back}
        />
      </Card>
    </>
  )
}
