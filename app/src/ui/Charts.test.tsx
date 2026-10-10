import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { Bars, Donut, ShareBar, type ChartBar } from './Charts.tsx'
import { personColorStyle } from './personColor.ts'

const CIRCUMFERENCE = 2 * Math.PI * 52

function dash(el: Element): number {
  return Number(el.getAttribute('stroke-dasharray')?.split(' ')[0])
}

function tip(): HTMLElement | null {
  return screen.queryByTestId('chart-tip')
}

const FOCUSABLE =
  'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])'

/**
 * L1-I2: nothing focusable inside an `aria-hidden` subtree or a
 * `role="img"` element, and every focusable mark has a name. A roving
 * mark with `tabindex="-1"` still counts: the arrow keys reach it.
 */
function expectAccessibleMarks(container: HTMLElement) {
  const reachable = container.querySelectorAll<HTMLElement>(
    `${FOCUSABLE}, [tabindex="-1"]`,
  )
  for (const element of reachable) {
    expect(element.closest('[aria-hidden="true"]')).toBeNull()
    expect(element.parentElement?.closest('[role="img"]')).toBeNull()
    expect(element.getAttribute('aria-label') ?? '').not.toBe('')
  }
  expect(container.querySelector('[title], title')).toBeNull()
}

const DAYS: ChartBar[] = [
  { id: 'd1', value: 4000, label: '1 Oct: 40,00 €', tick: '1' },
  { id: 'd2', value: 1000, label: '2 Oct: 10,00 €' },
  { id: 'd3', value: 0, label: '3 Oct: 0,00 €' },
]

const MONTHS: ChartBar[] = [
  {
    id: '2026-08',
    value: 50,
    label: 'August 2026: 0,50 €',
    to: '?month=2026-08',
  },
  {
    id: '2026-09',
    value: 100,
    label: 'September 2026: 1,00 €',
    to: '?month=2026-09',
  },
  {
    id: '2026-10',
    value: 200,
    label: 'October 2026, this month: 2,00 €',
    current: true,
  },
]

function renderIn(ui: ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>)
}

describe('Donut', () => {
  it('is one image named by its text alternative, a slice per part', () => {
    const { container } = render(
      <Donut
        label="Where it went: Rent 25,50 €, Groceries 4,50 €."
        slices={[
          { id: 'rent', value: 2550, colour: 'var(--chart-3)', label: 'Rent' },
          { id: 'food', value: 450, colour: 'var(--chart-1)', label: 'Food' },
        ]}
      >
        30,00 €
      </Donut>,
    )
    expect(
      screen.getByRole('img', {
        name: 'Where it went: Rent 25,50 €, Groceries 4,50 €.',
      }),
    ).toHaveTextContent('30,00 €')
    const rent = screen.getByTestId('slice-rent')
    const food = screen.getByTestId('slice-food')
    // Proportional, less the 2-unit gap between slices.
    expect(dash(rent)).toBeCloseTo(CIRCUMFERENCE * 0.85 - 2, 5)
    expect(dash(food)).toBeCloseTo(CIRCUMFERENCE * 0.15 - 2, 5)
    expect(rent).toHaveAttribute('stroke', 'var(--chart-3)')
    expect(food.getAttribute('stroke-dashoffset')).toBe(
      String(-(CIRCUMFERENCE * 0.85)),
    )
    expectAccessibleMarks(container)
  })

  it('shows a slice’s value at once on hover, and hides it on leave', () => {
    render(
      <Donut
        label="All rent"
        slices={[
          { id: 'rent', value: 10, colour: 'red', label: 'Rent: 0,10 €' },
        ]}
      />,
    )
    const rent = screen.getByTestId('slice-rent')
    fireEvent.pointerEnter(rent, { pointerType: 'mouse' })
    expect(tip()).toHaveTextContent('Rent: 0,10 €')
    expect(tip()).toHaveAttribute('aria-hidden', 'true')
    expect(rent).toHaveAttribute('data-tip')
    fireEvent.pointerLeave(rent, { pointerType: 'mouse' })
    expect(tip()).toBeNull()
  })

  it('shows a slice’s value on a tap, until a tap elsewhere', () => {
    render(
      <>
        <Donut
          label="All rent"
          slices={[
            { id: 'rent', value: 10, colour: 'red', label: 'Rent: 0,10 €' },
          ]}
        />
        <p>Elsewhere</p>
      </>,
    )
    fireEvent.click(screen.getByTestId('slice-rent'))
    expect(tip()).toHaveTextContent('Rent: 0,10 €')
    fireEvent.pointerDown(screen.getByText('Elsewhere'))
    expect(tip()).toBeNull()
  })

  it('draws one part as a full ring, with no gap', () => {
    render(
      <Donut
        label="All rent"
        slices={[{ id: 'rent', value: 10, colour: 'red', label: 'Rent' }]}
      />,
    )
    expect(dash(screen.getByTestId('slice-rent'))).toBeCloseTo(CIRCUMFERENCE, 5)
  })

  it('draws no slice for nothing', () => {
    render(
      <Donut
        label="Nothing"
        slices={[{ id: 'rent', value: 0, colour: 'red', label: 'Rent' }]}
      />,
    )
    expect(screen.queryByTestId('slice-rent')).not.toBeInTheDocument()
  })
})

