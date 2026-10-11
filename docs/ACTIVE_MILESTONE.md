# Active Milestone

## Milestone

**M6 — Export, import, backup and sharing** (`milestone-6`), on
`feature/milestone-6`, PR #14. Plan revision 7 was approved on
2026-10-11 (`0bff772`). The plan is `docs/milestones/milestone-6-PLAN.md`.

## Checkpoints

- **CP1 — complete:** storage version 3.
  - `createSchemaV3` adds the `versions` store (indexed `byHousehold`)
    and writes this device's random `deviceId` into `meta`. It rewrites
    no record and creates no version entry. M5's test-only step moved
    to version 4. `fixtures/v3.json` joins `v1.json` and `v2.json`.
  - `data/versions.ts`, pure: `bump` (refused past 2^31), `join` (the
    higher count per device), `compare` (equal, newer, older,
    concurrent), and the `VersionEntry` type. `readClock` and
    `readVersion` in `records.ts`.
  - The repository: every write bumps its record's clock in its own
    transaction, which now also opens `versions` and `meta`. Deletes
    keep the version entry with `deletedAt`. A save of a deleted id is
    refused with the same error as an edit of a record deleted in
    another tab. A damaged version entry, or one of another kind or
    household, refuses the write (`VersionEntryError`).
  - Content checks in the repository (E12, M5's carried-forward
    finding): households, members, expenses and payments that their own
    readers would refuse throw `InvalidRecordError` and write nothing.
  - Change tracking (E5): the first write sets `firstUnbackedChangeAt`;
    `recordBackup` sets `lastBackupAt` and clears it only when the
    change came before the backup's snapshot.
  - Tests: the v2-to-v3 upgrade byte for byte from `v2.json` and from
    the completion scenario, the frozen `v3.json`, a failing version-3
    step, each write's bump (refused writes leave clocks untouched),
    the deletion log, deleted ids, the content checks, change tracking.
  - Existing tests: only setup changed. The v1-to-v2 tests now pin
    version 2's migrations, and the completion scenario copies its
    records raw into an older database, since today's repository writes
    version 3. No assertion changed.
- **CP2 — complete:** the Settle file.
  - `features/exchange/format.ts`: the file's types (`SettleFile`, one
    entry per household with its records and `versions`) and
    `formatFile`, the canonical writer: fixed top-level and entry key
    order, sorted record keys, records and versions sorted by id, two
    spaces, a final newline.
  - `features/exchange/readFile.ts` (E2), pure and all or nothing: 20 MB
    limit before parsing, `format`, newer versions refused, unknown
    top-level and entry keys refused, every record through the
    database's own reader, then the stricter rules (the id rule on every
    nested id, ISO timestamps, positions from 0 to 2^31 − 1), records in
    their household, references inside the file, duplicate ids, the
    member limits, and the version rules (one per record, deletions,
    clocks of at most 64 entries). Problems are codes naming the record
    (kind, id, name or description, date), up to five, with the total.
  - `features/exchange/migrations.ts` (E3): the ordered step list
    (empty) and its runner. `fileName.ts`: the file names, with the
    characters a file system refuses replaced by `-`; the word "backup"
    comes from the catalogue.
  - `data/exchange.ts`: `snapshotHousehold` and `snapshotBackup` in one
    read-only transaction. Records that can't be read, that the file's
    stricter rules refuse, or that name a left-out record stay out and
    are counted by reason; a household whose own record can't be read is
    left out whole. The built text must pass `readFile` before it is
    returned (`ExportCheckError` otherwise).
  - Tests: the file round trip (read back to the same canonical text,
    two exports differing only in `exportedAt`), a backup of three
    households (one archived, one nearly empty), deletions and `{}`
    clocks, the left-out records (an unreadable member named by
    readable expenses, a non-ISO `createdAt`, a position out of range, a
    clock over 64 entries, a damaged version entry), every strict-reading
    refusal, `__proto__` dropped, the migration runner with a test-only
    version 2, and the file names.
