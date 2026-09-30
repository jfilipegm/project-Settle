import { useState } from 'react'
import type { Region } from '../../../app/region.ts'
import { formatAmount, type Cents } from '../../../lib/money.ts'
import { resultAsText } from '../format.ts'
import type { Bill } from '../model.ts'
import type { BreakdownLine, SplitOutcome, SplitResult } from '../split.ts'
import {
  adjustmentLabel,
  billErrorFieldLabel,
  billErrorMessage,
  fieldId,
  itemName,
} from './fields.ts'
import styles from './split.module.css'

interface Props {
  bill: Bill
  outcome: SplitOutcome
  region: Region
  /**
   * Notices about a scanned receipt (M2 remediation, R12 and R24): shown
   * above the totals, and copied with them. Never blocking.
   */
  notices?: readonly string[]
  /** Where the notices link to: the receipt check panel's heading. */
  noticeTarget?: string
}

export function ResultSection({
  bill,
  outcome,
  region,
  notices = [],
  noticeTarget,
}: Props) {
  return (
    <section
      id="result"
      className={styles.section}
      aria-labelledby="split-result-heading"
      tabIndex={-1}
    >
      <h2 id="split-result-heading">Who owes what</h2>
      {outcome.ok ? (
        <Result
          bill={bill}
          result={outcome.result}
          region={region}
          notices={notices}
          noticeTarget={noticeTarget}
        />
      ) : (
        <div className={styles.errorSummary}>
          <p>
            <strong>Fix these to see the split:</strong>
          </p>
          <ul>
            {outcome.errors.map((error, index) => (
              <li key={index}>
                <a href={`#${fieldId(error.field)}`}>
                  {billErrorFieldLabel(error, bill)}
                </a>
                : {billErrorMessage(error, bill, region)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

function Result({
  bill,
  result,
  region,
  notices,
  noticeTarget,
}: {
  bill: Bill
  result: SplitResult
  region: Region
  notices: readonly string[]
  noticeTarget: string | undefined
}) {
  const money = (value: Cents) => formatAmount(value, region)
  const [copyStatus, setCopyStatus] = useState('')
  const names = new Map(
    result.people.map((share) => [share.personId, share.name]),
  )

  function lineLabel(line: BreakdownLine): string {
    if (line.kind !== 'item') {
      return adjustmentLabel(line.kind)
    }
    const index = bill.items.findIndex((item) => item.id === line.itemId)
    const item = bill.items[index]
    return item ? itemName(item, index) : 'Item'
  }

  return (
    <>
      {notices.map((notice) => (
        <p key={notice} className={styles.receiptNotice}>
          <span aria-hidden="true">⚠ </span>
          {notice}
          {noticeTarget !== undefined && (
            <>
              {' '}
              <a href={`#${noticeTarget}`}>Go to the receipt check</a>
            </>
          )}
        </p>
      ))}
      <dl className={styles.summary}>
        <dt>Items subtotal</dt>
        <dd>{money(result.itemsSubtotal)}</dd>
        {result.tax > 0 && (
          <>
            <dt>Tax</dt>
            <dd>{money(result.tax)}</dd>
          </>
        )}
        {result.tip > 0 && (
          <>
            <dt>Tip</dt>
            <dd>{money(result.tip)}</dd>
          </>
        )}
        {result.discount > 0 && (
          <>
            <dt>Discount</dt>
            <dd>−{money(result.discount)}</dd>
          </>
        )}
        <dt className={styles.summaryTotal}>Bill total</dt>
        <dd className={styles.summaryTotal}>{money(result.total)}</dd>
      </dl>

      <ul className={styles.personCards}>
        {result.people.map((share) => (
          <li key={share.personId} className={styles.personCard}>
            <h3 className={styles.personCardHeading}>
              <span>{share.name}</span>
              <span>{money(share.total)}</span>
            </h3>
            {share.lines.length > 0 && (
              <details className={styles.details}>
                <summary>
                  Breakdown{' '}
                  <span className={styles.srOnly}>for {share.name}</span>
                </summary>
                <p className={styles.hint}>
                  Lines are rounded within your total, so one item&apos;s shares
                  can add up to a cent or two more or less than its price.
                </p>
                <ul className={styles.breakdown}>
                  {share.lines.map((line, index) => (
                    <li key={index}>
                      <span>{lineLabel(line)}</span>
                      <span>{money(line.amount)}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </li>
        ))}
      </ul>

      <h3>Settle up</h3>
      {result.settlements.length > 0 ? (
        <ul className={styles.settlements}>
          {result.settlements.map(({ fromId, toId, amount }) => (
            <li key={fromId}>
              {names.get(fromId)} owes {names.get(toId)}{' '}
              <strong>{money(amount)}</strong>
            </li>
          ))}
        </ul>
      ) : (
        <p>Nobody owes anything.</p>
      )}

      <div className={styles.copyRow}>
        <button
          type="button"
          className={styles.primaryButton}
          onClick={() => {
            const text = resultAsText(result, region, notices)
            setCopyStatus('')
            // `navigator.clipboard` is missing outside secure contexts, so
            // call it inside the promise chain: a throw becomes a rejection.
            Promise.resolve()
              .then(() => navigator.clipboard.writeText(text))
              .then(
                () => {
                  setCopyStatus('Copied.')
                },
                () => {
                  setCopyStatus("Couldn't copy. Your browser blocked it.")
                },
              )
          }}
        >
          Copy as text
        </button>
        <p role="status" className={styles.copyStatus}>
          {copyStatus}
        </p>
      </div>
    </>
  )
}