describe('Bars', () => {
  it('is a named, described group of named bars, scaled to the largest', () => {
    const { container } = renderIn(
      <Bars
        label="Spending each day"
        summary="50,00 € in October; the most on 1 Oct, 40,00 €."
        scale="Up to 40,00 €"
        bars={DAYS}
      />,
    )
    const group = screen.getByRole('group', { name: 'Spending each day' })
    expect(group).toHaveAccessibleDescription(
      '50,00 € in October; the most on 1 Oct, 40,00 €.',
    )
    expect(group).toHaveTextContent('Up to 40,00 €')
    expect(screen.getByRole('img', { name: '2 Oct: 10,00 €' })).toBeVisible()
    expect(screen.getByTestId('bar-d1').style.height).toBe('max(100.00%, 2px)')
    expect(screen.getByTestId('bar-d2').style.height).toBe('max(25.00%, 2px)')
    expect(screen.getByTestId('bar-d3').style.height).toBe('0px')
    expectAccessibleMarks(container)
  })

  it('can be named by a heading instead (O-14)', () => {
    renderIn(
      <>
        <h2 id="heading">Day by day</h2>
        <Bars label="ignored" labelledBy="heading" bars={DAYS} />
      </>,
    )
    const group = screen.getByRole('group', { name: 'Day by day' })
    expect(group).not.toHaveAttribute('aria-label')
  })

  it('is one Tab stop, with the arrows, Home and End moving between bars', () => {
    renderIn(<Bars label="Days" bars={DAYS} />)
    const marks = DAYS.map((bar) =>
      screen.getByRole('img', { name: bar.label }),
    )
    expect(marks.map((mark) => mark.tabIndex)).toEqual([0, -1, -1])
    marks[0]?.focus()
    fireEvent.keyDown(marks[0]!, { key: 'ArrowRight' })
    expect(marks[1]).toHaveFocus()
    expect(marks.map((mark) => mark.tabIndex)).toEqual([-1, 0, -1])
    fireEvent.keyDown(marks[1]!, { key: 'End' })
    expect(marks[2]).toHaveFocus()
    fireEvent.keyDown(marks[2]!, { key: 'ArrowRight' })
    expect(marks[2]).toHaveFocus()
    fireEvent.keyDown(marks[2]!, { key: 'ArrowLeft' })
    expect(marks[1]).toHaveFocus()
    fireEvent.keyDown(marks[1]!, { key: 'Home' })
    expect(marks[0]).toHaveFocus()
  })

  it('starts the Tab stop on the current bar', () => {
    renderIn(<Bars emphasis label="Months" bars={MONTHS} />)
    expect(
      screen.getByRole('img', { name: 'October 2026, this month: 2,00 €' }),
    ).toHaveAttribute('tabindex', '0')
    expect(
      screen.getByRole('link', { name: 'August 2026: 0,50 €' }),
    ).toHaveAttribute('tabindex', '-1')
  })

  it('shows the focused bar’s value, and hides it on blur', () => {
    renderIn(<Bars label="Days" bars={DAYS} />)
    const first = screen.getByRole('img', { name: '1 Oct: 40,00 €' })
    fireEvent.focus(first)
    expect(tip()).toHaveTextContent('1 Oct: 40,00 €')
    expect(first).toHaveAttribute('data-tip')
    fireEvent.blur(first)
    expect(tip()).toBeNull()
  })

  it('shows a bar’s value on hover, for a link and a plain bar alike', () => {
    renderIn(<Bars emphasis label="Months" bars={MONTHS} />)
    const link = screen.getByRole('link', { name: 'September 2026: 1,00 €' })
    fireEvent.pointerEnter(link, { pointerType: 'mouse' })
    expect(tip()).toHaveTextContent('September 2026: 1,00 €')
    fireEvent.pointerLeave(link, { pointerType: 'mouse' })
    const plain = screen.getByRole('img', {
      name: 'October 2026, this month: 2,00 €',
    })
    fireEvent.pointerEnter(plain, { pointerType: 'mouse' })
    expect(tip()).toHaveTextContent('October 2026, this month: 2,00 €')
    expect(plain).toHaveAttribute('data-tip')
    fireEvent.pointerLeave(plain, { pointerType: 'mouse' })
    expect(tip()).toBeNull()
  })

  it('shows a plain bar’s value on a tap, hidden by Escape', () => {
    renderIn(<Bars label="Days" bars={DAYS} />)
    const second = screen.getByRole('img', { name: '2 Oct: 10,00 €' })
    fireEvent.click(second)
    expect(tip()).toHaveTextContent('2 Oct: 10,00 €')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(tip()).toBeNull()
    // A second tap on the same bar hides it too.
    fireEvent.click(second)
    fireEvent.click(second)
    expect(tip()).toBeNull()
  })

  it('links only the bars with somewhere to go, and mutes all but the current one', () => {
    const { container } = renderIn(
      <Bars emphasis label="The last six months" bars={MONTHS} />,
    )
    expect(
      screen.getByRole('link', { name: 'September 2026: 1,00 €' }),
    ).toHaveAttribute('href', '/?month=2026-09')
    const current = screen.getByRole('img', {
      name: 'October 2026, this month: 2,00 €',
    })
    expect(current).toHaveAttribute('aria-current', 'date')
    expect(current).not.toHaveAttribute('href')
    expect(screen.getAllByRole('link')).toHaveLength(2)
    expect(screen.getByTestId('bar-2026-09')).toHaveAttribute('data-muted')
    expect(screen.getByTestId('bar-2026-10')).not.toHaveAttribute('data-muted')
    expectAccessibleMarks(container)
  })
})

