/**
 * Itemised expenses (M4 plan, H10): the split's bill, seeded from a
 * household's members.
 */
import { createBill, newId } from '../split/billReducer.ts'
import type { Bill } from '../split/model.ts'
import type { Member } from './model.ts'

/**
 * A fresh bill whose people are the household's active members, in order,
 * with their member ids as person ids (so the save dialog matches them
 * back), one empty item shared by all, and the first member paying.
 */
export function billForMembers(members: readonly Member[]): Bill {
  const base = createBill(['p1', 'p2', newId()])
  const people = members.map((member) => ({ id: member.id, name: member.name }))
  const [item] = base.items
  return {
    ...base,
    people,
    items:
      item === undefined
        ? []
        : [
            {
              ...item,
              assignees: people.map((person) => ({
                personId: person.id,
                weight: 1,
              })),
            },
          ],
    payerId: people[0]?.id ?? '',
  }
}
