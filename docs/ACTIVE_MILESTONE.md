# Active Milestone

## Milestone

**M1 — Bill splitter (manual entry)** (work item `milestone-1`), phase
`AWAITING_FUNCTIONAL_REVIEW`. Plan revision 3, approved in commit
`3720792`. Implementation revision 2, technically approved in `163f344`
(external review round 1 REVISE, then APPROVE). Branch
`feature/milestone-1`, PR #4.

## Checkpoints

| id | name | status |
|----|------|--------|
| M1-CP1 | Money extensions + Region setting | Complete |
| M1-CP2 | Split engine | Complete |
| M1-CP3 | Bill state and local draft | Complete |
| M1-CP4 | Split page UI | Complete |
| M1-CP5 | READMEs, home page and end-to-end test | Complete |

### M1-CP1 — verified state

- `app/src/lib/money.ts`: `allocateExact` (BigInt weights, no safe-sum
  limit; `allocate` now validates and delegates to it, unchanged
  behaviour), `percentOf`, the `Ratio` type, and
  `parseAmount(input, locale?, currency?)` with the symbol table
  `EUR: €`, `GBP: £`, `USD: US$ | $` (longest first). `MoneyCurrency`,
  `SUPPORTED_LOCALES` and `SUPPORTED_CURRENCIES` are exported.
- `app/src/app/region.ts` (storage, validation, `useRegion`) and
  `app/src/app/RegionProvider.tsx`. The plan named the provider file
  `region.tsx`; it was renamed because `region.ts` + `region.tsx` collide
  as one module name in the TypeScript project service. `App.tsx` wraps
  the app in the provider.
- `app/src/pages/SettingsPage.tsx`: the Region section (two labelled
  selects, a live example, the no-conversion note) and the M3
  receipt-reading line.
- Verified: `tsc -b`, `eslint . --max-warnings=0`, `prettier --check .`
  and `vitest run` (261 tests) pass.

### M1-CP2 — verified state

- `app/src/features/split/model.ts`: the `Bill` types, `LIMITS` (D14),
  `isBillRatio`, `toBillRatio` (trailing zeros stripped;
  `tooManyDecimals` past 3 significant decimals), `lineTotal`,
  `adjustmentAmount`, `displayName`, and `validateBill`. Each error is
  `{ code, field }`, and `field` names the person, item part, share,
  adjustment or payer it belongs to, for CP4's inline errors.
- `app/src/features/split/split.ts`: `computeSplit`, steps 1–7. Exact
  shares are BigInt integers already scaled by `D = T′ · lcm(Wᵢ) · n`,
  instead of the plan's internal `Fraction` type: same arithmetic, with
  no division until the one `allocateExact` call.
- `app/src/features/split/format.ts`: `resultAsText(result, region)`.
  Person names come from the result (`PersonShare.name`).
- Tests: a 1500-bill seeded property sweep against an independent
  BigInt-rational reference (every total within 1 cent, every breakdown
  line within 3 cents, the sums exact, deterministic). Deliberately
  breaking the engine's proportional or item weights makes it fail. Also
  the plan's hand-computed examples (fairness case lines included), 30
  validation cases passed straight to `computeSplit`, `toBillRatio`,
  settle-up and text export.
- Optional review findings applied here: O-9/O-EXT-2 (direct tests for
  a duplicate person id, a duplicate assignee, and 0 people or 0 items)
  and O-10/O-EXT-3 (person names are limited to 60 characters, like item
  names, under the same `limitExceeded` error).
- Verified: `tsc -b`, `eslint . --max-warnings=0`, `prettier --check .`
  and `vitest run` (318 tests) pass.

### M1-CP3 — verified state

- `app/src/features/split/billReducer.ts`: a pure reducer with every
  action the plan lists. Actions that create people or items carry
  their ids (`newId()` = `crypto.randomUUID()`, made by the
  dispatcher), so the reducer stays deterministic. New people are
  stored unnamed and shown as "Person n" (`displayName`), rather than
  storing the text "Person 3". The people count is clamped to 1–20 and
  items stop at 100. Removing a person drops their assignments and
  moves the payer to the first remaining person; the last person can't
  be removed.
- O-8 / O-EXT-1 applied: `createBill` (a fresh bill, and `newBill`)
  starts with two unnamed people and one empty item assigned to both.
  That bill is valid, so a fresh Split page shows zeros instead of a
  validation error.
