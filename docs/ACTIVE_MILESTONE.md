# Active Milestone

## Milestone

**M4 — Households, members and the expense ledger** (work item
`milestone-4`). Plan revision 4, `docs/milestones/milestone-4-PLAN.md`,
approved on 2026-10-09 (local and manual external plan reviews both
APPROVE; approval commit `ee0225d`), on `feature/milestone-4`, PR #12.
Phase `IMPLEMENTING`.

## Next action

All six checkpoints are complete. Next, `/milestone-implement
milestone-4` again: the self-review of the whole diff, the full
verification, the implementation bundle, then the local and the manual
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
- **CP3 — Quick expenses and the overview: complete.**
  - `features/household/quickForm.ts`: the form's text to an expense,
    field errors in words, a live preview of each share, and what exact
    amounts or percentages still have to place. Parsing reuses the split's
    `parseAmount`, `toBillRatio` and messages.
    `percentText` drops trailing zeros ("75 %", not "75,000 %"; found by
    its test).
  - `QuickExpenseForm`:
    - what, amount, date, category and "Who paid?", which offers anyone
      active that day, in the split or not (H6);
    - the four methods as radios, each member a checkbox with the
      method's input and their share.
  - Pages: `expenses/new`, `expenses/:eid` (amount, date, category, who
    paid, each share, Edit, Delete with a dialog) and
    `expenses/:eid/edit`.
  - Overview (H13): one month at a time (`?month=`, previous and next),
    "{amount} shared across {count} expenses", "Add expense" (a dialog
    offering Quick expense; Split a bill comes in CP4), the latest six,
    and "Where it went". `features/household/totals.ts` derives every
    total. With no active member, Add expense is disabled with a link to
    Members.
  - Categories (H8): `categories.ts` (Tabler icons) and their names in
    both languages. "Internet" is the same word in Portuguese, so it joins
    the catalogue test's named exceptions.
  - Tests: the form logic (each method, the remainders, errors in words,
    a round trip back into the form), month totals across month edges,
    and the pages end to end (each method saved, the payer outside the
    split, refusing a split that doesn't add up, edit, delete, the
    overview, the previous month, Portuguese).
