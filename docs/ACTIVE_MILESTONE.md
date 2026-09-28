# Active Milestone

## Milestone

None active. The last milestone, M1 — Bill splitter (manual entry) (work
item `milestone-1`), is `MILESTONE_COMPLETE`, accepted on 2026-09-28.

## Next action

Plan **M2 — Receipt upload and built-in parsing** (`docs/ROADMAP.md`)
with `/milestone-plan`: upload a photo or PDF of a receipt and get the M1
item list filled in automatically, in the browser.

Before planning, and after the user merges PR #4 (M1) into `master` (see
CLAUDE.md, "Git and GitHub workflow"): run
`git switch master && git pull && git switch -c feature/milestone-2`.
After the first commit, open the M2 PR.

## Last completed: M1 — Bill splitter (manual entry)

Split a bill correctly with items typed in by hand; M2's receipt parsing
fills in this editor:

- **CP1:** `money.ts` grows `allocateExact`, `percentOf` and a
  multi-currency `parseAmount` (EUR, GBP, USD); the Region setting
  (locale and currency, default `pt-PT` / `EUR`) on the Settings page.
- **CP2:** the split engine (`app/src/features/split/`): `validateBill`,
  `computeSplit` in exact BigInt rationals with three rounding points,
  per-person totals that always add up to the bill total, and the text
  export.
- **CP3:** the bill reducer and the local draft (one saved bill per
  device).
- **CP4:** the Split page: people and payer, items with shared
  assignees and custom shares, tax/tip/discount, "Who owes what" with
  breakdowns, settle-up and "Copy as text", and inline validation.
- **CP5:** the root `README.md`, the `app/README.md` updates, the home
  page's "Split a bill" link, and an end-to-end test of a 12-item bill
  for 3 people.

Verification:
- `tsc -b`, `eslint . --max-warnings=0`, `prettier --check .`,
  `vitest run` (378 tests) and `npm run build` pass.
- `app`, `workflow-conformance` and `pr-title` are green on GitHub
  (PR #4).
- Implementation review: round 1 REVISE (B-EXT-1, B-EXT-2 fixed), round
  2 APPROVE; technical approval `163f344` (implementation revision 2).
- Functional review: checklist evidence `5c00e07`; the user accepted the
  milestone.

Carried forward (not blockers):
- Plan Open questions 1 and 3 keep their defaults: the discount is
  always split in proportion to what each person had, and percentages
  are taken from the items subtotal.
- Invalid text typed in a field is lost when the Region changes.
- In a breakdown, one item's shares across people can differ from its
  price by a cent or two; each person's total is exact.
- Not in M1: receipt reading (M2/M3), multiple payers, negative line
  items, currency conversion, image/PDF export, bill history.

## Current blockers

None.

## Active plan

None. M1's plan is archived at
`docs/milestones/completed/milestone-1-PLAN.md` (M0's at
`docs/milestones/completed/milestone-0-PLAN.md`).

## Functional review checklist

None. M1's checklist (implementation revision 2) is in commit `5c00e07`.

<!--
This file is `workflow_state.FUNCTIONAL_CHECKLIST_PATH`. It is
repository-local state: workflow-manager generates it once at bootstrap and
never overwrites it on update.
-->
