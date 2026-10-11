# Milestone 6 — Export, import, backup and sharing: execution plan (Revision 7)

- **Work item:** `milestone-6` (product, governing workflow version
  `2.2`).
- **Plan revision:** 7. Revision 2 answered the local plan review's
  round 1 (`REVISE`): it replaced the merge base with a version kept for
  each record (E4, E6). Revision 3 answered round 2 (`REVISE`): which
  merge writes bump a clock, a phone restored to an older copy, files
  Settle itself would refuse, and how the sweep converges. Revision 4
  answers round 3 (`REVISE`): the restore check keeps covering the
  device's earlier ids, and the sweep's final round repeats until it
  decides nothing. Revision 5 answers round 4 (`REVISE`): what other
  phones see of a restore they can't detect, and the sweep's properties
  scoped for set-back runs. Revision 6 answers the manual external
  review of revision 5 (`REVISE`): a conflict between equal clocks is
  now decided with a clock newer than both. It also takes the round 5
  local review's two optional wording fixes. Revision 7 answers the
  local review of revision 6 (`REVISE`): what a conflict decision's clock
  guarantees, and equal clocks reached by crossed choices, which are not
  a restore. See "Review dispositions".
- **Base commit:** `e0bb7b33d7eb58010e0ba8333cfabf04ffa79687` (the
  `master` merge of PR #13, M5; `feature/milestone-6` is cut from it).
- **Branch / PR:** `feature/milestone-6`; the PR opens after the first
  commit.
- **Registry:** `docs/ai-workflow/registry/milestone-6-registry.json`
- **Requirement mapping:** `docs/ai-workflow/requirements/milestone-6-mapping.json`
- **Artifact declarations:** `docs/ai-workflow/registry/milestone-6-artifacts.json`
- **Roadmap:** `docs/ROADMAP.md`, "M6 — Export, import, backup and
  sharing", and "Decisions and open questions", "Sharing without a
  server".
- **The user's decisions for this plan (2026-10-11):**
  - **Merge is in scope.** The roadmap lists it as Useful. The user
    chose it so that two phones can both edit one household and swap
    files without losing changes: a merge by stable record ids, with a
    preview and a choice for each conflict.
  - **The file is plain JSON, with no password.** It is readable and
    documented. The app says what is inside before anything is shared.
    Encryption can come later if real users ask for it.
- **The design canvas** (`https://claude.ai/artifact/YLBvTe9jnLx1WqUzmty6wG`)
  draws no M6 screen yet. Its navigation map shows "Export, backup" as
  planned for M6. CP4 adds the new screens to the canvas before building
  them (the user's rule: check the design on every change). The values
  this plan needs are written into the decisions below, so a reviewer
  without the canvas can check the plan.
- **How the user wants this run:** after the plan is approved, every
  checkpoint is implemented back to back, with no stop between
  checkpoints, and both implementation reviews happen once, after the
  last one (the user, 2026-10-08, kept since M3).

## Checkpoints

| id | name | depends_on | complexity | session_target |
| --- | --- | --- | --- | --- |
| CP1 | Storage version 3: record versions and the deletion log, the device id, change tracking, content checks in the repository | - | 3 | 1 |
| CP2 | The Settle file: the versioned format, the canonical writer, strict reading with friendly errors, file migrations, the household and device snapshots | CP1 | 3 | 1 |
| CP3 | The merge: version comparison by record id, conflicts, references and limits, unreadable and foreign records kept, one-transaction apply with its re-check, property tests | CP2 | 3 | 1 |
| CP4 | Sharing, opening and backup: the canvas, Share household file, Open a Settle file and the import preview, Back up and Restore, the reminder | CP3 | 3 | 2 |
| CP5 | CSV export: the region-aware spreadsheet file of expenses and payments with shares, formula-safe | CP4 | 2 | 1 |
| CP6 | Quality pass and documentation: the two-device completion scenario, screens and design checkers, privacy checks, ADR 0007, ADR 0005, DESIGN.md, READMEs, roadmap, the design canvas | CP5 | 2 | 1 |

## Goal

Make the data the user's own. They can back it up, move it to another
device, and keep one household on two or more phones by exchanging a
file, with no account and no server.

**What the user sees at the end:**

- **Share a household.** On a household's Members tab, a "Share and
  export" card offers **Share household file**. It opens the phone's
  share sheet with one `.json` file, or downloads it where the browser
  can't share files. Before sharing, the card says what the file holds
  (names, amounts, dates, descriptions, merchants) and that anyone who
  gets it can read it.
- **Open a Settle file.** From the Households page, or from Settings,
  the user picks a file. Settle checks it and shows what it would do:
  - a household that isn't on this device is **added**;
  - a household that is already here is **merged**: "3 new expenses,
    1 changed, 1 deleted, 2 new payments", plus any **conflicts**, each
    with "Keep mine" or "Use theirs";
  - nothing is written until **Apply**.
- **Back up everything.** Settings, "Your data": **Back up now** saves
  one file with every household, archived ones included. **Restore from
  a file** opens that file through the same preview. A reminder appears
  when there are changes that haven't been backed up for a week.
- **Export CSV.** The same card offers **Export CSV**: one spreadsheet
  file of a household's expenses and payments, with each member's share.
- Files from an older Settle open through migrations. A file from a
  newer Settle is refused, with "Update Settle to open this file".

**What does not change:**

- The split, the balances engine, how shares are derived, the money
  rules, the receipt reader and the parser.
- The CSP and the privacy guarantees. No new origin is added, and
  nothing is uploaded. A file leaves the device only through the user's
  own share sheet or a download.
- Records that can't be read are never rewritten or deleted, by a merge
  either (M4, H1).

## Evidence (before planning)

- **The ledger (M4, M5):** IndexedDB `settle`, version 2, with the
  stores `households`, `members`, `expenses`, `settlements` (each
  `byHousehold`) and `meta` (`data/db.ts`). The migration list has two
  steps; the database version is its length. Every record carries `v: 1`.
- **Ids:** households, members, expenses and payments have random ids
  (`crypto.randomUUID`, with a fallback outside a secure context:
  `billReducer.ts`:50-60). They are stable across devices: a merge can
  match records by id.
- **Timestamps:** households, expenses and payments carry `createdAt` and
  `updatedAt`. Members have neither (`model.ts`:56-67).
- **Member positions:** `addMember` gives the next position after the
  highest (`repository.ts`:249). Two phones adding a member at the same
  time give them the same position. Order is position, then id
  (`byMemberOrder`), so a tie is harmless to order; the badge colour
  follows the position (`PersonBadge.tsx`:9).
- **Deletes leave no trace.** `deleteExpense`, `deleteSettlement` and
  `deleteMember` remove the record (`repository.ts`:507, 619, 332).
  Without a record of the delete, a merge can't tell "deleted here" from
  "new there", and a deleted expense would come back.
- **Readers** (`data/records.ts`) rebuild each record from known fields
  and check its content (`expenseContentErrors`,
  `settlementContentErrors`). Unreadable records are skipped, counted
  and kept. They trust some fields more than an untrusted file should
  get: `readHousehold` accepts any string as `createdAt`, `updatedAt` and
  `archivedAt` (`records.ts`:62-84), and `readMember` any safe integer as
  `position` (`records.ts`:86-110).
- **Ids are keys across households.** Every store is keyed by `id`
  alone (`db.ts`:33-51), and `put` replaces whatever sits under the key.
  The `byHousehold` indexes only find records whose `householdId` reads.
- **References in saves:** `saveExpense` reads each named member with
  `readMember`, and a member that can't be read fails the whole save
  with `MissingReferenceError` (`repository.ts`:493-501).
- **Saves:** `saveExpense` and `saveSettlement` re-check references
  inside their transaction but not content. They rely on the form's
  `validateExpense`/`validateSettlement` (M5's carried-forward finding:
  "check a payment's content in the repository once M6's import writes
  records without the form").
- **Receipt images are not stored.** An itemised expense keeps the bill
  and a `receipt` summary (merchant, tax id, date, total) and a
  `receiptKey` for the duplicate warning (`model.ts`:96-120). The roadmap's
  "optionally receipt images" therefore has nothing to export.
- **Settings** live in `localStorage`: `settle.theme`, `settle.language`,
  `settle.region`. So do the split draft (`settle.bill`), the receipt
  summary and the last household (`settle.household`).
- **Region:** `pt-PT` uses a decimal comma; `en-GB` and `en-US` use a
  point (`lib/money.ts`:16-18).
- **CSP** (`app/cspMeta.ts`): `connect-src 'self'`, `img-src 'self'
  blob: data:`, `worker-src 'self' blob:`. A download through an
  `<a download href="blob:…">` and reading a picked file (`File.text()`)
  need no new source.
- **Secure context:** the phone check runs over the LAN, by `http://`,
  so `crypto.subtle`, `crypto.randomUUID` and Web Share's file sharing
  aren't there. Nothing in this plan may depend on them: there is no
  hashing (E4), and sharing falls back to a download (E7).
- **Settings page** (`SettingsPage.tsx`): Language, Theme, Region and
  Receipts cards. **Members tab** (`MembersPage.tsx`): the members, those
  who left, and a "Household" card (rename, archive).

## Decisions taken in this plan

### E1 — The Settle file

One format for every use: sharing one household and backing up all of
them.

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

- `kind` is `"household"` (exactly one household) or `"backup"` (every
  household on the device, archived included, possibly none).
- **Records are written exactly as stored**: the same fields, the same
  `v`. The file adds no field of its own to a record, so a record
  round-trips byte for byte.
- **`versions`** holds one entry for each record in the file (the
  household record included) and one for each deletion (E4). An entry
  with `deletedAt` is a deletion: no record with that id is in the file.
  A record with no version on its device yet is written with an empty
  `clock`.
- **Canonical:** keys in a fixed order, records sorted by id, two-space
  indentation, UTF-8, a final newline. Two exports of the same data
  differ only in `exportedAt`.
- **Name:** `Settle - Flat - 2026-10-11.json`. For a backup, `Settle
  backup 2026-10-11.json`. Characters a file system refuses are
  replaced by `-`. The type is `application/json`, so chat apps pass it
  on as a document.
- **Not in the file:** settings, the split draft, the receipt summary,
  the last household, and records that can't be read. Before the file is
  made, the user is told how many records stay out:
  "2 records couldn't be read and aren't in the file." Leaving a record
  out is not a delete: only a version entry with `deletedAt` deletes
  (E4).
- **Every file Settle writes opens in Settle** (round 2, I3). The
  snapshot runs the file's own checks (E2) before writing, and leaves
  out, with the unreadable ones:
  - records that name a record left out (a readable expense or payment
    naming a member that can't be read). A household whose own record
    can't be read is left out whole;
  - records whose stored values the database's readers accept but the
    file's reader doesn't (E2's stricter rules: a timestamp that isn't
    ISO, a position out of range, a clock over 64 entries). The app never
    writes such values, so only damaged data meets this rule.

  They are counted in the same line, with the reason: "3 records aren't
  in the file: 1 couldn't be read, and 2 name it." They stay on this
  device, and a merge elsewhere keeps its own copies (left out is not
  deleted). If a household file would hold nothing readable, sharing is
  refused with the reason.
- **Documented** in ADR 0007, field by field, with the validation rules
  and the migration rule.

### E2 — Reading a file, strictly

`features/exchange/readFile.ts`, pure:

- **Limits:** at most 20 MB. That is about a hundred times a busy
  household's year. Larger files are refused before parsing.
- **Shape:** `format` must be `"settle"`. A `formatVersion` above the
  one this code knows is refused: "This file was made by a newer Settle.
  Update Settle to open it." An older one goes through the file
  migrations (E3).
- **Every record** goes through the same reader the database uses
  (`records.ts`), then the same content checks. The file is also checked
  as a whole:
  - every record belongs to its household;
  - every reference resolves inside the file;
  - no id appears twice;
  - the member limits hold (20 active on any day, 50 in all);
  - ids are 1 to 64 characters from `[A-Za-z0-9-]`. This applies to
    record ids, device ids in clocks, and every id nested in a record:
    `memberId`, `personId`, `payerId`, `fromId`, `toId`, and the bill's
    people and item ids;
  - beyond the readers (Evidence), the file's reader also requires:
    - `createdAt`, `updatedAt`, `archivedAt`, `deletedAt` and the
      top-level `exportedAt` are ISO timestamps;
    - member positions are whole numbers from 0 to 2^31 − 1;
  - **versions:**
    - every record has exactly one version entry, and each entry has
      exactly one record or is a deletion;
    - `kind` is `household`, `member`, `expense` or `settlement`, and
      matches the record's kind;
    - a deletion is never of kind `household`, and its id is not also a
      record in the file;
    - a clock has at most 64 entries, each a device id and a whole
      number from 1 to 2^31;
    - a record's clock may be empty (`{}`: no version on its device yet,
      E1). A deletion's clock may not, since every delete bumps it (E4)
      (round 3, O3);
  - **top-level keys:**
    - unknown keys at the top level or in a household entry refuse the
      file (they could hold data this version would silently drop);
    - unknown keys inside a record are dropped by its reader, as in the
      database.
- **All or nothing.** A file with any problem is refused whole, with
  up to five problems named in words, for example:
  - "The expense "Groceries" on 3 Oct names a member who isn't in the
    file."
  - "The file isn't a Settle file."
  - "The file is damaged (it isn't valid JSON)."

  A half-imported household would be worse than none.
- The file's text is untrusted. Readers build new objects from known
  fields only, so unknown keys (`__proto__` included) are dropped.
  Strings are shown as text by React, never as HTML.

### E3 — Versions and migrations

- `formatVersion` is the file's version, independent of the database's.
  Version 1 is this milestone's.
- `features/exchange/migrations.ts` holds an ordered list of steps,
  like the database's (M4, H2): a file of version *n* runs every step
  from *n* up. No older file version exists yet, so the list is empty.
  As with the database in M4, a test-only next version proves the runner
  upgrades a version-1 file with every record intact. A failing step
  refuses the file.
- A record's own `v` is checked by its reader, as in the database.

### E4 — Record versions and the deletion log (database version 3)

A merge must tell "changed here", "changed there" and "changed on both"
apart for any number of phones, and for files passed on from one phone
to another. Revision 1 compared each record with one stored "base" per
household. The local review showed that a second file from a phone that
hadn't opened ours could then undo our edits, or our "Keep mine",
without asking (round 1, B1). Revision 2 drops the base. Instead it
keeps a **version** for every record: a small counter per device, the
standard version vector.

- **The device id.** Version 3 stores a random id for this device in
  `meta` (`deviceId`, made with `newId`, so no secure context is needed).
  It is created by the upgrade, or with a new database. It never leaves
  the device except inside clocks, and a backup doesn't carry it: a
  phone restored from a backup gets its own.
- **The `versions` store** (new in version 3): `{ id, kind, householdId,
  clock, deletedAt? }`, keyed by the record's id, indexed `byHousehold`.
  `kind` is `household`, `member`, `expense` or `settlement`. `clock` maps
  device ids to counts.
- **Every change bumps the clock.** Every repository write that creates,
  changes or deletes a record adds 1 to this device's count in that
  record's clock (starting from `{}`), **in the same transaction**. This
  covers:
  - `createHousehold`, `renameHousehold` and `setHouseholdArchived`;
  - `addMember`, the members `saveExpense` adds through `newMembers`,
    `renameMember`, `setMemberLeft` and `deleteMember`;
  - `saveExpense`, `deleteExpense`, `saveSettlement` and
    `deleteSettlement`.

  **A merge is the exception** (round 2, I1). It writes exactly the
  clock E6 names for each outcome, and adds 1 for this device only for
  "Keep mine", "kept for references", and either choice on a conflict
  between **equal clocks** (E6). Taking a record, a deletion or a
  "Use theirs" with a bump would make the sender's next edit concurrent
  with ours, so the same record would conflict at every exchange. Equal
  clocks are the exception, because there the higher count for each
  device is the same clock, and only a bump makes the choice newer than
  both sides (manual external review of revision 5, M-I-1).
- **The deletion log is the same store.** A delete removes the record and
  keeps its version entry, with `deletedAt` set and the clock bumped.
  Entries are kept for good. They are small (about 150 bytes), and a
  household rarely deletes thousands of records.
- **A deleted id is never written again by a save.** A save of that id
  is refused as "deleted", in the same way as an edit of a record deleted
  in another tab (M4). Only a merge restores one, when the other side's
  version of the record is newer than the deletion (E6). The restore
  turns the entry back into a record version in the same transaction.
- **Records from before version 3 have no entry.** They read as `clock:
  {}`, and get an entry the first time they change. A merge that adds a
  record arriving with `clock: {}` stores no entry for it either, so
  "no entry" and `{}` stay the same thing everywhere: in the snapshot,
  the file, the re-check and the round trip. Before M6 a household
  existed on one device only, so `{}` on two devices always means the
  same, never-edited copy from one share. Deletions made before version 3
  leave nothing behind. Those records never left their device, so
  nothing can bring them back.
- Households are archived, never deleted, so a household version never
  has `deletedAt`.
- **Only this device counts under its own id.** That is the rule version
  vectors rest on: this device always holds the highest count ever
  issued for its id. It breaks when the database comes back from an
  older copy with the same `deviceId`: a phone restored from an iCloud or
  device backup, a phone moved to a new one with its site data, or a
  copied browser profile. Its new edits would then reuse counts that
  other phones have already seen, and lose to them without a prompt
  (round 2, I2). E6 detects this ("Gone back in time") and the device
  takes a new id.
- **Earlier ids stay this device's own** (round 3, I1). When the device
  takes a new id, the old one moves to `meta.formerDeviceIds` (a list,
  kept for good) and no count is ever issued under it again. The device's
  **own ids** are its current id and every former one. A restore can
  leave reused counts under an old id that the first file didn't expose,
  so E6's check covers every own id, not only the current one. The list
  grows by one per detected restore, and by one per Apply that decides an
  equal-clock conflict naming the current id (E6), which crossed choices
  can also make. Both are rare, so it stays short (local review of
  revision 6, I2).
- **Counts are bounded.** A bump that would pass 2^31 (E2's limit) is
  refused as damaged data. Only a file naming this device's id with a
  huge count could get near it, and E6's check gives the device a new id
  first.
- **Stored records don't change.** The version lives beside the record,
  not in it. Records keep their fields and `v: 1`, and round-trip byte
  for byte (E1).

### E5 — Change tracking (also version 3)

- **Change tracking:** `meta` gains `lastBackupAt` and
  `firstUnbackedChangeAt`. Every write transaction (the writes listed in
  E4, and a merge) sets `firstUnbackedChangeAt` if it is empty. So every
  write transaction now also opens `versions` and `meta`.
- A backup clears `firstUnbackedChangeAt` and sets `lastBackupAt` (E10).
- Applying a backup file that only adds households (a restore onto a new
  phone) **does not set** `firstUnbackedChangeAt`, since that data is
  already in a backup. A change that was already waiting to be backed up
  stays waiting.
- **The upgrade** creates the `versions` store and writes `deviceId`. It
  rewrites no record and creates no version entry. It is tested from
  M5's `v2.json` fixture and from the completion scenario's data.
  Version 2 to 3 keeps every record byte for byte.

### E6 — The merge

`features/exchange/merge.ts`, pure. It compares, per household and per
record id, **mine** (this device) with **theirs** (the file). Each side
is a record with its clock, a deletion with its clock, or nothing.

**Comparing clocks.** Clock *a* is **newer** than clock *b* when every
device's count in *a* is at least its count in *b*, and one count is
higher. Two clocks are **concurrent** when neither is newer and they
differ. A newer clock has seen every change the older one has. Two
concurrent clocks each hold a change the other hasn't seen.

| Case | Result |
| --- | --- |
| Same content on both sides (records equal as canonical text, or both deleted) | **Nothing to decide.** If the clocks differ, the clock becomes the higher count for each device. |
| Only theirs has it (no record or deletion here) | **New**: added, with its clock |
| Only mine has it | **Only here**: kept (they don't have it yet) |
| Theirs is newer, a record | **Changed there**: theirs is taken (restoring it if mine is a deletion) |
| Theirs is newer, a deletion | **Deleted there**: deleted here |
| Mine is newer | **Changed here**: mine is kept, whether a record or a deletion |
| Concurrent clocks, or equal clocks with different content | **Conflict** (changed on both, deleted on one and changed on the other) |
| Theirs counts higher than mine **for one of this device's own ids** (current or former, E4), and the content differs | **Conflict**, "gone back in time", whatever the rest of the clocks say (below) |

A higher count under one of this device's own ids is an **exposure**,
whatever the content. With equal content the row is still "Nothing to
decide", but an exposure under the current id still makes Apply change
the id (below), since the device is still reusing counts (round 4, O3).

**Equal clocks with different content** come from one of two causes
(local review of revision 6, I2):
- **a reused count**: one causal history ended in two contents, after a
  restore;
- **crossed choices**: two phones each decided the same concurrent
  conflict from files made before either import, and each took the other's
  content. Both then write the higher count for each device, the same
  clock, with swapped contents. For example, X is P at `{A:2}` on A and Q
  at `{A:1, B:1}` on B; both choose "Use theirs", and A holds Q, B holds
  P, both at `{A:2, B:1}`.

A device can't tell the two apart. So when that clock names this
device's **current** id, Apply changes the id either way. The device may
be the one reusing counts, a new id costs one clock entry, and when the
cause was something else the change is harmless. The choice's bump then
counts under an id nobody has seen (manual external review of revision
5, M-I-1). An equal clock is **not** shown as a restore: the conflict is
an ordinary one, with the line "Both versions have the same history:
the phones chose differently.", and the restored-phone notice and
"Use theirs for all of these" are not shown for it. Only a strictly
higher count under an own id shows them (below).

- **"Equal"** compares canonical text, so key order never matters.
- **A stale file can't undo anything.** A record or deletion made here
  after the other phone's copy has a newer clock. So an older file is
  always "Changed here", however many times it comes back. This holds for
  any number of phones, and for files passed on from one phone to
  another.
- **Gone back in time** (round 2, I2; round 3, I1). Only this device
  issues counts under its own ids (E4), and none under a former id after
  it is retired. So a file whose clock for some record gives **one of
  this device's own ids** (current or former) a higher count than this
  device holds for that record (0 when there's nothing here) proves this
  database came back from an older copy, or was copied. Then:
  - each such record whose content differs from mine is a **conflict**,
    never "Changed there", even when their clock is newer. My edit since
    the restore may have reused a count the other phone has already
    seen;
  - an id that is only theirs is still "New". Adding is safe;
  - when the higher count is under the **current** id, Apply also gives
    this device a **new `deviceId`** in the same transaction, and moves
    the old one to `formerDeviceIds`, so every later edit counts under an
    id nobody has seen. A higher count under a former id only needs the
    conflicts: the current id was made after that restore;
  - an equal clock naming the current id, with different content, changes
    the id in the same way (the rule above the list), but is not a
    gone-back-in-time conflict: it gets neither the notice below nor
    "Use theirs for all of these";
  - **every bump this Apply writes** ("Keep mine", "kept for
    references", either choice between equal clocks) counts under the
    **new** id, never the retired one,
    which another phone may already hold at that count (round 3, O1);
  - the preview says why, once, above the gone-back-in-time conflicts
    (those with a strictly higher count under an own id): "This phone seems
    to have been restored from an older copy. Check these records: the
    file has changes this phone made before the restore." Next to it,
    **Use theirs for all of these** sets every gone-back-in-time
    conflict to "Use theirs" in one tap. Each choice stays visible and
    can still be changed (round 3, O2). This is the likely choice after
    restoring a Settle backup onto a phone that a cloud backup has just
    set back: the file is what the user wants back.

  After a decision, this device's count for the exposed id is the file's
  count (a bump in that Apply counts under the new id; local review of
  revision 6, O1).
  A later file can still hold a **higher** pre-restore count for the same
  record (B had Y at `{A:7}`, C at `{A:9}`), and then asks again. So a
  record asks again only for a count it hasn't seen. The pre-restore
  counts are finite, so the questions end (round 4, O1). The trace that needs the former
  ids: A is set back, edits Y, imports B's file (which exposes another
  record and changes A's id, but holds an older Y), then imports C's file,
  which holds a newer pre-restore Y. With the current id alone, C's Y
  would replace A's edit without a prompt. With former ids, it is a
  conflict.

  The cost is a few extra questions about records this phone didn't
  touch since the restore. That's rare, and asking is safe. A known limit
  stays (ADR 0007): if a restored phone edits a record **more** times
  than it had before the restore, its new count passes the lost one, and
  that record shows no sign of the restore. The lost edit is then that
  phone's own pre-restore edit, which the restore had already undone on
  that phone. Other phones that held that pre-restore edit take the newer
  count without a prompt.

  **Other phones can't see a restore** (round 4, I1). Only the restored
  phone knows its own ids, so only it runs the check. Another phone
  compares clocks, and a reused count loses there. For example, B takes
  A's post-restore edit of Y at `{A:5}`, then C's file brings A's
  pre-restore Y at `{A:9}`: on B that is "Changed there", and A's newer
  edit is replaced without a prompt. This is a transient, not a loss. A
  still holds its edit, and the first file A opens that carries `{A:9}`
  (from B or C) makes Y a gone-back-in-time conflict on A. A's choice is
  newer than or equal to both sides, and strictly newer than the side it
  didn't take (the guarantee under "A conflict" below), so it reaches the
  other phones at the next exchange. ADR 0007 states this limit.
- **A conflict** is decided per record, "Keep mine" or "Use theirs",
  with both versions shown in words (E8). There is no default: Apply is
  disabled until every conflict is decided.
  - **"Keep mine"** keeps my record or deletion. Its clock becomes the
    higher count for each device, plus 1 for this device. It is then
    newer than both sides.
  - **"Use theirs"** takes their record or deletion. Its clock becomes
    the higher count for each device. When the two clocks are concurrent,
    that is already newer than both. In a gone-back-in-time conflict where
    their clock is newer than mine, it is exactly their clock: the same
    record at the same clock as theirs, like "Changed there". No bump is
    needed. Another content at that clock could only come from another
    reused count, which the equal-clock rule below decides.
  - **Equal clocks** (M-I-1). When the two clocks are equal, the higher
    count for each device is that same clock, so a choice would change the
    content without a new version. A later file holding the other content
    at that clock would then ask again, and taking it would swap the
    content back. So on a conflict between equal clocks, **both** choices
    add 1 for this device, under the new id when this Apply changes it
    (E6's exposure rule above). The chosen content is kept exactly. Only
    this case bumps "Use theirs". Concurrent "Use theirs", "Changed
    there", "New" and every import without a conflict stay unbumped
    (E4). One shared clock-resolution helper in `data/versions.ts` writes
    every outcome's clock, for every record kind, the household record and
    deletions, so the exception exists in one place.
  - **What a decision guarantees** (local review of revision 6, I1).
    The clock a decision writes is newer than or equal to both sides'
    clocks, and strictly newer than the clock of every side whose content
    it didn't take:
    - "Keep mine": the higher count plus 1, strictly newer than both;
    - concurrent "Use theirs": the higher count, strictly newer than mine;
    - either choice between equal clocks: bumped, strictly newer than
      both;
    - gone-back-in-time "Use theirs" over a newer clock: equal to theirs,
      strictly newer than mine.

    So the other phone takes it without asking, unless it has changed
    that record again in the meantime, and the content not taken never
    comes back at its old clock. The shared clock-resolution helper owns
    this list of which choices bump, so the rule and the code can't drift
    apart. Two phones only see the same conflict twice
    when both decided it, differently, before seeing each other's
    choice. Open question 1.
  - **Crossed choices repeat** (round 2, I4). If both phones decide
    differently from files made before either import, each file brings
    back a conflict. For example, both choose "Use theirs" and they swap.
    This repeats only as long as both people keep deciding
    simultaneously and differently. The first file opened after the
    other phone's choice ends it, because that choice is newer. Nothing
    is lost meanwhile: both versions are shown each time. When both took
    each other's content, the next exchange meets equal clocks with
    different content: an ordinary conflict, not a restore, and the Apply
    changes the id (the equal-clock rule above).
- **The household record** (name, archived) follows the same rules.
- **Ids that aren't this household's here are left alone** (I2). For
  every id in the file, the merge reads this device's raw entry **by its
  key** in the record's own store, and in `versions`. If the raw record
  can't be read, belongs to another household, or the version entry has
  another kind or household:
  - the id is left out, with its record and any deletion of it;
  - the preview lists it: "kept as it is: it couldn't be read here", or
    "left out: this phone uses that id for something else".

  Unreadable records here are never written over or deleted, whatever
  their `householdId`.
- **A household whose own record can't be read here** is left out
  whole, with the reason.
- **References stay whole:**
  - **Kept for references.** A member deleted on one side, but named by
    a record the merge keeps, is kept. The preview says why: "Bea stays:
    she's on 2 expenses from the other phone." The kept member's clock
    becomes the higher count for each device plus 1 for this device, so
    the member is restored on the other phone at the next exchange, and
    both phones agree. The kept member takes the record of the side
    that still has it: theirs when mine is the deletion, and mine when
    theirs is (round 2, O3). This also overrides a "Keep mine" chosen
    for that member's deletion in a conflict. The line then says so:
    "Bea stays, although you chose to keep her deleted: she's on 2
    expenses you're keeping." Choosing differently for those expenses
    lets the deletion stand.
  - **Unreadable records here.** A member's deletion from the file is not
    applied while this household has expenses or payments that can't be
    read, since one of them might name the member. This is M4's rule for
    deleting a member (H7). The member is kept with its own clock (no new
    version), and the preview lists it as kept for that reason. The
    deletion applies at a later exchange, once nothing unreadable is
    left.
  - **Records that would dangle** (I3). A record from the file that names
    a member who is left out (above) is left out too, and listed: "Not
    added: it names Bea, whose record couldn't be read here." The merge
    works this out before the preview, so Apply never fails on a
    reference the preview could have known.
  - **Member limits.** The result must keep the member limits: 20 active
    on any day, and 50 in all, counting members that can't be read, as
    `addMember` does. The result depends on the conflict choices (I4), so
    the preview recomputes it, the limit check and the "kept for
    references" lines after every choice. While the chosen result breaks
    a limit, Apply stays disabled and the preview says why ("This would
    make 21 people active on 3 Oct. Choose differently, or mark someone
    as left on one phone first.").
- **Positions are kept as they are**, even when two members share one
  (Evidence). Renumbering would make the two phones differ again at the
  next exchange. Order stays position, then id. Two members may then
  share a badge colour, which a later rename can't fix. Open question 3.
- **Applying** happens in one transaction over every store the household
  uses, `versions` and `meta` included:
  - **The re-check.** It re-reads this device's records, its version
    entries and the raw entries for every id in the file, and compares
    them with the snapshot the preview was made from. If anything
    changed meanwhile (another tab), nothing is written: "Your data
    changed while you were reviewing. Review the file again.";
  - it writes the new and changed records, the deletions, and every new
    version entry;
  - it re-checks references, content (E12) and limits inside the
    transaction, as every save does;
  - the other tabs refresh through `BroadcastChannel`.
- **Importing your own file** back changes nothing. Every record and
  clock is equal, and the preview says "Nothing new in this file".
- **A household that isn't on this device** is added whole with its
  versions, after the same per-id checks.

### E7 — Sharing a household, and opening a file

- **Share household file** (Members tab, "Share and export" card,
  E9). It builds the file (E1) and calls
  `navigator.share({ files: [file] })` when `navigator.canShare` accepts
  files (phones over HTTPS). Otherwise, and on any share failure other
  than the user cancelling, it downloads the file. A cancelled share is
  not an error (M5's rule). After a share or download: "File ready.
  Send it to your housemates; they open it with Open a Settle file."
- **The privacy line** sits in the card, always visible: "The file has
  names, amounts, dates, descriptions and shop names. Anyone who gets it
  can read it."
- **Open a Settle file**: a button on the Households page (also in the
  empty state, where "Restore from a backup" is the obvious next step
  on a new phone) and "Restore from a file" in Settings. Both lead to the
  route `/import`. It shows a file input (`accept=".json,application/json"`),
  then the checks (E2), then the preview (E8).
- Opening a file by tapping it in a chat app needs the PWA's file
  handling (M7). Until then the user saves it and picks it.

### E8 — The import preview (`/import`)

- **Per household in the file**, one card:
  - a new household: "Flat: new on this device. 4 people, 37
    expenses, 5 payments." and Add;
  - a merge: "Flat: 3 new expenses, 1 changed, 1 deleted, 2 new
    payments", "Nothing new" when every record is equal, and the lines
    for kept members and records kept as they are (E6);
  - each **conflict** as a pair: "This phone: Groceries, 23,40 €,
    3 Oct, paid by Ana" and "The file: Groceries, 32,40 €, 3 Oct, paid
    by Ana". Then a choice between "Keep mine" and "Use theirs"
    (a radio pair), and a line naming what differs ("The amount
    differs");
  - the lines for records left out (E6): kept as they are, using an id
    this phone uses for something else, or naming a member who is left
    out.
- **Every choice updates the preview** (E6): the counts, the kept
  members, and the limit check. While the chosen result breaks a member
  limit, Apply is disabled and the reason is shown next to it, read out
  by screen readers (`aria-live="polite"`).
- **The changes are listed** under a disclosure ("Show the 6 changes"),
  in the history's words ("Ana paid João 15,00 €"), so the user can see
  what Apply does.
- **Apply** writes everything in the file's households at once (E6) and
  opens a result line: "Done. Flat now has 40 expenses." with "Open
  Flat". For a backup with several households, Apply covers all of them,
  and the result links each one.
- **Cancel** writes nothing.
- **Errors** (E2) show in place of the preview, with "Choose another
  file".
- The balances after a merge are whatever the merged ledger gives
  (M5's engine). No balance is stored.

### E9 — The "Share and export" card

On the Members tab, above the "Household" card: the privacy line,
**Share household file** and **Export CSV**. The Members tab already
holds the household's own management (rename, archive), so a household's
file belongs there. The canvas gets it in CP4.

### E10 — Backup, restore and the reminder

- **Back up now** (Settings, "Your data" card) builds a `backup` file of
  every household (E1). It goes to the share sheet or a download (E7),
  then sets `lastBackupAt` and clears `firstUnbackedChangeAt` (E5). The
  card shows "Last backup: 11 Oct 2026" or "No backup yet".
- **The browser can't confirm** where a download went or whether a
  share finished. So a backup counts once the file was handed over
  without an error, and the card's line says so: "Keep the file
  somewhere other than this phone."
- **Restore from a file** is Open a Settle file (E7, E8): a backup
  merges each of its households, so restoring onto a new phone adds
  everything, and restoring onto a phone with data shows the merge.
  A restore never rolls a phone back to the backup's state. Newer
  changes here stay "Changed here". The card and the preview say so
  (round 2, O2): "Restoring adds what this phone is missing. It doesn't
  undo changes made since the backup."
- **The reminder** shows on the Households page and on a household's
  Overview when `firstUnbackedChangeAt` is 7 or more days old: "Your
  changes from the last 9 days aren't backed up." with **Back up now**
  and **Later**. Later hides it for 7 days (`settle.backupSnooze` in
  `localStorage`; storage that can't be written simply shows it again).
  It never blocks anything. Open question 2 covers the 7 days.
- `navigator.storage.persist()` is still asked once (M4, H3). The
  reminder exists because a browser can still evict the data, or the
  phone can be lost.

### E11 — CSV export

`features/exchange/csv.ts`, pure, and **Export CSV** on the card (E9):
one file per household, `Settle - Flat - 2026-10-11.csv`.

- **Rows:** every expense and payment, oldest first, with the columns
  Type (Expense/Payment), Date, Description, Category, Paid by, To,
  Amount, then one column per member (in member order) with their share.
  A payment row fills Paid by, To and Amount and leaves the shares
  empty. Payments are not spending, as in M5's history.
- **Dates** are written `YYYY-MM-DD` in every region. Spreadsheets read
  that form as a date everywhere, while `3/10/2026` means different days
  in different regions.
- **Numbers follow the region** so that a spreadsheet in that region
  reads them as numbers: with a decimal comma (`pt-PT`), the separator
  is `;` and amounts read `23,40`; otherwise `,` and `23.40`. Amounts
  have no currency symbol or grouping. The currency is in the header
  ("Amount (EUR)").
- **Text:** UTF-8 with a byte-order mark (spreadsheets otherwise
  misread accents), quotes per RFC 4180, CRLF line ends. Headers and
  category names in the app's language. A cell that starts with `=`,
  `+`, `-`, `@`, a tab or a carriage return gets a leading `'`, so a
  spreadsheet never runs it as a formula (CSV injection). This covers
  every cell of user text: descriptions, notes, and member names, both
  in the rows and in the header's per-member columns. Amounts are
  numbers written by the app, never user text, so they are unaffected.
- CSV is export only. It can't be imported back: the Settle file is the
  exchange format.

### E12 — Content checks in the repository (M5's carried-forward finding)

`saveExpense`, `saveSettlement`, `createHousehold`, `addMember` and the
merge's writes check content with the same validators the readers use
(`expenseContentErrors`, `settlementContentErrors`, the name and date
rules). A record that would read back as unreadable is never written.
They throw a named error (`InvalidRecordError`) that the forms never see
in practice, since the forms validate first.

### E13 — Languages, words and layers

- Every new string is in `en.ts` and `pt.ts` (European Portuguese):
  "Partilhar o ficheiro da casa", "Abrir um ficheiro do Settle", "Cópia
  de segurança", "Manter o meu", "Usar o deles", "Exportar CSV". The
  hardened literal-text guard (M5) covers the new screens.
- "File" is the user's word ("Settle file"). "Exchange" and "merge"
  stay in the code.
- **Layers** (ADR 0005's): `features/exchange/` (file, migrations,
  merge, CSV) is pure and framework-free; `data/exchange.ts` reads and
  writes the database for it (snapshots, versions, apply); pages under
  `pages/import/` and the cards use them. No React in `features/exchange/`.

## Acceptance targets

- **Round trip (the roadmap's completion criterion):** export, import
  into an empty database, export again gives identical bytes apart from
  `exportedAt`. This holds for M5's completion scenario, for every kind
  of expense (equal, shares, exact, percent, itemised with discounts,
  tax and tip), payments with and without notes, members who left, an
  archived household, and a backup with three households.
- **Every file Settle writes opens** (round 2, I3): every file in the
  round trips, the merge sweep and the completion scenario passes
  `readFile`. Also tested: a household with an unreadable member named by
  readable expenses, and an expense whose stored `createdAt` isn't
  ISO. Each export leaves out the right records, counts
  them with the reason, and opens.
- **Older files:** a version-1 file goes through the test-only version-2
  step with every record intact. A failing step refuses the file, and a
  version above the known one is refused with its message.
- **Strict reading:** each of these is refused, with its own message and
  nothing written:
  - not JSON; JSON that isn't a Settle file; over 20 MB;
  - an unknown `kind`; a household count of other than one for
    `household`; an unknown key at the top level or in a household entry;
  - each record kind with a missing field, a wrong type, or content its
    validator refuses;
  - a timestamp that isn't ISO (`createdAt`, `updatedAt`, `archivedAt`,
    `deletedAt`, `exportedAt`); a negative or fractional position, or
    one of 2^31 or more;
  - a dangling reference; a duplicate id; an id with other characters,
    at the top of a record or nested in a split or bill;
  - versions:
    - a record without a version entry, or with two;
    - a version entry with a wrong `kind`, or with no record and no
      `deletedAt`;
    - a deletion of a household;
    - an id that is both a record and a deletion;
    - a clock with a bad device id, a count of 0, a fraction, or more
      than 64 entries;
    - a deletion with an empty clock (a record's empty clock is read,
      round 3, O3);
  - 21 people active on one day, or 51 in all.

  Also: `__proto__` keys inside a record are dropped, never applied.
- **Merge, case by case:** each row of E6's table is a test, for each
  record kind and the household record. Each conflict choice is tested
  for the clock it writes.
- **A merge writes the clocks E6 names** (round 2, I1): B edits X and
  sends it; A takes it ("Changed there", A's clock for X equals B's). B
  edits X again and sends it; A takes it again, as "Changed there", with
  no conflict. The same for a deletion, a "New" record and "Use theirs".
  A "New" record with `clock: {}` stores no version entry (O4).
- **Gone back in time** (round 2, I2): A sends X at `{A:7}` to B. A's
  database is replaced by an older copy where X is `{A:5}`. A edits X,
  `{A:6}`. A merges B's file: X is a conflict, not "Changed there", the
  preview says why, and Apply gives A a new `deviceId` and keeps the old
  one in `formerDeviceIds`. A's next edit counts under the new id. When
  A chooses "Keep mine" in that Apply, the bump is under the new id
  (round 3, O1). When A chooses "Use theirs" instead, A writes B's X at
  exactly `{A:7}`, with no bump, and a later file holding A's `{A:6}` is
  "Changed here" (local review of revision 6, I1). "Use theirs for all of these" sets every such conflict
  and leaves each changeable (O2). Also: a file naming this device's id
  with a count of 2^31 changes the id rather than overflowing. Two more
  (round 4): a file whose exposure has equal content asks nothing but
  still changes the id (O3); and a later file with a still higher
  pre-restore count for X asks about X a second time (O1).
- **Gone back in time, after the id changed** (round 3, I1), three
  devices: A edits Y up to `{A:9}` and sends it to C only; B holds Y at
  `{A:4}`. A is set back to Y `{A:4}` and edits Y (`{A:5}`). A merges
  B's file, where another record exposes the set-back, so A's id
  changes; B's Y is older, "Changed here". A then merges C's file: Y is
  a conflict, not "Changed there", and A's edit is kept or replaced only
  by A's choice. No new id is made by that second Apply.
- **Another phone takes a reused count** (round 4, I1), three devices:
  A edits Y up to `{A:9}` and sends it to C; B holds Y at `{A:4}`. A is
  set back to Y `{A:4}` and edits Y (`{A:5}`, content P). A→B: B takes P
  ("Changed there"). C→B: B takes C's `{A:9}` without a prompt, as E6
  states. A then merges B's file: Y is a gone-back-in-time conflict, and
  A chooses "Keep mine". After A→B and B→C, all three hold P.
- **Equal clocks, different content** (manual external review of
  revision 5, M-I-1), three devices. Before a set-back, A writes Y as Q at
  `{A:5}` and sends it to B. A is set back to Y at `{A:4}`, edits Y as P
  (`{A:5}`), and sends P to C. A merges B's file:
  - Y is a conflict, and A's id changes (equal clock naming the current
    id). A chooses "Use theirs". A holds Q at `{A:5, A':1}`, which is
    strictly newer than both `{A:5}` sides;
  - A then merges C's file (P at `{A:5}`): "Changed here", no conflict,
    and Q stays;
  - after A→B, B→C and C→A, all three hold Q at `{A:5, A':1}`, with no
    further question.

  The same with "Keep mine". The same for a record against a deletion at
  equal clocks. The same on B with a clock that doesn't name B's id: the
  choice bumps under B's id, and B's id doesn't change. A concurrent
  "Use theirs" still writes the higher counts with no bump (the re-edit
  test above).
- **Merge, the two stale-file traces** (round 1, B1), each on two
  devices:
  1. A shares to B. A edits expense X. B edits Y and sends F1, and A
     merges it. B, without opening anything from A, adds Z and sends F2.
     After A merges F2, A still has its own X, without being asked.
  2. The same, but A and B both edit X. On F1, A chooses "Keep mine". On
     F2, A's X stays, without being asked.
- **Merge, properties** (seeded mulberry32 sweep, 500 runs). **Three**
  devices start from one shared household. Each makes random edits:
  adds, changes and deletes of expenses, payments and members; renames;
  leaving dates. Between edits, a random schedule sends files:
  - one way, both ways, the same sender several times in a row with no
    import in between;
  - files passed on (A→B, then B→C, then C→A);
  - crossed files: two devices each build a file before importing the
    other's;
  - in some runs, one device's database is set back to an earlier copy
    of itself and carries on (round 2, I2). Some of these runs then
    import first from a device that saw less, and later from one that
    saw more, so the id changes before the rest of the set-back shows
    (round 3, I1);
  - in some runs, generated on purpose rather than left to chance, the
    set-back device sends a record at a reused count before it receives
    the pre-restore copy, so two devices hold equal clocks with different
    content (manual external review of revision 5, M-I-1).

  Every conflict is decided by a fixed rule per device: A always keeps
  its own, B always uses theirs, C alternates by record id. Every choice
  is newer than both sides (round 2, I4), and a record asks "gone back in
  time" again only for a pre-restore count it hasn't seen, of which there
  are finitely many (E6, round 4, O1), so the final round below ends.

  The generator keeps the three devices' members together within the
  limits (at most 20 active on any day and 50 in all across the union),
  so no Apply is blocked by "New" members alone. A choice that breaks a
  limit is covered by its own directed test (round 4, O2).

  **The oracle** tracks the true history in the harness, never the
  clocks. In a set-back run:
  - a **reused edit** is an edit the set-back device made, after the
    set-back, under a count of its pre-restore id that the device had
    already issued for that record before the set-back (whether or not
    any file carried it yet);
  - a **known-limit edit** is a pre-restore edit of the set-back device
    that a post-set-back count of that device, under its pre-restore id,
    passes (E6's known limit: the passing count is often not itself a
    reused one) (local review, round 5, O1).

  Other phones can't see either kind (E6, round 4, I1).
  Checked:
  - **no silent loss of a record:** every record either survives, or has
    a deletion on some device, or was decided in a conflict;
  - **no silent loss of an edit** (in set-back runs, for every edit
    except reused and known-limit edits, which the set-back property
    below checks instead):
    - a change made on one device survives every merge on every device,
      unless a later change seen after it, or a conflict choice,
      replaced it;
    - a "Keep mine" is never reversed without a new conflict;
    - a file older than this device's copy never changes anything;
  - after a final round, all three devices hold equal ledgers and equal
    versions, so their exports are equal apart from `exportedAt`. The
    final round is a **sequential relay**, A→B, B→C, C→A, with each file
    built after the previous import, **repeated until a whole cycle
    decides no conflict**, then one more A→B (round 2, I4; round 3, I2).
    Without a set-back, the first cycle already leaves C newer than or
    equal to everyone, so the second decides nothing. With one, C→A can
    still raise "gone back in time" conflicts, and A's "Keep mine" is
    newer than C's; the next cycle carries it to B and C. The bound is
    three cycles: a run that still decides a conflict in its third
    cycle fails the sweep. The bound is a tested target, not a proof
    (manual external review of revision 5, O-EXT-1). A failing run prints
    its seed and its operation trace so it can be replayed. If a valid
    history needs more cycles, the bound is revised from that
    counterexample, never loosened to hide it;
  - **every conflict decision makes causal progress** (M-I-1; restated,
    local review of revision 6, I1): the clock it writes is newer than or
    equal to both sides' clocks, and strictly newer than the clock of
    every side whose content it didn't take (E6, "What a decision
    guarantees");
  - equal-clock conflicts also arise without a set-back, from crossed
    "Use theirs" choices (B and C both take theirs). The oracle treats
    them as ordinary conflicts. Each run logs how many id changes it made
    without a set-back, so a growing `formerDeviceIds` shows early (local
    review of revision 6, I2, O2);
  - in the set-back runs, every edit made after the set-back, reused
    edits included, either survives at the end of the final relay, or was
    replaced by a later change seen after it, or by a conflict choice, or
    was shown in a conflict on the set-back device (local review, round
    5, O2). Known-limit edits are exempt, and counted, as E6's stated
    limit;
  - an import of one's own file changes nothing;
  - references and member limits hold after every merge;
  - the balances on all devices are equal and sum to zero.
- **A stale file can't undo newer edits:** device A shares, keeps
  editing, then receives a file from B built on an older copy. A's newer
  edits stay. Also covered by the traces and the sweep above.
- **Crossed choices** (round 2, I4): A and B decide one conflict
  differently from files made before either import. The next exchange
  shows the conflict again on both. A sequential exchange after one
  decides it ends it.
- **Crossed "Use theirs" reaching equal clocks** (local review of
  revision 6, I2): X is P at `{A:2}` on A and Q at `{A:1, B:1}` on B. Both
  build files, both import and choose "Use theirs", so A holds Q and B
  holds P at `{A:2, B:1}`. At the next exchange, X is a conflict on each
  phone, shown as an ordinary conflict with the "same history" line,
  without the restored-phone notice or "Use theirs for all of these". The
  Apply changes the id of the phone that decides it, and its choice is
  bumped under the new id. A sequential exchange after that decision ends
  it, with no further question.
- **Kept for references overrides a deletion choice** (round 2, O3): the
  kept member takes the record of the side that has it, the preview line
  says so, and choosing differently for the naming expenses lets the
  deletion stand.
- **Restore doesn't roll back** (round 2, O2): restoring an older backup
  onto the phone that made it changes nothing newer, and the preview says
  "Nothing new in this file" with the line about restoring.
- **Unreadable and foreign records** (I2, I3):
  - a merge never writes over or deletes an unreadable raw record (byte
    for byte, after Apply), whether its `householdId` is this household,
    another, missing or damaged, and the preview lists it;
  - a file record or deletion whose id belongs to another household here
    is left out, that household's record stays byte for byte, and the
    preview lists it;
  - a version entry here with another kind keeps its id out, too;
  - a file expense naming a member who can't be read here is left out
    and listed, and Apply succeeds with the rest.
- **Limits follow the choices** (I4): a choice that makes 21 active
  members disables Apply with the reason, and changing it back enables
  Apply. The 50 counts unreadable members.
- **Concurrency:** a change in another tab between preview and Apply
  makes Apply refuse and write nothing. That covers a record, a version
  entry, or a raw entry for an id in the file.
- **Database version 3:** the upgrade from M5's `v2.json` and from the
  completion scenario's data keeps every record byte for byte. It
  creates no version entry, and writes one `deviceId`. Each write bumps
  its record's clock in the same transaction, and each delete keeps its
  version entry with `deletedAt` (an aborted write leaves both
  untouched). A save of a deleted id is refused.
- **Content checks:** a direct `saveExpense`/`saveSettlement` with
  invalid content throws and writes nothing.
- **CSV:** golden files for `pt-PT` and `en-GB`, with accents, quotes,
  a newline in a note, a description starting with `=`, an itemised
  expense's shares, a payment row, and members who left. Shares sum to
  each expense's amount in every row.
- **The completion scenario (two devices):** M5's household on device A
  (4 members, 31 expenses, 5 payments) is shared to an empty device B.
  B adds 3 expenses and a payment, edits one expense and deletes
  another. A meanwhile edits a different expense and the same one B
  edited, which makes a conflict. They exchange both ways. After that
  both devices have the same ledger, balances and suggestion, and A's
  backup restored onto an empty device C gives the same ledger again.
- **Existing behaviour kept:** the full `npm run check`; M4's and M5's
  suites keep their assertions, apart from the stores each write
  transaction opens (now `versions` and `meta` as well). The CI browser
  smoke test passes.
- **Both languages:** every new page, card and message renders in
  Portuguese with no English sentinel; the literal-text guard passes.
- **Design** (`screens.mjs`): the "Share and export" card, the "Your
  data" card, the reminder, and `/import` (pick a file, a new household,
  a merge with a conflict, an error, done) at 360, 390, 1024 and
  1440 px in both themes. No sideways scroll, a focus ring on every
  Tab stop. The Impeccable detector and ux-lint clean, or each finding
  reasoned in `CHECKS.md`.
- **Privacy:** `check-requests.mjs page-load` passes, and a new
  `check-requests.mjs exchange` drives share (download), import and
  Apply on the production build with no request leaving the origin. The
  CSP is unchanged.
- **Performance:** a merge of a 2000-expense household with 200 changes
  previews in under 500 ms in Vitest; reading a 5 MB file under 1 s.

## Checkpoint details

### CP1 — Storage version 3

- `data/db.ts`: `createSchemaV3` (the `versions` store and the
  `deviceId`); the test-only step moves to version 4; `fixtures/v3.json`.
- `data/versions.ts`: the clock helpers (bump, the higher count per
  device, newer or concurrent, equal), pure. CP3 adds the shared
  clock-resolution helper to it (E6).
- `data/repository.ts`:
  - every write bumps its record's clock in its transaction (E4), and
    refuses a bump past 2^31;
  - the deletes keep a version entry with `deletedAt`, and saves refuse
    deleted ids;
  - every write sets `firstUnbackedChangeAt` (E5);
  - content checks in the saves (E12).
- `data/records.ts`: the version entry's reader.
- Tests:
  - the v2 to v3 upgrade, byte for byte from `v2.json` and from the
    completion data;
  - every write's clock bump, including in an aborted transaction;
  - each delete with its entry;
  - a save of a deleted id;
  - the clock helpers;
  - the content checks;
  - change tracking.

### CP2 — The Settle file

- `features/exchange/format.ts` (types, canonical writer),
  `readFile.ts` (E2), `migrations.ts` (E3), `fileName.ts`.
- `data/exchange.ts`: a household's or the whole device's snapshot for
  the file (readable records, their versions and the deletions; the
  records left out, with their reasons, so the file passes `readFile`,
  E1).
- Tests: the round trips, every written file passing `readFile`, the
  records left out from a damaged household, strict reading (every
  refusal), the migration runner with its test-only step, file names,
  and the 20 MB limit.

### CP3 — The merge

- `features/exchange/merge.ts` (E6):
  - the per-record comparison by clocks, with the clocks each outcome
    writes (E4's exception), through one shared clock-resolution helper
    that also bumps both choices between equal clocks;
  - "gone back in time": the check on every own id (current and
    `formerDeviceIds`), its conflicts, the new `deviceId` with the old
    one retired, bumps under the new id, and "Use theirs for all of
    these";
  - the conflicts and the clocks their choices write;
  - the per-id checks for unreadable and foreign records;
  - references, dangling records and limits, recomputed per choice;
  - the plan of writes.
- `data/exchange.ts`:
  - the raw-entry snapshot by key;
  - `applyMerge` in one transaction with its re-check (E6);
  - `addHouseholdFromFile`;
  - the `BroadcastChannel` notice.
- Tests:
  - E6's table;
  - the two stale-file traces;
  - the re-edit test, gone back in time (before and after the id
    changed, an equal-content exposure, a second question, the clock a
    "Use theirs" over a newer clock writes), another phone taking a
    reused count, equal clocks with different content, crossed choices,
    crossed "Use theirs" reaching equal clocks;
  - the three-device property sweep, with its set-back runs (equal-clock
    histories generated on purpose), the oracle's reused and known-limit
    edits, causal progress for every decision, and the sequential final
    relay repeated until it decides nothing, with the seed and trace of
    any failing run;
  - unreadable, foreign and dangling records;
  - limits that follow the choices;
  - concurrency;
  - performance.

### CP4 — Sharing, opening and backup

- The canvas first: the "Share and export" card, the "Your data" card,
  the reminder, and `/import` (pick, preview with a conflict, error,
  done) at phone width in light and dark, plus the navigation map
  (Households and Settings to "Open a Settle file", Members to "Share
  household file"). Then the build follows the canvas.
- `pages/import/ImportPage.tsx` (E7, E8); the Members tab's card (E9)
  with Share household file; Settings' "Your data" card (E10); the
  Households page's button and empty state; the reminder on Households
  and Overview; `en.ts`/`pt.ts`.
- Tests: share (with `navigator.share`, without it, cancelled); open, preview,
  decide, Apply and Cancel; a backup's several households; a refused
  file's message; the reminder's timing and Later; keyboard and focus
  in the preview; Portuguese.

### CP5 — CSV export

- `features/exchange/csv.ts` (E11) and Export CSV on the card.
- Tests: the golden files, formula escaping, shares summing per row,
  both regions, the download.

### CP6 — Quality pass and documentation

- The two-device completion scenario (`data/exchange.completion.test.ts`).
- `screens.mjs`: the new screens and states; `check-requests.mjs
  exchange`; the design checkers; `CHECKS.md` and screenshots in
  `docs/milestones/milestone-6-evidence/`.
- **ADR 0007**: the Settle file field by field, its versions and
  migrations, and the merge rules. It also covers the record versions
  (clocks, the device id, why revision 1's single base was dropped) and
  their known limits:
  - the rule they rest on, "only this device counts under its own id",
    which merge outcomes add 1 for this device (only "Keep mine", "kept
    for references", and either choice between equal clocks), what a
    decision's clock guarantees, and how a
    broken rule is detected ("gone
    back in time") and handled (conflicts and a new `deviceId`);
  - that a device's former ids stay its own for good, so the check
    covers them too, and that bumps in the Apply that changes the id use
    the new one (round 3, I1, O1). M14's sync inherits this;
  - what that check can't see: a restored phone that edits a record more
    times than before the restore (E6);
  - that the check is local to the restored phone. Another phone can
    briefly take an older version over the restored phone's newer edit,
    until the restored phone opens a file carrying it and is asked
    (round 4, I1). M14's sync inherits this, and a server could do
    better;
  - two browsers using one device id at the same time (a copied browser
    profile) look like one device until a file from one reaches the
    other;
  - clocks grow by one entry per device that ever edited a record,
    including each new `deviceId`. A new id comes from a detected restore
    or from an equal-clock conflict naming the current id, which crossed
    choices can also make. A clock over 64 entries keeps its record out of
    files (E1).

  Plus ADR 0005's "Version 3" section.
- `docs/DESIGN.md` (the import preview, the conflict pair, the
  reminder), `app/README.md` (version 3, `features/exchange/`), the
  root `README.md` (back up, share, open, CSV), `PRODUCT.md` if its
  sharing line changes, and the roadmap's M6 status.
- The canvas's "As shipped in M6" board.
- The full verification: `npm run check`, the build and
  `check-build.mjs`, and CI's smoke steps locally.

## Requirement coverage

See `docs/ai-workflow/requirements/milestone-6-mapping.json` (generated).

| Requirement | Checkpoints |
| --- | --- |
| REQ-1 Record versions, the deletion log and change tracking (database version 3) | CP1, CP3 |
| REQ-2 Content checks in the repository (M5's carried-forward finding) | CP1 |
| REQ-3 The Settle file: versioned, documented, strictly validated, friendly errors | CP2, CP6 |
| REQ-4 Exact round trip, and older files through migrations | CP2, CP6 |
| REQ-5 Merge by stable record ids, with a preview and conflict choices | CP3, CP4 |
| REQ-6 Share a household by file, and open one | CP4 |
| REQ-7 Back up and restore all data | CP2, CP4 |
| REQ-8 The backup reminder | CP1, CP4 |
| REQ-9 CSV export of expenses and payments | CP5 |
| REQ-10 Data safety: unreadable records kept, references and limits, nothing lost without a deletion or a choice | CP1, CP3, CP4 |
| REQ-11 Privacy: nothing leaves except through the user's share or download; CSP unchanged | CP4, CP6 |
| REQ-12 Both languages, design, 360 px, accessibility | CP4, CP5, CP6 |
| REQ-13 Documentation and the design canvas | CP6 |

## Files touched and review classification

**Implementation-stage protected** (`milestone-6-artifacts.json`):
- `app/` (all source, tests, scripts, `package.json` and the lockfile);
- `docs/adr/` (ADR 0005's new section, ADR 0007);
- `docs/DESIGN.md`, `README.md`, `PRODUCT.md`;
- `.github/workflows/app-ci.yml`. It is not expected to change. It stays
  protected as for M3 to M5.

**Excluded** (workflow bookkeeping and evidence):
- `docs/ROADMAP.md`, `docs/ACTIVE_MILESTONE.md`;
- `docs/milestones/` (the evidence folder);
- `docs/ai-workflow/`.

No new dependency is planned.

## Migration, data and backup implications

- **The database moves to version 3:** one new store (`versions`) and a
  `deviceId` in `meta`. No record is rewritten, and no record's format
  changes. A record's version entry appears when it next changes. It is
  tested from `v2.json` and from the completion scenario.
- **No downgrade.** An older Settle in another tab gets "Settle was
  updated in another tab" and reloads (M4).
- **The file format is a public contract from now on.** Version 1 is
  documented in ADR 0007. A later change adds a migration step (E3) and
  never reinterprets version 1.
- **A merge is the first code that writes many records at once.** It is
  one transaction (all or nothing), it re-checks against the preview,
  and it never touches unreadable records or another household's ids.
- **Unchanged:** `settle.bill`, `settle.receipt`, `settle.household` and
  the settings keys.

## Roadmap open questions this plan touches

- **"Sharing without a server": is file exchange (2) or file merge (3)
  enough for real households?** The roadmap leaves this to M12. This
  plan builds both, at the user's decision, and settles nothing about
  sync: M12 still asks whether roommates use it.
- **"How far to take merge"** (M6, Useful). The user chose merge by
  record ids with a preview and per-record conflict choices (2026-10-11).
  Field-by-field merging inside one record is not attempted (open
  question 1).
- There is no `docs/TECHNICAL_DECISIONS.md` in this repository. The
  roadmap's "Decisions and open questions" and the ADRs are where open
  decisions live, and none of the others is touched.

## Out of scope

- Receipt images: none are stored (Evidence).
- Settings in the backup (theme, language, region). They take three taps
  to set again, and keeping them out keeps a restore from changing a
  phone's language.
- A password or encryption (the user's decision, 2026-10-11).
- Opening a file straight from a chat app (needs the PWA, M7); a
  read-only summary link or image (roadmap: Useful). The text from M5
  covers a summary.
- Importing other apps' exports, such as Splitwise CSV (roadmap: Future).
- Real-time sync, accounts, servers (M14).
- "Mark a period as settled" (carried from M5; after M10).
- M4's O-6 (the add-member form's "full" counts only today).

## Open questions (for the plan reviewer / user)

1. **E6, who decides a conflict.** Revision 1 asked on both phones.
   With record versions (revision 2), a choice is newer than both sides,
   so the other phone takes it without asking. Whoever decides first
   wins, unless the other phone also decided before seeing that choice,
   in which case it is asked again. Is that acceptable for real
   households? The alternative is to ask on both phones every time,
   which needs a way to mark a choice as "not yet agreed".
2. **E10, the reminder after 7 days** of unbacked-up changes, with
   Later hiding it for 7 days. Is a week right?
3. **E6, shared positions.** Two members added at the same time on two
   phones can end up with one badge colour. Is that acceptable for now
   (rare, cosmetic), or should colours come from the member order
   instead? Colours from order would change some existing members'
   colours once.
4. **E9, where sharing lives.** The plan puts Share and Export CSV on
   the Members tab, next to the household's other management. Would the
   Overview be easier to find?

## Stop conditions

Stop and ask the user if:
- an existing test's assertions would have to change beyond the stores
  each write transaction opens (now `versions` and `meta` as well);
- the CSP would need a new source;
- a stored record's format would change at all;
- the version-3 upgrade loses or alters any version-2 record in any test;
- the merge property sweep finds a case where a record or an edit
  disappears without a deletion or a choice, and E6's rules can't be
  fixed within this plan;
- a real browser's file sharing or download behaves in a way that loses
  or duplicates a file without telling the user;
- the bundle or font budgets fail and can't be met without dropping a
  requirement.

## Review dispositions

### Local plan review, round 1 (`REVISE`, against revision 1)

| Finding | Disposition | Where |
| --- | --- | --- |
| B1 — the base rule undoes edits and "Keep mine" | **Accepted.** Checked: under revision 1, the base after a merge is the merged state, which the sender doesn't have, so the reviewer's trace reverts X. The single base is dropped. Every record now has a version vector (option (b)): a device id per device, and a clock bumped by every write. A stale file is always older, for any number of phones and for files passed on. The stored record's format is unchanged, so members' `updatedAt` is no longer needed and is dropped. | E4, E5, E6, E1, CP1, CP3 |
| I1 — tests can't catch B1 | **Accepted.** The two traces are acceptance tests. The sweep uses three devices; repeated, one-way and passed-on schedules; and edit-survival properties. | Acceptance targets, CP3 |
| I2 — id collisions outside the household's index | **Accepted.** Checked: `db.ts`:33-51 keys every store by `id` alone. The merge reads each file id's raw entry and version entry by key, and leaves out anything that isn't this household's readable record of the same kind. | Evidence, E6, E8, acceptance targets |
| I3 — records that depend on a record kept unreadable | **Accepted.** Checked: `saveExpense` fails the whole save on an unreadable member (`repository.ts`:493-501). Records naming a left-out member are left out and listed before the preview, so Apply never fails on them. | Evidence, E6, E8 |
| I4 — limits depend on conflict choices | **Accepted.** The preview recomputes the result, the kept members and the limits after every choice, and disables Apply with the reason. The 50 counts unreadable members, as in `addMember`. | E6, E8, acceptance targets |
| I5 — strict reading narrower than E2 implied | **Accepted.** Checked against `records.ts`:62-110. E2 adds ISO timestamps, a position range, version-entry and clock rules, the id rule for nested ids, and refusing unknown top-level and household keys. Each has a refusal test. | Evidence, E2, acceptance targets |
| O1 — position line is 249 | **Accepted.** | Evidence |
| O2 — "leaves it unset" | **Accepted.** Now "does not set it": a change already waiting stays waiting. | E5 |
| O3 — CSV date format, header escaping | **Accepted.** Dates are `YYYY-MM-DD`. Formula escaping covers member names in the header. | E11 |
| O4 — re-check versions and the base too | **Accepted, adapted.** There is no base any more. The re-check compares records, version entries and the raw entries for every id in the file. | E6 |
| O5 — store lists, `newMembers` | **Accepted.** The stop condition and "existing behaviour kept" allow the wider store lists. E4 lists every write that bumps a clock, including `saveExpense`'s `newMembers`. Members' `updatedAt` is gone (B1). | E4, E5, acceptance targets, stop conditions |
| O6 — restate open question 1 | **Accepted.** Under versions, a choice travels without being asked again. Open question 1 now asks whether that is right. | Open questions |

### Local plan review, round 2 (`REVISE`, against revision 2)

| Finding | Disposition | Where |
| --- | --- | --- |
| I1 — E4 says a merge's writes bump the clock; E6 says most don't | **Accepted.** Checked: revision 2's E4 listed "a merge's own writes" among the bumping writes, while E6 bumps only for "Keep mine" and "kept for references". A merge now writes exactly E6's clocks, stated as E4's exception, with a re-edit test. | E4, acceptance targets, CP3 |
| I2 — a rolled-back or cloned device silently loses edits | **Accepted.** Option taken: a file clock giving this device's own id a higher count than this device holds is "gone back in time". Differing records become conflicts, Apply gives the device a new `deviceId`, and the preview says why. The trace is an acceptance test, the sweep has set-back runs, and ADR 0007 states the rule and its remaining limit. | E4, E6, acceptance targets, CP3, CP6 |
| I3 — exports can produce a file Settle refuses | **Accepted.** Checked: `readExpense` doesn't look up members, so a readable expense can name an unreadable member, and `readHousehold` takes any string as a timestamp (`records.ts`:62-84). The snapshot leaves out records that name a left-out record, and records that fail E2's stricter rules, and counts them with the reason. Every written file must pass `readFile`, as a property. | E1, acceptance targets, CP2 |
| I4 — convergence depends on the schedule and the decision rule | **Accepted.** The sweep's final round is a sequential relay (A→B, B→C, C→A, A→B), and the per-device rules are named. E6 states that crossed simultaneous choices repeat, with a test. | E6, acceptance targets, CP3 |
| O1 — the bump isn't bounded | **Accepted.** A bump past 2^31 is refused. A file that names this device's id with a count that high triggers "gone back in time" and a new id first. | E4, acceptance targets, CP1 |
| O2 — restore isn't a rollback | **Accepted.** The card and the preview say so, with a test. | E10, acceptance targets |
| O3 — which content "kept for references" takes, and the override | **Accepted.** It takes the record of the side that has one. Overriding a "Keep mine" deletion is stated in the preview line, with a test. | E6, acceptance targets |
| O4 — a "New" record with `clock: {}` | **Accepted.** It stores no entry, so "no entry" and `{}` stay the same thing everywhere. | E4, acceptance targets |
| O5 — clocks over 64 entries locally | **Accepted, adapted.** Nothing bounds a local clock, and E2 still refuses more than 64 entries. Such a record is left out of files and counted (E1's rule), and ADR 0007 records the limit. It needs 65 device ids editing one record. | E1, CP6 |

### Local plan review, round 3 (`REVISE`, against revision 3)

| Finding | Disposition | Where |
| --- | --- | --- |
| I1 — "gone back in time" stops detecting once the id changes | **Accepted.** Checked against revision 3's E6: the check named only "this device's id", and Apply then changed it, so reused counts under the old id that the first file didn't expose went unchecked. In the three-phone trace, C's newer pre-restore Y replaces A's post-restore edit with no prompt. Retired ids now move to `meta.formerDeviceIds` and stay this device's own ids. The check covers all of them, and a higher count under a former id makes conflicts without another id change. The trace is an acceptance test, the sweep's set-back runs include it, and ADR 0007 states it. | E4, E6, acceptance targets, CP3, CP6 |
| I2 — the final relay doesn't converge in set-back runs | **Accepted, first option.** Checked: revision 3's relay ended A→B, so a "Keep mine" that A wrote on a gone-back-in-time conflict in C→A never reached C. The relay now repeats A→B, B→C, C→A until a whole cycle decides no conflict, then one more A→B, with a bound of three cycles. It ends because every choice is newer than both sides and each record asks "gone back in time" at most once per own id (corrected in round 4, O1: again only for a count it hasn't seen, finitely often). | Acceptance targets (sweep), CP3 |
| O1 — which id the bumps use in the Apply that changes it | **Accepted.** The new id, stated in E6 and tested in the gone-back-in-time acceptance test. | E6, acceptance targets |
| O2 — many conflicts after restoring a backup onto a set-back phone | **Accepted.** "Use theirs for all of these" sits on the restored-phone notice. It sets every gone-back-in-time conflict, and each choice stays changeable. | E6, acceptance targets, CP3 |
| O3 — empty clocks in E2 | **Accepted.** A record's empty clock is read. A deletion's empty clock is refused, with a refusal test. | E2, acceptance targets |

### Local plan review, round 4 (`REVISE`, against revision 4)

| Finding | Disposition | Where |
| --- | --- | --- |
| I1 — the sweep's general edit-survival properties are false by design in set-back runs | **Accepted.** Checked against revision 4's E6: only the set-back device checks its own ids, so on B, C's pre-restore `{A:9}` is "Changed there" over A's post-restore `{A:5}`, with no prompt. A's known limit breaks the same property on C. E6 now states the transient ("Other phones can't see a restore"). The oracle names reused and known-limit edits; the general properties exclude them in set-back runs, and the set-back property checks them at the end of the final relay. The four-step trace is a deterministic test, and ADR 0007 states the limit. | E6, acceptance targets, CP3, CP6 |
| O1 — "asks at most once per own id" isn't quite true | **Accepted.** E6 and the sweep now say a record asks again only for a count it hasn't seen, which ends since the pre-restore counts are finite. The gone-back-in-time test adds a second question. The three-cycle bound is unchanged. | E6, acceptance targets |
| O2 — member limits can stall the sweep | **Accepted.** The generator keeps the union within 20 active and 50 in all. The limit case keeps its directed test. | Acceptance targets (sweep) |
| O3 — an exposure with equal content | **Accepted.** Stated under E6's table: an exposure under the current id changes the id whatever the content. Tested. | E6, acceptance targets |

### Local plan review, round 5 (`APPROVE`, against revision 5)

| Finding | Disposition | Where |
| --- | --- | --- |
| O1 — the known-limit edit's definition misses the known limit | **Accepted.** Checked: revision 5 defined it as a pre-restore edit that "such a reused count" passes, but E6's known limit is a count above every pre-restore count (`{A:10}` over `{A:9}`), which is not reused. A known-limit edit is now a pre-restore edit passed by any post-set-back count of that device under its pre-restore id. A reused edit is now defined by the counts the device had issued before the set-back, which also covers a file built before the set-back and opened after it. | Acceptance targets (sweep, the oracle) |
| O2 — the set-back property has no "replaced by a later change" exception | **Accepted.** The set-back property now allows an edit to be replaced by a later change seen after it, or by a conflict choice, as the general property does. | Acceptance targets (sweep) |

### Manual external plan review, round 5 (`REVISE`, against revision 5)

| Finding | Disposition | Where |
| --- | --- | --- |
| M-I-1 — "Use theirs" doesn't settle equal-clock, different-content conflicts | **Accepted.** Checked against revision 5's E6: the table makes equal clocks with different content a conflict, and "Use theirs" writes the higher count for each device, which for equal clocks is the same clock. So a later file with the other content at that clock asks again. The claim "either way the result is newer than both sides" was false there. Both choices on an equal-clock conflict now add 1 for this device, under the new id when the Apply changes it. Concurrent "Use theirs", "Changed there", "New" and imports without a conflict stay unbumped, as revision 3 intended. An equal clock naming the current id is also an exposure, because equal clocks with different content only come from a reused count. So the bump never reuses a count. One shared clock-resolution helper writes every outcome's clock. Directed tests cover "Use theirs", "Keep mine", a record against a deletion, and another device's id, with a re-import of the stale content and three-device propagation. The sweep generates equal-clock histories on purpose and asserts causal progress for every decision. | E4, E6, acceptance targets, CP1, CP3, CP6 |
| O-EXT-1 — the three-cycle bound is a tested target, not a proof | **Accepted.** The sweep keeps the failure, prints the seed and the operation trace, and the bound is only revised from a counterexample. | Acceptance targets (sweep), CP3 |
| O-EXT-2 — keep the rollback limit in the documentation | **Accepted, no change.** ADR 0007's limits already include it (CP6). | CP6 |
| O-EXT-3 — keep export validation aligned with import | **Accepted, no change.** E1's snapshot already runs E2's checks, and the acceptance targets test the counted, left-out records. | E1, acceptance targets |

### Local plan review, round 6 (`REVISE`, against revision 6)

| Finding | Disposition | Where |
| --- | --- | --- |
| I1 — the causal-progress property is false for a gone-back-in-time "Use theirs" over a newer clock | **Accepted.** Checked against revision 6's E6: only "Keep mine", "kept for references" and equal-clock choices bump, so "Use theirs" in the `{A:7}` against `{A:6}` trace writes `{A:7}`, equal to theirs. The behaviour stays (taking theirs at its clock is durable); the claim changes. A decision's clock is now newer than or equal to both sides, and strictly newer than every side whose content it didn't take. E6 states it case by case, the prose in "Other phones can't see a restore" follows it, the sweep asserts it, and the gone-back-in-time test checks the "Use theirs" clock. | E6, acceptance targets, CP3, CP6 |
| I2 — equal clocks with different content also come from crossed "Use theirs" choices | **Accepted, option (a).** Checked: revision 6's own crossed example (both choose "Use theirs" and swap) writes the higher count on both phones, the same clock with swapped contents, with no restore. The premise now names both causes. The id change stays, since a device can't tell them apart and a new id is always safe. But an equal-clock conflict is shown as an ordinary conflict, with a "same history" line, never with the restored-phone notice or "Use theirs for all of these". E4's growth claim and ADR 0007's limits name both sources of a new id. A directed test covers the crossed pair, and the sweep's oracle treats such conflicts as ordinary. | E4, E6, acceptance targets, CP3, CP6 |
| O1 — "this device's count for that id is the file's count" | **Accepted.** Now "for the exposed id", with the bump under the new id. | E6 |
| O2 — log id changes without a set-back in the sweep | **Accepted.** Each run logs them. | Acceptance targets (sweep) |
