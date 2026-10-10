import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
} from 'react'
import { Link } from 'react-router'
import styles from './Charts.module.css'

/*
 * The kit's charts (M4, review finding M-7): drawn beside the numbers,
 * never instead of them. Every value keeps a text alternative (an
 * accessible name on the chart or its marks), and the figures on the page
 * stay the readable source. Thin marks, a 2 px gap between fills, no
 * animation, colours from the chart tokens (never on text).
 *
 * A mark's value shows at once in the kit's tip (M5, B1): on pointer
 * hover, on a tap of a mark that isn't a link, and on keyboard focus of a
 * bar. The tip is `aria-hidden`; it repeats what the names already say.
 */

type TipSource = 'hover' | 'tap' | 'focus'

interface Tip {
  id: string
  label: string
  /** Where the mark is across the chart, 0 to 100. */
  x: number
  /** The tip's top, as a CSS length in the chart's box. */
  top: string
  source: TipSource
}

interface TipMark {
  id: string
  label: string
  x: number
  top: string
}

/**
 * The tip's state for one chart: shown by a mark, hidden by leaving it,
 * blurring it, a press outside the chart or Escape.
 */
function useChartTip(): {
  tip: Tip | null
  boxRef: RefObject<HTMLDivElement | null>
  show: (mark: TipMark, source: TipSource) => void
  hide: (id: string, source: TipSource) => void
  toggle: (mark: TipMark) => void
  hover: (mark: TipMark) => {
    onPointerEnter: (event: PointerEvent) => void
    onPointerLeave: () => void
  }
} {
  const boxRef = useRef<HTMLDivElement>(null)
  const [tip, setTip] = useState<Tip | null>(null)
  const shown = tip !== null

  useEffect(() => {
    if (!shown) return
    const press = (event: globalThis.PointerEvent) => {
      const box = boxRef.current
      if (box !== null && event.target instanceof Node) {
        if (box.contains(event.target)) return
      }
      setTip(null)
    }
    // Escape hides the tip first; a dialog around the chart stays open.
    const key = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      setTip(null)
    }
    document.addEventListener('pointerdown', press)
    document.addEventListener('keydown', key, true)
    return () => {
      document.removeEventListener('pointerdown', press)
      document.removeEventListener('keydown', key, true)
    }
  }, [shown])

  const show = (mark: TipMark, source: TipSource) => setTip({ ...mark, source })
  const hide = (id: string, source: TipSource) =>
    setTip((current) =>
      current !== null && current.id === id && current.source === source
        ? null
        : current,
    )
  const toggle = (mark: TipMark) =>
    setTip((current) =>
      current !== null && current.id === mark.id && current.source === 'tap'
        ? null
        : { ...mark, source: 'tap' },
    )
  const hover = (mark: TipMark) => ({
    // A touch has no hover: its tap shows the tip instead.
    onPointerEnter: (event: PointerEvent) => {
      if (event.pointerType !== 'touch') show(mark, 'hover')
    },
    onPointerLeave: () => hide(mark.id, 'hover'),
  })
  return { tip, boxRef, show, hide, toggle, hover }
}

/** The tip itself: above its mark, kept inside the chart's width. */
function ChartTip({ tip }: { tip: Tip | null }) {
  if (tip === null) return null
  return (
    <span
      className={styles.tip}
      aria-hidden="true"
      data-testid="chart-tip"
      style={
        {
          '--tip-x': `${tip.x.toFixed(2)}%`,
          '--tip-top': tip.top,
        } as CSSProperties
      }
    >
      {tip.label}
    </span>
  )
}

export interface DonutSlice {
  id: string
  value: number
  /** A CSS colour, normally a `var(--chart-…)` token. */
  colour: string
  /** The slice in words, for the tip. */
  label: string
}

const RADIUS = 52
const RING = 14
const CIRCUMFERENCE = 2 * Math.PI * RADIUS
/** The surface gap between slices, in the ring's own units. */
const GAP = 2
const VIEW = 120