- **CP3 — complete:** the merge.
  - `data/versions.ts`: the shared clock-resolution helper
    (`resolveClock`), which owns which outcomes add 1 for this device
    (`mergeBumps`: "Keep mine", "kept for references", and either choice
    between equal clocks).
  - `features/exchange/merge.ts`, pure: `planImport` classifies every id
    of the file against this device's side, read by key (E6's table:
    nothing to decide, new, changed there, deleted there, changed here,
    conflicts that are concurrent, between equal clocks, or "gone back in
    time" under any own id; ids left alone as unreadable or used for
    something else here; records naming a left-out member). It decides
    whether Apply changes the device id (a strictly higher count under
    the current id, or an equal-clock conflict naming it). `resolveImport`
    applies the choices: each record's result and clock, members kept
    for references (also over a "Keep mine" deletion, with the override
    noted), member deletions that wait for unreadable records, the
    member limits on the result, and the counts. `useTheirsForGoneBack`
    is the restored-phone notice's bulk action.
  - `data/exchange.ts`: `prepareImport` (this device's state for every
    id in the file, and the id Apply would give it) and `applyImport`,
    one transaction over every store, `versions` and `meta` included. It
    re-reads the state and refuses if anything changed
    (`ImportChangedError`), re-runs the merge, re-checks content and
    limits, writes, changes the id with the old one in
    `formerDeviceIds`, and leaves `firstUnbackedChangeAt` alone for a
    backup that only adds households. A new household goes through the
    same path, so no separate `addHouseholdFromFile` was needed.
  - Found by the sweep and fixed: two deletions of one record with
    different `deletedAt` never converged. Merging them keeps the
    earlier time. ADR 0007 will say so.
  - **The user's decisions (2026-10-11), at the plan's stop condition
    "an edit disappears without a deletion or a choice":** the sweep found
    a restored phone's count reused at the *same* number (seed 45: the
    lost pre-restore edit; seed 39: the restored phone's new edit). Once
    another phone has merged one of the two versions, the equal-clock
    rule never sees them meet, and either can replace the other without
    a question. The user accepted both as part of E6's known limit,
    widened from "passes" to "equals or passes", to be stated in ADR
    0007. The sweep exempts and counts them. Closing it would need a
    plan amendment (counts by time, or a record of the edit that last
    set each record's content).
  - Tests: E6's table for every kind and the household record, with the
    clock each choice writes; the re-edit test; the two stale-file
    traces; crossed choices and crossed "Use theirs" reaching equal
    clocks; the gone-back-in-time traces (Keep mine and Use theirs, the
    2^31 count, an equal-content exposure, a second question); after
    the id changed; another phone taking a reused count; equal clocks
    with different content on three devices (both choices, a record
    against a deletion, a phone the clock doesn't name); restore doesn't
    roll back; references, unreadable and foreign records, limits,
    concurrency, round trips, performance; and the seeded sweep (500
    runs, three devices, 175 set back, 145 with an equal clock made on
    purpose, 824 decisions; about 30 s).
- **CP4 — complete:** sharing, opening and backup.
  - The design canvas first (version 32): Households with the backup
    reminder and Open a Settle file, Members with Share and export,
    Settings with Your data, the import preview with a conflict, and
    pick, error and done, each at phone width in light and dark. The
    navigation map now draws Open a Settle file (from Households and
    Settings' Restore from a file) and the share sheet from Members.
  - `app/handOver.ts`: the share sheet with the file where the browser
    can share files, otherwise a download through a blob link (no new
    CSP source). A cancelled share is nothing; any other share failure
    falls back to the download.
  - `pages/import/ImportPage.tsx` at `/import`: pick a file (refused
    over 20 MB before reading), the strict check with up to five
    problems in words, then the preview per household (new on this
    device, or the merge's counts, kept and left-out records, each
    conflict as a pair with what differs and Keep mine or Use theirs,
    the restored-phone notice with Use theirs for all of these, an
    equal-clock conflict's "same history" line, the member-limit
    reason, the changes under a disclosure). Apply is disabled until
    every conflict is decided, with the reason in a polite live region;
    Cancel writes nothing; another tab's change asks to review again.
    Done links each household.
  - The Members tab's "Share and export" card (privacy line, Share
    household file), Settings' "Your data" card (last backup, Back up
    now, Restore from a file, the restore line), and the reminder on
    Households and the Overview after 7 days of unbacked changes, with
    Later hiding it for 7 days (`settle.backupSnooze`). Records that
    stay out of a file are named before it is made, with "Make the file
    anyway". Open a Settle file is on the Households page, and Restore
    from a backup in its empty state.
  - Every new string in `en.ts` and `pt.ts`; the pure words of the
    preview in `features/exchange/words.ts`.
  - `HouseholdDataProvider` now closes a database that opens after it
    has unmounted, instead of updating state (it surfaced as unhandled
    errors in the Settings tests).
  - Existing tests: the route table lists `/import`; the Settings and
    language tests render Settings inside a router and the data
    provider, which Your data needs; the literal-text guard allows
    `AbortError`, a DOMException name.
  - Tests: the hand-over (share, download, no Web Share, cancelled,
    failed, revoked URL); open, preview, decide, Apply and Cancel; a
    backup of several households; refused files and their messages;
    nothing new; another tab's change; the share card (download, share
    sheet, cancelled, records left out); Your data; the reminder's
    timing, Later and its backup; Open a Settle file from Households;
    Portuguese with no English sentinel.
