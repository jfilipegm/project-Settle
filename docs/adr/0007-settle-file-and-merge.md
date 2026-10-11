# ADR 0007 — The Settle file, record versions and the merge

- **Status:** Accepted
- **Date:** 2026-10-12
- **Milestone:** M6 — Export, import, backup and sharing
  (`docs/milestones/milestone-6-PLAN.md`, decisions E1 to E6, E11)
- **Builds on:** ADR 0005 (the ledger on the device: one transaction per
  action, unreadable records kept, a versioned schema).

## Context

Settle keeps everything on the device, with no account and no server.
M6 lets people own that data: back it up, move it to another phone, and
keep one household on two or more phones by passing a file between them.
The file must be documented and strictly checked, it must round-trip
exactly, and two phones that both changed a household must be able to
merge without losing a change no one chose to lose.

The user decided two things for this milestone (2026-10-11): the merge is
in scope (the roadmap listed it as "Useful"), and the file is plain JSON
with no password.

## Decisions

### One file format: the Settle file

One JSON format serves both sharing one household and backing up all of
them (`app/src/features/exchange/format.ts`).

```json
{
  "format": "settle",
  "formatVersion": 1,
  "kind": "household",
  "exportedAt": "2026-10-11T15:20:00.000Z",
  "households": [
    {
      "household": { "v": 1, "id": "…", "name": "Flat", "createdAt": "…", "updatedAt": "…" },
      "members": [ … ],
      "expenses": [ … ],
      "settlements": [ … ],
      "versions": [
        { "id": "…", "kind": "expense", "clock": { "d-7f3a…": 2, "d-91c0…": 1 } },
        { "id": "…", "kind": "member", "clock": { "d-7f3a…": 1 }, "deletedAt": "…" }
      ]
    }
  ]
}
```

Field by field:

