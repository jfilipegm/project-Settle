# Active Milestone

## Milestone

M0 — Project foundation (work item `milestone-0`, product, governing
workflow version `2.1`). Phase: `IMPLEMENTING`.

## Goal

An empty but deployable app skeleton with tooling in place, so M1 (bill
splitter) can start straight on product code: the web app builds and runs
locally and in CI and shows a placeholder home page; lint, format check,
type check and unit tests run in CI and pass; money is handled as integer
cents through one shared, tested module.

## Current checkpoint

None in progress. Next: `M0-CP5` (CI workflow, web manifest, developer README).

| Checkpoint | Status | Verified state |
|---|---|---|
| M0-CP1 — Stack ADR + Vite/React/TS scaffold in `app/` | Complete | `npm ci && npm run build` pass from `app/` (Node 24.21.0, npm 12.1.0, TypeScript 6.0.3, Vite 8.3.1). `npm run dev` served the placeholder page. ADR at `docs/adr/0001-web-app-tech-stack.md`. |
| M0-CP2 — Quality tooling | Complete | `npm run check` (typecheck, lint with `--max-warnings=0`, format:check, test) passes, both in the working tree and in a clean copy after `npm ci`; `npm run build` still passes. ESLint 10.11 + typescript-eslint 8.70, Prettier 3.9, Vitest 5.0 + jsdom 30 + Testing Library. |
| M0-CP3 — Money module | Complete | `app/src/lib/money.ts` + `money.test.ts` (144 tests). `npm run check` passes (145 tests in total). Mutation spot checks: dropping the `-0` guard, reversing the tie-break, rounding half down, truncating sub-cent input, formatting `value / 100`, disabling the lone-separator reading, and computing `allocate` in floats (quotients only, or everything) each fail at least one test. |
| M0-CP4 — App shell | Complete | React Router 8 routes (`/`, `/split`, `/finances`, `/settings`, not found) inside `Layout` (header + theme toggle, top bar ≥ 640 px, bottom tab bar with safe-area padding below it, skip link, `<main>`). `useTheme` + `public/theme-init.js` share key `project-w.theme` and the `theme-color` values. `npm run check` passes (186 tests), `npm run build` passes and copies `theme-init.js` to `dist/`. Mutation spot checks (a different colour or key or a miscased mode in `theme-init.js`, a changed `--color-surface`, a changed `index.html` meta, a wrong cycle order, a mode not stored) each fail at least one test. The manual 360/768/desktop check is deferred to the functional-review checklist, per the plan. |
| M0-CP5 — CI workflow, web manifest, developer README | Not started | — |

Implementation notes:

- TypeScript is pinned to `~6.0.2`, not the current 7.x, because
  `typescript-eslint` (CP2) supports only TypeScript `<6.1.0`. This is
  recorded in the ADR's consequences.
- ESLint's type-aware `recommendedTypeChecked` rules apply only to
  `**/*.{ts,tsx}`; plain JS (`eslint.config.js`, CP4's `public/*.js`) gets
  the untyped recommended rules. Checked with `eslint --print-config` and
  throwaway files, not only by the clean run.
- `theme.ts` reads a `theme-color` meta's scheme with
  `getAttribute('media')`, not `meta.media`: that property is missing from
  jsdom and from some older engines.
- Vitest stubs every CSS import, `?raw` included, to an empty string, so
  `tokens.test.ts` reads `tokens.css` from disk. `theme-init.test.ts` runs
  the real `public/theme-init.js` (through `?raw`) and compares its result
  with `theme.ts` for the same stored values.
- Vitest globals are off, so `src/test/setup.ts` calls Testing Library's
  `cleanup()` in `afterEach` itself.
- `formatAmount`'s `locale` option has the same `MoneyLocale` type as
  `parseAmount`'s, so the app can't format an amount in a locale it can't
  parse back.
- The plan's example large-weight `allocate` case happened to come out the
  same in float arithmetic, so it could not tell an exact implementation
  from a float one. It was replaced by two constructed cases where float
  arithmetic gives the wrong answer: a share of `k − 1/W`, and two
  remainders 1 apart that float sees as a tie. Their expected parts were
  computed separately with Python integers.

## Current blockers

None.

## Active plan

`docs/milestones/milestone-0-PLAN.md` (plan revision 2, approved).

## Functional review checklist

Empty. `/prepare-functional-review` writes the numbered checklist for the
active work item into this section; `/apply-functional-review` and
`/accept-milestone` read it back from here.

<!--
This file is `workflow_state.FUNCTIONAL_CHECKLIST_PATH`. It is
repository-local state: workflow-manager generates it once at bootstrap and
never overwrites it on update.
-->
