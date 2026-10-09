import { IconPlus, IconTrash } from '@tabler/icons-react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Button, IconButton } from './Button.tsx'

describe('Button', () => {
  it('is a plain button by default, never a submit', () => {
    render(<Button>New bill</Button>)
    const button = screen.getByRole('button', { name: 'New bill' })
    expect(button).toHaveAttribute('type', 'button')
    expect(button.className).toMatch(/secondary/)
    expect(button.className).toMatch(/size44/)
  })

  it.each(['primary', 'secondary', 'quiet'] as const)(
    'has the %s variant',
    (variant) => {
      render(<Button variant={variant}>Go</Button>)
      expect(screen.getByRole('button').className).toMatch(new RegExp(variant))
    },
  )

  it.each([40, 44, 48, 52] as const)('has the %i px size', (size) => {
    render(<Button size={size}>Go</Button>)
    expect(screen.getByRole('button').className).toMatch(`size${size}`)
  })

  it('shows a decorative icon before the words', () => {
    render(<Button icon={IconPlus}>Add item</Button>)
    const button = screen.getByRole('button', { name: 'Add item' })
    expect(button.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it('clicks, by pointer and by keyboard, and not while disabled', () => {
    const onClick = vi.fn()
    const { rerender } = render(<Button onClick={onClick}>Go</Button>)
    const button = screen.getByRole('button')
    button.focus()
    expect(button).toHaveFocus()
    fireEvent.click(button)
    expect(onClick).toHaveBeenCalledTimes(1)

    rerender(
      <Button onClick={onClick} disabled>
        Go
      </Button>,
    )
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByRole('button')).toBeDisabled()
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('submits a form only when asked', () => {
    const onSubmit = vi.fn((event: Event) => event.preventDefault())
    render(
      <form onSubmit={(e) => onSubmit(e.nativeEvent)}>
        <Button type="submit">Save</Button>
      </form>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSubmit).toHaveBeenCalled()
  })
})

describe('IconButton', () => {
  it('is named by its label and shows only the icon', () => {
    render(<IconButton label="Remove Ana" icon={IconTrash} />)
    const button = screen.getByRole('button', { name: 'Remove Ana' })
    expect(button).toHaveTextContent('')
    expect(button.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    expect(button.className).toMatch(/iconOnly/)
  })

  it('can be pressed, like a toggle', () => {
    render(<IconButton label="Ana" icon={IconPlus} aria-pressed="true" />)
    expect(
      screen.getByRole('button', { name: 'Ana', pressed: true }),
    ).toBeInTheDocument()
  })
})
