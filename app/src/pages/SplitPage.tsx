import { IconFilePlus, IconKeyboard } from '@tabler/icons-react'
import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useRegion } from '../app/region.ts'
import { useMediaQuery } from '../app/useMediaQuery.ts'
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
import {
  defaultStep,
  parseStep,
  type SplitStep,
} from '../features/split/steps.ts'
import { newBillIds, useBill } from '../features/split/useBill.ts'
import { useT } from '../i18n/language.ts'
import { Button } from '../ui/Button.tsx'
import { Card } from '../ui/Card.tsx'
import { Steps } from '../ui/Steps.tsx'

/** From this width, Who had what shows The split beside the items (S9). */
const BESIDE = '(min-width: 1024px)'

/** Where focus goes after the next render: a step's heading, or the check. */
type FocusTarget = SplitStep | 'check' | { id: string }

/**
 * The split (M3 plan, S9): three steps, Receipt, Who had what and The
 * split, in the URL (`?step=`), so Back, Forward and a reload keep the
 * step. All three stay mounted and the others are `hidden`, so switching
 * steps loses nothing typed. From 1024 px, Who had what shows The split
 * beside the items.
 */
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

  // The step: the URL's, or with none, the bill's default (L4-I1), which
  // is then written into the URL so it can't flip while the bill changes.
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [initialStep] = useState(() => defaultStep(bill))
  const requested = parseStep(params.get('step'))
  const step = requested ?? initialStep
  const beside = useMediaQuery(BESIDE)
  const goTo = (next: SplitStep, replace = false) => {
    void navigate({ search: `?step=${next}` }, { replace })
  }
  useEffect(() => {
    if (requested === undefined) {
      void navigate({ search: `?step=${step}` }, { replace: true })
    }
  }, [requested, step, navigate])

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

  // Each step's heading takes focus when the step changes (S13).
  const scanHeading = useRef<HTMLHeadingElement>(null)
  const peopleHeading = useRef<HTMLHeadingElement>(null)
  const resultHeading = useRef<HTMLHeadingElement>(null)
  const checkHeading = useRef<HTMLHeadingElement>(null)
  const pendingFocus = useRef<FocusTarget | null>(null)
  const shownStep = useRef(step)

  useLayoutEffect(() => {
    const changed = shownStep.current !== step
    shownStep.current = step
    const target = pendingFocus.current
    if (target === 'check' || (typeof target === 'object' && target !== null)) {
      // Both are on Who had what: wait until it shows.
      if (step !== 'items') return
      pendingFocus.current = null
      if (target === 'check') {
        checkHeading.current?.focus()
      } else {
        const element = document.getElementById(target.id)
        element?.focus()
        element?.scrollIntoView?.({ block: 'center' })
      }
      return
    }
    if (target === step || (target === null && changed)) {
      pendingFocus.current = null
      const heading = {
        receipt: scanHeading,
        items: peopleHeading,
        split: resultHeading,
      }[step]
      heading.current?.focus()
    }
  }, [step, summary, editorSession])

  const updateSummary = (next: ReceiptSummary | null) => {
    setSummary(next)
    saveReceiptSummary(next)
  }
  // A replaced image, or one still held when leaving the page, is freed.
  useEffect(() => () => revokeImageUrl(imageUrl), [imageUrl])

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
  const clearReceipt = () => {
    updateSummary(null)
    setImageUrl(undefined)
    setPhotoIssues(undefined)
    setPhotoChecks(undefined)
    setLines(undefined)
    setHighlightedItemId(undefined)
  }

  const stepLabels: Record<SplitStep, string> = {
    receipt: t('split.steps.receipt'),
    items: t('split.steps.items'),
    split: t('split.steps.split'),
  }
  const showsResult = step === 'split' || (beside && step === 'items')

  return (
    <div className={styles.page}>
      <h1>{t('split.title')}</h1>
      <Steps
        label={t('split.steps.label')}
        current={step}
        steps={(['receipt', 'items', 'split'] as const).map((id) => ({
          id,
          label: stepLabels[id],
          to: `?step=${id}`,
        }))}
        onSelect={(id) => {
          // The current step's own link changes nothing: a request left
          // pending would take focus on some later, unrelated render.
          if (id !== step) pendingFocus.current = id
        }}
      />

      <div
        className={styles.stepPanels}
        data-layout={beside && step === 'items' ? 'beside' : 'single'}
      >
        <div className={styles.stepPanel} hidden={step !== 'receipt'}>
          <ScanReceipt
            bill={bill}
            region={region}
            headingRef={scanHeading}
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
              pendingFocus.current = 'check'
              goTo('items')
            }}
          />
          <Card title={t('split.typeItIn.heading')}>
            <p className={styles.hint}>{t('split.typeItIn.hint')}</p>
            <Button
              icon={IconKeyboard}
              disabled={scanning}
              onClick={() => {
                pendingFocus.current = 'items'
                goTo('items')
              }}
            >
              {t('split.typeItIn.button')}
            </Button>
          </Card>
        </div>

        <div className={styles.stepPanel} hidden={step !== 'items'}>
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
              onDismiss={clearReceipt}
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
          <div
            className={styles.editorSections}
            inert={scanning}
            aria-busy={scanning || undefined}
          >
            <Fragment key={editorSession}>
              <PeopleSection {...sectionProps} headingRef={peopleHeading} />
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

          {!beside && (
            <p className={styles.stepNext}>
              <Button
                variant="primary"
                size={48}
                onClick={() => {
                  pendingFocus.current = 'split'
                  goTo('split')
                }}
              >
                {t('split.seeSplit')}
              </Button>
            </p>
          )}
        </div>

        <div
          className={`${styles.stepPanel} ${styles.resultPanel}`}
          hidden={!showsResult}
        >
          <ResultSection
            bill={bill}
            outcome={outcome}
            region={region}
            notices={notices}
            noticeTarget="receipt-check-heading"
            headingRef={resultHeading}
            onGoTo={
              step === 'items'
                ? undefined
                : (id) => {
                    pendingFocus.current =
                      id === 'receipt-check-heading' ? 'check' : { id }
                    goTo('items')
                  }
            }
          />
        </div>
      </div>

      <div className={styles.newBill}>
        <Button
          icon={IconFilePlus}
          disabled={scanning}
          onClick={() => {
            if (window.confirm(t('split.newBillConfirm'))) {
              dispatch({ type: 'newBill', ids: newBillIds() })
              clearReceipt()
              setEditorSession((session) => session + 1)
              // Replace, not push: Back never returns to the cleared step.
              pendingFocus.current = 'receipt'
              goTo('receipt', true)
            }
          }}
        >
          {t('split.newBill')}
        </Button>
        <p className={styles.hint}>{t('split.savedHint')}</p>
      </div>
    </div>
  )
}
