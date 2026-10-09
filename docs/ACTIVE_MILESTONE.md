# Active Milestone

## Milestone

None active. The last milestone, M3 — Design foundations (work item
`milestone-3`), is `MILESTONE_COMPLETE`, accepted on 2026-10-09.

## Next action

Plan **M4 — Households, members and the expense ledger**
(`docs/ROADMAP.md`) with `/milestone-plan`: turn one-off bills into a
household's running expense history, built on M3's design system and in
both languages.

Before planning, and after the user merges PR #10 (M3) into `master`
(see CLAUDE.md, "Git and GitHub workflow"): run
`git switch master && git pull && git switch -c feature/milestone-4`.
After the first commit, open the M4 PR.

## Last completed: M3 — Design foundations

Settle has one design system and speaks English and European
Portuguese. Behaviour, storage formats and the split's arithmetic are
unchanged.

- **CP1:** slate/rust tokens for light and dark, six people colours,
  three bundled fonts and Tabler icons, all from Settle's own origin;
  the roadmap renumbered (M3 inserted, households now M4).
- **CP2:** one typed catalogue (`en.ts`, `pt.ts`) with no library, the
  Language setting (`settle.language`, separate from Region), and a
  compiler-API guard against literal interface text.
- **CP3:** the component kit (`app/src/ui/`) and a development-only
  gallery at `/_kit`, absent from production builds.
- **CP4:** the new shell (tab bar on a phone, header menu from 640 px),
  Home, Settings and a Household placeholder (`/finances` redirects).
- **CP5:** the split in three steps in the URL (Receipt, Who had what,
  The split), The split beside the items from 1024 px, and person-first
  assignment.
- **CP6:** the quality pass (screens at 360/390/1440 px in both themes,
  keyboard pass, design checkers, request checks), `docs/DESIGN.md`,
  ADR 0004, notices and READMEs.

Verification:
- `npm run check` (typecheck, lint, format, 70 test files: 1378 passed,
  1 skipped), `npm run build` and `check-build.mjs` (14 same-origin
  fonts, 131,652 bytes for a first view; no gallery) pass; evidence in
  `docs/milestones/milestone-3-evidence/`.
- `app`, `workflow-conformance` and `pr-title` are green on GitHub
  (PR #10).
- Implementation review: revision 1 local REVISE (one important, four
  optional findings, all fixed); revision 2 local APPROVE, manual REVISE
  (CI evidence only), then round 3 local and manual APPROVE; technical
  approval `2cfcad3`.
- Functional review: round 1 checklist `80f9cc3`; no findings were
  written; the user accepted the milestone on 2026-10-09.

Carried forward (not blockers):
- **The literal-text guard's remaining forms** (R2-O1): a ternary or a
  template with substitutions in a label attribute, a parenthesised or
  `as` literal, and a kit `label` prop still pass it; nothing in `src/`
  uses them today. Harden it when M4 adds screens.
- A Ctrl/⌘-click on a split step link leaves a harmless focus request
  pending (R3-O2); skip `onSelect` for modified clicks if it gains other
  uses.
- Recent splits, the running "so far" total and a segmented Tabs
  component appear on the design canvas for later milestones (M4 on).
- **The M2.5 iPhone checks** (Lockdown Mode on and off for the site)
  are still not run; suggest them at the next real-phone testing (M7,
  the PWA and deployment).
- From M2.5: the 94 % reading aim (more real receipts, then perhaps the
  opt-in "enhanced reading"), remembering the user's corrections, and
  receipts from other countries.

## Current blockers

None.

## Active plan

None. M3's plan is archived at
`docs/milestones/completed/milestone-3-PLAN.md` (M0's, M1's, M2's,
M2's remediation child's and M2.5's are in the same folder).

## Functional review checklist

None. M3's round-1 checklist is in commit `80f9cc3`.

<!--
This file is `workflow_state.FUNCTIONAL_CHECKLIST_PATH`. It is
repository-local state: workflow-manager generates it once at bootstrap and
never overwrites it on update.
-->
