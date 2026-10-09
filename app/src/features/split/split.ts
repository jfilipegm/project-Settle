/**
 * The split engine: "Split algorithm" in docs/milestones/completed/milestone-1-PLAN.md,
 * steps 1–7. Every exact share is a BigInt rational scaled to one common
 * denominator `D`, so the only roundings are the three the plan names: each
 * line total, each percentage adjustment, and one allocation of the bill
 * total over everyone's exact share.
 */
import {
  add,
  allocateExact,
  negate,
  subtract,
  sum,
  type Cents,
} from '../../lib/money.ts'
import {
  adjustmentAmount,
  lineTotal,
  validateBill,
  type Bill,
  type BillError,
  type Person,
} from './model.ts'

/** One line of a person's breakdown. The lines sum to their total. */
export type BreakdownLine =
  | { kind: 'item'; itemId: string; amount: Cents }
  | { kind: 'tax'; amount: Cents }
  | { kind: 'tip'; amount: Cents }
  /** Negative: the person's part of the discount. */
  | { kind: 'discount'; amount: Cents }

export interface PersonShare {
  personId: string
  /** The person's display name ("Person n" when they have none). */
  name: string
  total: Cents
  lines: BreakdownLine[]
}

export interface Settlement {
  fromId: string
  toId: string
  amount: Cents
}

export interface SplitResult {
  itemsSubtotal: Cents
  tax: Cents
  tip: Cents
  discount: Cents
  /** Items subtotal + tax + tip − discount: what the people pay in all. */
  total: Cents
  /** In the bill's people order. The totals sum to `total` exactly. */
  people: PersonShare[]
  /** Who pays the payer what, in the bill's people order. */
  settlements: Settlement[]
}

export type SplitOutcome =
  { ok: true; result: SplitResult } | { ok: false; errors: BillError[] }

function gcd(a: bigint, b: bigint): bigint {
  while (b !== 0n) {
    ;[a, b] = [b, a % b]
  }
  return a
}

function lcm(a: bigint, b: bigint): bigint {
  return (a / gcd(a, b)) * b
}

/**
 * Splits a bill. Validates it first, and computes only a valid bill, so it
 * returns typed errors instead of throwing for any value the `Bill` type
 * allows. `nameOf` gives each person's shown name; the app passes the
 * catalogue's "Person n" for an unnamed person (M3 plan, S11).
 */
export function computeSplit(
  bill: Bill,
  nameOf: (person: Person, index: number) => string = (person) =>
    person.name.trim(),
): SplitOutcome {
  const errors = validateBill(bill)
  if (errors.length > 0) {
    return { ok: false, errors }
  }

  const { people, items } = bill
  const n = BigInt(people.length)
  const personIndex = new Map(people.map((person, index) => [person.id, index]))

  // 1–3. Line totals, subtotal, adjustments and the bill total.
  const lines = items.map(lineTotal)
  const itemsSubtotal = sum(lines)
  const tax = adjustmentAmount(bill.tax, itemsSubtotal)
  const tip = adjustmentAmount(bill.tip, itemsSubtotal)
  const discount = adjustmentAmount(bill.discount, itemsSubtotal)
  const total = subtract(add(itemsSubtotal, tax, tip), discount)

  // 4–5. Exact shares, scaled by D = T′ · lcm(Wᵢ) · n to integers.
  const itemWeights = items.map((item) =>
    item.assignees.reduce((acc, { weight }) => acc + BigInt(weight), 0n),
  )
  const L = itemWeights.reduce(lcm, 1n)
  const T = BigInt(itemsSubtotal)
  const tPrime = T > 0n ? T : 1n

  // Each item share Lᵢ·wᵢₚ/Wᵢ, scaled by L (an integer, since Wᵢ | L).
  const itemShareL = items.map((item, i) =>
    item.assignees.map(
      ({ personId, weight }) =>
        [
          personIndex.get(personId) ?? -1,
          (BigInt(lines[i] ?? 0) * BigInt(weight) * L) / (itemWeights[i] ?? 1n),
        ] as const,
    ),
  )
  // Sₚ·L: each person's items subtotal, scaled by L.
  const subtotalL = people.map(() => 0n)
  for (const shares of itemShareL) {
    for (const [index, share] of shares) {
      subtotalL[index] = (subtotalL[index] ?? 0n) + share
    }
  }

  // An adjustment's exact part for each person, scaled by D.
  const adjustmentD = (amount: Cents, mode: 'proportional' | 'equal') =>
    subtotalL.map((sL) =>
      mode === 'equal'
        ? BigInt(amount) * tPrime * L
        : // A·Sₚ/T · D = A · Sₚ·L · n; with T = 0, A is 0 (validated).
          BigInt(amount) * sL * n,
    )
  const taxD = adjustmentD(
    tax,
    bill.taxMode === 'equal' ? 'equal' : 'proportional',
  )
  const tipD = adjustmentD(
    tip,
    bill.tipMode === 'equal' ? 'equal' : 'proportional',
  )
  const discountD = adjustmentD(discount, 'proportional')

  const exactD = subtotalL.map(
    (sL, p) =>
      sL * tPrime * n +
      (taxD[p] ?? 0n) +
      (tipD[p] ?? 0n) -
      (discountD[p] ?? 0n),
  )
  const totals = allocateExact(total, exactD)

  // 6. Breakdown: one bill-level discount allocation, then each person's
  // positive lines rounded within their own total.
  const discountParts = allocateExact(discount, subtotalL)
  const shares: PersonShare[] = people.map((person, p) => {
    const positive: { line: BreakdownLine; weight: bigint }[] = []
    itemShareL.forEach((itemShares, i) => {
      for (const [index, share] of itemShares) {
        if (index === p) {
          positive.push({
            line: {
              kind: 'item',
              itemId: items[i]?.id ?? '',
              amount: 0 as Cents,
            },
            weight: share * tPrime * n,
          })
        }
      }
    })
    // Tax and tip lines only for a person who pays part of them.
    if ((taxD[p] ?? 0n) > 0n) {
      positive.push({
        line: { kind: 'tax', amount: 0 as Cents },
        weight: taxD[p] ?? 0n,
      })
    }
    if ((tipD[p] ?? 0n) > 0n) {
      positive.push({
        line: { kind: 'tip', amount: 0 as Cents },
        weight: tipD[p] ?? 0n,
      })
    }

    const personTotal = totals[p] ?? (0 as Cents)
    const discountPart = discountParts[p] ?? (0 as Cents)
    // With no positive lines, the person's exact share is 0, so their total
    // and discount part are 0 too.
    const amounts =
      positive.length > 0
        ? allocateExact(
            add(personTotal, discountPart),
            positive.map(({ weight }) => weight),
          )
        : []
    const breakdown: BreakdownLine[] = positive.map(({ line }, j) => ({
      ...line,
      amount: amounts[j] ?? (0 as Cents),
    }))
    if (discountPart > 0) {
      breakdown.push({ kind: 'discount', amount: negate(discountPart) })
    }

    return {
      personId: person.id,
      name: nameOf(person, p),
      total: personTotal,
      lines: breakdown,
    }
  })

  // 7. Settle-up: everyone else with something to pay pays the payer.
  const settlements: Settlement[] = shares
    .filter((share) => share.personId !== bill.payerId && share.total > 0)
    .map((share) => ({
      fromId: share.personId,
      toId: bill.payerId,
      amount: share.total,
    }))

  return {
    ok: true,
    result: {
      itemsSubtotal,
      tax,
      tip,
      discount,
      total,
      people: shares,
      settlements,
    },
  }
}
