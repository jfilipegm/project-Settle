import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { Bars, Donut, ShareBar } from './Charts.tsx'
import { personColorStyle } from './personColor.ts'

const CIRCUMFERENCE = 2 * Math.PI * 52

function dash(el: Element): number {
  return Number(el.getAttribute('stroke-dasharray')?.split(' ')[0])
}

describe('Donut', () => {
  it('is one image named by its text alternative, a slice per part', () => {
    render(
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
    expect(rent.querySelector('title')?.textContent).toBe('Rent')
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
  it('scales to the largest bar, as one image when nothing links', () => {
    render(
      <Bars
        label="Spending each day"
        scale="Up to 40,00 €"
        bars={[
          { id: 'd1', value: 4000, label: '1 Oct: 40,00 €', tick: '1' },
          { id: 'd2', value: 1000, label: '2 Oct: 10,00 €' },
          { id: 'd3', value: 0, label: '3 Oct: 0,00 €' },
        ]}
      />,
    )
    expect(
      screen.getByRole('img', { name: 'Spending each day' }),
    ).toHaveTextContent('Up to 40,00 €')
    expect(screen.getByTestId('bar-d1').style.height).toBe('max(100.00%, 2px)')
    expect(screen.getByTestId('bar-d2').style.height).toBe('max(25.00%, 2px)')
    expect(screen.getByTestId('bar-d3').style.height).toBe('0px')
    expect(screen.getByTitle('2 Oct: 10,00 €')).toBeInTheDocument()
  })

  it('names each linked bar, and with emphasis mutes all but the current one', () => {
    render(
      <MemoryRouter>
        <Bars
          emphasis
          label="The last six months"
          bars={[
            {
              id: '2026-09',
              value: 100,
              label: 'September 2026: 1,00 €',
              to: '?month=2026-09',
            },
            {
              id: '2026-10',
              value: 200,
              label: 'October 2026: 2,00 €',
              to: '?month=2026-10',
              current: true,
            },
          ]}
        />
      </MemoryRouter>,
    )
    expect(
      screen.getByRole('group', { name: 'The last six months' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'September 2026: 1,00 €' }),
    ).toHaveAttribute('href', '/?month=2026-09')
    expect(
      screen.getByRole('link', { name: 'October 2026: 2,00 €' }),
    ).toHaveAttribute('aria-current', 'date')
    expect(screen.getByTestId('bar-2026-09')).toHaveAttribute('data-muted')
    expect(screen.getByTestId('bar-2026-10')).not.toHaveAttribute('data-muted')
  })
})

describe('ShareBar', () => {
  it('gives each share its own coloured segment, in proportion', () => {
    render(
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
  })
})
