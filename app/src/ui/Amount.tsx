import type { Region } from '../app/region.ts'
import type { Cents } from '../lib/money.ts'
import { classes } from './classes.ts'
import { signedAmount, type AmountSign } from './signedAmount.ts'

/**
 * An amount in the figures face, tabular (S3): a `<data>` element whose
 * value is the amount in cents, its text in the region's format.
 */
export function Amount({
  value,
  region,
  sign = 'negative',
  className,
}: {
  value: Cents
  region: Region
  sign?: AmountSign
  className?: string | undefined
}) {
  return (
    <data value={value} className={classes('amount', className)}>
      {signedAmount(value, region, sign)}
    </data>
  )
}