- **CP5 — complete:** CSV export.
  - `features/exchange/csv.ts`, pure: every expense and payment, oldest
    first, with Type, Date (`YYYY-MM-DD`), Description, Category, Paid
    by, To, Amount (with the currency in the header), then each
    member's share in member order (members who left included). A
    payment fills Paid by, To and Amount and leaves the shares empty.
    `pt-PT` uses `;` and a decimal comma, the others `,` and a point; no
    symbol or grouping. UTF-8 with a byte-order mark, RFC 4180 quoting,
    CRLF. A text cell starting with `=`, `+`, `-`, `@`, a tab or a
    carriage return gets a leading `'`, member names in the header too.
  - Export CSV on the "Share and export" card, handed over like the
    Settle file (`text/csv`, `Settle - Flat - 2026-10-11.csv`). The
    canvas already drew the button.
  - Tests: golden files for `pt-PT` and `en-GB` (accents, quotes, a
    newline in a note, a description starting with `=`, an itemised
    expense's shares, payments, a member who left, a member named
    `=Rui`), shares summing to each amount in both regions, formula
    escaping, amounts, and the download from the card.
- **CP6 — complete:** quality pass and documentation.
  - The two-device completion scenario (`data/exchange.completion.test.ts`):
    M5's household with five payments on A is shared to an empty B; B
    adds 3 expenses and a payment, edits one expense and deletes
    another; A edits a different expense and the same one (a conflict);
    after B→A (decided) and A→B (no question) both hold the same ledger,
    balances and suggestion, and A's backup restored onto an empty C gives
    the same ledger again. M5's scenario also round-trips byte for byte.
    The scenario's builder moved to `test/completion.ts` (setup only).
  - `screens.mjs`: the database seeded at version 3 with a record version,
    and seven new screens (the reminder; Open a Settle file: the picker,
    a conflict undecided and decided, a refused file, done, a household
    new on this device), from a file generated from the seeded household.
    27 screens, 274 checks, 0 problems, 360 px in both languages included.
  - `check-requests.mjs exchange`: opens a generated Settle file, applies
    it, shares the household file, exports the CSV and backs up, moving
    through the app's own links; 14 clean requests, no CSP violation, the
    planted leak caught. Page load and CI's three smoke steps pass too.
  - The design checkers: no finding on an M6 screen (Impeccable 6 and
    ux-lint 52, the same as M5's, all reasoned before).
    `docs/milestones/milestone-6-evidence/CHECKS.md` records it all.
  - ADR 0007 (the Settle file field by field, its validation and
    migrations, record versions, the merge rules, the restore check and
    the known limits, the user's two decisions included) and ADR 0005's
    "Version 3" section; DESIGN.md (export, import and backup, the
    conflict pair, the reminder), both READMEs and the roadmap (M6 in
    progress).
  - The design canvas (versions 33 and 34): the "As shipped in M6" board
    (the new screens at phone width in light and dark, and the preview at
    desktop width), and the navigation map's legend.
  - The plan reviews' optional points: the equal-clock line is neutral
    (local O2), the sweep now asserts that no run without a set-back
    raises a gone-back-in-time conflict (local O3), the decision
    guarantee is asserted as the plan states it (external O-EXT-1), an
    equal clock is shown as an ordinary conflict (O-EXT-2), and a failing
    sweep run prints its seed and trace (O-EXT-3). Local O1 (stale wording
    in the plan) is plan text, left for the reviews.
  - The done screen puts "Open …" on its own line.

Verification: `npm run check` passes (109 test files, 1876 passed, 1
skipped). `npm run build` and `check-build.mjs` pass; the screens check
(27 screens, 0 problems), the privacy checks (page load, exchange) and
CI's three smoke steps pass locally in Brave.

## Last completed: M5 — Balances and settling up

Settle tells a household who owes whom, exactly, and makes settling up
one press away. Balances are derived from the ledger each time and are
never stored.

- **CP1:** the chart notes and M4's follow-ups:
  - a kit tip shows a mark's value at once (hover, a tap, keyboard
    focus);
  - each bar chart is one Tab stop with roving focus, and the roles are
    fixed (L1-I2);
  - the month on screen isn't a link;
  - M4's O-12 to O-14 are done;
  - the literal-text guard is hardened (R2-O1).
- **CP2:** payments (`Settlement`) and the database's first real
  migration, version 2, which adds the `settlements` store and rewrites
  nothing. A failed upgrade has its own state (O-4). A member named by a
  payment can't be deleted. ADR 0005.
- **CP3:** the balances engine (`features/household/balances.ts`, pure):
  - balances in integer cents, as of a date or over every record, with
    `complete` (M-I-1);
  - the fewest payments, exact up to 16 non-zero balances and above
    that a fallback;
  - explanations, and the payment dialog's outcome;
  - ADR 0006.
- **CP4:** the Balances tab, with Settle up and Mark as paid, Record a
  payment, and balances on a date. Also the payment dialog with its
  "After this…" line, each member's explanation, and the overview's
  balances card. With unreadable records the app fails closed.
- **CP5:** payments in the Expenses history and in their own dialog
  (edit, delete), and the settle-up text to copy or share.
- **CP6:** the completion scenario with payments across the real
  version-1 to version-2 upgrade, the screens check (20 screens), the
  design and privacy checks, the docs and the design canvas
  (version 31).
- **Review rounds:** the design canvas updates, the Portuguese 360 px
  pass, the "paga a" wording and the share-bar tip check (round 1);
  completed CI evidence (round 2's manual review).

Verification:
- `npm run check` passes: typecheck, lint, format and 96 test files
  (1703 passed, 1 skipped). `npm run build` and `check-build.mjs` pass.
- The screens check: 20 screens, 204 checks, 0 problems; evidence in
  `docs/milestones/milestone-5-evidence/`.
- `app`, `workflow-conformance` and `pr-title` are green on GitHub
  (PR #13).
- Implementation review: round 1, local REVISE, fixed. Round 2: local
  APPROVE, then manual REVISE, only for the CI evidence. Round 3, the
  same content: local and manual APPROVE. Technical approval `fc6f337`.
- Functional review: round 1 checklist `e63f550`; no findings were
  written; the user accepted the milestone on 2026-10-11.

Carried forward (not blockers):
- From M5's reviews:
  - check a payment's content in the repository, not only in the form,
    once M6's import writes records without the form;
  - keep the exact-versus-fallback wording accurate in product copy:
    the fewest payments up to 16 non-zero balances; above that, at most
    n − 1 payments.
- From M5's roadmap entry: "Mark a period as settled" (Useful, not
  built).
- From M4: the add-member form's "full" counts only today, while the
  repository refuses any day over 20 (O-6).
- Backup, export and sync, without which browser storage can be
  evicted: M6.

From M3 and earlier, still open:
- A Ctrl/⌘-click on a split step link leaves a harmless focus request
  pending (R3-O2); skip `onSelect` for modified clicks if it gains other
  uses.
- Recent splits and the running "so far" total appear on the design
  canvas for later milestones.
- **The M2.5 iPhone checks** (Lockdown Mode on and off for the site)
  are still not run; suggest them at the next real-phone testing (M7,
  the PWA and deployment).
- From M2.5: the 94 % reading aim (more real receipts, then perhaps the
  opt-in "enhanced reading"), remembering the user's corrections, and
  receipts from other countries.

## Current blockers

None.

## Active plan

`docs/milestones/milestone-6-PLAN.md` (revision 7). M5's plan is
archived at `docs/milestones/completed/milestone-5-PLAN.md`.

## Functional review checklist

None. M5's round-1 checklist is in commit `e63f550`.

<!--
This file is `workflow_state.FUNCTIONAL_CHECKLIST_PATH`. It is
repository-local state: workflow-manager generates it once at bootstrap and
never overwrites it on update.
-->
