# Active Milestone

## Milestone

**M5 — Balances and settling up** (`milestone-5`), on
`feature/milestone-5`, PR #13. Plan revision 4 was approved on
2026-10-10 (`bc85333`). The plan is `docs/milestones/milestone-5-PLAN.md`.

## Checkpoints

- **CP1 — complete:** the chart notes and M4's follow-ups.
  - A kit tip shows a mark's value at once: on hover for all four
    charts, on a tap of a mark that isn't a link, and on keyboard focus
    of a bar. `title` and SVG `<title>` are gone.
  - Each bar chart is one Tab stop with roving focus (arrows, Home,
    End). Every bar has the same hover, focus and tip style.
  - Bar charts are named groups (by their card's heading on the
    overview, O-14), described by a summary, with named marks. Nothing
    focusable sits under `aria-hidden` or `role="img"` (L1-I2).
  - "The last six months": the month on screen is a plain mark named
    "this month"; only the other months link.
  - The donut and its legend share one set of percentages (O-13).
  - The `/_kit` gallery shows the charts and a dialog's close button
    (O-12).
  - The literal-text guard now also catches ternaries, templates with
    substitutions, parenthesised, `as` and fallback literals in a label
    attribute, and a kit `label` prop (R2-O1). No existing hit.
  - Design canvas: the chart tip is noted on the "As shipped" board in
    CP6, with the rest of M5's canvas work.
- **CP2 — complete:** payments, the record and its storage.
  - `Settlement` (`model.ts`) with `settlementContentErrors` and
    `validateSettlement`; `readSettlement` (`records.ts`).
  - The database's first real migration: version 2 (`createSchemaV2`)
    adds the `settlements` store and rewrites nothing. M4's test-only
    step moved to version 3. `fixtures/v2.json` joins `v1.json`.
  - The repository: `listSettlements`, `getSettlement`, `saveSettlement`
    (references re-checked in its transaction; an edit never revives a
    payment deleted elsewhere), `deleteSettlement`. `deleteMember` also
    refuses for a payment, readable or not.
  - A failed upgrade has its own state, "Settle couldn't update its
    data", with Reload and the split (O-4). The member-delete messages
    now say "expenses or payments".
  - ADR 0005, "Version 2: payments".
- **CP3 — complete:** the balances engine (`features/household/balances.ts`,
  pure).
  - `balances`: paid − share + sent − received per member, in integer
    cents, as of a date or over every record (future-dated ones counted
    and counted out). It carries `complete` and the unreadable counts
    (M-I-1).
  - `suggestSettlements`: the most zero-sum groups by the O(2ⁿ·n)
    programme (`zeroSumGroups`, up to 16), each settled greedily, so the
    count is the minimum. Above 16, opposite pairs come out first.
    Deterministic tie-breaks by member order.
  - `explainBalance` (newest first, summing to the balance) and
    `paymentOutcome`, the dialog's "after this" line (an edit without
    itself, L2-I1; `null` on incomplete balances).
  - Tests: a 2000-household property sweep (zero sum, cleared, the
    minimum by brute force up to 8, order independence, explanations,
    dates), the planted-groups generator, the 13 hand-checked examples,
    the grouping rule, the over-16 fallback with members who left, and
    the budgets (1000 expenses and 200 payments, adversarial 16-member
    vectors).
- **CP4 — complete:** the Balances tab, recording a payment, explanations.
  - A fourth tab, Balances (pt: Saldos), at `/households/:hid/balances`:
    each member's balance ("Gets back", "Owes", "Settled up", the signed
    amount, "Paid …", "Left on …"), "Settle up in N payments" with each
    payment's Mark as paid, Record a payment, and "Balances on" a past
    date (`?on=`, which hides the actions). The "dated after today" line
    counts both kinds.
  - The payment dialog (`SettlementForm`): From, To (those who left
    last), Amount, Date, Note, and "After this, Tiago owes 7,65 and Ana
    is settled up." before saving. Errors by field, a double-press guard,
    a failed save keeps the input, "Payment recorded." announced.
  - Incomplete balances fail closed (M-I-1): a notice, figures only, no
    suggestion, no Mark as paid, never "Everyone is settled up" (zero
    readable balances read "No balance"), the dialog shows the notice in
    place of its outcome, and the overview card has no settle-up line.
  - The explanation page `/households/:hid/balances/:mid`: the sums, the
    lines by month (an expense opens over the page), and "Balance",
    respecting `?on=`. The incomplete notice shows there too (L4-O1).
  - The overview's balances card ("Across all expenses and payments.",
    the settle-up line, Details).
  - Design canvas and the screens check: in CP6.
