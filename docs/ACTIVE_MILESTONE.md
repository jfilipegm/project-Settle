# Active Milestone

## Milestone

**M4 — Households, members and the expense ledger** (work item
`milestone-4`). Plan revision 4, `docs/milestones/milestone-4-PLAN.md`,
approved on 2026-10-09 (local and manual external plan reviews both
APPROVE; approval commit `ee0225d`), on `feature/milestone-4`, PR #12.
Phase `AWAITING_FUNCTIONAL_REVIEW` (implementation revision 4, technical
approval `6f18e98`).

## Next action

The implementation is approved: round 4's manual review asked only for
the completed CI (B-EXT-1), and round 5, the same content republished
with that evidence, was approved by both reviews; technical approval
`6f18e98`. Next, the functional review: test with the checklist below,
then `/accept-milestone`, or write findings for
`/apply-functional-review`.

To carry forward at acceptance (optional, from the local round 4
review, deferred so the approved content stays as reviewed):
- O-12: the `/_kit` gallery lacks `Donut`, `Bars`, `ShareBar` and the
  dialog's close button.
- O-13: in a month with seven or more categories, the donut and its
  legend can show a category's percentage a point apart.
- O-14: "The last six months" names both the card and its chart, so a
  screen reader says it twice.

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
- **Self-review of the whole M4 diff: complete.**
  - **Found and fixed:** the limit of 20 active members (H4) was kept only
    by "Add member". "Undo leaving" (or a later leaving date) and new
    members added by the save dialog could take a household past 20.
    `setMemberLeft` and `saveExpense` now check it inside their own
    transaction, against `today`, and refuse with `MemberLimitError`
    (the pages already show its message). Two repository tests cover it.
  - No other blocking or important finding: the transactions, the
    readers, the member-delete scan, the shares, the draft's isolation
    while editing an expense, and the household switch in the save
    dialog were read again.
  - Verification after the fix: `npm run check` (typecheck, lint,
    format, 86 files, 1493 passed, 1 skipped); `npm run build` and
    `check-build.mjs` pass.
- **Local implementation review, round 1: REVISE, applied.**
  - **I-1 (fixed, `3d13de7`).** "Save to a household" and "Create
    household" had no guard while their write ran, so a double press
    saved the bill twice (with two copies of any new member) or made two
    households, despite H10. Both now ignore a press while saving and
    disable their buttons. "Add member" was already safe, because it
    clears the name at once; a test now holds it to that.
  - **I-2 (fixed, `db411be`).** The 20-active-member limit (H4) was
    checked only against today, so future (or past) join dates could
    make 21 or more active on one day. `addMember`, a `setMemberLeft`
    that lengthens a membership, and the save dialog's new members now
    check the peak over every day of the membership (`peakActiveWith`).
    The repository functions no longer take `today`.
  - **O-1 (fixed, `44fa445`).** Saving an edit no longer brings back an
    expense deleted in another tab: an edit (`replacing`) requires the
    expense to still exist in its household, in the same transaction,
    else `ExpenseNotFoundError` and a message in both languages.
  - **O-2 (fixed, `2506d11`).** `transaction()` no longer cancels
    IndexedDB's abort-on-error, so a failed request can never let the
    rest commit; it reports the request's own error, the first one.
  - **O-3 (recorded here).** The file layout differs from H2/H18 without
    changing what they decide: the migration list lives in `data/db.ts`
    (no `migrations.ts`), and one `data/repository.ts` holds the three
    repositories H18 names (`households`, `members`, `expenses`), since
    the member delete and the expense save each span two or three stores
    in one transaction. The `BroadcastChannel` posts `'changed'`, not the
    household id: every open list refreshes, which is simpler and as
    cheap at this size.
  - **O-4, O-5 (not applied).** O-4: a failed migration shows the
    storage-unavailable state; the plan names no separate state, the
    version-1 data is untouched, and a reload retries. That stays as it
    is until a real migration ships (M6). O-5: the save dialog's name
    matching and the quick form keep a member chosen when the date moves
    outside their membership. The model allows it (H4), H6 already keeps
    members already on an expense, and the choice stays visible and
    editable.
  - Verification: `npm run check` (86 files, 1501 passed, 1 skipped),
    `npm run build` and `check-build.mjs` pass.

