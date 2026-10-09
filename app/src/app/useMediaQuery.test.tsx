import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useMediaQuery } from './useMediaQuery.ts'

afterEach(() => {
  vi.restoreAllMocks()
})

/** A matchMedia whose answer the test flips, counting its listeners. */
function fakeMatchMedia(initial: boolean) {
  let matches = initial
  const listeners = new Set<() => void>()
  const added = vi.fn()
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        get matches() {
          return matches
        },
        media: query,
        addEventListener: (_type: string, listener: () => void) => {
          added()
          listeners.add(listener)
        },
        removeEventListener: (_type: string, listener: () => void) => {
          listeners.delete(listener)
        },
      }) as unknown as MediaQueryList,
  )
  const flip = (next: boolean) => {
    matches = next
    for (const listener of listeners) listener()
  }
  return { added, flip }
}

describe('useMediaQuery', () => {
  it('answers false without matchMedia, as under jsdom', () => {
    const { result } = renderHook(() => useMediaQuery('(min-width: 1024px)'))
    expect(result.current).toBe(false)
  })

  it('follows the query as it changes', () => {
    const { flip } = fakeMatchMedia(false)
    const { result } = renderHook(() => useMediaQuery('(min-width: 1024px)'))
    expect(result.current).toBe(false)
    act(() => {
      flip(true)
    })
    expect(result.current).toBe(true)
  })

  it('subscribes once, not on every render (R1-O1)', () => {
    const { added } = fakeMatchMedia(false)
    const { rerender } = renderHook(() => useMediaQuery('(min-width: 1024px)'))
    rerender()
    rerender()
    expect(added).toHaveBeenCalledTimes(1)
  })
})
