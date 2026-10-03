import { useMemo, type Ref } from 'react'
import type { Region } from '../../../app/region.ts'
import { formatAmount, negate, type Cents } from '../../../lib/money.ts'
import { LIMITS, type Bill } from '../../split/model.ts'
import splitStyles from '../../split/components/split.module.css'
import { PHOTO_ADVICE_LEAD_DONE, warningMessage } from '../messages.ts'
import type {
  PhotoIssue,
  PhotoQuality,
  ReceiptSummary,
  RemovedLine,
} from '../model.ts'
import { checkReceipt, type ReceiptCheck as Check } from '../reconcile.ts'
import {
  INCOMPLETE_BELOW,
  differenceOffer,
  isUnreadImport,
  linesCount,
  readShare,
} from '../review.ts'
import { PhotoAdvice } from './PhotoAdvice.tsx'
import styles from './receipt.module.css'

interface Props {
  bill: Bill
  summary: ReceiptSummary
  /** The receipt image's object URL, while this page holds it (D14). */
  imageUrl?: string | undefined
  /** P11: the photo quality check's issues, for this import only. */
  photoIssues?: readonly PhotoIssue[] | undefined
  /**
   * P11: each page's measurements, as numbers in a `data-` attribute for
   * `scripts/measure-quality.mjs` (the browser's own values). Never shown.
   */
  photoChecks?: readonly PhotoQuality[] | undefined
  region: Region
  headingRef?: Ref<HTMLHeadingElement>
  onDismiss: () => void
  /** R13: adds the missing difference as one flagged item. */
  onAddDifference: (amount: Cents) => void
  /** R24: the left-out lines aren't items; forget them. */
  onConfirmRemoved: () => void
  /** R24: add the left-out lines back as flagged items. */
  onPutBack: (lines: readonly RemovedLine[]) => void
}

function formatDate(iso: string, region: Region): string {
  const date = new Date(`${iso}T00:00:00Z`)
  return Number.isNaN(date.getTime())
    ? iso
    : new Intl.DateTimeFormat(region.locale, {
        dateStyle: 'medium',
        timeZone: 'UTC',
      }).format(date)
}

/** The live comparison, as text; the icon is only decoration. */
function CheckStatus({ check, region }: { check: Check; region: Region }) {
  const amount = (value: Parameters<typeof formatAmount>[0]) =>
    formatAmount(value, region)
  switch (check.status) {
    case 'match':
      return (
        <p className={styles.match}>
          <span aria-hidden="true">✓ </span>Matches the receipt total.
        </p>
      )
    case 'mismatch': {
      const less = check.difference < 0
      const gap = amount(less ? negate(check.difference) : check.difference)
      return (
        <p className={styles.mismatch}>
          <span aria-hidden="true">⚠ </span>Items add up to{' '}
          {amount(check.billTotal)}, {gap} {less ? 'less' : 'more'} than the
          receipt.
        </p>
      )
    }
    case 'noTotal':
      return (
        <p className={styles.mismatch}>
          <span aria-hidden="true">⚠ </span>No receipt total to compare the
          items with.
        </p>
      )
    case 'billInvalid':
      return (
        <p className={styles.mismatch}>
          <span aria-hidden="true">⚠ </span>Fix the bill’s errors to compare it
          with the receipt.
        </p>
      )
  }
}

/**
 * The status line (R14, R15, R24), or the live comparison. A cut never
 * reads as a plain "Matches" (R24).
 */
function StatusLine({
  bill,
  summary,
  check,
  region,
}: {
  bill: Bill
  summary: ReceiptSummary
  check: Check
  region: Region
}) {
  const removed = summary.removedLines?.length ?? 0
  const share = readShare(bill, summary)
  if (check.status === 'match' && removed > 0) {
    return (
      <p className={styles.mismatch}>
        <span aria-hidden="true">⚠ </span>Matches after leaving out{' '}
        {linesCount(removed)} read below the items as the receipt’s footer.
        Check they aren’t items:
      </p>
    )
  }
  if (check.status === 'match' && isUnreadImport(bill, summary)) {
    return (
      <p className={styles.mismatch}>
        <span aria-hidden="true">⚠ </span>None of the items could be read. The
        receipt’s total was added as one item: split it as it is, or type the
        items in.
      </p>
    )
  }
  if (
    check.status === 'mismatch' &&
    share !== undefined &&
    share.share < INCOMPLETE_BELOW
  ) {
    return (
      <p className={styles.mismatch}>
        <span aria-hidden="true">⚠ </span>Only{' '}
        {formatAmount(share.read, region)} of the receipt’s{' '}
        {formatAmount(check.receiptTotal, region)} was read. Add the missing
        items, or add the difference as one item.
      </p>
    )
  }
  return <CheckStatus check={check} region={region} />
}