- **Implementation review, round 2: local APPROVE; manual external
  REVISE, applied.** The owner's own testing found four usability
  problems. Each was reproduced with a test that failed first.
  - **M-1 (fixed, `0cef3fb`).** A click outside a dialog didn't close it,
    so on a phone Add expense's choice could only be left by picking one.
    `Dialog` now closes on a click on the backdrop, as Cancel does. Its
    content fills the `<dialog>` box, so only the backdrop's presses land
    on the element, and a press that starts inside (selecting text) and
    ends outside keeps it open. Closing the save dialog this way keeps
    the draft.
  - **M-2 (fixed, `731866c`).** On an expense's page, its edit page and a
    new expense no household tab was current. Every page under
    `/expenses` now keeps Expenses current, and under `/members`
    Members.
  - **M-3 (fixed, `26695f1`).** Expense rows showed a date, a
    description, a category, a payer and an amount with nothing saying
    which was which. From 640 px the lists (Expenses and the overview's
    latest) have column headings, Date, Description, Category, Paid by
    and Amount, as the canvas's desktop table always had. At phone
    width, where a header row can't line up with the two-line rows, the
    date has a calendar icon and the payer a visible "Paid by". Each
    row's link is named with every value and its label ("Date 5 Oct,
    Description Kitchen shelves, Category Household, Paid by João,
    Amount 69,99 €"), in English and Portuguese ("Data", "Descrição",
    "Categoria", "Pago por", "Valor").
  - **M-4 (fixed, `8aea2bd`).** "Split a bill" from a household opened
    the split on Who had what. It now opens on Receipt, with the
    household's active members already the bill's people, so the receipt
    can be read or uploaded first.
  - **Optional findings of the local round 2 (O-6 to O-8): not applied.**
    O-6 (the add form's "full" counts only today): the repository refuses
    any day over 20 with the right message, and a form-side any-day
    check would need the join date chosen first; nothing wrong is ever
    written. O-7 (a refused add clears the typed name) predates this
    round and only costs retyping one name. O-8 (state, not ref, as the
    double-press guard) is correct for discrete events; no change
    without a failing case.
  - Design canvas, version 29: the "As shipped in M4" board has the new
    screenshots (overview, expenses, an itemised expense, the overview
    dark, and both desktop boards), and the navigation map says "Split a
    bill" opens on Receipt, an expense's pages stay under Expenses, and a
    click outside closes a dialog. The drawn household boards needed no
    change: their desktop table already had the headings.
  - Verification: `npm run check` (86 files, 1508 passed, 1 skipped);
    `npm run build` and `check-build.mjs` pass (343,772 bytes of fonts,
    131,652 for a first view, no gallery); `node scripts/screens.mjs`:
    14 screens, 84 checks, 0 problems (no sideways scroll at 360 px,
    every Tab stop in reading order with the focus ring), and the
    evidence screens are replaced with this run's.

- **Implementation review, round 3: local APPROVE; manual external
  REVISE, applied.** The owner's own testing asked for three changes.
  Each change has tests; the fixes are bugs or gaps reproduced in the
  code first.
  - **M-5 (done, `26316be`).** An expense replaced the list with its own
    page, and nothing on it led back. It now opens in a dialog
    (`?expense=:eid`) over the page it came from, the Expenses list or
    the overview, rendered once by `HouseholdShell`, so the list keeps
    its month, filters and scroll. Closing (Close, Escape, the backdrop)
    goes Back when a row opened it, so the browser's Back closes it too;
    opened directly, it drops the parameter. Edit returns to the dialog;
    Delete closes it and the row goes. The dialog draws each member's
    share as one bar above the shares list. The kit's `Dialog` gains an
    optional close button beside the title (the first focus, so a long
    dialog opens at its top), and Escape in a dialog opened from another
    closes only that one (a test that failed first).
    **Departure from the plan's route table:**
    `/households/:hid/expenses/:eid` (CP3) is kept for links, saves and
    bookmarks but now lands on the Expenses list with that expense open,
    rather than a page of its own. Its edit page is unchanged.
  - **M-6 (done, `67dbd16`).** The backdrop mixed in `--color-ink`,
    near-white in the dark theme, so every dialog laid a pale veil over
    the page. A new `--color-scrim` is a near-black at 0.28 (light) and
    0.5 (dark) opacity.
  - **M-7 (done, `b5d9119`).** The overview draws "Day by day" (each
    day's spending as bars), "Where it went" as a donut beside the
    category list, now its legend with a percentage for each, and "The
    last six months" (this month emphasised, each bar opening its
    month), on top of the figures, never instead of them. The charts are
    kit components (`ui/Charts.tsx`: `Donut`, `Bars`, `ShareBar`; inline
    SVG and CSS, no library), fed by `features/household/charts.ts`,
    built on the same totals as the numbers. Eight categorical chart
    tokens per theme, the data-visualisation reference palette in its
    validated order, checked for colour-vision deficiency on the card in
    both themes; a category keeps its hue month to month, Other and a
    donut's folded rest are neutral. Each chart is one image named by a
    text alternative with every value. A month with nothing draws none.
    Not drawn: "Who paid" and balances (M5).
  - **The local round 3's optional findings.** O-9 (stale headers in the
    bundle's request and results) is fixed in this round's bundle; O-10
    and O-11 are fixed in `26316be`; the missing overview-headings test
    is in `overviewCharts.test.tsx`.
  - Changes to existing tests: the household suites find an expense by
    its dialog (`role="dialog"`, named by the description) where they
    found its `h1`; the history's row helper matches the `?expense=`
    link; the overview's "Where it went" rows now include the
    percentage. Their other assertions are unchanged.
  - Design canvas, version 30: the "As shipped in M4" board has this
    round's screenshots (the overview with its charts and an expense's
    dialog, at both widths, light and dark), and the navigation map says
    an expense opens over the list it came from. `docs/DESIGN.md`: the
    scrim, the chart tokens and rules, `Donut`, `Bars`, `ShareBar` and
    the dialog's close button.
  - Verification: `npm run check` (90 files, 1550 passed, 1 skipped);
    `npm run build` and `check-build.mjs` pass (343,772 bytes of fonts,
    131,652 for a first view, no gallery); `node scripts/screens.mjs`:
    15 screens, 90 checks, 0 problems; Impeccable: the CSS clean, the
    screens only M3's reasoned finding (a `cramped-padding` on the bar
    plot's baseline was found and fixed); ux-lint: the same 36 findings
    from M3's six reasoned rules, none on a household screen.

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

