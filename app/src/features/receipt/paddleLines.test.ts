import { describe, expect, it } from 'vitest'
import { assembleLines, repairNumbers, type PaddleBox } from './paddleLines.ts'

/** An invented box: text, left, top, width, and optional height/confidence. */
const box = (
  text: string,
  x: number,
  y: number,
  width = 40,
  height = 20,
  confidence = 0.95,
): PaddleBox => ({ text, confidence, box: { x, y, width, height } })

describe('assembleLines (P7)', () => {
  it('reads lines top to bottom and boxes left to right', () => {
    const lines = assembleLines([
      box('2,50', 300, 42),
      box('Bica', 10, 40),
      box('Total', 10, 100),
      box('Tosta', 10, 70),
      box('3,20', 300, 101),
      box('4,00', 300, 69),
    ])
    expect(lines.map((line) => line.text)).toEqual([
      'Bica 2,50',
      'Tosta 4,00',
      'Total 3,20',
    ])
  })

  it('joins boxes by vertical overlap, even on a slightly sloped line', () => {
    const lines = assembleLines([
      box('Agua', 10, 40, 40, 20),
      box('mineral', 60, 44, 60, 20),
      box('1,00', 300, 49, 40, 20),
      box('Pão', 10, 64, 40, 20),
    ])
    expect(lines.map((line) => line.text)).toEqual(['Agua mineral 1,00', 'Pão'])
  })

  it('keeps boxes that overlap less than half apart', () => {
    const lines = assembleLines([box('Bica', 10, 40), box('0,80', 300, 52)])
    expect(lines.map((line) => line.text)).toEqual(['Bica', '0,80'])
  })

  it('gives a line its weakest box’s confidence, 0–100', () => {
    const [line] = assembleLines([
      box('Bica', 10, 40, 40, 20, 0.98),
      box('0,80', 300, 40, 40, 20, 0.614),
    ])
    expect(line?.confidence).toBe(61)
  })

  it('repairs the spaces inside a number', () => {
    expect(repairNumbers('Pão 1 ,39')).toBe('Pão 1,39')
    expect(repairNumbers('2 X 4. 04')).toBe('2 X 4.04')
    expect(repairNumbers('Mesa 4 , Bica')).toBe('Mesa 4 , Bica')
    const [line] = assembleLines([box('Pão', 10, 40), box('1 ,39', 300, 40)])
    expect(line?.text).toBe('Pão 1,39')
  })

  it('marks a wide gap to a right column only when asked to', () => {
    const boxes = [
      box('Bica', 10, 40, 40, 20),
      box('cheia', 55, 40, 40, 20),
      box('0,80', 300, 40, 40, 20),
    ]
    expect(assembleLines(boxes)[0]?.text).toBe('Bica cheia 0,80')
    expect(assembleLines(boxes, { gapMarker: ' | ' })[0]?.text).toBe(
      'Bica cheia | 0,80',
    )
    // A gap under gapFactor × the line's height is an ordinary space.
    expect(
      assembleLines(boxes, { gapMarker: ' | ', gapFactor: 20 })[0]?.text,
    ).toBe('Bica cheia 0,80')
  })

  it('drops empty boxes and lines', () => {
    expect(
      assembleLines([box('  ', 10, 40), box('Bica', 10, 70), box('', 60, 70)]),
    ).toEqual([{ text: 'Bica', confidence: 95 }])
    expect(assembleLines([])).toEqual([])
  })
})
