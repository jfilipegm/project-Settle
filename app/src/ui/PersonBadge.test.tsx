import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PersonBadge } from './PersonBadge.tsx'
import { personInitial, personSlot } from './personColor.ts'

describe('personInitial', () => {
  it.each([
    ['Ana', 0, 'A'],
    ['  bruno', 1, 'B'],
    ['Élia', 2, 'É'],
    ['', 1, '2'],
    ['   ', 6, '7'],
  ])('%j at %i shows %j', (name, index, initial) => {
    expect(personInitial(name, index)).toBe(initial)
  })
})

describe('personSlot', () => {
  it('follows the position and repeats from the seventh person', () => {
    expect([0, 1, 5, 6, 7, 12].map(personSlot)).toEqual([1, 2, 6, 1, 2, 1])
  })
})

describe('PersonBadge', () => {
  it('shows the colour, the initial and the name', () => {
    const { container } = render(
      <PersonBadge person={{ id: 'a', name: 'Ana' }} index={0} />,
    )
    const badge = container.firstElementChild as HTMLElement
    expect(badge).toHaveTextContent('AAna')
    expect(badge).toHaveAttribute('data-person-slot', '1')
    // Through the CSSOM, never a style="" string the CSP would refuse.
    expect(badge.style.getPropertyValue('--person-color')).toBe(
      'var(--person-1)',
    )
    expect(badge.style.getPropertyValue('--person-on')).toBe(
      'var(--person-on-1)',
    )
  })

  it('names an unnamed person by number, with the number as the initial', () => {
    const { container } = render(
      <PersonBadge person={{ id: 'b', name: '' }} index={1} />,
    )
    expect(container).toHaveTextContent('2Person 2')
    expect(
      (container.firstElementChild as HTMLElement).style.getPropertyValue(
        '--person-color',
      ),
    ).toBe('var(--person-2)')
  })

  it('keeps the name for screen readers when it isn’t shown', () => {
    render(
      <PersonBadge
        person={{ id: 'c', name: 'Carla' }}
        index={7}
        showName={false}
      />,
    )
    const name = screen.getByText('Carla')
    expect(name.className).toMatch(/srOnly/)
    expect(screen.getByText('C')).toHaveAttribute('aria-hidden', 'true')
  })
})
