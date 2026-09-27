import { useMemo } from 'react'
import { useRegion } from '../app/region.ts'
import { AdjustmentsSection } from '../features/split/components/AdjustmentsSection.tsx'
import { ItemsSection } from '../features/split/components/ItemsSection.tsx'
import { PeopleSection } from '../features/split/components/PeopleSection.tsx'
import { ResultSection } from '../features/split/components/ResultSection.tsx'
import styles from '../features/split/components/split.module.css'
import { computeSplit } from '../features/split/split.ts'
import { newBillIds, useBill } from '../features/split/useBill.ts'

export function SplitPage() {
  const { region } = useRegion()
  const [bill, dispatch] = useBill()
  const outcome = useMemo(() => computeSplit(bill), [bill])
  const errors = outcome.ok ? [] : outcome.errors
  const sectionProps = { bill, dispatch, errors, region }

  return (
    <div className={styles.page}>
      <h1>Split a bill</h1>
      <p className={styles.pageActions}>
        <a href="#result">See result</a>
      </p>

      <PeopleSection {...sectionProps} />
      <ItemsSection {...sectionProps} />
      <AdjustmentsSection {...sectionProps} />
      <ResultSection bill={bill} outcome={outcome} region={region} />

      <div className={styles.newBill}>
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={() => {
            if (
              window.confirm('Start a new bill? This clears the current one.')
            ) {
              dispatch({ type: 'newBill', ids: newBillIds() })
            }
          }}
        >
          New bill
        </button>
        <p className={styles.hint}>
          This bill is saved on this device until you start a new one.
        </p>
      </div>
    </div>
  )
}
