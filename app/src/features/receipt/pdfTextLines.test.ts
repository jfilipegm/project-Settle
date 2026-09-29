import { describe, expect, it } from 'vitest'
import {
  fragmentsToLines,
  hasTextLayer,
  toFragments,
  type TextFragment,
} from './pdfTextLines.ts'

const at = (str: string, x: number, y: number, height = 10): TextFragment => ({
  str,
  x,
  y,
  height,
})

describe('fragmentsToLines (D6, R2-O-1)', () => {
  it('orders fragments given out of order into lines, top to bottom', () => {
    const lines = fragmentsToLines([
      at('9,50', 200, 700),
      at('TOTAL', 20, 600),
      at('Bitoque', 20, 700),
      at('Restaurante', 20, 800),
      at('23,40', 200, 600),
      at('Imperial', 20, 650),
      at('13,90', 200, 650),
    ])
    expect(lines.map((line) => line.text)).toEqual([
      'Restaurante',
      'Bitoque 9,50',
      'Imperial 13,90',
      'TOTAL 23,40',
    ])
    expect(lines.every((line) => line.confidence === 100)).toBe(true)
  })

  it('joins fragments on slightly different baselines', () => {
    const lines = fragmentsToLines([
      at('Galão', 20, 500),
      at('1,40', 200, 503.5),
      at('€', 240, 498),
    ])
    expect(lines.map((line) => line.text)).toEqual(['Galão 1,40 €'])
  })

  it('keeps lines apart when the baselines are a line apart', () => {
    const lines = fragmentsToLines([at('A', 0, 500), at('B', 0, 494)])
    expect(lines).toHaveLength(2)
  })

  it('joins with single spaces and drops empty fragments', () => {
    const lines = fragmentsToLines([
      at(' Pastel ', 20, 100),
      at('   ', 60, 100),
      at('de  nata', 80, 100),
    ])
    expect(lines.map((line) => line.text)).toEqual(['Pastel de nata'])
  })
})

describe('toFragments', () => {
  it('reads pdf.js text items and skips marked-content entries', () => {
    expect(
      toFragments([
        { str: 'TOTAL', transform: [10, 0, 0, 10, 72, 700], height: 10 },
        { type: 'beginMarkedContent' },
        { str: '23,40', transform: [12, 0, 0, 12, 300, 700], height: 0 },
      ]),
    ).toEqual([
      { str: 'TOTAL', x: 72, y: 700, height: 10 },
      { str: '23,40', x: 300, y: 700, height: 12 },
    ])
  })
})

describe('hasTextLayer (D6)', () => {
  it('needs at least 20 non-space characters', () => {
    expect(
      hasTextLayer([{ text: '1234567890 123456789', confidence: 100 }]),
    ).toBe(false)
    expect(
      hasTextLayer([
        { text: '1234567890', confidence: 100 },
        { text: '1234567890', confidence: 100 },
      ]),
    ).toBe(true)
    expect(hasTextLayer([])).toBe(false)
  })
})
