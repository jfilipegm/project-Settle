# Active Milestone

## Milestone

None active. The last milestone, M0 — Project foundation (work item
`milestone-0`), is `MILESTONE_COMPLETE`, accepted on 2026-09-27.

## Next action

Plan **M1 — Bill splitter (manual entry)** (`docs/ROADMAP.md`) with
`/milestone-plan`. Its scope now includes the user-changeable Region
setting (locale and currency, default `pt-PT` / `EUR`).

Before planning, and after the user merges PR #1 (M0) into `master` (see
CLAUDE.md, "Git and GitHub workflow"): run
`git switch master && git pull && git switch -c feature/milestone-1`.
After the first commit, open the M1 PR.

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

None. M0's plan is archived at `docs/milestones/completed/milestone-0-PLAN.md`.

## Functional review checklist

Empty. `/prepare-functional-review` writes the numbered checklist for the
active work item into this section; `/apply-functional-review` and
`/accept-milestone` read it back from here.

<!--
This file is `workflow_state.FUNCTIONAL_CHECKLIST_PATH`. It is
repository-local state: workflow-manager generates it once at bootstrap and
never overwrites it on update.
-->
