import type { Icon as TablerIcon } from '@tabler/icons-react'

/** The three icon sizes (M3 plan, S5), in px. */
export type IconSize = 16 | 20 | 24

/** One stroke weight for every icon (S5). */
export const ICON_STROKE = 1.75

interface IconProps {
  /** A Tabler icon, imported by name so only the used ones ship. */
  icon: TablerIcon
  size?: IconSize
  className?: string
}

/**
 * A Tabler icon at the house size and stroke. Always decorative: the words
 * next to it, or an icon-only button's `aria-label`, carry the meaning, so
 * it is hidden from assistive technology and never takes focus.
 */
export function Icon({ icon: Glyph, size = 20, className }: IconProps) {
  return (
    <Glyph
      size={size}
      stroke={ICON_STROKE}
      className={className}
      aria-hidden="true"
      focusable="false"
    />
  )
}