/**
 * The "Receipt check" panel (M2 plan, D14): what was read, the trusted
 * total and where it came from, and a live comparison with the bill. With
 * the remediation plan: one click to add a missing difference (R13), and
 * the lines a cut left out, until they're confirmed or put back (R24).
 */
export function ReceiptCheck({
  bill,
  summary,
  imageUrl,
  photoIssues = [],
  photoChecks,
  region,
  headingRef,
  onDismiss,
  onAddDifference,
  onConfirmRemoved,
  onPutBack,
}: Props) {
  const check = useMemo(() => checkReceipt(bill, summary), [bill, summary])
  const offer = differenceOffer(bill, check)
  const removed = summary.removedLines ?? []

  return (
    <section
      className={styles.check}
      aria-labelledby="receipt-check-heading"
      data-receipt-check=""
      data-photo-checks={
        photoChecks === undefined ? undefined : JSON.stringify(photoChecks)
      }
    >
      <h2 id="receipt-check-heading" tabIndex={-1} ref={headingRef}>
        Receipt check
      </h2>
      <dl className={styles.facts}>
        {summary.merchant !== undefined && (
          <>
            <dt>Merchant</dt>
            <dd>{summary.merchant}</dd>
          </>
        )}
        {summary.date !== undefined && (
          <>
            <dt>Date</dt>
            <dd>{formatDate(summary.date, region)}</dd>
          </>
        )}
        {summary.merchantTaxId !== undefined && (
          <>
            <dt>NIF</dt>
            <dd>{summary.merchantTaxId}</dd>
          </>
        )}
        {summary.total !== undefined && (
          <>
            <dt>Receipt total</dt>
            <dd>
              {formatAmount(summary.total, region)}{' '}
              <span className={splitStyles.hint}>
                {summary.totalSource === 'qr'
                  ? '(from the fiscal QR code)'
                  : '(read from the receipt)'}
              </span>
            </dd>
          </>
        )}
        {summary.ivaTotal !== undefined && (
          <>
            <dt>IVA included</dt>
            <dd>{formatAmount(summary.ivaTotal, region)}</dd>
          </>
        )}
      </dl>

      <div role="status">
        <StatusLine
          bill={bill}
          summary={summary}
          check={check}
          region={region}
        />
        {removed.length > 0 && check.status !== 'match' && (
          <p className={styles.mismatch}>
            {linesCount(removed.length)} {removed.length === 1 ? 'was' : 'were'}{' '}
            left out below the items as the receipt’s footer. Check they aren’t
            items:
          </p>
        )}
      </div>

      {removed.length > 0 && (
        <div className={styles.removed}>
          <ul aria-label="Lines left out">
            {removed.map((line, index) => (
              <li key={index}>
                <span>{line.name}</span>{' '}
                <span>{formatAmount(line.amount, region)}</span>
              </li>
            ))}
          </ul>
          <div className={styles.removedActions}>
            <button
              type="button"
              className={splitStyles.secondaryButton}
              onClick={onConfirmRemoved}
            >
              They aren’t items
            </button>
            {bill.items.length + removed.length <= LIMITS.maxItems && (
              <button
                type="button"
                className={splitStyles.secondaryButton}
                onClick={() => {
                  onPutBack(removed)
                }}
              >
                Put them back
              </button>
            )}
          </div>
        </div>
      )}

      {offer.kind === 'button' && (
        <p>
          <button
            type="button"
            className={splitStyles.primaryButton}
            onClick={() => {
              onAddDifference(offer.amount)
            }}
          >
            Add the difference ({formatAmount(offer.amount, region)}) as an item
          </button>
        </p>
      )}
      {offer.kind === 'percentage' && (
        <p>
          Add the missing items, or change the tax or tip to an amount, to match
          the receipt.
        </p>
      )}

      {summary.warnings.length > 0 && (
        <ul className={styles.warnings} aria-label="Warnings">
          {summary.warnings.map((warning) => (
            <li key={warning}>{warningMessage(warning, summary.currency)}</li>
          ))}
        </ul>
      )}

      <PhotoAdvice issues={photoIssues} lead={PHOTO_ADVICE_LEAD_DONE} />

      {imageUrl !== undefined && (
        <details className={splitStyles.details}>
          <summary>Show receipt image</summary>
          <img
            className={styles.receiptImage}
            src={imageUrl}
            alt="The scanned receipt"
          />
        </details>
      )}

      <button
        type="button"
        className={splitStyles.secondaryButton}
        onClick={onDismiss}
      >
        Dismiss
      </button>
    </section>
  )
}
