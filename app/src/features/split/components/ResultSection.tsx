import { IconAlertTriangle, IconCopy } from '@tabler/icons-react'
import { useState, type CSSProperties, type MouseEvent, type Ref } from 'react'
import type { Region } from '../../../app/region.ts'
import { useT } from '../../../i18n/language.ts'
import { negate, type Cents } from '../../../lib/money.ts'
import { Amount } from '../../../ui/Amount.tsx'
import { Button } from '../../../ui/Button.tsx'
import { Icon } from '../../../ui/Icon.tsx'
import { personColorStyle, personInitial } from '../../../ui/personColor.ts'
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
  /** The step's focus target (M3 plan, S9). */
  headingRef?: Ref<HTMLHeadingElement>
  /**
   * When the result shows on its own step, its links point at fields on
   * another step: this goes there instead of following the link.
   */
  onGoTo?: ((targetId: string) => void) | undefined
}

/** A link to a field or panel, through `onGoTo` when it's on another step. */
function stepLink(onGoTo: Props['onGoTo'], targetId: string) {
  return {
    href: `#${targetId}`,
    onClick: (event: MouseEvent<HTMLAnchorElement>) => {
      if (onGoTo === undefined) return
      event.preventDefault()
      onGoTo(targetId)
    },
  }
}

export function ResultSection({
  bill,
  outcome,
  region,
  notices = [],
  noticeTarget,
  headingRef,
  onGoTo,
}: Props) {
  const t = useT()
  return (
    <section
      id="result"
      className={styles.section}
      aria-labelledby="split-result-heading"
      tabIndex={-1}
    >
      <h2 id="split-result-heading" tabIndex={-1} ref={headingRef}>
        {t('split.result.heading')}
      </h2>
      {outcome.ok ? (
        <Result
          bill={bill}
          result={outcome.result}
          region={region}
          notices={notices}
          noticeTarget={noticeTarget}
          onGoTo={onGoTo}
        />
      ) : (
        <div className={styles.errorSummary}>
          <p>
            <strong>{t('split.result.fixThese')}</strong>
          </p>
          <ul>
            {outcome.errors.map((error, index) => (
              <li key={index}>
                <a {...stepLink(onGoTo, fieldId(error.field))}>
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

/** A person's share of the bill as a 0–100 % bar width. */
function shareOf(total: Cents, billTotal: Cents): string {
  if (billTotal <= 0 || total <= 0) return '0%'
  return `${String(Math.min(100, (total / billTotal) * 100))}%`
}

function Result({
  bill,
  result,
  region,
  notices,
  noticeTarget,
  onGoTo,
}: {
  bill: Bill
  result: SplitResult
  region: Region
  notices: readonly string[]
  noticeTarget: string | undefined
  onGoTo: Props['onGoTo']
}) {
  const t = useT()
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
          <Icon icon={IconAlertTriangle} size={20} />
          <span>
            {notice}
            {noticeTarget !== undefined && (
              <>
                {' '}
                <a {...stepLink(onGoTo, noticeTarget)}>
                  {t('split.result.goToCheck')}
                </a>
              </>
            )}
          </span>
        </p>
      ))}
      <dl className={styles.summary}>
        <dt>{t('split.result.itemsSubtotal')}</dt>
        <dd>
          <Amount value={result.itemsSubtotal} region={region} />
        </dd>
        {result.tax > 0 && (
          <>
            <dt>{t('split.adjustments.tax.name')}</dt>
            <dd>
              <Amount value={result.tax} region={region} />
            </dd>
          </>
        )}
        {result.tip > 0 && (
          <>
            <dt>{t('split.adjustments.tip.name')}</dt>
            <dd>
              <Amount value={result.tip} region={region} />
            </dd>
          </>
        )}
        {result.discount > 0 && (
          <>
            <dt>{t('split.adjustments.discount.name')}</dt>
            <dd>
              <Amount value={negate(result.discount)} region={region} />
            </dd>
          </>
        )}
        <dt className={styles.summaryTotal}>{t('split.result.billTotal')}</dt>
        <dd className={styles.summaryTotal}>
          <Amount value={result.total} region={region} />
        </dd>
      </dl>

      <ul className={styles.personCards}>
        {result.people.map((share) => {
          const index = bill.people.findIndex((p) => p.id === share.personId)
          const person = bill.people[index]
          return (
            <li
              key={share.personId}
              className={styles.personCard}
              style={
                {
                  ...personColorStyle(index),
                  '--share': shareOf(share.total, result.total),
                } as CSSProperties
              }
            >
              <div className={styles.personCardHeader}>
                <span className={styles.personDisc} aria-hidden="true">
                  {personInitial(person?.name ?? '', index)}
                </span>
                <h3 className={styles.personCardHeading}>
                  <span>{share.name}</span>
                  <span>
                    <Amount value={share.total} region={region} />
                  </span>
                </h3>
              </div>
              {/* The bar is a picture of the amount, which is the text. */}
              <div className={styles.shareBar} aria-hidden="true">
                <div className={styles.shareFill} />
              </div>
              {share.lines.length > 0 && (
                <details className={styles.details}>
                  <summary>
                    {t('split.result.breakdown')}{' '}
                    <span className={styles.srOnly}>
                      {t('split.result.breakdownFor', { name: share.name })}
                    </span>
                  </summary>
                  <p className={styles.hint}>
                    {t('split.result.roundingHint')}
                  </p>
                  <ul className={styles.breakdown}>
                    {share.lines.map((line, lineIndex) => (
                      <li key={lineIndex}>
                        <span>{lineLabel(line)}</span>
                        <Amount value={line.amount} region={region} />
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </li>
          )
        })}
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
              <strong>
                <Amount value={amount} region={region} />
              </strong>
            </li>
          ))}
        </ul>
      ) : (
        <p>{t('split.result.nobodyOwes')}</p>
      )}

      <div className={styles.copyRow}>
        <Button
          variant="primary"
          icon={IconCopy}
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
        </Button>
        <p role="status" className={styles.copyStatus}>
          {copyStatus}
        </p>
      </div>
    </>
  )
}
