import { fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { Button } from './Button.tsx'
import { Dialog } from './Dialog.tsx'

function Harness() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)}>Open it</Button>
      <Dialog open={open} title="Rename Ana" onClose={() => setOpen(false)}>
        <input aria-label="Name" />
        <Button onClick={() => setOpen(false)}>Done</Button>
      </Dialog>
    </>
  )
}

describe('Dialog', () => {
  it('opens named by its title, focuses its first field, and returns focus on close', () => {
    render(<Harness />)
    const opener = screen.getByRole('button', { name: 'Open it' })
    opener.focus()
    fireEvent.click(opener)

    const dialog = screen.getByRole('dialog', { name: 'Rename Ana' })
    expect(dialog).toHaveAttribute('open')
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveFocus()

    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
  })

  it('closes on Escape', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Open it' }))
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('closes on a click outside it, on the backdrop', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Open it' }))
    const dialog = screen.getByRole('dialog')
    // The backdrop's clicks land on the <dialog> element itself.
    fireEvent.pointerDown(dialog)
    fireEvent.click(dialog)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('stays open on a click inside it', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Open it' }))
    const field = screen.getByRole('textbox', { name: 'Name' })
    fireEvent.pointerDown(field)
    fireEvent.click(field)
    fireEvent.pointerDown(screen.getByRole('heading', { name: 'Rename Ana' }))
    fireEvent.click(screen.getByRole('heading', { name: 'Rename Ana' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('stays open when a press starts inside and ends on the backdrop', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Open it' }))
    const dialog = screen.getByRole('dialog')
    // Selecting text in a field and letting go outside the card.
    fireEvent.pointerDown(screen.getByRole('textbox', { name: 'Name' }))
    fireEvent.click(dialog)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})

function Nested() {
  const [outer, setOuter] = useState(true)
  const [inner, setInner] = useState(false)
  return (
    <Dialog
      open={outer}
      title="Groceries"
      closeLabel="Close"
      onClose={() => setOuter(false)}
    >
      <Button onClick={() => setInner(true)}>Delete</Button>
      <Dialog
        open={inner}
        title="Delete Groceries?"
        onClose={() => setInner(false)}
      >
        <Button onClick={() => setInner(false)}>Cancel</Button>
      </Dialog>
    </Dialog>
  )
}

describe('Dialog with a close button (M-5)', () => {
  it('puts a named close button beside the title, focused first', () => {
    render(<Nested />)
    const close = screen.getByRole('button', { name: 'Close' })
    expect(close).toHaveFocus()
    fireEvent.click(close)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('closes only the inner dialog on Escape', () => {
    render(<Nested />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    const inner = screen.getByRole('dialog', { name: 'Delete Groceries?' })
    fireEvent.keyDown(within(inner).getByRole('button', { name: 'Cancel' }), {
      key: 'Escape',
    })
    expect(
      screen.queryByRole('dialog', { name: 'Delete Groceries?' }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('dialog', { name: 'Groceries' }),
    ).toBeInTheDocument()
  })

  it('keeps the outer dialog open on a click on the inner one’s backdrop', () => {
    render(<Nested />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    const inner = screen.getByRole('dialog', { name: 'Delete Groceries?' })
    fireEvent.pointerDown(inner)
    fireEvent.click(inner)
    expect(
      screen.queryByRole('dialog', { name: 'Delete Groceries?' }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('dialog', { name: 'Groceries' }),
    ).toBeInTheDocument()
  })
})
