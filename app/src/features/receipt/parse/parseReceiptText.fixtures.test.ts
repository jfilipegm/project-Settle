import { describe, expect, it } from 'vitest'
import { loadTextFixtures, toExpectedShape } from '../fixtures/textFixtures.ts'
import { parseReceiptText } from './parseReceiptText.ts'

const fixtures = loadTextFixtures()

describe('parseReceiptText on the text fixtures', () => {
  it('has about 25 fixtures', () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(25)
  })

  it.each(fixtures.map((fixture) => [fixture.name, fixture] as const))(
    '%s',
    (_, fixture) => {
      expect(toExpectedShape(parseReceiptText(fixture.lines))).toEqual(
        fixture.expected,
      )
    },
  )
})
