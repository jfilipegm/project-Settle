# Milestone 5 — Balances and settling up: execution plan (Revision 4)

- **Work item:** `milestone-5` (product, governing workflow version
  `2.2`).
- **Plan revision:** 4. It applies the manual external plan review of
  revision 3: M-I-1 accepted, O-EXT-1 accepted, O-EXT-2 and O-EXT-3
  noted, needing no change. It also folds in the optional findings
  L3-O1 to L3-O3 of local round 3. Revision 3 applied local round 2,
  and revision 2 applied round 1. See "Review dispositions".
- **Base commit:** `5222a92699b94b4365de2abed6f2b289b68a9e70` (the
  `master` merge of PR #12, M4; `feature/milestone-5` is cut from it).
- **Branch / PR:** `feature/milestone-5`; the PR opens after the first
  commit.
- **Registry:** `docs/ai-workflow/registry/milestone-5-registry.json`
- **Requirement mapping:** `docs/ai-workflow/requirements/milestone-5-mapping.json`
- **Artifact declarations:** `docs/ai-workflow/registry/milestone-5-artifacts.json`
- **Roadmap:** `docs/ROADMAP.md`, "M5 — Balances and settling up".
- **The approved design:** the design canvas
  (`https://claude.ai/artifact/YLBvTe9jnLx1WqUzmty6wG`):
  - the household at phone width: each member's balance ("Gets back"
    or "Owes" and a signed amount), then "Settle up in 3 payments"
    with "Details";
  - the household at desktop width: the balances with "Paid …" under
    each name, and a "Settle up" card ("Three payments clear every
    balance.") whose payments each have "Mark as paid";
  - the navigation map: "Balances, settle up" (planned, M5), reached by
    the Balances tab and "Mark as paid".

  `docs/DESIGN.md` holds its rules. The values this plan needs are
  copied into the decisions below, so a reviewer without the canvas can
  check the plan.
- **How the user wants this run:** after the plan is approved, every
  checkpoint is implemented back to back, with no stop between
  checkpoints, and both implementation reviews happen once, after the
  last one (the user, 2026-10-08, kept since M3).

## Checkpoints

| id | name | depends_on | complexity | session_target |
| --- | --- | --- | --- | --- |
| CP1 | The chart notes and M4's follow-ups: the current month's bar not a link, one hover style, the chart tip on hover, focus and tap, the gallery, one set of percentages, one chart name, the hardened literal-text guard | - | 2 | 1 |
| CP2 | Payments, the record and its storage: the settlement model and reader, the version-2 migration, the repository, member deletes checking payments, the failed-migration state | CP1 | 3 | 1 |
| CP3 | The balances engine: net balances, balances on a date, the fewest-payments suggestion with deterministic tie-breaks, explanations, property tests and hand-checked examples | CP2 | 3 | 1 |
| CP4 | The Balances tab: the members' balances, settle up with Mark as paid, recording a full or partial payment, explaining a balance, balances on a date, the overview's balances card | CP3 | 3 | 2 |
| CP5 | Payments in the history and settle-up text: payment rows, filters and search, the payment dialog with edit and delete, Copy as text and Share | CP4 | 2 | 1 |
| CP6 | Quality pass and documentation: the completion scenario and migration tests, screens and design checkers, privacy checks, ADRs, DESIGN.md, READMEs, roadmap, the design canvas | CP5 | 2 | 1 |

## Goal

Answer "who owes whom?" for a household, exactly, and make settling up
one press away.

**What the user sees at the end:**

- A **Balances** tab on every household. Each member's balance across
  the whole history: "Gets back 91,15" or "Owes 22,40", or "Settled
  up".
- **Settle up in N payments**: the fewest payments that clear every
  balance, always the same for the same data. Each has **Mark as
  paid**.
- **Record a payment** between any two members, for the full amount or
  part of it. Payments sit in the Expenses history with the expenses,
  and can be opened, edited and deleted like them.
- **Why is my balance this?** A member's balance opens the list of the
  expenses and payments that make it up, adding up to it.
- **Copy as text** (and Share, where the browser has it): the balances
  and the payments, ready to paste into a group chat.
- **Balances on a past date** ("what did we owe at the end of last
  month?").
- The overview shows the balances and the settle-up line, as on the
  canvas.
- First, the owner's notes on M4's charts: the current month's bar is no
  longer a link, every chart shows its value at once on hover, focus or
  tap, and M4's three optional review findings are fixed.

**What does not change:**

- The split maths (`split.ts`), the money rules (`lib/money.ts`), the
  receipt reader and parser, and how an expense's shares are derived
  (`shares.ts`).
- The quick split without a household.
- The stored household, member and expense records (version 1 each).
  The database gains a store; nothing in it is rewritten.
- The CSP and the privacy guarantees: no new origin, nothing leaves the
  device. Copy and Share hand text to the user's own clipboard or share
  sheet only.

## Evidence (before planning)

- **The ledger (M4):** IndexedDB `settle`, version 1, stores
  `households`, `members`, `expenses` and `meta` (`data/db.ts`). The
  migration list has one entry; the database version is its length. A
  migration that throws aborts the whole upgrade
  (`MigrationFailedError`), and the provider shows it today as
  "unavailable" (M4's O-4).
- **Shares are derived** (`shares.ts`): `expenseShares` gives each
  member's share in cents, summing exactly to `expenseAmount`. Quick
  splits rotate the leftover cents by the expense id; itemised ones
  come from `computeSplit`. A member's balance is therefore an exact
  integer sum, with no rounding of its own.
- **The payer** can be any member, in the split or not (M4, H6).
  Members have `joinedOn` and an optional `leftOn`.
- **Reading:** `listExpenses` returns the readable expenses whose
  members all exist, and counts the rest as `unreadable` (kept, never
  deleted). `deleteMember` refuses inside its transaction when an
  expense, readable or not, of the household names the member.
- **History** (`ExpensesPage`, `search.ts`): month groups, filters by
  member and category and a search, kept in the address (`member`,
  `category`, `q`). An expense opens in `ExpenseDialog` over the page it
  came from (`?expense=:eid`, M4 review finding M-5).
- **Tabs** today: Overview, Expenses, Members (`HouseholdShell`); in
  Portuguese Resumo, Despesas, Membros.
- **"Copy as text"** exists for the split (`features/split/format.ts`,
  M1 D12), through `navigator.clipboard`.
- **Randomised tests** use a seeded mulberry32 sweep (`money.test.ts`,
  `split.test.ts`, `shares.test.ts`); there is no property-testing
  library.
- **The charts** (`ui/Charts.tsx`): `Donut`, `Bars` and `ShareBar` show
  values through `title` and SVG `<title>`, which the browser shows
  after a delay. Only linked bars have a hover style
  (`a.slot:hover .bar`). "The last six months" links every bar,
  including the month on screen (`MonthCharts.tsx`, `to:
  ?month=${m.month}`).
- **The canvas example** is consistent: Ana +91,15, Marta +30,05, João
  −22,40, Tiago −98,80, settled by "Tiago pays Ana 91,15", "João pays
  Marta 22,40" and "Tiago pays Marta 7,65". B4's rule produces exactly
  these three payments (acceptance targets).

## Decisions taken in this plan

### B1 — The chart notes and M4's follow-ups (CP1)

The owner's notes after M4's acceptance, and M4's optional findings
O-12 to O-14:

- **The month on screen is not a link.** In "The last six months" the
  bar for the month being shown is drawn as a plain mark with "this
  month" in its name; only the other months link to `?month=`.
- **One hover style for every bar.** "Day by day" gets the hover that
  linked bars have: every bar slot, link or not, lightens its bar on
  hover, on keyboard focus and while its tip is shown.
- **The value at once, through a kit tip.** A `ChartTip` inside
  `ui/Charts.tsx` shows a mark's label immediately:
  - on pointer hover, for all four charts (both bar charts, the donut,
    the expense dialog's share bar);
  - on a tap, for a mark that isn't a link (a tap elsewhere or Escape
    hides it);
  - on keyboard focus, for the bar charts. Each bar chart is **one Tab
    stop** with roving focus (arrow keys, Home, End) over its marks,
    so "Day by day" doesn't add 31 Tab stops. A linked bar is still a
    link (Enter opens its month).

  The donut's and the share bar's values are already printed beside
  them (the legend; the dialog's list of shares), so their marks are
  not focusable. The tip sits above the mark and stays inside the chart
  at 360 px. It is `aria-hidden`: every value keeps its text
  alternative (accessible names on the marks, the legend and the
  figures). `title` and the SVG `<title>` are removed, so no second,
  delayed browser tooltip appears.
- **The roles (L1-I2).** Nothing focusable sits inside an `aria-hidden`
  subtree or a `role="img"` element. Today a bar chart without links is
  `role="img"` with its plot `aria-hidden` (`Charts.tsx`:122-126); that
  changes:
  - a bar chart is `role="group"`, named by its card's heading
    (`aria-labelledby`, O-14) or by its `label`. A short summary (the
    total and the highest bar) stays in its description
    (`aria-describedby`), so the chart is still read as a whole;
  - each mark is focusable through the roving focus and has its own
    accessible name: a link for a month that opens, otherwise
    `role="img"` with `aria-label` (the day or month and its amount);
  - the plot is no longer `aria-hidden`; only the scale, the ticks and
    the tip are;
  - the donut and the share bar keep `role="img"` with a label, and
    their marks stay unfocusable, so nothing focusable is inside them.
- **O-12:** the `/_kit` gallery shows `Donut`, `Bars`, `ShareBar` (with
  the tip) and the dialog's close button.
- **O-13:** the donut and its legend show the same percentage for a
  category. Percentages are computed once, over all categories, with
  the largest remainder (`percentages`). A slice of its own takes its
  category's percentage, and "The rest" takes 100 minus the slices
  shown.
- **O-14:** "The last six months" is read once: the chart is labelled
  by its card's heading (`aria-labelledby`), not by a second copy of
  the same words.
- **The literal-text guard (M3's R2-O1)**, hardened before M5 adds
  screens: it now also catches a ternary or a template with
  substitutions in a label attribute, a parenthesised or `as` literal,
  and a literal passed to a kit component's `label` prop. Any existing
  hit is moved into the catalogue.

### B2 — The settlement record

A settlement ("a payment") is money one member gave another to settle
up. It is a record of its own, not an expense: it has no category, is
not spending, and never counts in a month's "shared" total or charts.

```ts
interface Settlement {
  v: 1                // RECORD_VERSION, as every record (M4, H1)
  id: string
  householdId: string
  fromId: string      // the member who paid
  toId: string        // the member who received
  amount: Cents       // 0,01 to 1 000 000,00
  date: string        // YYYY-MM-DD
  note?: string       // trimmed, 1 to 80 characters
  createdAt: string
  updatedAt: string
}
```

- `settlementContentErrors` (pure, in `model.ts`) checks what the
  record can check alone: `fromId ≠ toId`, the amount's range, the
  date (from 2000-01-01; when saving, up to a year after today, as for
  expenses, L1-O3) and the note's length.
- **Any two members of the household,** including one who has left: a
  member who moved out settling afterwards is the common case. A
  member's dates don't restrict a payment.
- **Paying more than owed is allowed.** It just turns the balance the
  other way, which can be what the members meant (an advance). The
  record dialog says the payer's new balance before saving (B6).
- `readSettlement` in `data/records.ts` follows M4's readers: known
  fields only, `null` for anything it can't trust, never throws.

### B3 — Storage: the database's first real migration

- **Version 2** adds a migration, `createSchemaV2`: the store
  `settlements` (`keyPath: 'id'`) with the index `byHousehold`. It
  creates; it rewrites nothing. A version-1 database (every M4 user)
  upgrades on the first household page after the update, and its
  households, members and expenses read back unchanged.
- M4's tests used a **test-only** version-2 migration to prove the
  runner (H2, test 3). It moves to version 3, on top of the real
  version 2, so the runner keeps that test.
- A **version-2 snapshot fixture** (`fixtures/v2.json`) joins
  `fixtures/v1.json`, both read back by test.
- **The repository** (`data/repository.ts`), each action one
  `readwrite` transaction, as in M4:
  - `listSettlements(db, householdId)`: the readable settlements whose
    two members exist in the household; the rest counted as unreadable
    and kept;
  - `getSettlement`, and `saveSettlement(db, settlement, { replacing
    })`. Inside one transaction over households, members and
    settlements: the household exists, both members belong to it
    (`MissingReferenceError` otherwise), and an edit only replaces a
    settlement that still exists (`SettlementNotFoundError`, so one
    deleted in another tab is never brought back);
  - `deleteSettlement`.
- **Deleting a member** now also checks settlements. `deleteMember`'s
  transaction covers members, expenses and settlements, and refuses
  when a settlement of the household, readable or not, names the
  member (`MemberInUseError`, the same reasons as for expenses, M-I-4).
- **Another tab** gets the same `BroadcastChannel` refresh as for
  expenses.
- **A failed migration (M4's O-4)** gets its own state, now that a real
  one ships: "Settle couldn't update the data on this device. Nothing
  was changed." with Reload, and the way to the split. It replaces the
  "unavailable" message that M4 showed for it. `blocked` (an older tab
  holds the database) keeps M4's message, which asks to close the
  other tab.
- **ADR 0005** gains a "Version 2" section: the settlements store, and
  why a settlement isn't an expense.

### B4 — Balances, derived (the engine)

`features/household/balances.ts`, pure and framework-free. Nothing it
computes is stored (M4, H5).

- **A member's balance** = what they paid − their shares + what they
  sent − what they received, in integer cents:
  - *paid*: the amounts of the expenses where they are the payer;
  - *share*: their `expenseShares` in every expense;
  - *sent* and *received*: their settlements.

  Positive: they get money back. Negative: they owe. Balances sum to
  exactly zero across the household (each expense's shares sum to its
  amount; each settlement adds and subtracts the same amount).
- **As of a date:** `balances(…, { asOf })` counts only records dated
  on or before it. With no date, everything counts, **including records
  dated after today** (L1-I1): expenses may be dated up to a year ahead
  (`maxExpenseDate`, M4's L1-O3), and so may payments (B2). A rent
  entered early for next month is owed, so it counts. Every surface
  uses this same default: the Balances tab, the suggestion, the
  overview's card, the payment dialog's "after this" line, the
  explanations and the text (B9).
- **The suggested settlement** (`suggestSettlements`): the fewest
  payments that bring every balance to zero, with a deterministic
  result.
  - The members with a non-zero balance are split into the **most
    groups that each sum to zero**. Each group settles inside itself in
    (size − 1) payments. So the number of payments is (members with a
    non-zero balance − groups), the minimum possible.
  - **The programme (O-EXT-1).** It runs over the n members with a
    non-zero balance, for n up to 16 (65 536 subsets), in three steps:
    - *Sums:* `sum[S]`, one addition per subset, from the subset
      without its lowest member. It is held in a `Float64Array`, exact
      for integer cents.
    - *Most groups:* `f[∅] = 0`, and
      `f[S] = max over i in S of f[S∖{i}]`, plus 1 when `sum[S] = 0`.
      For a zero-sum S, `f[S]` is the most zero-sum groups S splits
      into. (Take the members group by group: every group that closes
      brings the running sum back to zero.) This is O(2ⁿ·n) time and
      O(2ⁿ) memory, with no enumeration of submasks, so it is never
      O(3ⁿ).
    - *Building the groups:* "Which grouping" below scans the subsets
      of the remaining members that contain the first of them. That is
      2ᵏ⁻¹ subsets for k remaining members, and k drops by at least 2
      per group, so the whole construction stays under 2ⁿ checks. Each
      check is two table reads.

    The total is O(2ⁿ·n). CP3's performance test includes adversarial
    16-member vectors with many zero-sum subsets (small values such as
    ±1, ±2 and ±3).
  - **Above 16 (L3-O1).** A household can have up to 50 members
    (`HOUSEHOLD_LIMITS.maxMembers`, `model.ts`:36), and members who
    left keep their balances. So more than 16 non-zero balances can
    happen, rare as it is. Above 16 the engine:
    1. first takes out every pair with exactly opposite balances,
       matched in member order, each pair being its own group;
    2. runs the programme if 16 or fewer remain;
    3. otherwise treats the rest as one group.

    The result is still deterministic and uses at most n − 1 payments,
    though it may not be the minimum. ADR 0006 documents this, and
    CP3 tests it with members who left among the balances.
  - Inside a group: the largest debtor pays the largest creditor the
    smaller of the two amounts, and so on until the group is clear.
  - **Ties** are broken by member position (the order members were
    added), then by member id; "member order" below means that order.
  - **Which grouping (L1-O1).** Several groupings can reach the same
    number of groups. The grouping is built one group at a time:
    take the first remaining member in member order; among the
    zero-sum subsets of the remaining members that contain them and
    still allow the maximum number of groups, take the one with the
    fewest members; among those, the one whose members, listed in member
    order, come first (lexicographically by position). Repeat with the
    rest. The programme's table answers "still allows the maximum" in
    constant time per candidate: a candidate S of the remaining set R
    qualifies when `sum[S] = 0` and `f[R∖S] = f[R] − 1`.
  - **Output order:** the largest amount first, then the payer's
    position, then the payee's position.
  - On the canvas example this gives the canvas's three payments.
  - **Why the count is the minimum (L2-O2).** *Lower bound:* the
    payments of any settlement split the members with a non-zero balance
    into connected components, and each component sums to zero. A
    component of m members needs at least m − 1 payments to connect it,
    so k payments over n members leave at least n − k components:
    k ≥ n − (the most zero-sum groups). *Upper bound:* a group the
    programme keeps can't be split into smaller zero-sum groups (it
    would have been), and each greedy step clears at least one member,
    the last clearing two, so the greedy pass uses at most (size − 1)
    payments per group. The two bounds meet. ADR 0006 records this.
- **Explaining a balance** (`explainBalance`): for one member, every
  expense they paid or share in, with paid, share and the effect (paid
  − share), and every settlement they sent (+amount) or received
  (−amount). Newest first, as in history. The effects sum exactly to
  the balance (tested).
- **Unreadable records** are never guessed at. The engine only sees
  readable records; the page says how many weren't counted (B5).
- **Complete or not (M-I-1).** Balances are *complete* only when every
  member, expense and payment record of the household could be read.
  An unreadable expense or payment could reverse a suggested payment,
  and an unreadable member's own balance is missing. When anything is
  unreadable, the balances are shown as figures from the readable
  records only. No surface turns them into a recommendation:
  - no suggested payments and no Mark as paid;
  - no "Everyone is settled up";
  - no "after this" outcome;
  - no settle-up text.

  The engine's result carries the flag (`complete: boolean`, with the
  unreadable counts), so every surface reads one value and none decides
  for itself.

### B5 — The Balances tab

- **Route** `/households/:hid/balances`. The tabs become Overview,
  Expenses, Balances, Members (pt: Resumo, Despesas, Saldos, Membros).
  The four labels fit at 360 px in both languages; `screens.mjs` checks
  it.
- **The page,** following the canvas:
  - the heading, "Balances", and one line: "Settle up in 3 payments."
    or "Everyone is settled up.";
  - **the members' balances:** badge, name, "Gets back" / "Owes" /
    "Settled up", and the signed amount (a true minus sign, M3's
    `signedAmount`). Under the name, "Paid 412,30" as on the desktop
    canvas. Each row links to that member's explanation (B7). A member
    who has left is listed while their balance isn't zero, with "Left
    on 3 Sep"; with a zero balance they're left out;
  - **Settle up:** each suggested payment, "Tiago pays Ana 91,15", with
    **Mark as paid**, which opens the payment dialog filled in (B6);
  - **Record a payment**, which opens the dialog empty;
  - **Copy as text**, and **Share** where the browser offers
    `navigator.share` (B9).
- **Balances on a date:** a date field, "Balances on", kept in the
  address (`?on=YYYY-MM-DD`). Without `?on=` the page shows the
  default of B4: every record, including any dated after today, and
  the field is empty with the hint "All expenses and payments".
  - When records dated after today exist, a line says so (L1-I1). It
    counts both kinds, with plurals, in both languages (L3-O3):
    "Includes 1 expense dated after today.", "Includes 2 payments dated
    after today.", or "Includes 1 expense and 2 payments dated after
    today."
  - `?on=` takes a date up to today. A later date, or one that isn't a
    real date, is ignored, as an unknown `?month=` is on the overview.
  - With `?on=` set, the balances and explanations are as of that day,
    and Settle up, Mark as paid, Record a payment, Copy as text and
    Share are hidden (L2-I2), with
    "These are the balances on 30 Sep. Show all.", since a payment is
    recorded against the current balances.
- **Unreadable records (M-I-1, open question 1 resolved):** when any
  member, expense or payment record of the household couldn't be read
  (B4, "Complete or not"), the page fails closed:
  - A notice says: "3 records couldn't be read, so these balances leave
    something out. Settle up isn't suggested until they can be read."
    The heading line reads "Balances from the records that could be
    read."
  - The members' balances and their explanations still show, for
    inspection.
  - Settle up, its payments and Mark as paid aren't shown. Neither is
    "Settle up in N payments" or "Everyone is settled up". All-zero
    readable balances read "No balance in the records that could be
    read."
  - Copy as text and Share are hidden: the text would leave the device
    with figures known to be incomplete.
  - Record a payment stays available, because a payment that really
    happened can always be written down. Its dialog shows the same
    notice in place of the "after this" line (B6).
  - With `?on=` set, the same notice shows, since an unreadable
    record's date is unknown.

  When every record is readable again, the page is the ordinary one.
- **No members, or no expenses yet:** the empty states say so and link
  to Members or Add expense.
- **The overview** gets the canvas's balances card: the members'
  balances, compact, then "Settle up in 3 payments" (or "Everyone is
  settled up") and **Details**, to the Balances tab. The card shows
  B4's default balances whichever month the overview shows, and says so
  in words that match that default (L2-I2): "Across all expenses and
  payments.", plus the "dated after today" line when such records exist.
  It never says "today". It appears once the household has an expense or
  a payment; before that the overview is M4's. When the balances aren't
  complete (M-I-1), the card shows the balances with the short notice
  "3 records couldn't be read." and Details. It shows no settle-up line
  and never "Everyone is settled up".

### B6 — Recording a payment

- **A dialog** (the kit's `Dialog`), opened by Mark as paid or Record a
  payment, or by Edit on a payment (B8). Fields:
  - **From** and **To**: the members, in position order, with those who
    have left last, marked "(left)";
  - **Amount**, M1's amount field;
  - **Date**, today by default;
  - **Note**, optional.
- Mark as paid fills From, To and the suggested amount. Changing the
  amount records a **partial** payment; the rest stays owed and the
  suggestion recomputes.
- Under the fields, both members' outcome: "After this, Tiago owes
  7,65 and Ana is settled up." (each "owes …", "gets back …" or "is
  settled up", L1-O3), computed by the engine on the record being
  entered over the default balances of B4, so the effect is visible
  before saving. When the balances aren't complete (M-I-1), the line
  isn't computed. The dialog says instead: "3 records couldn't be read,
  so the outcome isn't shown." Saving still works: the dialog records a
  payment that was made, whether or not it was suggested. Mark as paid
  is never offered on incomplete balances, so the dialog only ever
  opens empty there.
- **Editing a payment (L2-I1):** the default balances already contain
  the payment being edited, so the preview is computed over the default
  balances **without** it, then with the record as entered. This holds
  whatever is changed: the amount, the date, or From and To (the line
  then names the new pair). Editing 91,15 down to 50,00 shows the
  outcome of 50,00 alone.
- **Errors** in M4's style, next to their field: the same member twice,
  a missing or out-of-range amount, a bad date. A save that fails in
  storage keeps what was typed and says so.
- **Saving** is guarded against a double press (M4, round 1). It
  closes the dialog, announces "Payment recorded." in a live region and
  refreshes the balances.

### B7 — Explaining a balance

- **Route** `/households/:hid/balances/:mid`, under the Balances tab.
  It respects `?on=`.
- The member's balance at the top, then the sums that make it: "Paid
  1 284,60 · Share 1 193,45 · Sent 0,00 · Received 0,00".
- **The lines,** in month groups, newest first:
  - an expense: date, description, "Paid 38,47 · Share 9,62", and its
    effect, "+28,85";
  - a payment: "Paid Ana" or "From Tiago", and its effect.

  Each line opens its record in the dialog over this page
  (`?expense=` or `?settlement=`). Back and Escape return here.
- The last line: "Balance +91,15", equal to the sum of the effects.
- Any member of the household has an explanation, including one who has
  left with a zero balance and is therefore not listed on the tab
  (L2-O4): their page shows their (zero) balance and its lines. Only an
  id that isn't a member of this household shows Not found, as an
  unknown household does.

### B8 — Payments in the history

- **The Expenses tab lists payments** among the expenses, by date, in
  the same month groups. A payment's row: an exchange icon, "Tiago paid
  Ana", the date and the amount, styled apart from the expenses.
- **Month totals and counts** stay expenses only ("€1 284,60 across 37
  expenses"), and so do the overview's charts and "shared" line.
- **Filters:** a member filter shows the payments they sent or
  received. A category filter hides payments, since they have no
  category. The search matches the two names and the note.
- **A payment opens in a dialog** over the list (`?settlement=:sid`),
  as an expense does (M4, M-5): from, to, amount, date, note, then Edit
  (the B6 form, filled in) and Delete (with a confirmation: "Delete
  this payment? The balances change back."). Close, Escape, a click
  outside and Back return to the list. An unknown id says the payment
  wasn't found.

### B9 — Settle-up text

`features/household/balanceText.ts`, pure, both languages, the region's
money format:

```
Rua das Flores 12, balances
Ana gets back €91,15
Marta gets back €30,05
João owes €22,40
Tiago owes €98,80

To settle up, 3 payments:
Tiago pays Ana €91,15
João pays Marta €22,40
Tiago pays Marta €7,65
```

Or "Everyone is settled up." in place of the payments.

The header names no date, because B4's default includes records dated
after today (L2-I2). When such records exist, a line under the header
says so (B5's wording). The text is only offered without `?on=` and
with complete balances (B5, M-I-1). It is therefore always the default
balances over every record, and never claims "Everyone is settled up"
over incomplete data. `balanceText` itself refuses an incomplete result
(it throws), so no caller can bypass the rule.

"Copy as text"
puts it on the clipboard and says "Copied." (M1's pattern; a refused
clipboard says so). "Share" calls `navigator.share({ text })` where the
browser has it; a cancelled share is not an error.

### B10 — Languages and words

- Every new string is in `en.ts` and `pt.ts`. Portuguese: "Saldos",
  "Recebe" / "Deve" / "Contas certas", "Acertar contas em 3
  pagamentos", "Marcar como pago", "Registar um pagamento", "Tiago paga
  à Ana", "Saldos a".
- "Payment" is the user's word for a settlement throughout the UI.
  "Settlement" stays in the code.
- Amounts use `signedAmount`: a true minus sign, and a plus sign on
  balances (`always`).

### B11 — Layers and tests

- **Layers** (as M4's H18): `balances.ts` and
  `balanceText.ts` are pure; `data/` stores and reads; pages compose.
  No React in `features/household/*.ts`.
- **Test infrastructure:** `fake-indexeddb`, as M4. The property tests
  use the seeded mulberry32 sweep the repository already uses; no new
  dependency.
- **Performance:** 1000 expenses and 200 payments give balances, the
  suggestion and an explanation within the test's budget (500 ms under
  jsdom). The pages memoise the derived values per data revision.

## Acceptance targets

- **Property tests (the roadmap's completion criteria).** 2000 seeded
  random households (2 to 12 members, some who left or joined late, 1
  to 60 expenses of every split kind, 0 to 10 payments, partial ones
  among them):
  - balances sum to exactly zero;
  - applying the suggested payments leaves every balance at zero;
  - no suggested payment is zero or negative, and none pays oneself;
  - the number of payments is the minimum: for 8 or fewer non-zero
    balances, checked against a brute-force search over all groupings.
    Random cents rarely produce separate zero-sum groups, so a second
    generator (L2-O1) builds balance vectors from planted zero-sum
    groups (small integer amounts, 2 to 4 groups, shuffled, 2 to 16
    members) and checks `suggestSettlements` against the same brute
    force up to 8 balances, and against the planted group count above;
  - the result is deterministic, and doesn't depend on the order the
    records are listed in;
  - each member's explanation sums to their balance;
  - as of any date, balances equal those computed from only the records
    up to it.
- **Hand-checked examples** (the roadmap's "edge cases in Phase 3's
  list"), each a unit test with the figures worked out in the test's
  comment:
  1. the canvas example: three payments, as drawn;
  2. a member joins mid-month and shares only later expenses;
  3. a member leaves owing money, then pays after leaving;
  4. someone pays for others without a share (payer outside the split);
  5. unequal splits: shares, exact amounts, percentages;
  6. an itemised expense with a shared item, a discount, a tax and a
     tip;
  7. a duplicate receipt saved twice counts twice, and deleting the
     duplicate restores the balances;
  8. corrections are not dated: after editing an old expense (amount,
     payer), the balances on any date use its corrected values (L1-O2);
  9. a historical expense added later counts at its own date;
  10. a partial payment, then the rest;
  11. a payment larger than owed turns the balance the other way;
  12. two separate pairs (A owes B 10, C owes D 10): two payments, not
      three;
  13. everyone settled: no payments, "Everyone is settled up".
- **Data integrity:**
  - the version-1 to version-2 upgrade keeps every household, member and
    expense byte for byte, with the same derived shares and month
    totals; the M4 snapshot fixture upgrades and reads back;
  - a failed upgrade step leaves version-1 data intact and shows the new
    "couldn't update" state;
  - unreadable payments are skipped, counted and left in the database,
    byte for byte;
  - deleting a member named by a payment, readable or not, is refused
    inside the transaction; a payment of **another** household doesn't
    block;
  - **two tabs:** a payment saved after its member was deleted elsewhere
    is refused and writes nothing; an edit of a payment deleted
    elsewhere is refused.
- **Incomplete balances fail closed (M-I-1).** With an unreadable
  record, no surface recommends a payment or claims everyone is settled
  up:
  - the tab shows no suggestion and no Mark as paid;
  - the overview card shows no settle-up line;
  - the payment dialog shows no "after this" line;
  - there is no text.

  This is tested with an unreadable expense that would reverse the
  suggested payment (the reviewer's Ana and Tiago case), with an
  unreadable payment, and with an unreadable member. When the record is
  readable again, the ordinary suggestions come back.
- **The completion scenario** (M4's, extended): the household with 4
  members and 31 expenses, plus 5 payments (two from suggestions, one
  partial, one by a member who left, one edited and one deleted). The
  balances, the suggestion and every explanation are equal before and
  after a reload, and before and after the version-1 to version-2
  upgrade of the data without payments.
- **The existing behaviour is kept:**
  - the full `npm run check` suite passes;
  - the split's suites keep their assertions;
  - M4's household suites keep theirs. Only the expected changes are
    made: a fourth tab, and the chart's link and tip (B1);
  - the CI browser smoke test passes on the production build.
- **Both languages:** every new page and dialog renders in Portuguese
  with no English sentinel, and the hardened literal-text guard passes.
- **Design:**
  - the Balances tab, an explanation, the payment dialog (empty and
    filled), a payment in history and its dialog, and the overview's
    balances card, at 360, 390, 1024 and 1440 px in both themes. No
    sideways scroll at 360 px, and a focus ring on every Tab stop
    (`screens.mjs` extended);
  - the chart tips at 360 px stay inside their card;
  - the Impeccable detector and ux-lint clean, or each finding reasoned
    in `CHECKS.md`;
  - one accent per screen.
- **Privacy:** `check-requests.mjs page-load` and `scan` pass on the
  production build, every request same-origin. The CSP is unchanged.
- **Performance:** B11's budget, and `check-build.mjs`'s first-view
  font and bundle budgets.

## CP1 — The chart notes and M4's follow-ups

- **Charts** (`ui/Charts.tsx`, `Charts.module.css`): `ChartTip`, roving
  focus for `Bars`, hover and focus styles on every slot, `title` and
  SVG `<title>` replaced (B1). A bar without `to` renders a mark that
  isn't a link.
- **`MonthCharts.tsx`:** the month on screen has no `to` and its name
  says "this month"; "The last six months" is labelled by its card's
  heading (O-14); the donut and legend share one set of percentages
  (O-13).
- **The expense dialog's `ShareBar`** gets the tip.
- **The gallery** (O-12).
- **The literal-text guard** hardened (B1), and any hit fixed.
- **Tests:**
  - `Charts.test.tsx`: the tip shows on hover, focus and tap and hides
    on leave, blur, Escape and a tap elsewhere; roving focus with
    arrows, Home and End; one Tab stop per bar chart; no `title`;
    every chart: no focusable element inside an `aria-hidden` subtree
    or a `role="img"` element, and every focusable mark has a name
    (L1-I2);
  - `overviewCharts.test.tsx`: the current month's bar is not a link;
    the other five are; the donut's and the legend's percentages agree
    for a month with nine categories; the chart's name is the card's
    heading only;
  - the guard's own tests: one per new form, failing before the change.
- **The design canvas:** the "As shipped in M4" board's charts noted
  with the tip (design check).

## CP2 — Payments: the record and its storage

- **The model** (B2): `Settlement`, `settlementContentErrors`, in
  `features/household/model.ts`.
- **The reader** `readSettlement` (`data/records.ts`).
- **The migration** `createSchemaV2`; the test-only step moves to
  version 3; `fixtures/v2.json` (B3).
- **The repository:** `listSettlements`, `getSettlement`,
  `saveSettlement`, `deleteSettlement`, and `deleteMember` checking
  payments (B3).
- **The provider and the "couldn't update" state** (O-4):
  `HouseholdDataStatus` gains `migrationFailed`; `StorageState` shows
  it, in both languages.
- **ADR 0005,** "Version 2".
- **Tests:** the model's validation; the reader's rejections; the
  upgrade from a version-1 database (empty, and M4's fixture); the
  failed step; the repository's references, edit-after-delete and the
  two-tab cases; the member delete refusals (readable, unreadable,
  other household); the new storage state.

## CP3 — The balances engine

- `features/household/balances.ts` (B4): `balances`,
  `suggestSettlements`, `explainBalance`, and the "after this" preview
  B6 uses.
- **Tests:** the property tests and the 13 hand-checked examples
  (acceptance targets), the brute-force check for up to 8 balances, the
  planted-groups generator (L2-O1), the
  over-16 fallback with members who left among the balances and its
  opposite-pair pass (L3-O1), the grouping rule of L1-O1 on a case with two
  groupings of equal size, a future-dated expense and payment counted by
  default and left out by an earlier `asOf` (L1-I1), the `complete` flag
  false for an unreadable member, expense or payment and true otherwise
  (M-I-1), and B11's performance budget, including adversarial
  16-member vectors with many zero-sum subsets (O-EXT-1).

## CP4 — The Balances tab, recording a payment, and explanations

- **Routes and the tab** (B5): `balances` and `balances/:mid` in
  `routes.tsx`; the fourth tab in `HouseholdShell`.
- **`BalancesPage`** (B5), **`BalanceDetailPage`** (B7), and the
  **payment dialog** `SettlementForm` (B6), in
  `pages/households/` and `features/household/components/`.
- **The overview's balances card** (B5).
- **Strings** in both languages (B10).
- **Tests:** the balances and their words; left members; Mark as paid
  filling the dialog; a full and a partial payment updating the
  balances and the suggestion; the "after this" line naming both
  members; the validation errors; the double-press guard; a failed save
  keeping the input; the date field (a set date hides the actions, the
  address keeps it, a date after today is ignored); with a future-dated
  expense and payment, the same default on the tab, the suggestion, the
  overview card, the "after this" line, an explanation and the text,
  and the "dated after today" line (L1-I1); the overview card's label
  ("Across all expenses and payments.", never "today") with and without
  a future-dated record, and Copy and Share hidden with `?on=` (L2-I2);
  the explanation of a member who left with a zero balance (L2-O4); the
  "dated after today" line with only expenses, only payments and both
  (L3-O3); incomplete balances (M-I-1). For incomplete balances, an
  unreadable expense that would reverse the suggestion (Ana and Tiago),
  an unreadable payment and an unreadable member each give:
  - the notice;
  - no Settle up and no Mark as paid;
  - no "Everyone is settled up", including when the readable balances
    are all zero;
  - Copy and Share hidden;
  - Record a payment still saving, with the notice in place of the
    "after this" line;
  - the overview card without a settle-up line;
  - the notice kept with `?on=`;
  - the ordinary page back once the record is readable.

  The rest of the CP4 tests:
  - the empty states;
  - an explanation summing to its balance and opening its expense
    lines over the page (its payment lines arrive with the payment
    dialog in CP5, L3-O2);
  - Not found for an unknown member;
  - the overview card on a past month;
  - Portuguese.

## CP5 — Payments in the history, and settle-up text

- **`ExpensesPage`** and `search.ts`: payments in the month groups, the
  filters and the search (B8); totals stay expenses only.
- **The payment dialog over the list** (`SettlementDialog`, opened by
  `?settlement=` from `HouseholdShell`, beside `ExpenseDialog`): view,
  Edit and Delete with its confirmation (B8).
- **`balanceText.ts`** and the Copy and Share buttons (B9).
- **Tests:** a payment in its month, styled apart; the totals
  unchanged; each filter and the search; open, close (Escape, outside,
  Back) back to the filtered list; edit; editing a payment's amount,
  and its From and To, shows the "after this" outcome without the
  original payment (L2-I1); delete with confirmation; an
  unknown id; a payment line on an explanation page opening its dialog
  over that page, and Back returning there (L3-O2); `balanceText`
  refusing an incomplete result (M-I-1); the text in both languages with and without payments, its
  header with no date, and its "dated after today" line with a
  future-dated record (L2-I2);
  Copy (granted and refused) and Share (present, absent, cancelled).

## CP6 — Quality pass and documentation

- **The completion scenario and migration tests** (acceptance targets),
  if not already covered in CP2 to CP5.
- **`app/scripts/screens.mjs`** gains the screens listed under "Design"
  above; the 360 px and keyboard checks run.
- **The design checkers,** with findings reasoned in
  `docs/milestones/milestone-5-evidence/CHECKS.md`.
- **The privacy checks:** page load and a scan, on the production build.
- **Documentation:**
  - **ADR 0006**, "Balances and the suggested settlement": derived, never
    stored; the programme's recurrence and complexity, the grouping
    rule, the proof that the count is the minimum, its limit of 16 with
    the over-16 fallback, the tie-breaks, and why incomplete balances
    never produce a recommendation (M-I-1);
  - **`docs/DESIGN.md`:** the chart tip, the balances list, payments in
    history, and the four tabs;
  - **`app/README.md`:** the version-2 migration as the worked example of
    adding one, and the balances engine;
  - **the root `README.md`:** what M5 adds;
  - **`docs/ROADMAP.md`:** M5's status;
  - **the design canvas:** the navigation map (Balances drawn, Mark as
    paid and Record a payment, the explanation), the Balances tab at
    phone width in both themes, and an "As shipped in M5" board.
- **The full verification:** `npm run check`, the build and
  `check-build.mjs`, and CI's smoke steps locally.

## Requirement coverage

See `docs/ai-workflow/requirements/milestone-5-mapping.json` (generated).

| Requirement | Checkpoints |
| --- | --- |
| REQ-1 The chart notes | CP1 |
| REQ-2 M4's follow-ups: O-12 to O-14, the literal-text guard | CP1 |
| REQ-3 Payments stored: the record, version 2, the repository | CP2 |
| REQ-4 A failed migration's own state (O-4) | CP2 |
| REQ-5 Net balance per member, exact, summing to zero | CP3, CP4 |
| REQ-6 The suggested settlement: fewest payments, deterministic | CP3, CP4 |
| REQ-7 Record a payment, full or partial | CP2, CP4 |
| REQ-8 Explain a balance | CP3, CP4 |
| REQ-9 Payments in the history, editable and deletable | CP5 |
| REQ-10 Settle-up summary as text | CP5 |
| REQ-11 Balances on a date | CP3, CP4 |
| REQ-12 Members who left: balances kept, payments allowed, delete refused | CP2, CP3, CP4 |
| REQ-13 Property tests and hand-checked examples | CP3, CP6 |
| REQ-14 Both languages, design, 360 px, accessibility | CP1, CP4, CP5, CP6 |
| REQ-15 Documentation and the design canvas | CP6 |

## Files touched and review classification

**Implementation-stage protected** (`milestone-5-artifacts.json`):
- `app/` (all source, tests, scripts, `package.json` and the lockfile);
- `docs/adr/` (ADR 0005's new section, ADR 0006);
- `docs/DESIGN.md`, `README.md`, `PRODUCT.md`;
- `.github/workflows/app-ci.yml`. It is not expected to change. It stays
  protected as for M3 and M4.

**Excluded** (workflow bookkeeping and evidence):
- `docs/ROADMAP.md`, `docs/ACTIVE_MILESTONE.md`;
- `docs/milestones/` (the evidence folder);
- `docs/ai-workflow/`.

## Migration, data and backup implications

- **The database moves to version 2:** one new store, nothing
  rewritten. It is the first real migration, so it is tested from an
  empty version-1 database, from M4's fixture, and from the completion
  scenario's data.
- **No downgrade.** An older Settle in another tab gets M4's "Settle was
  updated in another tab" and reloads; it can't open a version-2
  database.
- **Unchanged:** the household, member and expense records,
  `settle.bill`, `settle.receipt`, `settle.household` and the
  settings keys.
- **No backup exists until M6.** M5 deletes nothing without the user's
  confirmed action: a payment's delete is confirmed, a member named by a
  payment can't be deleted, and unreadable payments are kept. M6's file
  format will carry payments.

## Out of scope

- Real payments, payment links or requests (MB WAY, Revolut, IBAN QR),
  bank connections (roadmap: Future / not yet).
- Reminders and notifications.
- "Mark a period as settled" (roadmap: Useful). It needs a record of its
  own and a decision on how the history shows it. It is left for after
  M10's personal use shows whether a fresh start is wanted (open
  question 2).
- Export, import, backup and sharing between devices (M6).
- M4's O-6 (the add-member form's "full" counts only today). The
  repository already refuses correctly; it is a message, kept for M10.
- Any change to the split maths, the parser, the reader or how shares
  are derived.

## Open questions (for the plan reviewer / user)

1. **B5, unreadable records.** *Resolved by the external review
   (M-I-1):* the suggestions, Mark as paid, "Everyone is settled up",
   the "after this" line and the text are hidden until every record can
   be read. The balances stay visible, marked as incomplete, and Record
   a payment stays available.
2. **The roadmap's two "Useful" items.** "Balances on a date" is
   planned (it's cheap: a filter on the same engine). "Mark a period as
   settled" is left out (see "Out of scope"). Is that the right split?
3. **B8, one history.** Payments are listed in the Expenses tab with the
   expenses, as the roadmap's "part of the history" reads, but don't
   count in its totals. Is that clear enough, or should they sit only
   under Balances?
4. **B2, paying more than owed** is allowed, with the "after this" line
   showing the result. Should it be refused instead?

## Stop conditions

Stop and ask the user if:
- an existing split test's assertions would have to change (not only its
  harness);
- an M4 household test's assertions would have to change beyond the
  fourth tab and B1's chart changes;
- the CSP would need a new source;
- a stored record's format would change (anything beyond the new store);
- the version-2 upgrade loses or alters any version-1 record in any
  test;
- the bundle or font budgets fail and can't be met without dropping a
  requirement;
- IndexedDB behaviour in a real browser contradicts `fake-indexeddb` in
  a way that affects data safety.

## Review dispositions

### Local plan review, round 1 (`LOCAL_MODEL_PLAN_REVIEW`, revision 1 → 2)

| Finding | Disposition | Where |
| --- | --- | --- |
| L1-I1 future-dated records and the default date | Accepted. One default for every surface: every record counts, future-dated ones included and noted; `?on=` only up to today | B4 "As of a date", B5, B6, CP3 and CP4 tests |
| L1-I2 focusable marks inside a hidden chart | Accepted. Bar charts become named groups with focusable, named marks; the plot is no longer `aria-hidden`; a test forbids focusable elements under `aria-hidden` or `role="img"` | B1 "The roles", CP1 tests |
| L1-O1 the grouping tie-break | Accepted. Stated as a concrete construction | B4 "Which grouping" |
| L1-O2 example 8's wording | Accepted | Acceptance targets, example 8 |
| L1-O3 the "after this" line | Accepted. It names both members | B6 |
| L1-O4 the review request's head | Accepted. `REVIEW_REQUEST.md` says HEAD is the base because nothing is committed before plan approval | the bundle's review request |

### Local plan review, round 2 (`LOCAL_MODEL_PLAN_REVIEW`, revision 2 → 3)

| Finding | Disposition | Where |
| --- | --- | --- |
| L2-I1 editing a payment double-counts it in the "after this" line | Accepted. The preview of an edit leaves the original payment out | B6 "Editing a payment", CP5 tests |
| L2-I2 "today" labels that contradict L1-I1's default | Accepted. The card says "Across all expenses and payments."; the text's header has no date and notes future-dated records; Copy and Share are hidden with `?on=` | B5, B9, CP4 and CP5 tests |
| L2-O1 the minimum-count test barely exercises grouping | Accepted. A planted zero-sum-groups generator against the brute force | Acceptance targets, CP3 tests |
| L2-O2 the exactness argument | Accepted. Moved into B4 with the lower bound; ADR 0006 records it | B4 "Why the count is the minimum" |
| L2-O3 the screens script's path | Accepted. `app/scripts/screens.mjs` | CP6 |
| L2-O4 the explanation of a member who left with a zero balance | Accepted. Every member of the household has one; only a non-member id is Not found | B7, CP4 tests |

### Manual external plan review (`MANUAL_EXTERNAL_PLAN_REVIEW`, revision 3 → 4)

| Finding | Disposition | Where |
| --- | --- | --- |
| M-I-1 suggestions shown when balances are known to be incomplete | Accepted. The reviewer's case was checked against the repository. `listExpenses` and `householdMembers` count unreadable records and drop them (`repository.ts`:73-79), so an unreadable expense can reverse a suggested payment. Unreadable members (`HouseholdShell.tsx`:84) are included too. The engine now returns a `complete` flag. Incomplete balances show with a notice. They get no suggestions, no Mark as paid, no "settled up", no "after this" line, and no text; `balanceText` refuses them. Record a payment stays. Open question 1 is resolved | B4 "Complete or not", B5, B6, B9, acceptance targets, CP3, CP4 and CP5 tests, ADR 0006 |
| O-EXT-1 the programme's complexity | Accepted. The recurrence is stated (`f[S]` over single-member removals, O(2ⁿ·n), never O(3ⁿ)), and so is the construction's bound. Adversarial 16-member vectors are in the performance test | B4 "The programme", "Which grouping", CP3 tests |
| O-EXT-2 future-dated wording kept consistent | Noted. It is already the plan's rule (L1-I1, L2-I2). L3-O3 extends the line to payments | B5 |
| O-EXT-3 payments kept out of spending totals | Noted. It is already the plan's rule and tests | B8, CP5 tests |

### Local plan review, round 3 (`LOCAL_MODEL_PLAN_REVIEW`, APPROVE of revision 3; optional findings folded in)

| Finding | Disposition | Where |
| --- | --- | --- |
| L3-O1 the justification for the 16 limit | Accepted. The real reach is stated: up to 50 members (`model.ts`:36), and members who left keep their balances. The fallback first takes out opposite pairs, and it is tested with members who left | B4 "Above 16", CP3 tests, ADR 0006 |
| L3-O2 an explanation's payment lines before their dialog | Accepted. CP4 tests the expense lines and CP5 the payment lines | CP4 and CP5 tests |
| L3-O3 the "dated after today" line for payments | Accepted. Both kinds are counted, with plurals, in both languages | B5, CP4 tests |