/**
 * A donut: part to whole at a glance, six slices at most (the caller
 * folds the rest). `children` sit in the hole, typically the total. One
 * image to assistive technology, named by `label`; its slices aren't
 * focusable, since the legend beside it prints every value.
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
  const { tip, boxRef, toggle, hover } = useChartTip()
  const total = slices.reduce((a, s) => a + Math.max(0, s.value), 0)
  const drawn = slices.filter((s) => s.value > 0)
  const gap = drawn.length > 1 ? GAP : 0
  let offset = 0
  return (
    <div className={styles.donut} role="img" aria-label={label} ref={boxRef}>
      <svg
        viewBox={`0 0 ${String(VIEW)} ${String(VIEW)}`}
        aria-hidden="true"
        focusable="false"
      >
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
            // The middle of the slice, clockwise from the top.
            const angle = ((start + length / 2) / CIRCUMFERENCE) * 2 * Math.PI
            const mark: TipMark = {
              id: slice.id,
              label: slice.label,
              x: ((60 + RADIUS * Math.sin(angle)) / VIEW) * 100,
              top: `${(((60 - RADIUS * Math.cos(angle)) / VIEW) * 100).toFixed(2)}%`,
            }
            return (
              <circle
                key={slice.id}
                className={styles.slice}
                data-testid={`slice-${slice.id}`}
                data-tip={tip?.id === slice.id ? '' : undefined}
                cx="60"
                cy="60"
                r={RADIUS}
                fill="none"
                stroke={slice.colour}
                strokeWidth={RING}
                strokeDasharray={`${String(dash)} ${String(CIRCUMFERENCE)}`}
                strokeDashoffset={-start}
                transform="rotate(-90 60 60)"
                {...hover(mark)}
                onClick={() => toggle(mark)}
              />
            )
          })}
      </svg>
      {children !== undefined && <div className={styles.hole}>{children}</div>}
      <ChartTip tip={tip} />
    </div>
  )
}

export interface ChartBar {
  id: string
  value: number
  /** The bar in words: its accessible name and its tip. */
  label: string
  /** A short label under the bar, or none. */
  tick?: string
  /** The one bar drawn in the series colour; the others recede. */
  current?: boolean
  /** Makes the bar a link (to that month, say). */
  to?: string
}

const NEXT_KEYS: Record<string, (index: number, last: number) => number> = {
  ArrowRight: (i, last) => Math.min(i + 1, last),
  ArrowDown: (i, last) => Math.min(i + 1, last),
  ArrowLeft: (i) => Math.max(i - 1, 0),
  ArrowUp: (i) => Math.max(i - 1, 0),
  Home: () => 0,
  End: (_i, last) => last,
}

/**
 * Vertical bars on one baseline, scaled to the largest. With `emphasis`,
 * only the `current` bar wears the series colour and the rest are neutral;
 * otherwise every bar does.
 *
 * The chart is a group, named by `labelledBy` (a heading's id) or else
 * `label`, and described by `summary`. Each bar is named by its label: a
 * link when it has `to`, otherwise an image. The group is one Tab stop;
 * the arrow keys, Home and End move between the bars (roving focus).
 */
