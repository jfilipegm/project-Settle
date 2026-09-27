import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Vitest globals are off, so Testing Library can't register its automatic
// cleanup. Unmount rendered trees between tests here instead.
afterEach(() => {
  cleanup()
})
