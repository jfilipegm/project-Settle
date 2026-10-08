import { useState } from 'react'
import type { Region } from '../../../app/region.ts'
import { useT } from '../../../i18n/language.ts'
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
  const t = useT()
  return (
    <section
      id="result"
      className={styles.section}
      aria-labelledby="split-result-heading"
      tabIndex={-1}
    >
      <h2 id="split-result-heading">{t('split.result.heading')}</h2>
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
            <strong>{t('split.result.fixThese')}</strong>
          </p>
          <ul>
            {outcome.errors.map((error, index) => (
              <li key={index}>
                <a href={`#${fieldId(error.field)}`}>
                  {billErrorFieldLabel(t, error, bill)}
                </a>
                : {billErrorMessage(t, error, bill, region)}
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
  const t = useT()
  const money = (value: Cents) => formatAmount(value, region)
  const [copyStatus, setCopyStatus] = useState('')
  const names = new Map(
    result.people.map((share) => [share.personId, share.name]),
  )

  function lineLabel(line: BreakdownLine): string {
    if (line.kind !== 'item') {
      return adjustmentLabel(t, line.kind)
    }
    const index = bill.items.findIndex((item) => item.id === line.itemId)
    const item = bill.items[index]
    return item ? itemName(t, item, index) : t('split.errors.fieldItem')
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
              <a href={`#${noticeTarget}`}>{t('split.result.goToCheck')}</a>
            </>
          )}
        </p>
      ))}
      <dl className={styles.summary}>
        <dt>{t('split.result.itemsSubtotal')}</dt>
        <dd>{money(result.itemsSubtotal)}</dd>
        {result.tax > 0 && (
          <>
            <dt>{t('split.adjustments.tax.name')}</dt>
            <dd>{money(result.tax)}</dd>
          </>
        )}
        {result.tip > 0 && (
          <>
            <dt>{t('split.adjustments.tip.name')}</dt>
            <dd>{money(result.tip)}</dd>
          </>
        )}
        {result.discount > 0 && (
          <>
            <dt>{t('split.adjustments.discount.name')}</dt>
            <dd>−{money(result.discount)}</dd>
          </>
        )}
        <dt className={styles.summaryTotal}>{t('split.result.billTotal')}</dt>
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
                  {t('split.result.breakdown')}{' '}
                  <span className={styles.srOnly}>
                    {t('split.result.breakdownFor', { name: share.name })}
                  </span>
                </summary>
                <p className={styles.hint}>{t('split.result.roundingHint')}</p>
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

      <h3>{t('split.result.settleUp')}</h3>
      {result.settlements.length > 0 ? (
        <ul className={styles.settlements}>
          {result.settlements.map(({ fromId, toId, amount }) => (
            <li key={fromId}>
              {t('split.result.owes', {
                from: names.get(fromId) ?? '',
                to: names.get(toId) ?? '',
              })}{' '}
              <strong>{money(amount)}</strong>
            </li>
          ))}
        </ul>
      ) : (
        <p>{t('split.result.nobodyOwes')}</p>
      )}

      <div className={styles.copyRow}>
        <button
          type="button"
          className={styles.primaryButton}
          onClick={() => {
            const text = resultAsText(t, result, region, notices)
            setCopyStatus('')
            // `navigator.clipboard` is missing outside secure contexts, so
            // call it inside the promise chain: a throw becomes a rejection.
            Promise.resolve()
              .then(() => navigator.clipboard.writeText(text))
              .then(
                () => {
                  setCopyStatus(t('split.result.copied'))
                },
                () => {
                  setCopyStatus(t('split.result.copyFailed'))
                },
              )
          }}
        >
          {t('split.result.copy')}
        </button>
        <p role="status" className={styles.copyStatus}>
          {copyStatus}
        </p>
      </div>
    </>
  )
}
