# Active Milestone

## Milestone

**M1 — Bill splitter (manual entry)** (work item `milestone-1`), phase
`IMPLEMENTING`. Plan revision 3, approved in commit `3720792`. Branch
`feature/milestone-1`, PR #4.

## Checkpoints

| id | name | status |
|----|------|--------|
| M1-CP1 | Money extensions + Region setting | Complete |
| M1-CP2 | Split engine | Complete |
| M1-CP3 | Bill state and local draft | Complete |
| M1-CP4 | Split page UI | Not started |
| M1-CP5 | READMEs, home page and end-to-end test | Not started |

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

## Next action

`/milestone-implement` for M1-CP4 (Split page UI).

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

Empty. `/prepare-functional-review` writes the numbered checklist for the
active work item into this section; `/apply-functional-review` and
`/accept-milestone` read it back from here.

<!--
This file is `workflow_state.FUNCTIONAL_CHECKLIST_PATH`. It is
repository-local state: workflow-manager generates it once at bootstrap and
never overwrites it on update.
-->
