/**
 * The Split page's test harness (M3 plan, CP5, L4-I2): a router around
 * the page, which the `step` parameter needs, and the navigation needed to
 * reach a control: choosing a step and opening an item's editor. The
 * values tests assert never depend on these.
 */
import { fireEvent, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router'

export type StepName = 'Receipt' | 'Who had what' | 'The split'

/** The page inside a memory router, at `/split` with no step by default. */
export function inRouter(ui: ReactNode, path = '/split') {
  return <MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>
}

function stepsNav() {
  return screen.getByRole('navigation', { name: 'Steps' })
}

/** The step shown now. */
export function currentStep(): string | null {
  return (
    within(stepsNav())
      .getAllByRole('link')
      .find((link) => link.getAttribute('aria-current') === 'step')
      ?.textContent ?? null
  )
}

/** Shows a step through the steps indicator, if it isn't shown already. */
export function showStep(name: StepName): void {
  const link = within(stepsNav()).getByRole('link', { name })
  if (link.getAttribute('aria-current') !== 'step') {
    fireEvent.click(link)
  }
}

/** Opens every item's editor on Who had what (S10's Edit). */
export function openEditors(): void {
  showStep('Who had what')
  for (const button of screen.queryAllByRole('button', {
    name: /^Edit /,
    expanded: false,
  })) {
    fireEvent.click(button)
  }
}

/**
 * A wide screen (from 1024 px): Who had what shows the split beside the
 * items (S9), so a test can edit and read the result without switching
 * steps. Call before rendering; `vi.restoreAllMocks()` undoes it.
 */
export function wideScreen(spyOn: typeof import('vitest').vi.spyOn): void {
  spyOn(window, 'matchMedia').mockImplementation(
    (query: string): MediaQueryList => ({
      matches: query.includes('min-width: 1024px'),
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }),
  )
}