M4, round 1 (implementation revision 4, technical approval `6f18e98`).
Write each finding, with the flow number, to
`.ai-review/milestone-4/feedback/FUNCTIONAL_REVIEW.md`. Every amount is
exact to the cent: shares that don't add up to the expense, a total
that differs from its expenses, or anything lost is a finding.

### Setup

1. `npm --prefix app ci`, then `npm --prefix app run build`.
2. Desktop: `npm --prefix app run preview` and open the address it
   prints. Phone: `npm --prefix app run preview -- --host`, then open the
   `Network:` address on the phone, on the same Wi-Fi.
3. Keep the site's data from M3 for flow 1 (a bill in progress, theme,
   language, region). Households are new, so there are none yet.
4. Use one browser profile throughout: households live in this
   browser's IndexedDB, on this device only (until M6).

### Test data

- A household "Flat" with four people: Ana, João, Marta, Rui.
- Quick expenses across this month and the two before it, in at least
  three categories (rent, groceries, eating out), some paid by someone
  who isn't in the split.
- A receipt for flow 7: `app/src/features/receipt/fixtures/browser/sample-1.jpg`
  (or any receipt with a QR code), and a small typed bill.

### Flows and expected results

1. **Nothing lost from M3.** Open the app. *Expected:* the bill in
   progress, theme, language and region are as you left them. Household
   shows "No households yet" and "New household".
2. **Create a household.** New household → "Flat", add four people →
   Create household. *Expected:* its Overview opens, with Overview,
   Expenses and Members tabs. Reopening the Household tab later goes
   straight back to "Flat". A second household appears in the list and
   the header's switch moves between them.