- **CP5 — complete:** payments in the history, and the settle-up text.
  - The Expenses tab lists payments among the expenses, by date in the
    same month groups, styled apart ("Tiago paid Ana", an exchange icon,
    the note). Month totals and counts stay expenses only. A member
    filter shows the payments they sent or received, a category filter
    hides payments, and the search matches both names and the note.
    Unreadable payments are counted there too (L4-O4).
  - A payment opens in a dialog over the page (`?settlement=`): from,
    to, amount, date, note, then Edit (the payment form, whose outcome
    leaves the original out, L2-I1) and Delete ("Delete this payment?
    The balances change back."). An explanation's payment lines open it
    too (L3-O2).
  - `balanceText.ts`: the balances and the payments as text, both
    languages, no date in the header, the "dated after today" line; it
    throws over incomplete balances (M-I-1). Copy as text ("Copied.", or
    the refusal) and Share where the browser has it; neither with
    `?on=` or over incomplete balances.
- **CP6 — complete:** quality pass and documentation.
  - The completion scenario with payments: five payments (two from the
    suggestion, one partial, one by a member who left, one edited) and
    one deleted; the balances, the suggestion and every explanation are
    equal across a reload and across the real version-1 to version-2
    upgrade (`data/completion.test.ts`).
  - `app/scripts/screens.mjs`: the ledger built at version 2 with a
    payment; five new screens; 1024 px added; a 360 px check that chart
    tips stay inside their card. 20 screens, 162 checks, 0 problems,
    after one fix: the four tabs were 12 px too wide at 360 px, so under
    400 px they take less padding and 14 px text.
  - The design checkers and the privacy checks: nothing new on any M5
    screen; page load and the sample scans pass
    (`docs/milestones/milestone-5-evidence/CHECKS.md`).
  - ADR 0006 (balances and the suggestion, with the minimum's proof and
    the over-16 fallback); `docs/DESIGN.md` (the chart tip, the four
    tabs, balances and payments); `app/README.md` (version 2 as the
    worked migration, the engine); the root `README.md`; the roadmap's
    M5 status.
  - **The design canvas is not updated yet.** Uploading the M5
    screenshots to the canvas was blocked by the session's permission
    check, so the "As shipped in M5" board, the Balances tab at phone
    width, the navigation map (Balances drawn) and the chart-tip note on
    the M4 board wait for the user's go-ahead.

## Next action

`/milestone-implement milestone-5` again: every checkpoint is complete,
so it enters the self-review, runs the full verification and generates
the implementation bundle for `/review-implementation`.

## Last completed: M4 — Households, members and the expense ledger

Settle keeps a household's shared expenses on the device. The split is
unchanged and still never opens the database.

- **CP1:** the household, member and expense model with categories;
  shares derived, never stored, exact to the cent; the IndexedDB store
  `settle` (version 1, a migration list, readers that keep what they
  can't read, one transaction per action re-checking its references);
  ADR 0005.
- **CP2:** households (create, rename, archive, restore, the last one
  remembered) and members (join and leaving dates, delete refused when
  in use); the kit's `Tabs`, `Dialog` and `Checkbox`.
- **CP3:** quick expenses split equally, by shares, by exact amounts or
  by percentage, with a payer inside or outside the split; the month
  overview.
- **CP4:** itemised expenses: "Save to a household" from the split, the
  duplicate-receipt warning, a split started from a household, and
  editing an expense's items on a copy that never touches the draft.
- **CP5:** the Expenses history: month groups with totals, filters by
  person, category and words, kept in the address.
- **CP6:** the quality pass (screens, keyboard, design checkers, privacy
  checks), the completion scenario, docs and the design canvas.
- **Review rounds:** a double-press guard on saves, the 20-member limit
  over every day of a membership, edits that can't revive a deleted
  expense (round 1); an expense opened in a dialog over its list, a
  lighter dialog backdrop, and charts on the overview (Day by day,
  Where it went, The last six months) beside the figures (round 3's
  manual review, `docs/DESIGN.md` "Charts").

Verification:
- `npm run check` (typecheck, lint, format, 90 test files: 1550 passed,
  1 skipped), `npm run build` and `check-build.mjs` pass; 15 screens,
  90 checks, 0 problems; evidence in
  `docs/milestones/milestone-4-evidence/`.
- `app`, `workflow-conformance` and `pr-title` green on GitHub (PR #12).
- Implementation review: rounds 1 to 3 each ended in REVISE and were
  fixed; round 4's manual review asked only for the pending CI; round 5, the same content, local and manual APPROVE;
  technical approval `6f18e98`.
- Functional review: round 1 checklist `42618b9`; no findings were
  written; the user accepted the milestone on 2026-10-10.

Carried forward (not blockers):
- From M4's local round 4 review:
  - O-12: the `/_kit` gallery lacks `Donut`, `Bars`, `ShareBar` and the
    dialog's close button;
  - O-13: in a month with seven or more categories, the donut and its
    legend can show a category's percentage a point apart;
  - O-14: "The last six months" names both the card and its chart, so a
    screen reader says it twice.
- From M4's earlier rounds: a failed migration shows the storage-
  unavailable state (O-4; revisit when a real migration ships, M6), and
  the add-member form's "full" counts only today, while the repository
  refuses any day over 20 (O-6).
- Balances, "who owes whom" and settling up: M5. Backup, export and
  sync, without which browser storage can be evicted: M6.

From M3 and earlier, still open:
- A Ctrl/⌘-click on a split step link leaves a harmless focus request
  pending (R3-O2); skip `onSelect` for modified clicks if it gains other
  uses.
- Recent splits, the running "so far" total and a segmented Tabs
  component appear on the design canvas for later milestones (Tabs
  shipped in M4).
- **The M2.5 iPhone checks** (Lockdown Mode on and off for the site)
  are still not run; suggest them at the next real-phone testing (M7,
  the PWA and deployment).
- From M2.5: the 94 % reading aim (more real receipts, then perhaps the
  opt-in "enhanced reading"), remembering the user's corrections, and
  receipts from other countries.

## Current blockers

None.

## Active plan

`docs/milestones/milestone-5-PLAN.md` (revision 4, approved).

## Functional review checklist

None. M4's round-1 checklist is in commit `42618b9`.

<!--
This file is `workflow_state.FUNCTIONAL_CHECKLIST_PATH`. It is
repository-local state: workflow-manager generates it once at bootstrap and
never overwrites it on update.
-->