- **CP4 — Itemised expenses: complete.**
  - The duplicate key (H11, M-I-1): `features/receipt/receiptKey.ts`
    (rules 1 to 3, folding, validation).
    - `toBill.ts` computes it at import, while the QR code is in hand, and
      stores it as `ReceiptSummary.receiptKey`. The store's reader keeps a
      valid key and reads an invalid one as absent; `RECEIPT_VERSION`
      stays 1.
    - One existing receipt test (`toBill.test.ts`, "uses the printed total
      without a QR") compares the whole summary. It gained the planned
      field, `receiptKey: 'm:tasca:2026-09-28:950'`; its other values are
      unchanged.
  - "Save to a household" (H10): on The split once the bill is valid. The
    dialog (`SaveToHouseholdDialog`) asks for:
    - the household: the one the split came from, the last used, or the
      only one;
    - who each person is: matched by member id, then by name ignoring case
      and accents; else "Choose", with "Add as a new member";
    - who paid: anyone, in the bill or not;
    - what, when and the category, from the receipt when there is one;
    - then the duplicate check (H11, O-EXT-1).

    The expense and any new members are written in one transaction
    (R3-O1). The draft and its receipt clear only after that commits
    (L1-O1, O-EXT-2: the text says so before saving, and Cancel changes
    nothing). Save is disabled until the household's members have loaded.
  - Splitting a bill from a household: `/split?household=:hid` (the
    overview's Add expense has a "Split a bill" choice).
    - It asks before replacing a bill with content.
    - Otherwise it starts a bill of the active members, with their member
      ids as person ids (`billForMembers`), then drops the parameter.
    - With no active member it starts nothing, and Add expense is disabled
      (M-I-2). One member is a valid bill.
  - Editing items (H10, L1-O2): `/split?expense=:eid`.
    - `useBill` takes a source: the draft (the default, unchanged) or a
      working copy in memory.
    - `SplitPage` is now a wrapper around `SplitEditor`.
    - A banner offers Save changes (the same dialog, the household fixed)
      and Cancel. New bill is hidden. The receipt summary isn't the
      draft's and isn't saved.
    - Step links keep the URL's other parameters.
  - The expense page for an itemised expense: its items with who shares
    them, the shares, "Edit items", "Edit details" (the dialog) and Delete.
  - `useLoaded` now reads as loading when what it loads changes. Before,
    a household switch briefly showed the previous household's members;
    the save dialog's tests found it.
  - Tests:
    - receipt keys, and the summary store with a key, without one and with
      an invalid one;
    - saving a typed bill and a scanned one, then the duplicate warning
      and "Save anyway";
    - an unknown person and "Add as a new member"; two people refused as
      one member; a payer outside the bill;
    - the draft kept on Cancel and after a save that fails because a
      member was deleted elsewhere;
    - a split started from a household, the replace prompt answered No,
      one member and no active member;
    - editing items, with Save changes and Cancel, the draft untouched.

    The existing split suites pass unchanged (208 tests), and so do the
    receipt suites (651).
- **CP5 — History: complete.**
  - `features/household/search.ts`:
    - member: the payer, or anyone sharing the expense;
    - category;
    - search: every word of the query, case- and accent-insensitive
      (`foldText`), over the description, the receipt's merchant, item
      names, and the category's name in the current language;
    - `groupByMonth`.
  - The Expenses tab (H12):
    - the filters (Person, Category, Search) live in the URL
      (`?member=&category=&q=`, written with `replace`);
    - month groups, newest first, each with its total;
    - the result count;
    - "No expense matches these filters" with "Clear the filters";
    - the empty state;
    - the unreadable count.
  - Tests:
    - the rules on their own, including Portuguese accents and the
      category's Portuguese name;
    - the page: order and grouping, each filter, the URL on a reload, the
      search;
    - 1000 expenses render and filter within the budget: about 2 s in
      jsdom, against 15 s and 5 s;
    - the Expenses tab in Portuguese.
- **CP6 — Quality pass and documentation: complete.**
  - The completion scenario (REQ-11), `data/completion.test.ts`:
    - 4 members, 34 expenses (24 quick of all four methods, 10 itemised,
      one with its receipt summary and key);
    - João leaves, Rui joins;
    - three edits and three deletes, leaving 31 expenses.

    After a reload, after the test-only version-2 upgrade (L1-I1) and
    after a fixture round trip, every household, member, expense, share
    and month total reads back equal. The frozen v1 snapshot reads back
    equal too.
  - `scripts/screens.mjs` seeds the browser's own IndexedDB with an
    invented household, and covers 14 screens: the households list (empty
    and full), the overview, expenses, members, a new expense, an itemised
    expense and the save dialog.
    - All 28 pass 360 px, and every Tab stop has the focus ring.
    - **Found and fixed:** a date field's calendar button had no focus
      ring (the input matches neither `:focus-visible` nor `:focus`
      then); `Field.module.css` now rings it on `:focus-within`.
  - Design checkers (`milestone-4-evidence/CHECKS.md`):
    - Impeccable: the CSS is clean. On the screens, only M3's reasoned
      `repeated-container-text` remains.
      **Found and fixed:** `cramped-padding` on "Where it went" rows.
    - ux-lint: only M3's six reasoned rules, on the split's markup; no
      household screen has a finding. All 528 buttons are named.
  - Privacy:
    - page load: 12 requests, all same-origin, no CSP violation, the
      planted leak caught;
    - a scan of sample 1: clean;
    - CI's three smoke steps, run locally in Brave, behave as required.
  - Docs:
    - `docs/DESIGN.md`: Tabs, Dialog, Checkbox, date-field focus, a "The
      household" section with the categories and their icons; category
      icons are ink, not rust;
    - `app/README.md`: the ledger, adding a schema change, the test
      database;
    - the root `README.md`: what M4 adds, and the eviction caveat until
      M6;
    - `docs/ROADMAP.md`: M4 in progress, with H16's reading;
    - ADR 0005 stands as drafted.
  - The design canvas, version 28: the navigation map now has Add
    expense, Expenses and Members as shipped (M4) with their labels, and
    an "As shipped in M4" board holds 13 screenshots.
  - Verification on the final code:
    - `npm run check`: 86 files, 1491 passed, 1 skipped;
    - `npm run build` and `check-build.mjs` pass (343,772 bytes of fonts,
      131,652 for a first view, no gallery).

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