3. **Members.** On Members: add "Bea" with a joining date; rename Rui;
   mark Marta as left (the date can't be before she joined), then undo
   it; delete Bea. *Expected:* each change shows at once and survives a
   reload. Once someone is in an expense, Delete is refused with the
   reason and offers "Mark as left" instead.
4. **Quick expense, each method.** Add expense → Quick expense, four
   times: 30,00 € Equally among three; 10,00 € By shares 2:1:1; 25,00 €
   Exact amounts; 100,00 € By percentage 50/30/20. *Expected:* each
   person's share previews as you type; exact amounts and percentages
   say what is left or too much, and Save is refused until they add up.
   Shares always sum to the amount (10,00 € equally among three is
   3,34 + 3,33 + 3,33). Someone outside the split can be "Who paid?".
5. **An expense in its dialog.** On Expenses, open an expense.
   *Expected:* a dialog over the list, with the amount, date, category,
   who paid, a bar of the shares and the list of shares. Close, Escape,
   a click on the dim backdrop and the browser's Back each close it,
   back to the same list with its filters. The backdrop is a light dim
   in both themes, not a white veil. A copied link to an open expense
   opens it over Expenses.
6. **Edit and delete.** From the dialog: Edit → change the amount →
   Save expense. *Expected:* back in the dialog with the new amount.
   Delete asks first; Escape on the question cancels only the question;
   confirming closes the dialog and the row is gone.
7. **Itemised expense from a split.** Overview → Add expense → Split a
   bill. *Expected:* a split starts with the household's active people.
   Scan or type the bill, assign items, then "Save to a household" on
   The split: choose who each person is (or "Add as a new member"), who
   paid, what, when and the category. *Expected:* the expense shows its
   items and who shares each; the split starts fresh after saving.
   Saving the same scanned receipt again warns "This receipt looks
   already saved", with "Save anyway" and "Open that expense".
8. **Edit an itemised expense.** Open it → Edit items. *Expected:* the
   split opens with a banner; change an item → Save changes updates the
   expense; Cancel changes nothing. A split you had in progress
   elsewhere is untouched.
9. **Overview and its charts.** On Overview, this month. *Expected:*
   "{amount} shared across {count} expenses"; Day by day (bars on the
   days with spending); Latest expenses; Where it went (a donut beside
   the category list, each with its colour, percentage and amount,
   the percentages adding up to 100); The last six months (bars, this
   month marked). The figures agree with the Expenses tab. Tapping a
   month's bar opens that month; Previous and Next walk the months. A
   month with nothing in it shows no chart. A category keeps its colour
   from month to month.
10. **History and filters.** On Expenses: filter by Person, then
    Category, then search a word from a description, an item name or a
    category (accents and case don't matter). *Expected:* month groups,
    newest first, each with its total, and the count. The filters stay
    in the address and survive a reload; "Clear the filters" resets
    them.
11. **Archive and restore.** Members → Archive household. *Expected:*
    it leaves the list, everything kept; Archived → Restore brings it
    back unchanged.
12. **Portuguese.** Settings → Language → Português, then walk flows 2
    to 10. *Expected:* everything in European Portuguese, including
    the charts' titles ("Dia a dia", "Onde foi o dinheiro", "Os
    últimos seis meses"), the dialog's Fechar and "Despesa não
    encontrada". Note any wording that is wrong, Brazilian or awkward.
    Plurals read right with 1 and 2 or more. No English left.
13. **Phone and desktop, both themes.** At 360 px and on a desktop, in
    light and dark. *Expected:* nothing scrolls sideways; the charts
    fit their cards; the expense dialog fits the phone; text is
    readable on every chart colour.
14. **Keyboard.** Tab through the Expenses list, open an expense with
    Enter. *Expected:* focus starts on Close and stays in the dialog;
    after closing, focus is somewhere sensible on the list. Each chart
    bar that links is reachable and named.

### Known limitations (not findings)

- Data lives only in this browser on this device until M6 (sync and
  backup); clearing site data deletes it.
- Balances, "who owes whom" and settling up are M5.
- The charts' hover detail is the browser's own tooltip; every value is
  also in the figures beside them.
- The three optional findings above (O-12 to O-14).

<!--
This file is `workflow_state.FUNCTIONAL_CHECKLIST_PATH`. It is
repository-local state: workflow-manager generates it once at bootstrap and
never overwrites it on update.
-->