export function Bars({
  bars,
  label,
  labelledBy,
  summary,
  scale,
  emphasis = false,
}: {
  bars: readonly ChartBar[]
  label: string
  /** The id of the heading that names the chart, in place of `label`. */
  labelledBy?: string
  /** The chart in one sentence (its total and highest bar, say). */
  summary?: string
  /** The value at the top of the plot, in words, shown on its hairline. */
  scale?: string
  emphasis?: boolean
}) {
  const { tip, boxRef, show, hide, toggle, hover } = useChartTip()
  const summaryId = useId()
  const marks = useRef<(HTMLElement | null)[]>([])
  const last = bars.length - 1
  const initial = Math.max(
    0,
    bars.findIndex((bar) => bar.current === true),
  )
  const [focused, setFocused] = useState<number | null>(null)
  const roving = Math.min(focused ?? initial, Math.max(last, 0))
  const max = bars.reduce((a, b) => Math.max(a, b.value), 0)

  const onKeyDown = (event: KeyboardEvent) => {
    const next = NEXT_KEYS[event.key]
    if (next === undefined || last < 0) return
    event.preventDefault()
    const index = next(roving, last)
    setFocused(index)
    marks.current[index]?.focus()
  }

  return (
    <div
      className={styles.bars}
      role="group"
      aria-label={labelledBy === undefined ? label : undefined}
      aria-labelledby={labelledBy}
      aria-describedby={summary === undefined ? undefined : summaryId}
      style={{ '--bar-count': bars.length } as CSSProperties}
    >
      {summary !== undefined && (
        <span id={summaryId} hidden>
          {summary}
        </span>
      )}
      <div className={styles.plot} ref={boxRef} onKeyDown={onKeyDown}>
        {scale !== undefined && (
          <span className={styles.scale} aria-hidden="true">
            {scale}
          </span>
        )}
        {bars.map((bar, index) => {
          const height = max > 0 ? (bar.value / max) * 100 : 0
          const mark: TipMark = {
            id: bar.id,
            label: bar.label,
            x: ((index + 0.5) / bars.length) * 100,
            // The bar's top: the plot's padding, then the empty part.
            top: `calc(var(--plot-top) + (100% - var(--plot-top)) * ${(1 - height / 100).toFixed(4)})`,
          }
          const shared = {
            ref: (element: HTMLElement | null) => {
              marks.current[index] = element
            },
            className: styles.slot,
            tabIndex: index === roving ? 0 : -1,
            'data-tip': tip?.id === bar.id ? '' : undefined,
            onFocus: () => {
              setFocused(index)
              show(mark, 'focus')
            },
            onBlur: () => hide(bar.id, 'focus'),
            ...hover(mark),
          }
          const drawnBar = (
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
              {...shared}
              to={bar.to}
              aria-label={bar.label}
              aria-current={bar.current === true ? 'date' : undefined}
            >
              {drawnBar}
            </Link>
          ) : (
            <span
              key={bar.id}
              {...shared}
              role="img"
              aria-label={bar.label}
              aria-current={bar.current === true ? 'date' : undefined}
              onClick={() => toggle(mark)}
            >
              {drawnBar}
            </span>
          )
        })}
        <ChartTip tip={tip} />
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
  /** The segment in words, for the tip. */
  label: string
}

/**
 * One horizontal bar split into each part's share of the whole: one image
 * named by `label`; its segments aren't focusable, since the list beside
 * it prints every share.
 */
export function ShareBar({
  segments,
  label,
}: {
  segments: readonly ShareSegment[]
  label: string
}) {
  const { tip, boxRef, toggle, hover } = useChartTip()
  const drawn = segments.filter((segment) => segment.value > 0)
  const total = drawn.reduce((a, s) => a + s.value, 0)
  // Each segment's middle, as a share of the whole bar.
  const middles = drawn.map(
    (segment, i) =>
      drawn.slice(0, i).reduce((a, s) => a + s.value, 0) + segment.value / 2,
  )
  return (
    <div className={styles.shareBox} ref={boxRef}>
      <div className={styles.shareBar} role="img" aria-label={label}>
        {drawn.map((segment, i) => {
          const middle = middles[i] ?? 0
          const mark: TipMark = {
            id: segment.id,
            label: segment.label,
            x: total > 0 ? (middle / total) * 100 : 50,
            top: '0px',
          }
          return (
            <span
              key={segment.id}
              className={styles.segment}
              data-testid={`segment-${segment.id}`}
              data-tip={tip?.id === segment.id ? '' : undefined}
              style={{ ...segment.style, flexGrow: segment.value }}
              {...hover(mark)}
              onClick={() => toggle(mark)}
            />
          )
        })}
      </div>
      <ChartTip tip={tip} />
    </div>
  )
}
