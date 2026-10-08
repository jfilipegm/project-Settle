import type { CSSProperties } from 'react'

/** How many people colours the tokens define (S2). */
export const PERSON_COLOURS = 6

/**
 * A person's colour slot, 1 to 6, from their current position in the bill
 * (S2): no stored field, so removing someone shifts the colours after
 * them. From the seventh person the colours repeat.
 */
export function personSlot(index: number): number {
  return (index % PERSON_COLOURS) + 1
}

/** The custom properties that colour a person's badge, bar or chip. */
export function personColorStyle(index: number): CSSProperties {
  const slot = personSlot(index)
  return {
    '--person-color': `var(--person-${String(slot)})`,
    '--person-on': `var(--person-on-${String(slot)})`,
  } as CSSProperties
}

/**
 * The badge's initial: the name's first letter, upper-cased, or the
 * person's number for an unnamed person ("Person 2" shows 2).
 */
export function personInitial(name: string, index: number): string {
  const first = [...name.trim()][0]
  return first === undefined ? String(index + 1) : first.toLocaleUpperCase()
}
