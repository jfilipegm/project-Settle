import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useRegion } from '../app/region.ts'
import { useT } from '../i18n/language.ts'
import { ReceiptCheck } from '../features/receipt/components/ReceiptCheck.tsx'
import { ScanReceipt } from '../features/receipt/components/ScanReceipt.tsx'
import { revokeImageUrl } from '../features/receipt/importUi.ts'
import type {
  PhotoIssue,
  PhotoQuality,
  ReceiptSummary,
  RemovedLine,
  ReviewLine,
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
import { displayName } from '../features/split/model.ts'
import { computeSplit } from '../features/split/split.ts'
import { newBillIds, useBill } from '../features/split/useBill.ts'

export function SplitPage() {
  const { region } = useRegion()
  const t = useT()
  const [bill, dispatch] = useBill()
  const outcome = useMemo(
    () => computeSplit(bill, (person, index) => displayName(t, person, index)),
    [bill, t],
  )
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
  // P15: the review's lines, and the bill row of the line selected in it.
  const [lines, setLines] = useState<ReviewLine[]>()
  const [highlightedItemId, setHighlightedItemId] = useState<string>()
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
        : receiptNotices(t, checkReceipt(bill, summary), summary, region),
    [bill, summary, region, t],
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
      <h1>{t('split.title')}</h1>
      <p className={styles.pageActions}>
        <a href="#result">{t('split.seeResult')}</a>
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
          setLines(imported.lines)
          setHighlightedItemId(undefined)
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
          lines={lines}
          onAddItem={(name, amount) => {
            addFlaggedItems(summary, [{ name, amount }])
          }}
          onSelectItem={setHighlightedItemId}
          region={region}
          headingRef={checkHeading}
          onDismiss={() => {
            updateSummary(null)
            setImageUrl(undefined)
            setPhotoIssues(undefined)
            setPhotoChecks(undefined)
            setLines(undefined)
            setHighlightedItemId(undefined)
          }}
          onAddDifference={(amount) => {
            addFlaggedItems(summary, [
              { name: t('receipt.notReadItem'), amount },
            ])
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
            highlightedItemId={highlightedItemId}
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
            if (window.confirm(t('split.newBillConfirm'))) {
              dispatch({ type: 'newBill', ids: newBillIds() })
              updateSummary(null)
              setImageUrl(undefined)
              setPhotoIssues(undefined)
              setPhotoChecks(undefined)
              setLines(undefined)
              setHighlightedItemId(undefined)
              setEditorSession((session) => session + 1)
            }
          }}
        >
          {t('split.newBill')}
        </button>
        <p className={styles.hint}>{t('split.savedHint')}</p>
      </div>
    </div>
  )
}
