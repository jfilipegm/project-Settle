import { useMemo, type Ref } from 'react'
import type { Region } from '../../../app/region.ts'
import { formatAmount, negate } from '../../../lib/money.ts'
import type { Bill } from '../../split/model.ts'
import splitStyles from '../../split/components/split.module.css'
import { warningMessage } from '../messages.ts'
import type { ReceiptSummary } from '../model.ts'
import { checkReceipt, type ReceiptCheck as Check } from '../reconcile.ts'
import styles from './receipt.module.css'

interface Props {
  bill: Bill
  summary: ReceiptSummary
  /** The receipt image's object URL, while this page holds it (D14). */
  imageUrl?: string | undefined
  region: Region
  headingRef?: Ref<HTMLHeadingElement>
  onDismiss: () => void
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
 * The "Receipt check" panel (M2 plan, D14): what was read, the trusted
 * total and where it came from, and a live comparison with the bill.
 */
export function ReceiptCheck({
  bill,
  summary,
  imageUrl,
  region,
  headingRef,
  onDismiss,
}: Props) {
  const check = useMemo(() => checkReceipt(bill, summary), [bill, summary])

  return (
    <section
      className={styles.check}
      aria-labelledby="receipt-check-heading"
      data-receipt-check=""
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
        <CheckStatus check={check} region={region} />
      </div>

      {summary.warnings.length > 0 && (
        <ul className={styles.warnings} aria-label="Warnings">
          {summary.warnings.map((warning) => (
            <li key={warning}>{warningMessage(warning, summary.currency)}</li>
          ))}
        </ul>
      )}

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
