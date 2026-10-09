import { IconAlertTriangle } from '@tabler/icons-react'
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Icon, ICON_STROKE } from './Icon.tsx'

function svg(container: HTMLElement): SVGSVGElement {
  const element = container.querySelector('svg')
  expect(element).not.toBeNull()
  return element as SVGSVGElement
}

describe('Icon', () => {
  it('draws at 20 px with the house stroke by default', () => {
    const { container } = render(<Icon icon={IconAlertTriangle} />)

    expect(svg(container)).toHaveAttribute('width', '20')
    expect(svg(container)).toHaveAttribute('height', '20')
    expect(svg(container)).toHaveAttribute('stroke-width', String(ICON_STROKE))
  })

  it.each([16, 24] as const)('draws at %i px', (size) => {
    const { container } = render(<Icon icon={IconAlertTriangle} size={size} />)

    expect(svg(container)).toHaveAttribute('width', String(size))
  })

  it('is hidden from assistive technology and never focusable', () => {
    const { container } = render(<Icon icon={IconAlertTriangle} />)

    expect(svg(container)).toHaveAttribute('aria-hidden', 'true')
    expect(svg(container)).toHaveAttribute('focusable', 'false')
  })
})
