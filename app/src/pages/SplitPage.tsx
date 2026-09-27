import { Fragment, useMemo, useState } from 'react'
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
  // Inputs keep their own text while it's invalid, and only read the bill
  // when they mount. "New bill" replaces the bill from outside them, so it
  // remounts the editor: no field can keep showing the old bill's text.
  const [editorSession, setEditorSession] = useState(0)

  return (
    <div className={styles.page}>
      <h1>Split a bill</h1>
      <p className={styles.pageActions}>
        <a href="#result">See result</a>
      </p>

      <Fragment key={editorSession}>
        <PeopleSection {...sectionProps} />
        <ItemsSection {...sectionProps} />
        <AdjustmentsSection {...sectionProps} />
      </Fragment>
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
              setEditorSession((session) => session + 1)
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
