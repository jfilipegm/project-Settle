import type { Dispatch } from 'react'
import type { Region } from '../../../app/region.ts'
import { cents } from '../../../lib/money.ts'
import type { BillAction } from '../billReducer.ts'
import type {
  Adjustment,
  AdjustmentName,
  Bill,
  BillError,
  SplitMode,
} from '../model.ts'
import { adjustmentLabel, fieldError, fieldId } from './fields.ts'
import { AmountInput, RatioInput } from './inputs.tsx'
import styles from './split.module.css'

interface Props {
  bill: Bill
  dispatch: Dispatch<BillAction>
  errors: readonly BillError[]
  region: Region
}

const HINTS: Partial<Record<AdjustmentName, string>> = {
  tax: 'Only tax not already included in the prices. Portuguese prices already include IVA.',
  discount: 'Split in proportion to what each person had.',
}

export function AdjustmentsSection(props: Props) {
  return (
    <section
      className={styles.section}
      aria-labelledby="split-adjustments-heading"
    >
      <h2 id="split-adjustments-heading">Tax, tip and discount</h2>
      <p className={styles.hint}>
        Percentages are taken from the items subtotal.
      </p>
      <AdjustmentFields {...props} name="tax" />
      <AdjustmentFields {...props} name="tip" />
      <AdjustmentFields {...props} name="discount" />
    </section>
  )
}

function AdjustmentFields({
  bill,
  dispatch,
  errors,
  region,
  name,
}: Props & { name: AdjustmentName }) {
  const label = adjustmentLabel(name)
  const adjustment = bill[name]
  const field = { kind: 'adjustment', adjustment: name } as const
  const id = fieldId(field)
  const error = fieldError(errors, field, bill, region)
  const set = (next: Adjustment) => {
    dispatch({ type: 'setAdjustment', name, adjustment: next })
  }
  const mode: SplitMode | undefined =
    name === 'tax' ? bill.taxMode : name === 'tip' ? bill.tipMode : undefined

  return (
    <fieldset className={styles.fieldset}>
      <legend>{label}</legend>
      {HINTS[name] && <p className={styles.hint}>{HINTS[name]}</p>}

      <div
        className={styles.choices}
        role="radiogroup"
        aria-label={`${label} as`}
      >
        <label className={styles.choice}>
          <input
            type="radio"
            name={`split-${name}-kind`}
            checked={adjustment.kind === 'amount'}
            onChange={() => {
              set({ kind: 'amount', value: cents(0) })
            }}
          />
          Amount
        </label>
        <label className={styles.choice}>
          <input
            type="radio"
            name={`split-${name}-kind`}
            checked={adjustment.kind === 'percent'}
            onChange={() => {
              set({ kind: 'percent', ratio: { numerator: 0, denominator: 1 } })
            }}
          />
          Percentage
        </label>
      </div>

      {adjustment.kind === 'amount' ? (
        <AmountInput
          key={`amount-${region.locale}-${region.currency}`}
          id={id}
          label={`${label} amount`}
          value={adjustment.value}
          error={error}
          onChange={(value) => {
            set({ kind: 'amount', value })
          }}
        />
      ) : (
        <RatioInput
          key={`percent-${region.locale}`}
          id={id}
          kind="percent"
          label={`${label} percentage (%)`}
          value={adjustment.ratio}
          error={error}
          onChange={(ratio) => {
            set({ kind: 'percent', ratio })
          }}
        />
      )}

      {mode !== undefined && name !== 'discount' && (
        <div
          className={styles.choices}
          role="radiogroup"
          aria-label={`Split the ${label.toLowerCase()}`}
        >
          <label className={styles.choice}>
            <input
              type="radio"
              name={`split-${name}-mode`}
              checked={mode !== 'equal'}
              onChange={() => {
                dispatch({
                  type: 'setAdjustmentMode',
                  name,
                  mode: 'proportional',
                })
              }}
            />
            By what each person had
          </label>
          <label className={styles.choice}>
            <input
              type="radio"
              name={`split-${name}-mode`}
              checked={mode === 'equal'}
              onChange={() => {
                dispatch({ type: 'setAdjustmentMode', name, mode: 'equal' })
              }}
            />
            Equally
          </label>
        </div>
      )}
    </fieldset>
  )
}
