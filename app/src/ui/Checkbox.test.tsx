import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Checkbox } from './Checkbox.tsx'

describe('Checkbox', () => {
  it('is a native checkbox named by its label', () => {
    const onChange = vi.fn()
    render(<Checkbox label="Ana" checked={false} onChange={onChange} />)
    const box = screen.getByRole('checkbox', { name: 'Ana' })
    fireEvent.click(box)
    expect(onChange).toHaveBeenCalledOnce()
  })
})
