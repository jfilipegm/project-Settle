import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { createBill } from '../features/split/billReducer.ts'
import { saveDraft } from '../features/split/draft.ts'
import { cents } from '../lib/money.ts'
import { HomePage } from './HomePage.tsx'

function renderHome() {
  render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>,
  )
  return screen.getByRole('link', { name: /bill/ })
}

describe('Home (M3 plan, S8, L4-I1)', () => {
  it('says what Settle does, with the privacy line', () => {
    renderHome()
    expect(
      screen.getByRole('heading', { level: 1, name: 'Settle' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Split bills. Settle up. Stay private.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('No account. Your bills stay on this device.'),
    ).toBeInTheDocument()
  })

  it('offers "Split a bill" with no saved draft', () => {
    expect(renderHome()).toHaveTextContent('Split a bill')
  })

  it('offers "Split a bill" for a saved fresh bill, its one empty item included', () => {
    saveDraft(createBill(['p1', 'p2', 'i1']))
    const link = renderHome()
    expect(link).toHaveTextContent('Split a bill')
    expect(link).toHaveAttribute('href', '/split')
  })

  it('offers "Continue your bill" for a saved draft with content', () => {
    const bill = createBill(['p1', 'p2', 'i1'])
    saveDraft({
      ...bill,
      items: bill.items.map((item) => ({ ...item, unitPrice: cents(250) })),
    })
    const link = renderHome()
    expect(link).toHaveTextContent('Continue your bill')
    expect(link).toHaveAttribute('href', '/split')
  })
})
