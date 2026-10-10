import type { CSSProperties, ReactNode } from 'react'
import { Link } from 'react-router'
import styles from './Charts.module.css'

/*
 * The kit's charts (M4, review finding M-7): drawn beside the numbers,
 * never instead of them. Each chart is one image to assistive technology,
 * named by a text alternative that carries its values; the figures on the
 * page stay the readable source. Thin marks, a 2 px gap between fills, no
 * animation, colours from the chart tokens (never on text).
 */

export interface DonutSlice {
  id: string
  value: number
  /** A CSS colour, normally a `var(--chart-…)` token. */
  colour: string
  /** The slice in words, for the hover title. */
  label: string
}

const RADIUS = 52
const RING = 14
const CIRCUMFERENCE = 2 * Math.PI * RADIUS
/** The surface gap between slices, in the ring's own units. */
const GAP = 2

/**
 * A donut: part to whole at a glance, six slices at most (the caller
 * folds the rest). `children` sit in the hole, typically the total.
 */
export function Donut({
  slices,
  label,
  children,
}: {
  slices: readonly DonutSlice[]
  /** The text alternative: every slice with its value. */
  label: string
  children?: ReactNode
}) {
  const total = slices.reduce((a, s) => a + Math.max(0, s.value), 0)
  const drawn = slices.filter((s) => s.value > 0)
  const gap = drawn.length > 1 ? GAP : 0
  let offset = 0
  return (
    <div className={styles.donut} role="img" aria-label={label}>
      <svg viewBox="0 0 120 120" aria-hidden="true" focusable="false">
        <circle
          className={styles.track}
          cx="60"
          cy="60"
          r={RADIUS}
          strokeWidth={RING}
        />
        {total > 0 &&
          drawn.map((slice) => {
            const length = (slice.value / total) * CIRCUMFERENCE
            const dash = Math.max(length - gap, 0.5)
            const start = offset
            offset += length
            return (
              <circle
                key={slice.id}
                data-testid={`slice-${slice.id}`}
                cx="60"
                cy="60"
                r={RADIUS}
                fill="none"
                stroke={slice.colour}
                strokeWidth={RING}
                strokeDasharray={`${String(dash)} ${String(CIRCUMFERENCE)}`}
                strokeDashoffset={-start}
                transform="rotate(-90 60 60)"
              >
                <title>{slice.label}</title>
              </circle>
            )
          })}
      </svg>
      {children !== undefined && <div className={styles.hole}>{children}</div>}
    </div>
  )
}

export interface ChartBar {
  id: string
  value: number
  /** The bar in words: its title on hover and, for a link, its name. */
  label: string
  /** A short label under the bar, or none. */
  tick?: string
  /** The one bar drawn in the series colour; the others recede. */
  current?: boolean
  /** Makes the bar a link (to that month, say). */
  to?: string
}

/**
 * Vertical bars on one baseline, scaled to the largest. With `emphasis`,
 * only the `current` bar wears the series colour and the rest are neutral;
 * otherwise every bar does. Bars that link are each named by their label;
 * otherwise the whole chart is one image named by `label`.
 */
export function Bars({
  bars,
  label,
  scale,
  emphasis = false,
}: {
  bars: readonly ChartBar[]
  label: string
  /** The value at the top of the plot, in words, shown on its hairline. */
  scale?: string
  emphasis?: boolean
}) {
  const max = bars.reduce((a, b) => Math.max(a, b.value), 0)
  const links = bars.some((bar) => bar.to !== undefined)
  return (
    <div
      className={styles.bars}
      role={links ? 'group' : 'img'}
      aria-label={label}
      style={{ '--bar-count': bars.length } as CSSProperties}
    >
      <div className={styles.plot} aria-hidden={links ? undefined : true}>
        {scale !== undefined && (
          <span className={styles.scale} aria-hidden="true">
            {scale}
          </span>
        )}
        {bars.map((bar) => {
          const height = max > 0 ? (bar.value / max) * 100 : 0
          const mark = (
            <span
              className={styles.bar}
              data-testid={`bar-${bar.id}`}
              data-muted={emphasis && bar.current !== true ? '' : undefined}
              style={{
                height:
                  bar.value > 0 ? `max(${height.toFixed(2)}%, 2px)` : '0px',
              }}
            />
          )
          return bar.to !== undefined ? (
            <Link
              key={bar.id}
              className={styles.slot}
              to={bar.to}
              title={bar.label}
              aria-label={bar.label}
              aria-current={bar.current === true ? 'date' : undefined}
            >
              {mark}
            </Link>
          ) : (
            <span key={bar.id} className={styles.slot} title={bar.label}>
              {mark}
            </span>
          )
        })}
      </div>
      {bars.some((bar) => bar.tick !== undefined) && (
        <div className={styles.ticks} aria-hidden="true">
          {bars.map((bar) => (
            <span key={bar.id} data-current={bar.current ? '' : undefined}>
              {bar.tick ?? ''}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export interface ShareSegment {
  id: string
  value: number
  /** Custom properties that colour it (`personColorStyle`). */
  style: CSSProperties
  label: string
}

/** One horizontal bar split into each part's share of the whole. */
export function ShareBar({
  segments,
  label,
}: {
  segments: readonly ShareSegment[]
  label: string
}) {
  const drawn = segments.filter((segment) => segment.value > 0)
  return (
    <div className={styles.shareBar} role="img" aria-label={label}>
      {drawn.map((segment) => (
        <span
          key={segment.id}
          className={styles.segment}
          data-testid={`segment-${segment.id}`}
          title={segment.label}
          style={{ ...segment.style, flexGrow: segment.value }}
        />
      ))}
    </div>
  )
}
