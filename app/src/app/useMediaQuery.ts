import { useSyncExternalStore } from 'react'

function hasMatchMedia(): boolean {
  return (
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
  )
}

/**
 * Whether a media query matches, kept live (M3 plan, S9). Without
 * `window.matchMedia` (jsdom) it answers false, so tests see the narrow
 * layout with no polyfill.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (!hasMatchMedia()) return () => undefined
      const list = window.matchMedia(query)
      list.addEventListener('change', onChange)
      return () => {
        list.removeEventListener('change', onChange)
      }
    },
    () => hasMatchMedia() && window.matchMedia(query).matches,
    () => false,
  )
}
