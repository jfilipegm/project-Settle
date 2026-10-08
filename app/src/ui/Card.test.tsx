import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Card } from './Card.tsx'

describe('Card', () => {
  it('is a plain block without a title', () => {
    const { container } = render(<Card>Body</Card>)
    expect(container.firstElementChild?.tagName).toBe('DIV')
    expect(screen.queryByRole('region')).not.toBeInTheDocument()
  })

  it('is a section named by its title', () => {
    render(<Card title="Who owes what">Body</Card>)
    const region = screen.getByRole('region', { name: 'Who owes what' })
    expect(region).toContainElement(
      screen.getByRole('heading', { level: 2, name: 'Who owes what' }),
    )
  })

  it('passes attributes on', () => {
    render(
      <Card title="Receipt check" data-receipt-check="">
        Body
      </Card>,
    )
    expect(screen.getByRole('region')).toHaveAttribute('data-receipt-check')
  })
})
