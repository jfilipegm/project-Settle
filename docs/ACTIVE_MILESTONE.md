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

None in progress. Next: `M0-CP3` (money module); `M0-CP4` (app shell) is
also unblocked.

| Checkpoint | Status | Verified state |
|---|---|---|
| M0-CP1 — Stack ADR + Vite/React/TS scaffold in `app/` | Complete | `npm ci && npm run build` pass from `app/` (Node 24.21.0, npm 12.1.0, TypeScript 6.0.3, Vite 8.3.1). `npm run dev` served the placeholder page. ADR at `docs/adr/0001-web-app-tech-stack.md`. |
| M0-CP2 — Quality tooling | Complete | `npm run check` (typecheck, lint with `--max-warnings=0`, format:check, test) passes, both in the working tree and in a clean copy after `npm ci`; `npm run build` still passes. ESLint 10.11 + typescript-eslint 8.70, Prettier 3.9, Vitest 5.0 + jsdom 30 + Testing Library. |
| M0-CP3 — Money module | Not started | — |
| M0-CP4 — App shell | Not started | — |
| M0-CP5 — CI workflow, web manifest, developer README | Not started | — |

Implementation notes:

- TypeScript is pinned to `~6.0.2`, not the current 7.x, because
  `typescript-eslint` (CP2) supports only TypeScript `<6.1.0`. This is
  recorded in the ADR's consequences.
- ESLint's type-aware `recommendedTypeChecked` rules apply only to
  `**/*.{ts,tsx}`; plain JS (`eslint.config.js`, CP4's `public/*.js`) gets
  the untyped recommended rules. Checked with `eslint --print-config` and
  throwaway files, not only by the clean run.
- Vitest globals are off, so `src/test/setup.ts` calls Testing Library's
  `cleanup()` in `afterEach` itself.

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
