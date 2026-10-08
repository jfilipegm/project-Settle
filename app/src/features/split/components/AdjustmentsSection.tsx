import type { Dispatch } from 'react'
import type { Region } from '../../../app/region.ts'
import { useT } from '../../../i18n/language.ts'
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

export function AdjustmentsSection(props: Props) {
  const t = useT()
  return (
    <section
      className={styles.section}
      aria-labelledby="split-adjustments-heading"
    >
      <h2 id="split-adjustments-heading">{t('split.adjustments.heading')}</h2>
      <p className={styles.hint}>{t('split.adjustments.percentHint')}</p>
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
  const t = useT()
  const label = adjustmentLabel(t, name)
  const hint = t(`split.adjustments.${name}.hint`)
  const adjustment = bill[name]
  const field = { kind: 'adjustment', adjustment: name } as const
  const id = fieldId(field)
  const error = fieldError(t, errors, field, bill, region)
  const set = (next: Adjustment) => {
    dispatch({ type: 'setAdjustment', name, adjustment: next })
  }
  const mode: SplitMode | undefined =
    name === 'tax' ? bill.taxMode : name === 'tip' ? bill.tipMode : undefined

  return (
    <fieldset className={styles.fieldset}>
      <legend>{label}</legend>
      {hint !== '' && <p className={styles.hint}>{hint}</p>}

      <div
        className={styles.choices}
        role="radiogroup"
        aria-label={t(`split.adjustments.${name}.as`)}
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
          {t('split.adjustments.amount')}
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
          {t('split.adjustments.percentage')}
        </label>
      </div>

      {adjustment.kind === 'amount' ? (
        <AmountInput
          key={`amount-${region.locale}-${region.currency}`}
          id={id}
          label={t(`split.adjustments.${name}.amountLabel`)}
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
          label={t(`split.adjustments.${name}.percentLabel`)}
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
          aria-label={t(`split.adjustments.${name}.splitThe`)}
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
            {t('split.adjustments.proportional')}
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
            {t('split.adjustments.equally')}
          </label>
        </div>
      )}
    </fieldset>
  )
}
