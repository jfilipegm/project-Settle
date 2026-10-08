import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { Steps, type Step } from './Steps.tsx'

const STEPS: Step<'receipt' | 'items' | 'split'>[] = [
  { id: 'receipt', label: 'Receipt', to: '?step=receipt' },
  { id: 'items', label: 'Who had what', to: '?step=items' },
  { id: 'split', label: 'The split', to: '?step=split' },
]

function renderSteps(onSelect = vi.fn()) {
  render(
    <MemoryRouter initialEntries={['/split?step=items']}>
      <Steps label="Steps" steps={STEPS} current="items" onSelect={onSelect} />
    </MemoryRouter>,
  )
  return onSelect
}

describe('Steps', () => {
  it('names each step, as links in order, in a named navigation', () => {
    renderSteps()
    const nav = screen.getByRole('navigation', { name: 'Steps' })
    expect(
      within(nav)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Receipt', 'Who had what', 'The split'])
    expect(nav).not.toHaveTextContent(/of 3/)
  })

  it('marks the current step, and only it', () => {
    renderSteps()
    expect(screen.getByRole('link', { name: 'Who had what' })).toHaveAttribute(
      'aria-current',
      'step',
    )
    expect(screen.getByRole('link', { name: 'Receipt' })).not.toHaveAttribute(
      'aria-current',
    )
  })

  it('links to each step and reports the one chosen', () => {
    const onSelect = renderSteps()
    const split = screen.getByRole('link', { name: 'The split' })
    expect(split).toHaveAttribute('href', '/split?step=split')
    split.focus()
    expect(split).toHaveFocus()
    fireEvent.click(split)
    expect(onSelect).toHaveBeenCalledWith('split')
  })
})
