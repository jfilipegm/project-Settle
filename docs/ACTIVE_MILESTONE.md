# Active Milestone

## Milestone

None active. M5 (Balances and settling up) was accepted on 2026-10-11;
the next roadmap milestone is **M6 — Export, import, backup and
sharing**.

## Next action

`/milestone-plan` for M6, after PR #13 (M5) is merged into `master`:
then `git switch master && git pull` and
`git switch -c feature/milestone-6`.

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

None. M5's plan is archived at
`docs/milestones/completed/milestone-5-PLAN.md`.

## Functional review checklist

None. M5's round-1 checklist is in commit `e63f550`.

<!--
This file is `workflow_state.FUNCTIONAL_CHECKLIST_PATH`. It is
repository-local state: workflow-manager generates it once at bootstrap and
never overwrites it on update.
-->
