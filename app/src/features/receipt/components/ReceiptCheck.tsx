import { useMemo, type Ref } from 'react'
import type { Region } from '../../../app/region.ts'
import { useT } from '../../../i18n/language.ts'
import { formatAmount, negate, type Cents } from '../../../lib/money.ts'
import { LIMITS, type Bill } from '../../split/model.ts'
import splitStyles from '../../split/components/split.module.css'
import { warningMessage } from '../messages.ts'
import type {
  PhotoIssue,
  PhotoQuality,
  ReceiptSummary,
  RemovedLine,
  ReviewLine,
} from '../model.ts'
import { checkReceipt, type ReceiptCheck as Check } from '../reconcile.ts'
import {
  INCOMPLETE_BELOW,
  differenceOffer,
  isUnreadImport,
  readShare,
} from '../review.ts'
import { PhotoAdvice } from './PhotoAdvice.tsx'
import { ReceiptLines } from './ReceiptLines.tsx'
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
  /** P15: the lines read, for "Review lines", this import only. */
  lines?: readonly ReviewLine[] | undefined
  /** P15: adds a line as a flagged item shared by everyone. */
  onAddItem?: (name: string, amount: Cents) => void
  /** P15: the bill row of the line selected in the review, or none. */
  onSelectItem?: (itemId: string | undefined) => void
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
  const t = useT()
  const amount = (value: Parameters<typeof formatAmount>[0]) =>
    formatAmount(value, region)
  switch (check.status) {
    case 'match':
      return (
        <p className={styles.match}>
          <span aria-hidden="true">✓ </span>
          {t('receipt.check.matches')}
        </p>
      )
    case 'mismatch': {
      const less = check.difference < 0
      const params = {
        total: amount(check.billTotal),
        gap: amount(less ? negate(check.difference) : check.difference),
      }
      return (
        <p className={styles.mismatch}>
          <span aria-hidden="true">⚠ </span>
          {less
            ? t('receipt.check.mismatchLess', params)
            : t('receipt.check.mismatchMore', params)}
        </p>
      )
    }
    case 'noTotal':
      return (
        <p className={styles.mismatch}>
          <span aria-hidden="true">⚠ </span>
          {t('receipt.check.noTotal')}
        </p>
      )
    case 'billInvalid':
      return (
        <p className={styles.mismatch}>
          <span aria-hidden="true">⚠ </span>
          {t('receipt.check.billInvalid')}
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
  const t = useT()
  const removed = summary.removedLines?.length ?? 0
  const share = readShare(bill, summary)
  if (check.status === 'match' && removed > 0) {
    return (
      <p className={styles.mismatch}>
        <span aria-hidden="true">⚠ </span>
        {t('receipt.check.matchesAfterCut', { count: removed })}
      </p>
    )
  }
  if (check.status === 'match' && isUnreadImport(bill, summary)) {
    return (
      <p className={styles.mismatch}>
        <span aria-hidden="true">⚠ </span>
        {t('receipt.check.unread')}
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
        <span aria-hidden="true">⚠ </span>
        {t('receipt.check.incomplete', {
          read: formatAmount(share.read, region),
          total: formatAmount(check.receiptTotal, region),
        })}
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
  lines,
  onAddItem,
  onSelectItem,
  region,
  headingRef,
  onDismiss,
  onAddDifference,
  onConfirmRemoved,
  onPutBack,
}: Props) {
  const t = useT()
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
        {t('receipt.check.heading')}
      </h2>
      <dl className={styles.facts}>
        {summary.merchant !== undefined && (
          <>
            <dt>{t('receipt.check.merchant')}</dt>
            <dd>{summary.merchant}</dd>
          </>
        )}
        {summary.date !== undefined && (
          <>
            <dt>{t('receipt.check.date')}</dt>
            <dd>{formatDate(summary.date, region)}</dd>
          </>
        )}
        {summary.merchantTaxId !== undefined && (
          <>
            <dt>{t('receipt.check.taxId')}</dt>
            <dd>{summary.merchantTaxId}</dd>
          </>
        )}
        {summary.total !== undefined && (
          <>
            <dt>{t('receipt.check.total')}</dt>
            <dd>
              {formatAmount(summary.total, region)}{' '}
              <span className={splitStyles.hint}>
                {summary.totalSource === 'qr'
                  ? t('receipt.check.fromQr')
                  : t('receipt.check.fromText')}
              </span>
            </dd>
          </>
        )}
        {summary.ivaTotal !== undefined && (
          <>
            <dt>{t('receipt.check.ivaIncluded')}</dt>
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
            {t('receipt.check.leftOut', { count: removed.length })}
          </p>
        )}
      </div>

      {removed.length > 0 && (
        <div className={styles.removed}>
          <ul aria-label={t('receipt.check.leftOutList')}>
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
              {t('receipt.check.notItems')}
            </button>
            {bill.items.length + removed.length <= LIMITS.maxItems && (
              <button
                type="button"
                className={splitStyles.secondaryButton}
                onClick={() => {
                  onPutBack(removed)
                }}
              >
                {t('receipt.check.putBack')}
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
            {t('receipt.check.addDifference', {
              amount: formatAmount(offer.amount, region),
            })}
          </button>
        </p>
      )}
      {offer.kind === 'percentage' && (
        <p>{t('receipt.check.percentageHint')}</p>
      )}

      {summary.warnings.length > 0 && (
        <ul
          className={styles.warnings}
          aria-label={t('receipt.check.warnings')}
        >
          {summary.warnings.map((warning) => (
            <li key={warning}>
              {warningMessage(t, warning, summary.currency)}
            </li>
          ))}
        </ul>
      )}

      <PhotoAdvice issues={photoIssues} lead={t('receipt.photo.leadDone')} />

      {lines !== undefined && lines.length > 0 && (
        <details className={splitStyles.details}>
          <summary>{t('receipt.check.reviewLines')}</summary>
          <ReceiptLines
            lines={lines}
            imageUrl={imageUrl}
            bill={bill}
            region={region}
            onAddItem={(name, amount) => {
              onAddItem?.(name, amount)
            }}
            onSelectItem={(itemId) => {
              onSelectItem?.(itemId)
            }}
          />
        </details>
      )}

      {imageUrl !== undefined && (
        <details className={splitStyles.details}>
          <summary>{t('receipt.check.showImage')}</summary>
          <img
            className={styles.receiptImage}
            src={imageUrl}
            alt={t('receipt.check.imageAlt')}
          />
        </details>
      )}

      <button
        type="button"
        className={splitStyles.secondaryButton}
        onClick={onDismiss}
      >
        {t('receipt.check.dismiss')}
      </button>
    </section>
  )
}
