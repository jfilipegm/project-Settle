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
  mergeBumps,
  resolveClock,
  type MergeOutcome,
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

describe('the clock each merge outcome writes (E4, E6)', () => {
  const mine = { me: 2, them: 1 }
  const theirs = { me: 1, them: 3 }

  it('bumps only "Keep mine", "kept for references" and equal-clock choices', () => {
    const outcomes: MergeOutcome[] = [
      'nothingToDecide',
      'new',
      'changedThere',
      'deletedThere',
      'keepMine',
      'useTheirs',
      'keptForReferences',
    ]
    expect(outcomes.filter((o) => mergeBumps(o, false))).toEqual([
      'keepMine',
      'keptForReferences',
    ])
    expect(outcomes.filter((o) => mergeBumps(o, true))).toEqual([
      'keepMine',
      'useTheirs',
      'keptForReferences',
    ])
  })

  it('writes a clock newer than or equal to both, strictly newer than the side not taken', () => {
    const keep = resolveClock('keepMine', mine, theirs, 'me')
    expect(keep).toEqual({ me: 3, them: 3 })
    expect(compare(keep, mine)).toBe('newer')
    expect(compare(keep, theirs)).toBe('newer')
    const take = resolveClock('useTheirs', mine, theirs, 'me')
    expect(take).toEqual({ me: 2, them: 3 })
    expect(compare(take, mine)).toBe('newer')
    expect(dominates(take, theirs)).toBe(true)
    // Gone back in time, theirs newer: exactly theirs.
    expect(resolveClock('useTheirs', { a: 6 }, { a: 7 }, 'b')).toEqual({ a: 7 })
    // Equal clocks: either choice bumps, under the id given.
    expect(resolveClock('useTheirs', { a: 5 }, { a: 5 }, 'new')).toEqual({
      a: 5,
      new: 1,
    })
    expect(resolveClock('keepMine', { a: 5 }, { a: 5 }, 'new')).toEqual({
      a: 5,
      new: 1,
    })
  })
})
