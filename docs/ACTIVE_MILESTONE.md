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
- **CP2 — not started:** the Settle file.
- **CP3 — not started:** the merge.
- **CP4 — not started:** sharing, opening and backup.
- **CP5 — not started:** CSV export.
- **CP6 — not started:** quality pass and documentation.

Verification: `npm run check` passes (98 test files, 1732 passed, 1
skipped).

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
