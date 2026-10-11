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
  - Design canvas: updated on 2026-10-10 with the user's go-ahead
    (version 31): an "As shipped in M5" board (16 screenshots), the
    Balances tab at phone width in light and dark, the navigation map
    (Balances drawn, Record a payment and the explanation), and the
    chart-tip note on the M4 board.

## Implementation review

- **Round 1, local:** REVISE. I-1, the canvas, is fixed (above). The
  optional findings are applied: the Portuguese 360 px pass (O-1), the
  "paga a" wording recorded in `docs/DESIGN.md` (O-2), and the share-bar
  tip check (O-3).
- **Round 2:** local APPROVE; manual external REVISE, only for B-EXT-1
  (completed CI not shown). No code changed. All required checks are
  green on `cb215e7` and `53aae66`, with the run IDs in the bundle's
  `TEST_RESULTS.md`; the round was republished as same content
  (`53aae66`).
- **Round 3:** local APPROVE and manual external APPROVE. Technical
  approval `fc6f337` (2026-10-11). Optional findings carried forward:
  check payment content in the repository when M6 adds import, and keep
  the exact-versus-fallback wording accurate in product copy.

## Next action

Manual functional review: the checklist below. Then `/accept-milestone`,
or `/apply-functional-review` for findings.

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

M5, round 1 (implementation revision 2, technical approval `fc6f337`).
Write each finding, with the flow number, to
`.ai-review/milestone-5/feedback/FUNCTIONAL_REVIEW.md`. Every amount is
exact to the cent. A balance that doesn't follow from the expenses and
payments, balances that don't add up to zero, a suggested payment that
doesn't clear them, or anything lost is a finding.

### Setup

1. `npm --prefix app ci`, then `npm --prefix app run build`.
2. Desktop: `npm --prefix app run preview` and open the address it
   prints. Phone: `npm --prefix app run preview -- --host`, then open the
   `Network:` address on the phone, on the same Wi-Fi.
3. Keep the browser data from M4 for flow 1: its households open in a
   database that this version upgrades on first load.
4. Use one browser profile throughout. Everything lives in this
   browser's IndexedDB, on this device only (until M6).

### Test data

A new household, "M5 test", with three people: Ana, João, Marta. Add two
quick expenses, both dated this month:

- 90,00 €, paid by Ana, Equally among Ana, João and Marta (30,00 each);
- 30,00 €, paid by Marta, Equally among João and Marta (15,00 each).

The expected balances are Ana +60,00, João −45,00 and Marta −15,00.
They add up to zero.

### Flows and expected results

1. **Nothing lost from M4.** Open an M4 household. *Expected:* every
   member and expense is as it was, and the month totals and charts are
   unchanged. There are now four tabs: Overview, Expenses, Balances,
   Members.
2. **The Balances tab.** In "M5 test", open Balances. *Expected:* "Settle
   up in 2 payments." The rows are Ana, Gets back, +60,00 (Paid 90,00);
   João, Owes, −45,00; Marta, Owes, −15,00 (Paid 30,00). The amounts use
   a true minus sign. Under Settle up: "João pays Ana 45,00 €", then
   "Marta pays Ana 15,00 €", each with Mark as paid. Record a payment,
   Copy as text and (where the browser offers it) Share are there too.
3. **Explaining a balance.** Tap Ana's row. *Expected:* "Ana’s
   balance", "Paid 90,00 · Share 30,00 · Sent 0,00 · Received 0,00",
   the 90,00 expense with "+60,00", and "Balance +60,00". Tap that
   line: the expense opens in its dialog. Back or Escape returns to the
   explanation, and "All balances" returns to the tab. Do the same for
   Marta: her two lines, +15,00 and −30,00, sum to −15,00.
4. **Mark as paid, whole.** Mark as paid on "Marta pays Ana".
   *Expected:* the dialog opens with From Marta, To Ana, 15,00 and
   today's date. The line under the fields reads "After this, Marta is
   settled up and Ana gets back 45,00 €" (or similar). Save payment:
   the dialog closes and the tab now says "Settle up in 1 payment."
   with "João pays Ana 45,00 €". Marta reads Settled up.
5. **Mark as paid, partial.** Mark as paid on "João pays Ana", then
   change the amount to 20,00. *Expected:* the outcome line changes as
   you type, to "João owes 25,00 €" and "Ana gets back 25,00 €". Save:
   the suggestion becomes "João pays Ana 25,00 €".
