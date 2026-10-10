import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { Tabs } from './Tabs.tsx'

describe('Tabs', () => {
  it('names the group and marks only the current tab', () => {
    render(
      <MemoryRouter>
        <Tabs
          label="Household"
          current="b"
          tabs={[
            { id: 'a', label: 'Overview', to: '/a' },
            { id: 'b', label: 'Expenses', to: '/b' },
          ]}
        />
      </MemoryRouter>,
    )
    const nav = screen.getByRole('navigation', { name: 'Household' })
    expect(within(nav).getByRole('link', { name: 'Expenses' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(
      within(nav).getByRole('link', { name: 'Overview' }),
    ).not.toHaveAttribute('aria-current')
  })
})
