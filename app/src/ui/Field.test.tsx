import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SelectField, TextField } from './Field.tsx'

describe('TextField', () => {
  it('is labelled by the label above it', () => {
    render(<TextField label="Name" />)
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveAttribute(
      'type',
      'text',
    )
  })

  it('is described by its hint', () => {
    render(<TextField label="Name" hint="As it appears on the receipt" />)
    expect(screen.getByRole('textbox')).toHaveAccessibleDescription(
      'As it appears on the receipt',
    )
    expect(screen.getByRole('textbox')).not.toHaveAttribute('aria-invalid')
  })

  it('links an error, with its icon and words, and marks itself invalid', () => {
    render(<TextField label="Price" hint="In euros" error="Enter an amount" />)
    const input = screen.getByRole('textbox', { name: 'Price' })
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription('In euros Enter an amount')
    const error = screen.getByText('Enter an amount').parentElement
    expect(error?.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it('keeps a given id, and passes input attributes on', () => {
    const onChange = vi.fn()
    render(
      <TextField
        label="Price"
        id="item-price"
        inputMode="decimal"
        error="Too much"
        onChange={onChange}
      />,
    )
    const input = screen.getByRole('textbox')
    expect(input).toHaveAttribute('id', 'item-price')
    expect(input).toHaveAttribute('inputmode', 'decimal')
    expect(input).toHaveAttribute('aria-describedby', 'item-price-error')
    fireEvent.change(input, { target: { value: '2' } })
    expect(onChange).toHaveBeenCalled()
  })

  it('can be disabled', () => {
    render(<TextField label="Name" disabled />)
    expect(screen.getByRole('textbox')).toBeDisabled()
  })
})

describe('SelectField', () => {
  it('is labelled, described and holds its options', () => {
    const onChange = vi.fn()
    render(
      <SelectField
        label="Language"
        hint="System follows your browser"
        value="en"
        onChange={onChange}
      >
        <option value="en">English</option>
        <option value="pt">Português</option>
      </SelectField>,
    )
    const select = screen.getByRole('combobox', { name: 'Language' })
    expect(select).toHaveAccessibleDescription('System follows your browser')
    expect(select).toHaveValue('en')
    fireEvent.change(select, { target: { value: 'pt' } })
    expect(onChange).toHaveBeenCalled()
  })

  it('shows an error', () => {
    render(
      <SelectField label="Currency" error="Choose one">
        <option>EUR</option>
      </SelectField>,
    )
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('combobox')).toHaveAccessibleDescription(
      'Choose one',
    )
  })
})