6. **Record a payment, and its errors.** Record a payment: the dialog
   opens empty. Save straight away; then choose Ana in both From and
   To; then enter 0 or leave the amount empty. *Expected:* each error
   shows next to its field ("Choose who paid and who received.",
   "Choose two different people.", the amount's message) and nothing is
   saved. Pressing Save twice quickly never makes two payments. A note
   over 80 characters is refused.
7. **Paying more than owed.** Record João paying Ana 40,00. *Expected:*
   the outcome line says Ana owes and João gets back; once saved, the
   suggestion turns the other way (Ana pays João 15,00 €). Keep this
   payment for flow 9, then delete it.
8. **Payments in the history.** Open Expenses. *Expected:* the payments
   sit among the expenses by date, with an exchange icon and "João paid
   Ana", styled apart from the expenses. The month's total and count
   are expenses only (120,00 € across 2 expenses), as are the overview's
   "shared" line and charts. Filter by Person = Marta: her payment and
   expenses show. A Category filter hides the payments. A search for
   "Marta", or for a word in a payment's note, finds the payment.
9. **A payment in its dialog.** Open a payment. *Expected:* From, To,
   amount, date and note, with Edit and Delete. Edit: the dialog is
   filled in. Lowering an amount shows the outcome of the new amount
   alone, not the old amount added on top. Save. Delete: "Delete this
   payment? The balances change back."; confirming removes it and the
   balances return. Close, Escape, a click on the backdrop and Back each
   return to the list.
10. **Balances on a date.** On Balances, set "Balances on" to a day
    before the payments. *Expected:* the balances are as they were that
    day, and "These are the balances on {date}. Show all." appears.
    Settle up, Mark as paid, Record a payment, Copy and Share are
    hidden. The date is in the address and survives a reload; Show all
    clears it. Explanations follow the date. A date after today typed
    into the address (`?on=`) is ignored.
11. **Records dated after today.** Add an expense dated next month.
    *Expected:* without a date set, the balances include it and a line
    says "Includes 1 expense dated after today." Delete it afterwards.
12. **Settle-up text.** Copy as text, then paste it somewhere.
    *Expected:* "M5 test, balances", then one line per person ("Ana
    gets back 25,00 €", "João owes 25,00 €"), then "To settle up, 1
    payment:" and the payment, in the region's money format. "Copied."
    is announced. On the phone, Share opens the share sheet, and
    cancelling it is not an error.
13. **The overview's balances card.** Open Overview. *Expected:* a
    balances card with each person's balance, "Across all expenses and
    payments.", the settle-up line and Details (which opens Balances).
    The card shows the same balances whichever month the overview is
    on. A household with no expenses and no payments has no card.
14. **Everyone settled.** Record João paying Ana 25,00. *Expected:*
    "Everyone is settled up." on the tab, on the card and in the copied
    text. Everyone reads Settled up, and there are no payments to
    suggest.
15. **Members and payments.** Add Rui, record Rui paying Ana 5,00,
    then try to delete Rui on Members. *Expected:* refused, because
    he's on a payment ("…is on expenses or payments…"), with "Mark as
    left" offered instead. Delete that payment: now Rui can be
    deleted. Mark Marta as left: while her balance is zero she
    isn't listed on Balances. If she leaves with a balance, she is
    listed with "Left on {date}" and still appears in From/To as
    "Marta (left)".
16. **The chart notes (M4's follow-ups).** On an M4 household's
    Overview. *Expected:*
    - In "The last six months", the month on screen isn't a link; the
      other months are.
    - Every bar lightens on hover, and its value shows at once in a tip
      above the bar. This holds on both bar charts, the donut and the
      expense dialog's share bar. There is no second, delayed browser
      tooltip.
    - On the phone, tapping a bar that isn't a link shows its tip, and
      tapping elsewhere hides it.
    - The donut and its legend show the same percentage for each
      category.
17. **Keyboard.** Tab to a bar chart. *Expected:* the whole chart is one
    Tab stop. The arrow keys, Home and End move between bars, each
    showing its tip; Enter on a linked month opens it. In the payment
    dialog, focus starts inside and stays there; after Save, "Payment
    recorded." is announced and focus lands somewhere sensible.
18. **Portuguese.** Settings → Language → Português, then walk flows 2
    to 14. *Expected:* everything in European Portuguese, including
    Saldos, Recebe / Deve / Contas certas, "Acertar contas em 2
    pagamentos.", Marcar como pago, Registar um pagamento, Saldos a,
    and "João paga a Ana" (no article: see `docs/DESIGN.md`,
    "Languages"). Plurals read right with 1 and with 2 or more. No
    English is left. Note any wording that is wrong, Brazilian or
    awkward.
19. **Phone and desktop, both themes.** At 360 px and on a desktop, in
    light and dark, in both languages. *Expected:* the four tabs fit,
    nothing scrolls sideways, the payment dialog fits the phone, and
    chart tips stay inside their card.

### Known limitations (not findings)

- Data lives only in this browser on this device until M6 (sync and
  backup); clearing site data deletes it. Export is M6.
- Payments are only written down. Settle doesn't move money and sends no
  reminders. "Mark a period as settled" is out of scope.
- Above 16 people with a non-zero balance, the suggestion may use more
  than the fewest payments (at most one fewer than the number of
  people). See ADR 0006.
- How the page behaves with records that can't be read (no suggestion,
  the notice) is covered by automated tests: a damaged record can't be
  made from the app.
- The optional findings carried forward (Implementation review, above).

<!--
This file is `workflow_state.FUNCTIONAL_CHECKLIST_PATH`. It is
repository-local state: workflow-manager generates it once at bootstrap and
never overwrites it on update.
-->
