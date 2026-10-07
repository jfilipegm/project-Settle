import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Vitest globals are off, so Testing Library can't register its automatic
// cleanup. Unmount rendered trees between tests here instead.
afterEach(() => {
  cleanup()
  // After the unmount, not before: a bill's last draft save is a passive
  // effect that can flush after a test file's own clear, and the next test
  // would start with that bill (and, scanning, a replace prompt jsdom
  // answers "no"). Unmounting flushes it, so clearing now leaves nothing.
  if (typeof localStorage !== 'undefined') localStorage.clear()
})

// jsdom has no matchMedia, and `system` theme mode depends on media
// queries. The stub matches nothing, like a light-scheme browser; a test
// that needs a match replaces it with vi.spyOn(window, 'matchMedia').
// Suites that run in the node environment have no window at all.
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string): MediaQueryList => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }),
  })
}
