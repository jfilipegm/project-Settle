import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { cents } from '../lib/money.ts'
import { Amount } from './Amount.tsx'
import { MINUS, signedAmount } from './signedAmount.ts'

const PT = { locale: 'pt-PT', currency: 'EUR' } as const
const GB = { locale: 'en-GB', currency: 'GBP' } as const
const plain = (text: string) => text.replace(/[\u00a0\u202f]/g, ' ')

describe('signedAmount', () => {
  it('formats in the region', () => {
    expect(plain(signedAmount(cents(123456), PT))).toBe('1234,56 €')
    expect(signedAmount(cents(123456), GB)).toBe('£1,234.56')
  })

  it('writes a negative amount with the minus sign U+2212', () => {
    expect(plain(signedAmount(cents(-250), PT))).toBe(`${MINUS}2,50 €`)
    expect(signedAmount(cents(-250), GB)).toBe(`${MINUS}£2.50`)
    expect(MINUS).toBe('−')
  })

  it('adds a plus sign only when asked, and never to zero', () => {
    expect(signedAmount(cents(250), GB, 'always')).toBe('+£2.50')
    expect(signedAmount(cents(250), GB)).toBe('£2.50')
    expect(signedAmount(cents(0), GB, 'always')).toBe('£0.00')
  })
})

describe('Amount', () => {
  it('is a data element in the figures face, valued in cents', () => {
    render(<Amount value={cents(-1999)} region={GB} />)
    const amount = screen.getByText(`${MINUS}£19.99`)
    expect(amount.tagName).toBe('DATA')
    expect(amount).toHaveAttribute('value', '-1999')
    expect(amount).toHaveClass('amount')
  })
})