describe('ShareBar', () => {
  it('gives each share its own coloured segment, in proportion', () => {
    const { container } = render(
      <ShareBar
        label="Ana 30,00 €, Marta 10,00 €"
        segments={[
          { id: 'ana', value: 3000, style: personColorStyle(0), label: 'Ana' },
          { id: 'marta', value: 1000, style: personColorStyle(1), label: 'M' },
          { id: 'joao', value: 0, style: personColorStyle(2), label: 'J' },
        ]}
      />,
    )
    expect(
      screen.getByRole('img', { name: 'Ana 30,00 €, Marta 10,00 €' }),
    ).toBeInTheDocument()
    const ana = screen.getByTestId('segment-ana')
    expect(ana.style.flexGrow).toBe('3000')
    expect(ana.style.getPropertyValue('--person-color')).toBe('var(--person-1)')
    expect(screen.getByTestId('segment-marta').style.flexGrow).toBe('1000')
    expect(screen.queryByTestId('segment-joao')).not.toBeInTheDocument()
    expectAccessibleMarks(container)
  })

  it('shows a share’s value on hover and on a tap, outside the image', () => {
    render(
      <ShareBar
        label="Ana 30,00 €, Marta 10,00 €"
        segments={[
          {
            id: 'ana',
            value: 3000,
            style: personColorStyle(0),
            label: 'Ana: 30,00 €',
          },
          {
            id: 'marta',
            value: 1000,
            style: personColorStyle(1),
            label: 'Marta: 10,00 €',
          },
        ]}
      />,
    )
    fireEvent.pointerEnter(screen.getByTestId('segment-marta'), {
      pointerType: 'mouse',
    })
    expect(tip()).toHaveTextContent('Marta: 10,00 €')
    // Three quarters along, then half of Marta's quarter: 87,5 %.
    expect(tip()?.style.getPropertyValue('--tip-x')).toBe('87.50%')
    expect(tip()?.closest('[role="img"]')).toBeNull()
    fireEvent.pointerLeave(screen.getByTestId('segment-marta'))
    fireEvent.click(screen.getByTestId('segment-ana'))
    expect(tip()).toHaveTextContent('Ana: 30,00 €')
  })

  it('ignores a touch’s hover, so its tap decides', () => {
    render(
      <ShareBar
        label="Ana"
        segments={[
          { id: 'ana', value: 1, style: personColorStyle(0), label: 'Ana' },
        ]}
      />,
    )
    fireEvent.pointerEnter(screen.getByTestId('segment-ana'), {
      pointerType: 'touch',
    })
    expect(tip()).toBeNull()
  })
})
