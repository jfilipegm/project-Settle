// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { readClock, readVersion } from './records.ts'
import {
  ClockOverflowError,
  MAX_COUNT,
  bump,
  compare,
  dominates,
  join,
} from './versions.ts'

describe('clocks (M6 plan, E4, E6)', () => {
  it('bumps this device only, starting from the empty clock', () => {
    expect(bump({}, 'a')).toEqual({ a: 1 })
    expect(bump({ a: 2, b: 1 }, 'b')).toEqual({ a: 2, b: 2 })
  })

  it('refuses a bump past 2^31 as damaged data', () => {
    expect(bump({ a: MAX_COUNT - 1 }, 'a')).toEqual({ a: MAX_COUNT })
    expect(() => bump({ a: MAX_COUNT }, 'a')).toThrow(ClockOverflowError)
  })

  it('joins by the higher count for each device', () => {
    expect(join({ a: 2, b: 1 }, { b: 3, c: 1 })).toEqual({ a: 2, b: 3, c: 1 })
    expect(join({}, {})).toEqual({})
  })

  it('compares: equal, newer, older, concurrent', () => {
    expect(compare({}, {})).toBe('equal')
    expect(compare({ a: 1 }, { a: 1 })).toBe('equal')
    expect(compare({ a: 2 }, { a: 1 })).toBe('newer')
    expect(compare({ a: 1, b: 1 }, { a: 1 })).toBe('newer')
    expect(compare({ a: 1 }, {})).toBe('newer')
    expect(compare({ a: 1 }, { a: 1, b: 1 })).toBe('older')
    expect(compare({ a: 2 }, { a: 1, b: 1 })).toBe('concurrent')
    expect(dominates({ a: 1 }, { a: 1 })).toBe(true)
    expect(dominates({ a: 2 }, { a: 1, b: 1 })).toBe(false)
  })

  it('keeps device keys in a fixed order', () => {
    expect(Object.keys(join({ b: 1 }, { a: 1 }))).toEqual(['a', 'b'])
    expect(Object.keys(bump({ c: 1 }, 'a'))).toEqual(['a', 'c'])
  })
})

describe('reading stored versions', () => {
  it('reads a clock of whole counts from 1 to 2^31', () => {
    expect(readClock({ a: 1, b: MAX_COUNT })).toEqual({ a: 1, b: MAX_COUNT })
    expect(readClock({})).toEqual({})
    for (const bad of [
      { a: 0 },
      { a: 1.5 },
      { a: -1 },
      { a: MAX_COUNT + 1 },
      { a: '1' },
      [],
      null,
    ]) {
      expect(readClock(bad)).toBeNull()
    }
  })

  it('reads a version entry and a deletion, from known fields only', () => {
    const entry = {
      id: 'e1',
      kind: 'expense',
      householdId: 'h1',
      clock: { a: 1 },
      extra: 'dropped',
    }
    expect(readVersion(entry)).toEqual({
      id: 'e1',
      kind: 'expense',
      householdId: 'h1',
      clock: { a: 1 },
    })
    expect(readVersion({ ...entry, deletedAt: 'x' })).toMatchObject({
      deletedAt: 'x',
    })
    expect(readVersion({ ...entry, kind: 'payment' })).toBeNull()
    expect(readVersion({ ...entry, clock: { a: 0 } })).toBeNull()
    expect(readVersion({ ...entry, householdId: 1 })).toBeNull()
    // Households are archived, never deleted (E4).
    expect(
      readVersion({ ...entry, kind: 'household', deletedAt: 'x' }),
    ).toBeNull()
  })
})
