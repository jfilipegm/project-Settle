import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StatusChip } from './StatusChip.tsx'

describe('StatusChip', () => {
  it.each(['success', 'warning', 'error'] as const)(
    'says its %s state in words, with a decorative icon',
    (tone) => {
      const { container } = render(
        <StatusChip tone={tone}>Matches the receipt total</StatusChip>,
      )
      const chip = container.firstElementChild
      expect(chip).toHaveAttribute('data-tone', tone)
      expect(chip).toHaveTextContent('Matches the receipt total')
      expect(chip?.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
      expect(chip?.className).toMatch(tone)
    },
  )

  it('uses a different icon for each state', () => {
    const icons = (['success', 'warning', 'error'] as const).map((tone) => {
      const { container, unmount } = render(
        <StatusChip tone={tone}>x</StatusChip>,
      )
      const svg = container.querySelector('svg')?.getAttribute('class') ?? ''
      unmount()
      return svg
    })
    expect(new Set(icons).size).toBe(3)
  })
})
