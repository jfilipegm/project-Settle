import { formatAmount } from '../../lib/money.ts'
import type { Region } from '../../app/region.ts'
import type { SplitResult } from './split.ts'

/**
 * The result as plain text for "Copy as text" (D12): the bill total, each
 * person's total, and who owes whom, in the region's format. For people to
 * read, not a data format.
 */
export function resultAsText(result: SplitResult, region: Region): string {
  const money = (value: Parameters<typeof formatAmount>[0]) =>
    formatAmount(value, region)
  const names = new Map(
    result.people.map((share) => [share.personId, share.name]),
  )

  const lines = [`Bill total: ${money(result.total)}`, '']
  for (const share of result.people) {
    lines.push(`${share.name}: ${money(share.total)}`)
  }
  if (result.settlements.length > 0) {
    lines.push('')
    for (const { fromId, toId, amount } of result.settlements) {
      lines.push(
        `${names.get(fromId) ?? ''} owes ${names.get(toId) ?? ''} ${money(amount)}`,
      )
    }
  }
  return lines.join('\n')
}
