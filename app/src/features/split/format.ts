import type { Region } from '../../app/region.ts'
import type { Translate } from '../../i18n/t.ts'
import { formatAmount } from '../../lib/money.ts'
import type { SplitResult } from './split.ts'

/**
 * The result as plain text for "Copy as text" (D12): the bill total, each
 * person's total, and who owes whom, in the region's format, then any
 * notices about a scanned receipt (M2 remediation, R12 and R24). For
 * people to read, not a data format.
 */
export function resultAsText(
  t: Translate,
  result: SplitResult,
  region: Region,
  notices: readonly string[] = [],
): string {
  const money = (value: Parameters<typeof formatAmount>[0]) =>
    formatAmount(value, region)
  const names = new Map(
    result.people.map((share) => [share.personId, share.name]),
  )

  const lines = [
    t('split.copyText.billTotal', { amount: money(result.total) }),
    '',
  ]
  for (const share of result.people) {
    lines.push(
      t('split.copyText.person', {
        name: share.name,
        amount: money(share.total),
      }),
    )
  }
  if (result.settlements.length > 0) {
    lines.push('')
    for (const { fromId, toId, amount } of result.settlements) {
      lines.push(
        t('split.copyText.owes', {
          from: names.get(fromId) ?? '',
          to: names.get(toId) ?? '',
          amount: money(amount),
        }),
      )
    }
  }
  if (notices.length > 0) {
    lines.push('', ...notices)
  }
  return lines.join('\n')
}
