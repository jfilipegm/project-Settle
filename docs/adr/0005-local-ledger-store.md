# ADR 0005 — The household ledger on the device, in IndexedDB

- **Status:** Accepted
- **Date:** 2026-10-09
- **Milestone:** M4 — Households, members and the expense ledger
  (`docs/milestones/milestone-4-PLAN.md`, decisions H1 to H5, H16, H17)
- **Builds on:** ADR 0001 (the web app, no server, the CSP).

## Context

Until M4, Settle kept everything in `localStorage`: the split draft
(`settle.bill`), the receipt summary and three settings, each a small
versioned value read field by field. M4 adds the first long-lived data:
households, members and their expenses, written over months. There is no
server and no account, and no backup exists until M6's export, so the
data must survive reloads and app updates on the device alone.

## Decisions

### IndexedDB, through a small wrapper of our own (H1)

The ledger lives in IndexedDB, in a database named `settle`. Its stores
are `households`, `members` (`byHousehold`), `expenses` (`byHousehold`,
`byReceiptKey` over `[householdId, receiptKey]`) and `meta`.
`app/src/data/db.ts` wraps opening and transactions in about a hundred
lines; no library. `localStorage` is too small and synchronous for a
growing ledger, and the API we need is a handful of calls.

Every record carries `v`, its own format version. Readers
(`app/src/data/records.ts`) rebuild each record from known fields and
return it or `null`. A record a reader rejects is **never deleted or
rewritten**: it is skipped and counted, so a bug or a partial write can't
cost the user data silently.

### One transaction per user action, with the integrity checks inside it (H1)

IndexedDB has no foreign keys. `app/src/data/repository.ts` enforces one
contract inside each write's own transaction:

- **Saving an expense** runs over `households`, `members` and `expenses`.
  It re-reads the household and every member the expense names (payer,
  split members, itemised mapping), and writes only when all of them
  exist in that household. Members the save dialog adds are written in
  the same transaction.
- **Deleting a member** runs over `members` and `expenses`. It scans the
  **raw** expense records with a cursor and deletes only when it can prove
  that no expense names the member. An unreadable record of the
  household, an unknown record version or a record with no readable
  household refuses the delete; a cursor failure rejects the transaction.

IndexedDB serialises `readwrite` transactions whose scopes overlap, so a
save and a delete in two tabs can't interleave. `BroadcastChannel` only
refreshes the other tab's lists.

### A versioned schema and a tested migration runner (H2)

`app/src/data/db.ts` holds an ordered list of steps, one per database
version, run in the upgrade transaction from the stored version up. A
step that throws aborts the upgrade, and the older data stays as it was.
A newer database than the code (another tab updated Settle) and a
blocked upgrade each have their own message.

Three kinds of test guard every later change:
`app/src/data/fixtures/v1.json`, raw records as version 1 writes them,
must always read back equal; a test-only version-2 step proves the runner
upgrades with every record intact; and a failing step proves the
rollback.

### Derived, never stored (H5)

A quick expense stores its amount and its split definition; an itemised
expense stores only its bill. Shares, amounts and every total are
computed from the stored expenses each time, with M1's exactness
(`allocate`, one rounding). Leftover-cent ties in quick splits rotate by
a hash of the expense id, so nobody absorbs every cent.

### The split draft stays where it is (H16)

`settle.bill` stays the split's working copy in `localStorage`, same
format, loaded synchronously. A bill enters the ledger when the user
saves it into a household; the draft is cleared only once that write has
committed.

### When storage isn't available (H3)

Without IndexedDB, or when it can't open, the household pages show one
message and the split works as before. Settle asks the browser for
persistent storage (`navigator.storage.persist()`) when the first
household is created.

### Tests (H17)

`fake-indexeddb` (Apache-2.0, no dependencies), as a development
dependency only, gives Vitest a spec-conforming IndexedDB; each test gets
a fresh factory.

## Version 2: payments (M5)

M5 ships the database's first real migration. Version 2's step,
`createSchemaV2`, creates the `settlements` store (`keyPath: 'id'`, index
`byHousehold`) and rewrites nothing: every household, member and expense
record stays version 1, byte for byte. M4's test-only step moved to
version 3, so the runner keeps its test on top of the real step, and
`app/src/data/fixtures/v2.json` joins the version-1 snapshot.

**A payment is a record of its own, not an expense.** A settlement is
money one member gave another: it has no category, is not spending, and
never counts in a month's total or charts. Stored as an expense, every
total, chart and filter would have to tell the two apart, and an
expense's shares would have to model "all of it to one person". Kept
apart, the balances are simply what each member paid, less their shares,
plus what they sent, less what they received.

The repository treats payments as it treats expenses: each action is one
transaction that re-checks its references (the household exists, both
members belong to it), an edit never brings back a payment deleted in
another tab, unreadable payments are counted and kept, and a member named
by any payment of the household, readable or not, can't be deleted.

A failed upgrade now has its own state ("Settle couldn't update the data
on this device. Nothing was changed."), replacing the "unavailable"
message M4 showed for it (M4's O-4).

## Consequences

- Clearing the site's data deletes the ledger. Persistent storage lowers
  the risk of eviction; M6's export is the real answer.
- Every schema change adds a migration step and keeps the version-1 and
  version-2 snapshot tests passing.
- The data layer imports no React; the pages reach it through providers
  and hooks.