- `app/src/features/split/draft.ts`: `loadDraft` rebuilds the bill from
  known fields and rejects a wrong version, a bad shape or bad
  references (via `validateBill`'s `invalidReference` errors). Range
  errors load as they are, for the editor to show. `saveDraft`
  overwrites the draft, so "New bill" replaces it with the fresh bill.
- `app/src/features/split/useBill.ts`: `useReducer` initialised from the
  draft (or a fresh bill), saved after every change.
- Verified: `tsc -b`, `eslint . --max-warnings=0`, `prettier --check .`
  and `vitest run` (361 tests) pass.

### M1-CP4 — verified state

- `app/src/pages/SplitPage.tsx` with the sections in
  `app/src/features/split/components/`:
  - People: a count stepper (1–20), name inputs ("Person n"
    placeholders), a Remove button per person, and the payer radio
    group.
  - Items: name, quantity and unit price per row, line total, Remove,
    assignee chips (`aria-pressed`) and a "Shares" disclosure with
    1–99 steppers. "Add item" focuses the new row's name.
  - Tax, tip and discount: amount or percentage each, tax and tip
    split by what each person had or equally, and D6's tax hint.
  - "Who owes what": subtotal, adjustments, total, one card per person
    with the breakdown disclosure and its rounding hint, settle-up, and
    "Copy as text" with a `role="status"` message. Validation errors
    replace the result, each linking to its field.
  - "See result" link at the top; "New bill" with `window.confirm` and
    the "saved on this device" note.
- Inputs (`inputs.tsx`) keep the typed text while it's invalid and
  only report valid, in-range values, so a typo never changes the
  result. Each shows its typed error under the field (`aria-invalid`,
  `aria-describedby`). A saved draft's out-of-range values show their
  `validateBill` error under the field instead.
- New `--color-error` token (light and both dark blocks).
- Visually hidden label prefixes keep the separating space outside the
  hidden span. Inside it, the accessible-name computation trims it
  ("Item 1Unit price"), which the tests caught.
- Checked by a headless Firefox screenshot of the production build at
  360 px: one column, nothing clipped, clear of the tab bar.
- Verified: `tsc -b`, `eslint . --max-warnings=0`, `prettier --check .`,
  `vitest run` (376 tests) and `npm run build` pass.

### M1-CP5 — verified state

- `README.md` (root, new): what project-W is, what works today (the bill
  splitter, the Region setting, themes), how to try it locally (no
  hosted version yet), privacy (browser storage only; "New bill" clears
  the bill), and the roadmap and releases.
- `app/README.md`: the layout now shows `features/split/`, the money
  section covers `parseAmount`'s currency, `allocateExact`, `percentOf`
  and the engine's three rounding points, and a new "Browser storage"
  table lists the three keys.
- `app/src/pages/HomePage.tsx`: "Coming soon." replaced by a short
  description and a "Split a bill" link (router test added).
- `app/src/pages/SplitPage.e2e.test.tsx`: a 12-item Portuguese restaurant
  receipt for Ana, Rui and Maria, typed through the UI, with shared
  items, a 2 : 1 wine share, a 10 % proportional tip and 5,00 € off.
  The totals (32,21 / 32,21 / 30,79 € of 95,21 €) were computed by hand
  with exact fractions, independently of the engine. The test also
  checks the summary, the settle-up and the copied text.
- The e2e test exposed a real accessibility defect: every item's share
  steppers had the same names. They now name the item ("Increase Ana's
  share of Vinho da casa").
- Verified: `tsc -b`, `eslint . --max-warnings=0`, `prettier --check .`,
  `vitest run` (378 tests) and `npm run build` pass.

### Implementation review

- Self-review fixes (`554d14a`): the line total can no longer throw on a
  saved draft with an out-of-range price, and people with no items get
  no zero tax or tip lines.
- External review round 1 (REVISE): B-EXT-1, an explicit timeout for the
  e2e test that timed out on CI (`0c0cf17`); B-EXT-2, "New bill" now
  resets the tax, tip and discount inputs (`9bd19f5`). Round 2: APPROVE.

## Next action

Manual functional review: the checklist below. Findings go to
`.ai-review/feedback/FUNCTIONAL_REVIEW.md`. When testing is clean, run
`/accept-milestone`.

## Last completed: M0 — Project foundation

An empty but deployable app skeleton, which M1 builds on:

- **CP1:** stack ADR (`docs/adr/0001-web-app-tech-stack.md`) and the
  Vite + React + TypeScript scaffold in `app/`.
- **CP2:** ESLint, Prettier, Vitest + Testing Library, and `npm run check`.
- **CP3:** `app/src/lib/money.ts`. Integer cents, exact BigInt
  allocation, `parseAmount`/`formatAmount` (pt-PT, en-GB, en-US).
- **CP4:** app shell. Routes, a responsive layout (bottom tab bar under
  640 px), and a light/dark/system theme with no flash on load.
- **CP5:** `app-ci.yml`, the web manifest and icons, and `app/README.md`.

Verification:
- `npm run check` (197 tests) and `npm run build` pass.
- `app` and `workflow-conformance` are green on GitHub (PR #1), which
  settled Open question 4.
- Implementation review: APPROVE, technical approval `0dbeb45`
  (implementation revision 1).
- Functional review: all nine checklist items passed (checklist evidence
  `9678a58`), and the user accepted the milestone.

User decisions at acceptance (recorded in `docs/ROADMAP.md`):
- default `pt-PT` / `EUR`, changeable by the user (added to M1);
- keep npm;
- keep path routes;
- Node from the system package.

Carried forward (optional review notes, not blockers):
- a theme change in one tab reaches other tabs only on reload;
- the manifest has a single light `theme_color` (revisit in M8);
- `app-ci.yml` runs on every push as well as on PRs.

## Current blockers

None.

## Active plan

`docs/milestones/milestone-1-PLAN.md` (revision 3). M0's plan is archived
at `docs/milestones/completed/milestone-0-PLAN.md`.

## Functional review checklist

M1 functional review, implementation revision 2. Report findings in
`.ai-review/feedback/FUNCTIONAL_REVIEW.md`: the item number, what you
did, what you saw, and what you expected.

**Setup**

- From `app/`: `npm ci`, then `npm run dev` and open
  http://localhost:5173. (Item 10 can use `npm run build && npm run
  preview` at http://localhost:4173 instead.)
- Use a Chromium browser. DevTools' device toolbar (Ctrl+Shift+M) sets
  the width.
- Start clean: in DevTools → Application → Local storage, delete
  `project-w.bill` and `project-w.region` (or use a private window).
- Amounts below are typed in the default Portuguese format (`12,50`).
  Totals are shown like `32,21 €`.

**Checklist**

1. **Home page.** Open `/`.
   *Expected:* "Coming soon." is gone. There's a short description and a
   "Split a bill" link, which opens the Split page.
2. **A fresh bill.** Open Split.
   *Expected:* two people (placeholders "Person 1", "Person 2"), one
   empty item shared by both, and "Who owes what" showing `0,00 €` for
   each person, with no error.
3. **A real 12-item receipt for 3 people** (M1's "Done when"). Click
   "+" once for 3 people, name them Ana, Rui and Maria, and leave Ana as
   the payer. Enter these items (quantity 1 unless noted), setting "Shared
   by" with the chips:

   | # | Name | Qty | Unit price | Shared by |
   |---|------|-----|-----------|-----------|
   | 1 | Bacalhau à Brás | 1 | 14,50 | Ana |
   | 2 | Bitoque | 1 | 12,90 | Rui |
   | 3 | Polvo à lagareiro | 1 | 18,50 | Maria |
   | 4 | Salada mista | 1 | 4,50 | all three |
   | 5 | Pão e azeitonas | 1 | 3,20 | all three |
   | 6 | Vinho da casa | 1 | 12,00 | Ana and Rui, **Ana's share 2** (Shares → +) |
   | 7 | Água | 1 | 2,80 | Maria |
   | 8 | Sumo de laranja | 2 | 3,20 | Rui |
   | 9 | Batatas fritas | 1 | 3,90 | Rui and Maria |
   | 10 | Arroz de tomate | 1 | 5,50 | Ana and Maria |
   | 11 | Café | 3 | 0,90 | all three |
   | 12 | Pudim | 1 | 4,20 | Ana and Rui |

   Then set Tip → Percentage `10` (by what each person had), and Discount
   amount `5,00`.
   *Expected:*
   - "Add item" puts the cursor in the new item's name.
   - The line totals show 6,40 € for item 8 and 2,70 € for item 11.
   - Items subtotal **91,10 €**, Tip 9,11 €, Discount −5,00 €, Bill total
     **95,21 €**.
   - **Ana 32,21 €, Rui 32,21 €, Maria 30,79 €**, which sum to 95,21 €.
   - Settle up: "Rui owes Ana 32,21 €" and "Maria owes Ana 30,79 €".
   - Each person's Breakdown lists their items, tip and discount, adding
     up exactly to their total, with the note about rounding within your
     total.
4. **Copy as text.** On that bill, click "Copy as text" and paste into a
   text editor.
   *Expected:* the "Copied." message appears. The text has the bill
   total, each person's total, and the two "owes" lines.
5. **Saved on this device.** Reload the page (F5).
   *Expected:* the whole bill from item 3 is still there, with the same
   result. The note under "New bill" says it's saved on this device.
6. **New bill.** Click "New bill" and choose Cancel, then click it again
   and choose OK.
   *Expected:* Cancel keeps everything. OK gives a fresh bill (item 2's
   state). The Tax, Tip and Discount fields are all empty again and
   switched back to Amount. A reload keeps the fresh bill.
7. **Fairness.** On a fresh bill, set 3 people. Add items until there
   are 10, each priced `1,00` and shared by all three.
   *Expected:* the totals are **3,34 / 3,33 / 3,33 €**, not
   3,40 / 3,30 / 3,30. In a breakdown, one item can show 0,34 € for each
   person (1,02 € in all); the rounding note explains why.
8. **Typing mistakes never change the result.** On any item with a price,
   type each of these in turn into its Unit price.
   *Expected:*
   - `12,5,0` shows "Enter an amount, like 12,50".
   - `12,505` shows "Use at most 2 decimal places".
   - `-3` shows "Can't be negative".
   - `1000000,01` shows "At most 1 000 000,00 €".
   - The field keeps what you typed and turns red, and the totals don't
     move while it's invalid.

   In Quantity:
   - `0` shows the "more than 0" message.
   - `0,0001` shows "Use at most 3 decimal places".
   - `1,0000` is accepted.
9. **Errors instead of a result.** Deselect every chip on one item; then,
   separately, set a Discount larger than the items subtotal.
   *Expected:* "Who owes what" is replaced by "Fix these to see the
   split" and a list ("Choose who shares this item", "The discount can't
   be more than the items subtotal"). Each list entry is a link that
   jumps to its field. Fixing the field brings the result back.
10. **Payer, and people with no items.** On the item-3 bill, choose Rui
    under "Who paid?". Then add a 4th person with no items.
    *Expected:* the settle-up now says Ana and Maria owe Rui. The 4th
    person pays 0,00 € with the tip "By what each person had". Switch the
    tip to "Equally": they now pay a share of the tip, and the total is
    still 95,21 €.
11. **Region.** Settings → Region: set Number format "English (UK)" and
    Currency "Pound sterling (£)".
    *Expected:*
    - The example shows `£1,234.56`, and the note says currency changes
      don't convert amounts.
    - On Split, amounts show as `£…` with `.` decimals.
    - Typing `12.50` or `£12.50` is accepted, and `€12,50` shows the
      invalid-amount error.
    - After a reload the region is kept.
    - Set it back to Portuguese / Euro when you're done.
12. **Phone, tablet and dark mode.** Device toolbar at 360 × 640, then
    768 px. Also switch the theme to Dark.
    *Expected:*
    - One column with no horizontal scrolling at 360 px.
    - Every field and button is reachable, nothing hides behind the
      bottom tab bar, and "See result" jumps to "Who owes what".
    - Error text, chips and cards stay readable in dark mode.
13. **Keyboard and screen-reader basics.** Use Tab only on the Split
    page.
    *Expected:*
    - Every input, chip, stepper button and link can be reached, with a
      visible focus ring.
    - Space toggles a chip, and a pressed chip shows a ✓.
    - Optional, with a screen reader: inputs announce e.g. "Item 1 Unit
      price", chips announce pressed or not pressed, and share buttons
      name their item ("Increase Ana's share of Vinho da casa").
14. **CI on GitHub.** Open https://github.com/jfilipegm/project-W/pull/4.
    *Expected:* `app`, `workflow-conformance` and `pr-title` are green.

**Known limitations (not findings for M1)**

- No receipt photos or OCR (M2/M3), no multiple payers, no negative line
  items (use the discount), no currency conversion, no image/PDF export,
  no bill history. There's one saved bill per device.
- The discount is always split in proportion to what each person had,
  and percentages are taken from the items subtotal. These are plan Open
  questions 1 and 3, still yours to confirm.
- Text you typed that isn't valid yet is lost when you change the Region
  (the fields reload from the saved values).
- In a breakdown, one item's shares across people can add up to a cent
  or two more or less than its price. Each person's total is exact.

<!--
This file is `workflow_state.FUNCTIONAL_CHECKLIST_PATH`. It is
repository-local state: workflow-manager generates it once at bootstrap and
never overwrites it on update.
-->