| Field | Meaning |
| --- | --- |
| `format` | Always `"settle"`. |
| `formatVersion` | The file's own version (1 in M6), independent of the database's. |
| `kind` | `"household"` (exactly one household) or `"backup"` (every household on the device, archived included, possibly none). |
| `exportedAt` | When the file was made, an ISO timestamp. Two exports of the same data differ only here. |
| `households[]` | One entry per household, with exactly these five keys. |
| `household`, `members`, `expenses`, `settlements` | The records exactly as the database stores them (ADR 0005's record formats, `v: 1`). The file adds no field to a record. |
| `versions[]` | One entry per record (the household's own included), and one per deletion: `id`, `kind` (`household`, `member`, `expense` or `settlement`), `clock` (device id to count), and `deletedAt` for a deletion, whose record is not in the file. A record not changed since version 3 of the database has `clock: {}`. |

**Canonical.** The top level and each household entry write their keys in
the fixed order above; every record's keys are sorted; records and
versions are sorted by id; two spaces of indentation, UTF-8, a final
newline. So an export, an import into an empty database and another
export give the same bytes apart from `exportedAt` (tested on M5's
completion household, a rich household with every kind of expense, an
archived household and a backup of three).

**Names.** `Settle - Flat - 2026-10-11.json`, `Settle backup 2026-10-11.json`
(the word "backup" in the app's language), and the CSV
`Settle - Flat - 2026-10-11.csv`. Characters a file system refuses become
`-`. The type is `application/json`, so chat apps pass it on as a
document.

**Not in the file:** settings, the split draft, the receipt summary, the
last household used, and records that can't be read. Receipt images are
never stored, so there are none to export.

### Every file Settle writes opens in Settle

The snapshot (`app/src/data/exchange.ts`) reads the records and their
versions in one read-only transaction and leaves out, counting each by
reason: records that can't be read (or whose version entry can't be read,
or is of another kind or household); records whose stored values the
database's readers accept but the file's stricter rules refuse; and
readable records that name a record left out. A household whose own record
can't be read is left out whole. The user is told before the file is made
("1 record isn't in the file: 1 has a value a file can't hold. They stay
on this phone."). Left out is not deleted: a merge elsewhere keeps its own
copies. Finally the built text must pass the file's own reader, or it is
refused rather than shared.

### Reading a file, strictly

`app/src/features/exchange/readFile.ts` is pure and all or nothing: a file
with any problem is refused whole, naming up to five problems in words
("The expense “Groceries” on 3 Oct names a member who isn't in the
file.") and counting the rest. A half-imported household would be worse
than none.

- At most 20 MB, refused before parsing (the picker checks the file's size
  before reading it, too).
- `format` must be `"settle"`; a newer `formatVersion` is refused ("This
  file was made by a newer Settle. Update Settle to open it."); an older
  one runs the migrations.
- Unknown keys at the top level or in a household entry refuse the file
  (they could hold data this version would drop). Unknown keys inside a
  record are dropped by its reader, `__proto__` included.
- Every record goes through the database's own reader (`records.ts`), then
  these stricter rules: ids of 1 to 64 characters from `[A-Za-z0-9-]`, for
  record ids, device ids and every nested id (members, payers, the bill's
  people and items); ISO timestamps for `createdAt`, `updatedAt`,
  `archivedAt`, `deletedAt` and `exportedAt`; member positions from 0 to
  2^31 − 1.
- The file as a whole: every record in its household, every reference
  inside the file, no id twice, the member limits (20 active on any day,
  50 in all), one version per record, deletions only of members, expenses
  and payments and never of a record also in the file, clocks of at most
  64 entries with counts from 1 to 2^31, and a deletion's clock never
  empty.

### Versions and migrations of the file

`app/src/features/exchange/migrations.ts` holds an ordered list of steps,
like the database's: a file of version n runs every step from n up, and a
failing step refuses the file. Version 1 is the first, so the list is
empty; a test-only version 2 proves the runner. The format is a public
contract from M6 on: a later change adds a step and never reinterprets
version 1.

### Record versions (database version 3)

A merge must tell "changed here", "changed there" and "changed on both"
apart for any number of phones, and for files passed on from one phone to
the next. The plan's first revision compared each record with one stored
"base" per household. The local review showed that a second file from a
phone that hadn't opened ours could then undo our edits, or our "Keep
mine", without asking. The base was dropped for the standard version
vector:

- **The device id.** Version 3 stores a random id for this device in
  `meta` (`deviceId`, made without needing a secure context). A backup
  doesn't carry it: a phone restored from a Settle backup gets its own.
- **The `versions` store**, keyed by record id and indexed by household:
  `{ id, kind, householdId, clock, deletedAt? }`.
- **Every repository write adds 1 for this device** to the record's clock,
  in the write's own transaction: creating, renaming and archiving a
  household; adding, renaming, marking as left and deleting a member
  (members added by an expense's save included); saving and deleting
  expenses and payments. A count past 2^31 is refused as damaged data.
- **The deletion log is the same store.** A delete removes the record and
  keeps its entry, with `deletedAt` and the clock bumped. A save never
  writes a deleted id again; only a merge restores one, when the other
  side's record is newer than the deletion.
- Records from before version 3 have no entry and read as `clock: {}`;
  "no entry" and `{}` mean the same everywhere. The upgrade rewrites no
  record and creates no entry.
- A damaged version entry, or one of another kind or household, refuses
  the write rather than starting the record's clock again.

### The merge

`app/src/features/exchange/merge.ts` is pure. Per household and per record
id it compares this device's side ("mine") with the file's ("theirs");
each is a record with its clock, a deletion with its clock, or nothing.
Clock a is **newer** than b when every count in a is at least b's and one
is higher; two clocks are **concurrent** when neither is newer and they
differ.

| Case | Result |
| --- | --- |
| Same content (records equal as canonical text, or both deleted) | Nothing to decide; the clock becomes the higher count for each device. Two deletions keep the earlier `deletedAt`, so every phone ends with the same entry. |
| Only theirs | New: added with its clock (a deletion is stored too, so a stale copy of the record can't come back). |
| Only mine | Kept. |
| Theirs newer | Changed there (restoring a record deleted here) or deleted there: taken at their clock. |
| Mine newer | Changed here: kept, nothing written. |
| Concurrent, or equal clocks with different content | A conflict, decided per record: Keep mine or Use theirs. |
| Theirs counts higher under one of this device's own ids (current or former) and the content differs | A conflict, "gone back in time", whatever the rest of the clocks say. |

**Which outcomes add 1 for this device** (owned by one helper,
`resolveClock` in `app/src/data/versions.ts`, so the rule and the code
can't drift apart): Keep mine, a member kept for references, and either
choice on a conflict between equal clocks. Taking a record, a deletion, or
a Use theirs over a concurrent or newer clock adds nothing, so the
sender's next edit is never concurrent with ours.

**What a decision guarantees.** The clock it writes is newer than or equal
to both sides, and strictly newer than the clock of every side whose
content it didn't take: Keep mine is the higher counts plus 1; a
concurrent Use theirs is the higher counts; either choice between equal
clocks is bumped; a gone-back-in-time Use theirs over a newer clock is
exactly theirs. So the other phone takes it without asking, unless it has
changed that record again meanwhile, and the content not taken never comes
back at its old clock. A stale file can't undo anything: a change made
here after the other phone's copy has a newer clock.

**References stay whole.** A member deleted on one side but named by a
record the merge keeps is kept, with the record of the side that still
has it and a bumped clock, also over a Keep mine of the deletion (the
preview says so); choosing differently for those records lets the
deletion stand. A member's deletion from the file waits while this
household has expenses or payments that can't be read. A record from the
file that names a member left out here is left out too, before the
preview. The member limits are checked on the result after every choice,
and Apply stays disabled while one is broken. Positions are kept as they
are, even when two members share one.

**Ids that aren't this household's are left alone.** For every id in the
file the merge reads this device's raw record by key in its own store,
and its version entry. If the record can't be read, belongs to another
household, or the entry is of another kind or household, the id is left
out and listed. Unreadable records are never written over or deleted.

**Apply** is one transaction over every store, `versions` and `meta`
included. It re-reads everything the preview was made from and refuses if
anything changed (another tab), re-runs the merge, re-checks content and
limits, then writes. A backup that only adds households doesn't mark a
change to back up.

### A restored phone: "gone back in time"

The rule version vectors rest on is that only this device counts under its
own id, so it always holds the highest count issued for it. That breaks
when the database comes back from an older copy with the same id: a phone
restored from an iCloud or device backup, a phone moved with its site
data, a copied browser profile. Its new edits would reuse counts other
phones have already seen, and lose to them without a prompt.

So when a file's clock gives one of this device's own ids a higher count
than this device holds for that record, the records whose content differs
become conflicts, never "changed there", and the preview says why once
("This phone seems to have been restored from an older copy…"), with Use
theirs for all of these. When the higher count is under the current id,
Apply also gives the device a new id and keeps the old one in
`meta.formerDeviceIds`, for good: no count is ever issued under it again,
and the check covers every own id, so reused counts under an old id that
the first file didn't expose are still caught. Every bump of that Apply
counts under the new id. An equal-content exposure asks nothing but still
changes the id. An equal clock naming the current id, with different
content, also changes the id (the device can't tell a reused count from
crossed choices), but is shown as an ordinary conflict, with the line
"Both versions have the same history, so Settle can't tell which is
newer.", never as a restore.

### Known limits

- **Equal or higher counts after a restore.** If a restored phone edits a
  record as many times as it had before the restore, or more, its new
  count reaches the lost one, and that record may show no sign of the
  restore. With a higher count, the restored phone's own pre-restore edit
  is replaced on the other phones without a prompt. With an equal count,
  once another phone has merged one of the two versions (so the two never
  meet at equal clocks), either can replace the other without a prompt:
  the pre-restore edit, or the restored phone's new edit. The user
  accepted both as this limit on 2026-10-11, when the merge's property
  sweep found them (seeds 45 and 39). Closing it would need counts that
  never repeat (by time, say) or a record of which edit last set each
  record's content, both changes to this format.
- **Other phones can't see a restore.** Only the restored phone knows its
  own ids. Another phone can briefly take an older version over the
  restored phone's newer edit, until the restored phone opens a file
  carrying it and is asked; its choice then spreads.
- **A copied browser profile** looks like one device until a file from one
  copy reaches the other.
- **Clocks grow** by one entry per device id that ever edited a record,
  and a new id comes from a detected restore or from an equal-clock
  conflict naming the current id, which crossed choices can also make. A
  clock over 64 entries keeps its record out of files (it stays on the
  device).
- **Crossed choices repeat.** Two phones that decide one conflict
  differently from files made before either import see it again; the
  first file opened after the other's choice ends it.
- M14's sync inherits these rules; a server could do better.

### CSV is export only

`app/src/features/exchange/csv.ts` writes every expense and payment with
each member's share, dates as `YYYY-MM-DD`, numbers in the region's form
(`;` and a decimal comma for `pt-PT`, `,` and a point otherwise), UTF-8
with a byte-order mark, RFC 4180 quoting and CRLF. A text cell starting
with `=`, `+`, `-`, `@`, a tab or a carriage return gets a leading `'`.
CSV can't be imported back: the Settle file is the exchange format.

## Consequences

- The data leaves the device only through the user's own share sheet or a
  download (a `blob:` link, no new CSP source). Nothing is uploaded; the
  privacy check drives import, share, CSV and backup on the production
  build with no request leaving the origin.
- Every write now also opens `versions` and `meta`, and costs one more
  small entry per record.
- The file format is a public contract: version 1 is documented here, and
  a change needs a migration step.
- The merge is tested case by case, by the traces the reviews named, and
  by a seeded three-device sweep of 500 runs (with set-back runs and
  equal clocks made on purpose) whose oracle tracks the true history,
  not the clocks.
