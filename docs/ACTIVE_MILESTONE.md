# Active Milestone

## Milestone

**M4 — Households, members and the expense ledger** (work item
`milestone-4`). Plan revision 4, `docs/milestones/milestone-4-PLAN.md`,
approved on 2026-10-09 (local and manual external plan reviews both
APPROVE; approval commit `ee0225d`), on `feature/milestone-4`, PR #12.
Phase `IMPLEMENTING`.

## Next action

Implement the remaining checkpoints back to back (the user's choice:
reviews only after the last one), then the self-review and the
implementation reviews.

## Progress

- **CP1 — Data foundations: complete.**
  - `features/household/model.ts`: the household, member and expense
    model (H4), categories (H8), dates with "today" passed in (R2-O2),
    `validateExpense` and `expenseContentErrors`, `referencedMemberIds`.
  - `features/household/shares.ts`: `expenseShares` and `expenseAmount`
    (H5). Quick splits allocate once with the leftover-cent tie-break
    rotated by an FNV-1a hash of the expense id; itemised ones read
    `computeSplit`. Tests: M1's exactness cases and a 2000-case seeded
    property test.
  - `data/db.ts`: the `settle` database, version 1, the migration runner
    (a failing step aborts the upgrade), `versionchange`, a newer database
    (`StorageOutdatedError`), storage unavailable (H2, H3).
  - `data/records.ts`: one reader per store; a rejected record is
    counted, never deleted (H1). `readBill` is now exported from
    `draft.ts` for the itemised split; its behaviour is unchanged.
  - `data/repository.ts`: one transaction per action. Saving an expense
    re-reads the household and every referenced member inside its own
    transaction (M-I-3). Members added by the save dialog are written in
    the same transaction (R3-O1). A member delete scans the raw records
    and fails closed on anything it can't read, including a cursor
    failure (M-I-4 and the manual review's implementation note).
  - Tests (`fake-indexeddb` 6.2.5, dev only, H17): the migration tests
    with the frozen `data/fixtures/v1.json` and the value-preserving
    test-only version 2 (R2-O1), and the repository and integrity tests,
    including two connections racing a save against a delete.
  - ADR 0005 drafted (the local ledger store).
  - The literal-text guard allows `VersionError`, a DOM name compared in
    code; error classes carry no prose.
  - Checks: the new suites, the guard and `draft.test.ts` (189 passed),
    `tsc -b`, `eslint`, `prettier`.
- **CP2 — Households and members: complete.**
  - Routes (H9): `/household` opens the household used last
    (`settle.household`, an id only) or the list. `/households` is the
    list, with "New household" (a dialog: name, then people), Archived and
    Restore. `/households/:hid` holds the tabs Overview, Expenses and
    Members. `/finances` still lands on the Household tab, and an unknown
    id shows Not found. The tab bar marks Household on every
    `/households/…` page (`Layout.tsx` now sets `aria-current` itself).
  - `HouseholdDataProvider` (around the shell) opens the database lazily,
    on the first household page, so the split never touches IndexedDB. It
    has the unavailable, outdated and blocked states (H2, H3) and a
    `BroadcastChannel` refresh. `requestPersistentStorage()` runs when a
    household is created.
  - Members (H7): add (with the joining date), rename, mark as left
    (with the date, never before joining), undo leaving, delete (refused
    with the reason, and "Mark as left" offered, when the repository
    refuses). The household's rename and archive are here too.
  - The kit (H14): `Tabs`, `Dialog` (native `<dialog>`, falling back to
    the `open` attribute where `showModal` is missing, as in jsdom) and
    `Checkbox`, each tested and in the `/_kit` gallery.
  - Both languages: the new catalogue entries in `en.ts` and `pt.ts`.
    Portuguese uses neutral wording for a person ("esta pessoa"). The
    English sentinels moved to `test/portuguese.ts`, a harness change,
    with M4's words added.
  - Tests: the household pages end to end on fake-indexeddb (create, the
    redirect, Not found, archive and restore, the member actions, the
    refusal of an in-use member, the empty overview, Portuguese), and the
    kit components. The router tests for the old placeholder now check
    the storage message jsdom shows (it has no IndexedDB) and the
    Household tab on `/households/…`.
  - Design canvas: the household screens and the navigation map are
    updated in CP6, with the rest of M4's screens.

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

`docs/milestones/milestone-4-PLAN.md` (revision 4). M3's plan is
archived at `docs/milestones/completed/milestone-3-PLAN.md`.

## Functional review checklist

None. M3's round-1 checklist is in commit `80f9cc3`.

<!--
This file is `workflow_state.FUNCTIONAL_CHECKLIST_PATH`. It is
repository-local state: workflow-manager generates it once at bootstrap and
never overwrites it on update.
-->
