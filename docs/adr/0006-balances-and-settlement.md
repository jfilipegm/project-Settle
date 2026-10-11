# ADR 0006 — Balances and the suggested settlement

- **Status:** Accepted
- **Date:** 2026-10-10
- **Milestone:** M5 — Balances and settling up
  (`docs/milestones/milestone-5-PLAN.md`, decisions B2, B4, B9)
- **Builds on:** ADR 0005 (the ledger on the device, derived values never
  stored).

## Context

M5 answers "who owes whom?" for a household, exactly, and suggests how to
settle everyone. The ledger holds expenses (M4) and, from M5, payments
between members. A suggestion is advice about real money: it must be the
fewest payments, always the same for the same data, and never offered
when the ledger is known to be incomplete.

## Decisions

### Derived, never stored

A member's balance is what they paid, less their shares, plus what they
sent, less what they received, in integer cents
(`app/src/features/household/balances.ts`). Shares come from M4's
`expenseShares`, which sum exactly to each expense's amount, and a payment
adds to one member what it takes from another, so the balances sum to
exactly zero. Nothing about a balance is stored: every surface works it
out from the records each time. Positive means the member gets money
back; negative means they owe.

By default every record counts, including those dated after today (an
expense or payment may be dated up to a year ahead): a rent entered early
for next month is owed. "Balances on" a date counts only the records
dated on or before it. Every surface uses the same default and says when
it includes records dated after today.

### The fewest payments: zero-sum groups, then greedy

The members with a non-zero balance are split into the most groups that
each sum to zero; each group settles inside itself greedily, the largest
debtor paying the largest creditor the smaller of the two amounts, until
the group is clear. The suggestion has (members with a non-zero balance
− groups) payments, which is the minimum:

- **Lower bound.** The payments of any settlement connect the members
  they involve into components, each of which sums to zero. A component
  of m members needs at least m − 1 payments to be connected, so k
  payments over n members leave at least n − k components:
  k ≥ n − (the most zero-sum groups).
- **Upper bound.** A group the grouping keeps can't be split into
  smaller zero-sum groups (it would have been), and each greedy step
  clears at least one member, the last step two, so a group of m members
  takes at most m − 1 payments.

**The programme**, for up to 16 non-zero balances (2¹⁶ subsets):

- _Sums:_ `sum[S]` for every subset, one addition each, from S without
  its lowest member (a `Float64Array`, exact for integer cents).
- _Most groups:_ `f[∅] = 0` and `f[S] = max over i in S of f[S∖{i}]`,
  plus one when `sum[S] = 0`. For a zero-sum S, `f[S]` is the most
  zero-sum groups S splits into: taking the members one at a time, every
  group that closes brings the running sum back to zero. This is
  O(2ⁿ·n) time and O(2ⁿ) memory; it never enumerates submasks, so it is
  never O(3ⁿ).
- _The grouping:_ take the first remaining member in member order; among
  the zero-sum subsets S of the remaining set R that contain them and keep
  the maximum (`f[R∖S] = f[R] − 1`), take the one with the fewest
  members, then the one whose members come first in member order. Repeat
  with the rest. The scan is 2ᵏ⁻¹ subsets for k remaining members, and k
  drops by at least 2 per group, so the construction stays under 2ⁿ
  checks of two table reads each.

**Above 16.** A household can have 50 members, and members who left keep
their balances, so more than 16 non-zero balances can happen, rarely.
Then the engine first takes out every pair of exactly opposite balances
(matched in member order, each pair its own group), runs the programme if
16 or fewer remain, and otherwise settles the rest as one group. The
result is deterministic and uses at most n − 1 payments, but it may not be
the minimum.

**Ties and order.** "Member order" is the order members were added
(`position`), then their id. Greedy ties go to the earlier member. The
payments are listed by amount, largest first, then by payer, then by
payee. The same balances always give the same payments, whatever order
the records are read in.

### Incomplete balances never become a recommendation

Records that can't be read are kept and counted, never guessed at (ADR
0005). An unreadable expense or payment can reverse a suggested payment,
and an unreadable member's balance is missing, so balances are _complete_
only when every member, expense and payment of the household reads. The
engine's result carries that flag, and every surface reads the one value:

- incomplete balances show as figures from the readable records, with a
  notice;
- no suggested payments and no Mark as paid;
- never "Everyone is settled up" (a zero reads "No balance");
- no "after this" outcome in the payment dialog;
- no settle-up text: `balanceText` throws on an incomplete result, so no
  caller can bypass the rule.

Recording a payment stays possible: a payment that really happened can
always be written down.

One limit remains: a record whose household reference itself is damaged
can't be attributed to any household, so no household counts it as
unreadable. The member-delete check treats such records conservatively
(ADR 0005); the balances can't, without marking every household
incomplete.

### A payment is its own record

See ADR 0005, "Version 2". Paying more than owed is allowed: it turns the
balance the other way, and the dialog shows the outcome before saving.

## Consequences

- Balances, suggestions, explanations and the text always agree, because
  they come from one pure engine over the same records.
- The engine is tested by a 2000-household seeded property sweep (zero
  sum, the suggestion clears everything, the minimum checked by brute
  force up to 8 balances, order independence, explanations, dates), a
  planted zero-sum-groups generator, 13 hand-checked examples and
  performance budgets, including adversarial 16-member vectors.
- Above 16 non-zero balances the suggestion is still correct and
  deterministic but not guaranteed minimal; user-facing words never claim
  more.
- A future "mark a period as settled" would be a record of its own; it is
  out of M5's scope.
