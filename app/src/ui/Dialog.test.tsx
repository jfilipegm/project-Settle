import { fireEvent, render, screen } from '@testing-library/react'
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
})
