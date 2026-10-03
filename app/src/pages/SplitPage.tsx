import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useRegion } from '../app/region.ts'
import { ReceiptCheck } from '../features/receipt/components/ReceiptCheck.tsx'
import { ScanReceipt } from '../features/receipt/components/ScanReceipt.tsx'
import { revokeImageUrl } from '../features/receipt/importUi.ts'
import { NOT_READ_ITEM_NAME } from '../features/receipt/messages.ts'
import type {
  PhotoIssue,
  PhotoQuality,
  ReceiptSummary,
  RemovedLine,
} from '../features/receipt/model.ts'
import { checkReceipt } from '../features/receipt/reconcile.ts'
import { receiptNotices } from '../features/receipt/review.ts'
import {
  loadReceiptSummary,
  saveReceiptSummary,
} from '../features/receipt/receiptStore.ts'
import { AdjustmentsSection } from '../features/split/components/AdjustmentsSection.tsx'
import { ItemsSection } from '../features/split/components/ItemsSection.tsx'
import { PeopleSection } from '../features/split/components/PeopleSection.tsx'
import { ResultSection } from '../features/split/components/ResultSection.tsx'
import styles from '../features/split/components/split.module.css'
import { newId } from '../features/split/billReducer.ts'
import { computeSplit } from '../features/split/split.ts'
import { newBillIds, useBill } from '../features/split/useBill.ts'

export function SplitPage() {
  const { region } = useRegion()
  const [bill, dispatch] = useBill()
  const outcome = useMemo(() => computeSplit(bill), [bill])
  const errors = outcome.ok ? [] : outcome.errors
  const sectionProps = { bill, dispatch, errors, region }
  // Inputs keep their own text while it's invalid, and only read the bill
  // when they mount. "New bill" and a receipt import replace the bill from
  // outside them, so they remount the editor: no field can keep showing
  // the old bill's text.
  const [editorSession, setEditorSession] = useState(0)

  // The receipt check (M2, D14, D15): the summary is saved next to the
  // bill; the image's object URL lives in memory only, and so does the
  // photo quality check's advice (M2.5, P11).
  const [summary, setSummary] = useState<ReceiptSummary | null>(
    loadReceiptSummary,
  )
  const [imageUrl, setImageUrl] = useState<string>()
  const [photoIssues, setPhotoIssues] = useState<PhotoIssue[]>()
  const [photoChecks, setPhotoChecks] = useState<PhotoQuality[]>()
  const [scanning, setScanning] = useState(false)
  const checkHeading = useRef<HTMLHeadingElement>(null)
  const focusCheck = useRef(false)

  const updateSummary = (next: ReceiptSummary | null) => {
    setSummary(next)
    saveReceiptSummary(next)
  }
  // A replaced image, or one still held when leaving the page, is freed.
  useEffect(() => () => revokeImageUrl(imageUrl), [imageUrl])

  // After an import, focus moves to the check panel's heading, in the
  // same commit that shows the panel.
  useLayoutEffect(() => {
    if (focusCheck.current) {
      focusCheck.current = false
      checkHeading.current?.focus()
    }
  }, [summary, editorSession])

  const flaggedItemIds = useMemo(
    () => new Set(summary?.flaggedItemIds ?? []),
    [summary],
  )
  // R12 and R24: what the result section says about the receipt.
  const notices = useMemo(
    () =>
      summary === null
        ? []
        : receiptNotices(checkReceipt(bill, summary), summary, region),
    [bill, summary, region],
  )

  /** Adds items, flagged "Check", and records their flags (R13, R24). */
  const addFlaggedItems = (
    current: ReceiptSummary,
    items: readonly RemovedLine[],
    changes: Partial<ReceiptSummary> = {},
  ) => {
    const added = items.map((item) => ({
      id: newId(),
      name: item.name,
      unitPrice: item.amount,
    }))
    dispatch({ type: 'addItems', items: added })
    updateSummary({
      ...current,
      ...changes,
      flaggedItemIds: [
        ...current.flaggedItemIds,
        ...added.map((item) => item.id),
      ],
    })
  }
  const withoutRemovedLines = (current: ReceiptSummary): ReceiptSummary => {
    const rest = { ...current }
    delete rest.removedLines
    return rest
  }

  return (
    <div className={styles.page}>
      <h1>Split a bill</h1>
      <p className={styles.pageActions}>
        <a href="#result">See result</a>
      </p>

      <ScanReceipt
        bill={bill}
        region={region}
        onBusyChange={setScanning}
        onImported={(imported) => {
          dispatch({ type: 'replaceBill', bill: imported.bill })
          updateSummary(imported.summary)
          setImageUrl(imported.imageUrl)
          setPhotoIssues(imported.photoIssues)
          setPhotoChecks(imported.photoChecks)
          setEditorSession((session) => session + 1)
          focusCheck.current = true
        }}
      />

      {summary !== null && (
        <ReceiptCheck
          bill={bill}
          summary={summary}
          imageUrl={imageUrl}
          photoIssues={photoIssues}
          photoChecks={photoChecks}
          region={region}
          headingRef={checkHeading}
          onDismiss={() => {
            updateSummary(null)
            setImageUrl(undefined)
            setPhotoIssues(undefined)
            setPhotoChecks(undefined)
          }}
          onAddDifference={(amount) => {
            addFlaggedItems(summary, [{ name: NOT_READ_ITEM_NAME, amount }])
          }}
          onConfirmRemoved={() => {
            updateSummary(withoutRemovedLines(summary))
          }}
          onPutBack={(lines) => {
            addFlaggedItems(withoutRemovedLines(summary), lines)
          }}
        />
      )}

      {/* Nothing typed during a scan can be lost to the import (D17). */}
      <div inert={scanning} aria-busy={scanning || undefined}>
        <Fragment key={editorSession}>
          <PeopleSection {...sectionProps} />
          <ItemsSection
            {...sectionProps}
            flaggedItemIds={flaggedItemIds}
            onItemEdited={(itemId) => {
              if (summary?.flaggedItemIds.includes(itemId)) {
                updateSummary({
                  ...summary,
                  flaggedItemIds: summary.flaggedItemIds.filter(
                    (id) => id !== itemId,
                  ),
                })
              }
            }}
          />
          <AdjustmentsSection {...sectionProps} />
        </Fragment>
      </div>
      <ResultSection
        bill={bill}
        outcome={outcome}
        region={region}
        notices={notices}
        noticeTarget="receipt-check-heading"
      />

      <div className={styles.newBill}>
        <button
          type="button"
          className={styles.secondaryButton}
          disabled={scanning}
          onClick={() => {
            if (
              window.confirm('Start a new bill? This clears the current one.')
            ) {
              dispatch({ type: 'newBill', ids: newBillIds() })
              updateSummary(null)
              setImageUrl(undefined)
              setPhotoIssues(undefined)
              setPhotoChecks(undefined)
              setPhotoChecks(undefined)
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
