# Roadmap

Product milestone ordering for Settle (repository `project-Settle`).
`/milestone-plan` picks the first milestone whose status is not
**Complete**; `/accept-milestone` marks it complete here. Each milestone
should ship something usable on its own.

This is a living document. Milestones after the current one are a
direction, not a commitment. They get re-ordered, merged or dropped as we
learn.

Last updated: 2026-09-30 (M2 complete; M2.5 added for receipt-reading
accuracy; restructured around the free-first product strategy on
2026-09-28, see [Roadmap strategy](#roadmap-strategy))

## Current goal

> **Phase 1: finish the free, local-first core.** The next milestone is
> **M2.5 — Accurate receipt reading**: real receipts read right 94–100 %
> of the time, still for free and entirely in the browser. After it comes
> the shared-household core: households, an expense ledger, balances and
> settling up (M3–M4).

Nothing in Phases 3–8 is being built yet.

## Product vision

**Settle: split bills. Settle up. Stay private.**

The core idea is **make living together financially painless.** People who
share a home, or regularly share costs, can:

- record shared expenses (groceries, utilities, internet, cleaning
  supplies, household purchases, takeout, shared subscriptions), typed in
  or read from a receipt;
- split them fairly: equally, by shares, or item by item from a receipt;
- always see who owes whom, and settle up with the fewest payments;
- keep a history they can correct, export and take with them.

Settle is first built as a genuinely useful, **free, local-first** product
that solves a real problem the developer has. Monetisation is deliberately
later, and only around behaviour that real users have shown they value.

**Who it's for (to be validated, not assumed):**

- university students sharing houses, and roommates in shared households
  (the primary use case);
- anyone who regularly shares expenses with the same group;
- possibly, later, landlords and property managers who reconcile shared
  expenses across rooms or units. The narrow potential wedge is *shared
  expenses and financial reconciliation for multi-tenant properties*,
  **not** a full property-management platform.

## Guiding principles

- **€0 mandatory operating costs in the free product.** It runs in the
  browser on a free static host. It never depends on a paid external API or
  a project-owned AI key. Optional extras that cost money run on the user's
  own key ("bring your own key") or become paid features later.
- **No account needed.** Everything in the free product works without
  signing up. Accounts arrive only with sync (Phase 7), and stay optional.
- **Your data stays yours.** Financial data stays on the device. The only
  thing that ever leaves it before accounts exist is **anonymous, aggregate
  product telemetry** (M7), which never contains amounts, names, items,
  merchants or receipt content.
- **Useful for free, not crippled.** The free product must solve the
  problem on its own. Paid features add convenience, automation, sync,
  backup, more powerful processing and collaboration. They never remove or
  hobble what the free product does.
- **Do not monetise the idea. Monetise validated behaviour.**
- **Real use before more features.** Personal use (Phase 3) and real users
  (Phase 5) decide what gets built next, not the list of interesting ideas.
- **Simple first, flexible data model.** Keep the model general enough to
  grow (for example, a household could later be a property, and members
  could have move-in and move-out dates). But build only what's needed now.
- **Mobile-friendly from day one.** A responsive layout, and a PWA, so a
  native wrapper later is not a rewrite.
- **Money is exact.** Integer cents, one shared money module, and splits
  whose totals always add up (M0/M1 decisions, kept).

## Roadmap philosophy

> Build the smallest genuinely useful free product first.
> Use it personally.
> Instrument it enough to understand usage.
> Polish the experience.
> Put it in the hands of real users.
> Learn what they value.
> Then build the paid layer around validated demand.

## How to read each milestone

Every milestone lists its **Objective**, **Why it matters**, its work split
by priority, its **Completion criteria**, and **Not yet** (what it must not
build).

- **Must-have**: the milestone isn't done without it.
- **Useful**: build it if it's cheap once the must-haves are done;
  otherwise it moves to a later milestone.
- **Future / validation-dependent**: don't build it until evidence (personal
  use, user research, telemetry) says it's worth it.

A milestone's plan (`/milestone-plan`) turns this outline into exact
scope. Anything not listed as must-have is negotiable there.

## Milestone overview

| #   | Milestone                                          | Phase                            | Status      |
|-----|----------------------------------------------------|----------------------------------|-------------|
| M0  | Project foundation                                 | 1 · Free local-first core        | Complete    |
| M1  | Bill splitter (manual entry)                       | 1 · Free local-first core        | Complete    |
| M2  | Receipt upload and built-in parsing                | 1 · Free local-first core        | Complete    |
| M2.5| Accurate receipt reading                           | 1 · Free local-first core        | Not started |
| M3  | Households, members and the expense ledger         | 1 · Free local-first core        | Not started |
| M4  | Balances and settling up                           | 1 · Free local-first core        | Not started |
| M5  | Export, import, backup and sharing                 | 1 · Free local-first core        | Not started |
| M6  | Installable PWA and public deployment              | 1 · Free local-first core        | Not started |
| M7  | Privacy-first product analytics                    | 2 · Analytics and developer BO   | Not started |
| M8  | Minimal developer backoffice                       | 2 · Analytics and developer BO   | Not started |
| M9  | Personal validation and stabilisation              | 3 · Personal validation          | Not started |
| M10 | Product design and UX pass                         | 4 · Design and UX                | Not started |
| M11 | Real-user validation (closed beta)                 | 5 · Real-user validation         | Not started |
| M12 | Paid-product exploration                           | 6 · Paid-product exploration     | Not started |
| M13 | Accounts, cloud sync and billing                   | 7 · Paid layer (if validated)    | Not started |
| M14 | Student plan and verification                      | 7 · Paid layer (if validated)    | Not started |
| M15 | Business and financial backoffice                  | 7 · Paid layer (if validated)    | Not started |
| M16 | Landlord / property-manager experiments            | 8 · Expansion (if validated)     | Not started |

Milestones M12–M16 are **conditional**. Each one starts only if the
milestone before it produced the evidence it needs, and any of them can be
dropped. Ideas without a milestone live in the
[Validation-dependent backlog](#validation-dependent-backlog).

**Changes in the 2026-09-28 restructure** (for anyone reading older
plans):

- The old *M3 Bring-your-own-key receipt reading* is now a backlog item,
  revisited if personal use shows the built-in reader isn't good enough.
- The old *M4–M7 personal finance file ("the key"), dashboards, editing
  and bill-to-expenses integration* moved to the backlog as a possible
  future expansion. Their durable parts are kept in the new milestones: a
  versioned, validated, user-owned file (M5) and a local working copy that
  autosaves (M3).
- The old *M8 Installable app* is now M6, earlier, because real users need
  it deployed and installable.
- *M2.5 Accurate receipt reading* was added on 2026-09-30, after M2's
  functional review showed real receipts reading far below what a
  product needs. Its work item id is `milestone-2-5` (work item ids can't
  contain a dot).
- The old *M9 Accounts and sync* is now M13, a paid-layer candidate.

### Every milestone

From M1 on, every milestone ends by checking the root `README.md`, the
page people see first on GitHub:

- **Does it still make sense?** Read it as a new visitor would.
- **Remove** anything outdated: features that changed, steps that no
  longer work, "coming soon" notes that have shipped.
- **Add** what the milestone delivered: new features, and changed setup
  or usage.
- **Update** the status, the screenshots (if any) and the links.

Keep it simple and user-facing. Developer detail belongs in
`app/README.md`, which gets the same check when the milestone changes
setup, commands or project layout. If nothing needs changing, the
milestone's PR says so in one line. The check is part of every
milestone's "Done when".

From M7 on, every milestone that adds a user action also adds its
analytics event (see M7's event rules), or says in its plan why it
doesn't need one.

---

# Phase 1 — Free, local-first core

**Objective:** a Settle that one household can genuinely use for its shared
expenses: receipts in, fair splits, a history, clear balances, settling up,
backup and export. It works on a phone, with no account, and costs €0 to
run.

**Why it matters:** everything later (validation, design, pricing) depends
on a core that works. The free product is the product. The paid layer
only makes it more convenient.

**Not yet in Phase 1:** accounts, cloud sync, payments, bank integrations,
hosted AI, landlord features, and visual polish beyond clean and usable.

## M0 — Project foundation

**Status:** Complete (accepted 2026-09-27; PR #1). Plan archived at
`docs/milestones/completed/milestone-0-PLAN.md`.

**Goal:** An empty but deployable app skeleton with tooling in place.

**Scope**
- Pick the tech stack and record the decision (see
  [Decisions and open questions](#decisions-and-open-questions)).
- App shell: routing, basic layout, responsive, light/dark theme.
- Tooling: formatter, linter, type checking, unit test runner, CI running
  all of them.
- Money handling rule: store amounts as integer cents (never floats), with
  one shared helper for formatting and rounding.

**Done when**
- The app builds and runs locally and in CI, and shows a placeholder home
  page.
- The test suite runs in CI and passes.

---

## M1 — Bill splitter (manual entry)

**Status:** Complete (accepted 2026-09-28; PR #4). Plan archived at
`docs/milestones/completed/milestone-1-PLAN.md`.

**Goal:** Split a bill correctly with items typed in by hand. This gets the
split math and the UI right before OCR adds uncertainty.

**Scope**
- Create a bill: add, edit, and remove line items (name, quantity, price).
- Add people: choose how many, and optionally name them.
- Assign each item to one or more people. An item assigned to several
  people is split equally by default, with custom shares possible.
- Tax, tip/service, and discounts: split proportionally to each person's
  subtotal (or equally, as an option).
- Rounding: leftover cents are assigned deterministically so the per-person
  totals always add up exactly to the bill total.
- "Who owes what" dashboard: per-person total, item breakdown, and who owes
  whom (one payer by default).
- Export or share the result (copy as text; image or PDF optional).
- Region setting: the user can change the locale (number format) and the
  currency used to enter and show amounts. The default is `pt-PT` / `EUR`
  (decided in M0). This is the Settings page's first real section.
  `parseAmount` accepts only `€` today, so its symbol set grows with the
  currencies offered; `formatAmount` already takes a locale and currency.
- Project `README.md` (repository root): a good, simple README covering
  what Settle is, what works today, how to open or run it (linking to
  `app/README.md` for development), where the roadmap and releases are,
  and the privacy stance (everything stays in the browser).

**Done when**
- Unit tests cover the split math, including rounding, shared items, tax,
  tip, and discounts. Per-person totals always equal the bill total.
- A user can split a real 10+ item bill between 3 people end to end.
- `README.md` exists at the repository root, is accurate for what M1
  ships, and follows "Every milestone" above.

---

## M2 — Receipt upload and built-in parsing

**Status:** Complete (accepted 2026-09-30; PR #6), with one remediation
child for real receipts (`milestone-2-remediation-1`). Plans archived at
`docs/milestones/completed/milestone-2-PLAN.md` and
`docs/milestones/completed/milestone-2-remediation-1-PLAN.md`.
Carried forward to M2.5: switching the built-in reader from Tesseract.js
to PaddleOCR (the user's decision, 2026-09-29) to raise the accepted
read-rate floors on real receipts, and the phone reading-time
measurement that was waived for it.

**Goal:** Upload a photo or PDF of a receipt and get the item list filled in
automatically, for free and entirely in the browser.

**Scope**
- Upload from file picker, camera (on mobile), or drag and drop. Accept
  JPEG, PNG, HEIC, and PDF.
- Image clean-up before OCR (grayscale, contrast, straightening) to help
  with thermal paper.
- Text reading with **Tesseract.js** in the browser, then a rule-based
  parser that finds merchant, date, line items, subtotal, tax, and total.
  Start with Portuguese and English receipt formats.
- **Portuguese fiscal QR code**: when present, read it (e.g. with
  zxing-js) to get a reliable date, merchant tax number (NIF), total, and
  VAT (IVA) breakdown, and check the parsed items against that total.
- **Review step:** the parsed items open in the M1 editor so the user can fix
  mistakes before splitting. Warn when the items don't add up to the
  receipt total.
- All receipt readers sit behind one shared interface (image in,
  structured receipt out), so other readers (bring-your-own-key AI, and
  perhaps a hosted reader in the paid layer) can plug in later without
  changes elsewhere.

**Done when**
- A set of sample receipts parses with totals matching, or is clearly
  flagged for correction.
- Any parsing failure falls back to the manual editor instead of blocking
  the user.
- No receipt data leaves the browser.
- `README.md` (and `app/README.md` if setup changed) reviewed and
  updated for M2: outdated parts removed, new features added (see
  "Every milestone").

---

## M2.5 — Accurate receipt reading

**Status:** Not started (work item `milestone-2-5`, branch
`feature/milestone-2.5`)

**Objective:** Real receipts are read right almost every time: the goal
is **94–100 %**, not M2's accepted floors (Continente 56 %, the Lidl app
screenshots 11–22 % of items). Still €0, and nothing leaves the browser.

**Why it matters:** if people still have to type in or check the items
on a large share of their receipts, receipt reading doesn't work as a
product. It's also what M3's itemised expenses are fed by.

**Where it starts:** a local spike (branch `spike/paddleocr`, not pushed)
ran PaddleOCR (`ppu-paddle-ocr` on ONNX Runtime Web, the PP-OCRv5 mobile
models, about 13 MB, MIT and Apache-2.0) on the five real receipts with
M2's scoring: lidl1 44 %, lidl2 73 %, lidl3 all 5 items, Continente 94 %,
Tiffosi 100 %, with cleaner names and 0.5–2 s per read on the desktop.
The chosen route is local: **PaddleOCR + our parser + the fiscal QR
total check**.

**Must-have**
- **A larger local test set**: at least 30 real receipts (the user is
  gathering more), across supermarkets, restaurants, cafés, shops, app
  screenshots and phone photos. Like M2's five, they hold personal data:
  **local only, never committed**, git-ignored and guarded, with tests
  that skip without them. Each has an expected file (items as printed,
  and the total).
- **One accuracy measure**, run on that set and reported per receipt:
  - **receipt accuracy**: the share of receipts read with **no edit
    needed** (every item's name recognisable, every price right, and the
    items adding up to the receipt's total);
  - **item accuracy**: the share of the printed items read with the
    right price.
- **The PaddleOCR reader** behind M2's `ReceiptReader` interface, in a
  worker, with its models served from the app's own address under the
  existing Content-Security-Policy. Whether Tesseract stays as a fallback
  or is removed is decided in the plan. A new ADR records the change (ADR
  0002 chose Tesseract), and the licence notices are updated.
- **Image clean-up and parser retuned** for PaddleOCR's text detection
  and lines, and parser rules for the layouts the larger set shows.
- **Honest flags**: a receipt that isn't fully read never shows
  "Matches"; the gap and the "⚠ Check" markers show what to fix.
- **Phone reading time**, waived in M2: on the user's phone, a 12.6-MP
  photo within 60 s and a small screenshot within 20 s (the plan may
  tighten these).
- The committed synthetic corpus keeps passing in CI.

**Useful**
- A **row-by-row review** of what the reader found: the receipt image
  with each line's role (item, total, discount, ignored), and adding a
  line it missed.
- **Help with the input**: when the text is too small to read (a
  low-resolution screenshot), say so and suggest a full-resolution or
  zoomed-in one.
- Cropping and perspective correction, if the test set shows angled
  photos failing.
- A time-boxed test of an image-to-JSON model (e.g. Donut) as a second
  opinion, measured on the same set. Note that
  `AdamCodd/donut-receipts-extract` v2 is CC-BY-NC (non-commercial), and
  it's about 0.2B parameters.

**Future / validation-dependent**
- Remembering the user's corrections on the device.
- If the local route stops short of the goal on the test set: an opt-in
  "enhanced reading" with the user's own AI key (the
  [BYOK backlog item](#validation-dependent-backlog)), which sends the
  image to their provider. That changes a guiding principle, so it's the
  user's decision, not this milestone's.

**Completion criteria**
- On the local test set (at least 30 receipts, including M2's five):
  receipt accuracy of at least **94 %**, aiming for 100 %, and every
  receipt that isn't fully read is flagged (no false "Matches"). If the
  local route plateaus below this, the plan stops and reports the numbers
  and causes; the target is never lowered silently.
- The phone reading times above, measured on the user's phone.
- No receipt data leaves the browser (M2's request checks still pass).
- `README.md` and `app/README.md` reviewed and updated (see "Every
  milestone").

**Not yet:** cloud or BYOK readers, a hosted reader, storing receipt
images (M3's "Useful"), households (M3).

---

## M3 — Households, members and the expense ledger

**Status:** Not started

**Objective:** Turn one-off bills into a household's running expense
history. This is the core expense model.

**Why it matters:** the shared-house problem is not "split this one bill".
It's "keep track of everything we share, over months". Balances,
settling up, sharing and every later phase build on this model.

**Must-have**
- **Households** (generic groups): create, rename, archive; several per
  device (a flat and a holiday group, say).
- **Members**: add, rename, and mark as left (with the date), keeping their
  history. Someone who has left still appears in past expenses and
  balances. Members are *people*, not accounts or devices.
- **Expenses**: a description, date, amount, category (a small fixed list
  to start), who paid, and how it's split. There are two ways to create
  one:
  - **a quick expense**: an amount split equally, by shares, by exact
    amounts, or by percentages, among chosen members;
  - **an itemised expense**: M1's bill splitter, fed by M2's receipt
    reader. The saved expense keeps its items and assignments.
- **Someone paid on behalf of others**: the payer can be any member,
  including one who isn't part of the split.
- **History**: a list per household, newest first, with a filter by
  member and category, and a search.
- **Corrections**: edit or delete any expense, and every balance is
  recomputed from the history (balances are derived, never stored).
- **Local persistence**: IndexedDB, with a versioned schema and tested
  migrations. It autosaves, and M1's single `settle.bill` draft is
  migrated into the new model.
- **Duplicate-receipt warning**: warn when a receipt with the same fiscal
  QR code (or merchant, date and total) is already in the household.

**Useful**
- Custom categories.
- Notes and an attached receipt image (stored locally, with a size cap and
  easy removal).
- Undo for delete.

**Future / validation-dependent**
- Recurring expenses (rent, internet, subscriptions). They're a strong
  household need, but wait until personal use shows how people want them
  to work. They're also a paid-layer candidate.
- Multi-currency households.

**Completion criteria**
- A household with 4 members, 30+ expenses of both kinds, a member who
  leaves and one who joins, and several corrections: every expense, and
  the history, survives a reload and an app update (a migration test).
- The split rules are unit-tested with the same exactness guarantees as M1.

**Not yet:** balances across the household (M4), sharing between devices
(M5), properties, units or tenants (M16).

---

## M4 — Balances and settling up

**Status:** Not started

**Objective:** Everyone can see what they owe or are owed across the
whole history, and settle it with as few payments as possible.

**Why it matters:** settling up is the moment the product has to earn
trust. The balances must be exact and understandable, and the next action
obvious.

**Must-have**
- **Net balance per member**, derived from the ledger: paid minus share,
  exact to the cent, and summing to zero across the household.
- **Suggested settlement**: a minimal set of payments that clears every
  balance (debt simplification), with a deterministic tie-break.
- **Record a settlement**, full or **partial**, between any two members.
  It's part of the history, and editable and deletable like an expense.
- **Explain a balance**: from a member's balance to the expenses and
  settlements that make it up.
- **Settle-up summary as text** (copy or share), extending M1's "Copy as
  text".

**Useful**
- The balance as of a date ("what did we owe at the end of last month?").
- Mark a period as settled, so the history view can start fresh without
  deleting anything.

**Future / validation-dependent**
- Payment links or requests (MB WAY, Revolut, IBAN QR). They depend on
  real users showing they want them, and on the providers' terms.

**Completion criteria**
- Property tests: balances always sum to zero, and applying the suggested
  settlements always clears them. Partial settlements and members who
  left are covered.
- Hand-checked examples for the edge cases in Phase 3's list.

**Not yet:** real payments or bank connections, and reminders or
notifications.

---

## M5 — Export, import, backup and sharing

**Status:** Not started

**Objective:** Users own their data, can back it up, move it to another
device, and share a household with their roommates without an account or a
server.

**Why it matters:** local-first data is only safe if it's easy to back up.
Roommates each have their own phone, so the free product needs *some* way
to share, even before cloud sync exists.

**Must-have**
- **Settle file**: one versioned, documented JSON format per household
  (members, expenses, settlements, and optionally receipt images). It has a
  schema version, is strictly validated with friendly errors, and
  round-trips exactly. (This keeps the good ideas from the old "finance
  file" plan: user-owned, versioned, validated.)
- **Backup and restore** of all data on the device, with a reminder when
  the last backup is old.
- **CSV export** of expenses and settlements, for spreadsheets.
- **Share a household**: send the Settle file to a roommate, who opens it
  on their device.

**Useful**
- **Merge** a roommate's updated file into your copy by stable record ids,
  with a clear view of what changes and a prompt for any conflict. This is
  what makes sharing work without a server. How far to take it is an open
  question, see [Sharing without a server](#sharing-without-a-server).
- A read-only summary link or image of the balances.

**Future / validation-dependent**
- Real-time multi-device sync (M13, a paid-layer candidate).
- Import from other apps' exports (e.g. Splitwise CSV), if early users ask
  for it.

**Completion criteria**
- Export, import and re-export gives identical data (tested). A file from
  an older schema version imports through migrations.
- Two devices can share one household by exchanging files, in functional
  review.

**Not yet:** accounts, a server, or any upload of household data.

---

## M6 — Installable PWA and public deployment

**Status:** Not started

**Objective:** Settle is live at a public URL, installable on a phone, and
works offline.

**Why it matters:** personal daily use and real users both need it on a
phone's home screen, not on `localhost`. This also settles the open
hosting question.

**Must-have**
- **Hosting** on a free static host that serves the app at `/` with the
  SPA fallback (ADR 0001, D11), plus HTTPS and the production CSP. The
  host's security headers replace the CSP `<meta>` where possible.
- **PWA**: installable, offline-capable app shell, the OCR assets cached
  after first use, and a clear update flow ("a new version is ready").
- **Camera-first receipt capture** and touch-friendly item assignment
  (tap a person, then tap items).
- A short **privacy page**: what stays on the device, and what doesn't
  (nothing, until M7).

**Useful**
- Web Share API for summaries and Settle files.
- Persistent storage request (`navigator.storage.persist()`), so the
  browser doesn't evict the data.

**Future / validation-dependent**
- A native wrapper (Capacitor) for the app stores.

**Completion criteria**
- It installs and works offline on Android and iOS for the full flow:
  household, receipt, expense, balances, export.
- Deploys from `master` automatically, costing €0.

**Not yet:** a custom domain, unless it's free or trivially cheap. App
store releases.

---

# Phase 2 — Privacy-first analytics and a minimal developer backoffice

**Objective:** know, in aggregate, whether and how Settle is used, without
learning anything about anyone's finances.

**Why it matters:** Phases 3–6 rely on evidence. Without instrumentation,
"is anyone using it, and for what?" can't be answered.

**Not yet in Phase 2:** anything about revenue, plans or subscriptions
(that's M15), per-user tracking, third-party analytics scripts, and
session replay.

## M7 — Privacy-first product analytics

**Status:** Not started

**Objective:** a small, documented event pipeline for product behaviour.

**Must-have**
- **An event catalogue**, documented in the repository. For example:
  - `household_created`, `member_added`;
  - `expense_created` (with its kind: quick or itemised), `expense_split`
    (with the split rule);
  - `receipt_imported`, `receipt_parsed` (outcome: matched, flagged or
    failed; the reader used);
  - `settlement_created`, `settlement_completed`;
  - `export_created`, `app_opened`, `error_occurred` (an error code only).
- **Event rules:** events carry the event name, the app version, coarse
  properties (enums and small counts), and a coarse timestamp. **They never
  carry** amounts, names, descriptions, items, merchants, dates of
  expenses, receipt text or images, or free text.
- **Active users and active households without tracking people**: counts
  by day, week and month from an anonymous, rotating identifier or
  equivalent. The choice is made in planning, after checking GDPR/ePrivacy
  rules for the Portuguese and EU audience.
- **User control**: a clear setting to turn telemetry on or off, the
  default decided in planning under those rules (opt-in if consent is
  required). The privacy page lists every event.
- **A €0 ingest endpoint** (e.g. a free-tier serverless function on the
  same host), so the CSP can keep `connect-src` to the app's own origin
  where possible. It stores events, not users.
- **Failure reporting**: error codes and app versions for crashes and
  failed receipt reads, with no content.

**Useful**
- A local "what we send" viewer in Settings, showing the last events
  queued.
- Batching and offline queueing.

**Future / validation-dependent**
- Funnels and retention cohorts beyond simple counts. Only build these if
  the M8 dashboard shows they're needed to answer a real question.

**Completion criteria**
- Tests prove that no event payload can contain a field outside the
  catalogue, and none of the forbidden data.
- Turning telemetry off stops all sending (tested).
- Running costs €0 at the expected volume.

**Not yet:** third-party analytics SDKs, fingerprinting, advertising IDs,
and per-user profiles.

---

## M8 — Minimal developer backoffice

**Status:** Not started

**Objective:** one private page where the developer can see whether
Settle is used, and whether it's healthy.

This is the **free-phase BO**. It exists for product learning, not as
customer support infrastructure. The business BO comes later (M15).

**Must-have**
- **Access limited to the developer.** It lives outside the public app, or
  behind the host's access control. It costs €0.
- **Usage:** active users and households (daily, weekly, monthly),
  counts of expenses created, receipts processed (by outcome and
  reader) and settlements completed, and exports.
- **Product events:** counts per event over time, by app version.
- **Health:** error codes and failed receipt reads over time, the latest
  deploy and version, and ingest status.
- **Storage/resources** where relevant: the event store's size and the
  free-tier limits.

**Useful**
- A weekly summary (a generated page or email) of the key numbers.

**Future / validation-dependent**
- User and account counts, once accounts exist (M13).
- Everything financial (plans, MRR, churn, costs), which is M15.

**Completion criteria**
- The dashboard answers "how many households used Settle this week, how
  many expenses and receipts, and did anything break?" from real events.

**Not yet:** looking up or impersonating individual users, viewing any
household's content, and any business metrics. **Privacy rule:** the BO
only ever shows aggregates of the M7 catalogue. It has no access to users'
financial data, because that data never leaves their devices.

---

# Phase 3 — Personal validation and stabilisation

## M9 — Personal validation and stabilisation

**Status:** Not started

**Objective:** the developer uses Settle for real, with their own
household, long enough to find what's wrong, and fixes it.

**Why it matters:** real use finds data-model and split problems that
tests and imagination miss. Fixing them now is far cheaper than after
real users rely on the data.

**Must-have**
- **At least 4 weeks of real use**, recording every real shared expense
  in Settle: receipts, corrections, and settling up at least once.
- **A usage log**: each friction, bug or missing capability, with the date
  and the scenario.
- **Edge cases exercised** on purpose, each with a test once it works:
  - a person joins or leaves the household mid-period;
  - someone pays on behalf of others;
  - unequal splits (shares, exact amounts, percentages);
  - shared items on receipts;
  - discounts, taxes and tips;
  - duplicate receipts;
  - correcting mistakes, including in old expenses;
  - adding historical expenses;
  - settling partial balances.
- **Fixes** for every data-model, splitting or settlement problem found.
  Schema changes go through M3's migrations, with no data loss.
- **Receipt-reading report**: how often the built-in reader was good
  enough, on real receipts, from the log and M7's `receipt_parsed`
  outcomes. This decides the BYOK backlog item.

**Useful**
- Performance checks on a large history (1 000+ expenses).
- Accessibility checks on the core flows.

**Completion criteria**
- Four consecutive weeks in which every real shared expense went through
  Settle, with no open data-model or balance bug.
- The usage log is triaged, with each item fixed, scheduled in a later
  milestone, or rejected with a reason.

**Not yet:** new features that the log doesn't ask for, and visual polish
(Phase 4).

---

# Phase 4 — Product design and UX

## M10 — Product design and UX pass

**Status:** Not started

**Objective:** make the proven workflows feel cohesive, obvious and
intentional, on a phone first.

**Why it matters:** real users (Phase 5) judge within minutes. But polish
only pays off once the workflow is known to work. **Visual polish is not a
substitute for validation.**

**Must-have**
- **Visual identity**: the logo (the current "S" mark is a placeholder),
  colour, typography, and a small component set built on the existing design
  tokens.
- **Onboarding**: from first open to the first household and first
  expense in under a minute, with no explanation needed.
- **Navigation** built around households: the household's home shows the
  balances, a quick "add expense", and recent activity.
- **Simpler expense and receipt-splitting flows**, informed by M9's log.
- **Balances you understand at a glance**, and a settle-up action that's
  obvious.
- **Empty, loading and error states** for every screen.

**Useful**
- Motion and micro-interactions that help understanding (not decoration).
- Portuguese UI translation, if the first users need it. (M11 answers
  this.)

**Completion criteria**
- 3–5 people who haven't seen Settle each complete "create a household,
  add a receipt expense, settle up" without help, in informal hallway
  tests. The problems they hit are fixed.

**Not yet:** new features. This pass reshapes existing ones.

---

# Phase 5 — Real-user validation

## M11 — Real-user validation (closed beta)

**Status:** Not started

**Objective:** put Settle in front of a small group of real households and
learn what they actually value. **Do not assume the answers in advance.**

**Who:** first, university students and people living with roommates (for
example 5–10 households). Maybe a few landlords or property managers
later, only to listen.

**Must-have**
- **Recruitment and onboarding** of the beta households, with a simple
  way to give feedback in the app (a link or form, not a tracking tool).
- **Quantitative signals** from M7/M8: households created, members added
  per household, expenses per household per week, the share of expenses
  from receipts, settlements completed, and whether people return in week
  2 and week 4.
- **Qualitative research**: short interviews at the start, after 2 weeks
  and at the end, and watching people use it.
- **Questions to answer, with evidence:**
  - Do people understand the product without explanation?
  - Do they create households, and invite (share with) their roommates?
  - Do they add expenses repeatedly?
  - Do they use receipt processing?
  - Do they settle balances?
  - Do they come back after the first use?
  - Which workflows confuse them?
  - Which features do they ask for repeatedly, and which do they ignore?
  - What makes them want to keep using Settle?
- **Fixes** for what blocks them. Anything bigger becomes a candidate for a
  later milestone.
- **Findings report**: the answers, the evidence, and the implications
  for Phase 6.

**Useful**
- A public "request a feature" or feedback page.

**Completion criteria**
- The findings report exists, and the beta ran at least 4 weeks. It
  states clearly whether Settle retains households, and why or why not.

**Not yet:** payments, pricing pages, or building requested features
before they're weighed against the findings.

---

# Phase 6 — Paid-product exploration

## M12 — Paid-product exploration

**Status:** Not started, and **conditional on M11** showing that
households keep using the free product.

**Objective:** find out what, if anything, people would pay for, and at
what price, before building any of it.

**Why it matters:** *do not monetise the idea, monetise validated
behaviour.* The paid layer should wrap what users already do and value,
adding convenience, automation, sync, backup, more powerful processing
and collaboration.

**Must-have**
- **A shortlist of paid-feature candidates**, each backed by M11's evidence
  (repeat requests, workarounds, drop-off points). Candidates, none of them
  committed:
  - cloud sync, cloud backup and multi-device use;
  - hosted AI/OCR and advanced receipt processing;
  - automatic categorisation, recurring expenses, automation;
  - advanced household features, collaboration, advanced analytics;
  - bank integrations;
  - landlord/property features.
- **Willingness-to-pay tests** (interviews, a pricing page with a
  waitlist, or pre-orders) for the top candidates.
- **Pricing hypotheses**, to validate, not decisions:
  - a free core that stays genuinely useful;
  - student pricing, around **€2.49/month**;
  - household pricing, around **€4.99/month**;
  - higher-priced landlord/property-manager plans.
- **Unit economics**: the cost per paying user of each candidate (hosting,
  sync storage, AI/OCR calls), and payment-provider fees.
- **Decision record**: which paid features to build (if any), at what
  price, and what stays free. This updates M13–M16 below.

**Completion criteria**
- The decision record exists and is backed by evidence. If the evidence
  doesn't support a paid layer, the roadmap says so and stays free-first.

**Not yet:** billing code, accounts, or student verification.

---

# Phase 7 — The paid layer (only what M12 validates)

## M13 — Accounts, cloud sync and billing

**Status:** Not started, and **conditional on M12**.

**Objective:** optional accounts, so a household's data follows its members
across devices and people, with billing for whatever M12 validated.

**Must-have (if M12 chooses sync)**
- Sign-in, and server-side storage of the same data model, with end-to-end
  encryption considered first.
- **Real household sharing**: invite roommates, and see the same ledger on
  every member's device.
- The Settle file stays supported for import, export and backup, so nobody
  is locked in, and the free local-first product keeps working without an
  account.
- Billing through a payment provider (subscriptions, invoices, VAT for EU
  customers). No card handling in the app itself.
- BYOK keys (if that backlog item was built) stay on the device by
  default. Syncing them is opt-in and encrypted.
- A privacy and security review before launch.

**Completion criteria**
- A signed-in household sees the same data on two members' devices, and
  a paid plan can be bought, cancelled and refunded end to end.

**Not yet:** any paid feature M12 didn't validate.

---

## M14 — Student plan and verification

**Status:** Not started, and **conditional on M12** showing students value
a student price.

**Objective:** a student plan with the lightest verification that works.

**Must-have (if validated)**
- **Investigate first**: do students actually value the discount, and is
  abuse a real problem at this price?
- If verification is needed, **integrate a specialised verification
  provider**. Settle does not build its own identity or enrolment checks.

**Not yet:** building verification infrastructure, and storing student ID
documents.

---

## M15 — Business and financial backoffice

**Status:** Not started, and **conditional on M13** (there's revenue to
track).

**Objective:** extend M8's BO with what a paid product needs.

**Must-have (when monetised)**
- Plans, subscriptions and paying users (student, household, landlord).
- MRR, revenue and churn.
- Costs: infrastructure, AI/API usage, and payment fees, against revenue.
- User and account counts, and active accounts.

**Not yet (ever, unless there's a reason):** viewing a household's
expenses or receipts. Support tools that need personal data get their
own privacy review first.

---

# Phase 8 — Expansion (only with evidence)

## M16 — Landlord / property-manager experiments

**Status:** Not started, and **conditional on evidence** (landlords in
M11/M12 asking for it, and willing to pay).

**Objective:** test the narrow wedge, *shared expenses and financial
reconciliation for multi-tenant properties*, without becoming a
property-management platform.

**Candidate scope (to validate):**
- properties with units or rooms, and tenants, reusing households and
  members (a property as a group of households, or a household with
  units);
- allocation rules for shared bills (by room, by occupancy, fixed
  shares);
- payment and settlement tracking per tenant, across several properties;
- property-level reporting and export.

**Not yet:** leases, rent collection, maintenance tickets, tenant
screening, accounting integrations, and anything else that belongs to a
full property-management system.

**Architecture note for earlier milestones:** keep households and members
general. Don't assume one household per user, that members have devices,
or that a split rule is always per person. That keeps this path open
without building any of it.

---

## Validation-dependent backlog

Ideas worth keeping that don't have a milestone. Each one moves into a
milestone only when evidence (personal use, the beta, telemetry,
willingness to pay) supports it.

- **Bring-your-own-key receipt reading** (the old M3). The user's own AI
  or receipt-service key, called straight from the browser. It's €0 for
  the project and much more accurate. Revisit if M2.5's local reader
  stops short of its goal, or after M9's receipt-reading report. The design notes are kept under
  [Bring your own key (BYOK)](#bring-your-own-key-byok).
- **Personal finance** (the old M4–M7): a personal "key" file, dashboards
  of income and expenses, and your share of household expenses feeding
  your own finances. It's a possible expansion once the household product
  is validated. M5's Settle file and M3's local working copy already
  cover the durable parts of the idea.
- Recurring expenses and subscription detection (also a paid candidate).
- Multi-currency (for example, trips).
- Importing bank CSV/OFX exports, and bank integrations (a paid
  candidate).
- Payment links (MB WAY, Revolut, IBAN QR) for settling up.
- Savings goals and alerts.
- Automatic categorisation (a paid candidate if it needs a hosted model).
- A native app-store wrapper (Capacitor).

---

## Decisions and open questions

### Receipt parsing

Decision: tiers behind one shared reader interface (M2's `ReceiptReader`).

| Tier | Cost to project | Privacy | Accuracy | Status |
|------|-----------------|---------|----------|--------|
| Built-in (M2): Tesseract.js + rule parser + fiscal QR | None | Nothing leaves the browser | Fine on clean receipts, weak on real photos and app screenshots (M2's floors: 11–100 % of items) | Phase 1, replaced in M2.5 |
| Built-in (M2.5): PaddleOCR + rule parser + fiscal QR | None | Nothing leaves the browser | Goal: 94–100 % of receipts with no edit needed | Phase 1 (M2.5) |
| BYOK: the user's AI model or receipt-service key | None (the user pays their provider) | Image sent to the user's chosen provider | Much better, returns items directly | Backlog, after M9 |
| Hosted AI/OCR | Per receipt, so it needs a paid plan | Image sent to Settle's provider | Much better | Paid candidate (M12) |

The review step applies to every tier, so a reader that is mostly right is
still usable.

### Bring your own key (BYOK)

Kept for the backlog item above.

- **Browser to provider, with no project server in between.** This keeps
  the "no server" principle and means the key never reaches the project.
  It only works for providers that accept requests straight from a browser.
  Anthropic (which needs an explicit opt-in header), OpenAI, and Google
  Gemini are expected to work; check each when the item is planned.
  Services that need request signing (e.g. AWS) or block browser requests
  would need a small relay server. Those are deferred unless one is really
  wanted, and a relay must pass the key through without storing or logging
  it.
- **Key safety.** A key stored in the browser can be stolen by any script
  injected into the page, so the app needs a strict Content Security
  Policy (M2 adds one), no third-party scripts on pages that handle keys,
  and minimal dependencies. Recommend that users create a key with a
  spending limit just for this app.
- **Model and prompt choices** (which model, the JSON output format, cost
  per receipt) are decided when the item is planned, using the providers'
  current documentation.

### Sharing without a server

Roommates each have their own device, but the free product has no server.
The options, cheapest first:

1. **One bookkeeper**: one member keeps the household, and shares
   summaries as text (M4).
2. **File exchange**: send the Settle file, and the other person opens it
   (M5, must-have).
3. **File merge** by stable record ids, with conflict prompts (M5,
   useful).
4. **Real-time sync**: needs a server (M13, a paid candidate).

Open question: is 2 or 3 enough for real households? M11 answers it
("Do they invite roommates?") before sync is built.

### Analytics and privacy

Decided: aggregate, anonymous product events only (M7's rules), a €0
endpoint, and a user setting. Still open, for M7 planning:

- opt-in or opt-out by default, under GDPR/ePrivacy;
- how to count active users and households without a persistent
  identifier;
- which free-tier endpoint and event store to use, and their limits.

### Hosting

Decided in principle: a free static host with an SPA fallback (ADR 0001,
D11). Which host is chosen in M6, together with the M7 endpoint, so they
can share an origin.

### Pricing (hypotheses, not decisions)

A free core, student around €2.49/month, household around €4.99/month,
and higher-priced landlord plans. M12 validates or replaces all of these.

### Tech stack

**Decided in M0** (`docs/adr/0001-web-app-tech-stack.md`): TypeScript +
React + Vite, with npm as the package manager and path-based routes
(`/split`, not `/#/split`). Path routes need a host that serves the site
at `/` and rewrites unknown paths to `index.html`. Node comes from the
system package (Node 24 LTS, matching `app/.nvmrc`).

PWA support is expected via `vite-plugin-pwa` (M6). A later native app
would be a Capacitor wrapper around the same codebase.

### Earlier decisions, kept

- **Default currency and locale:** `pt-PT` / `EUR` (decided in M0),
  changeable by the user (M1, "Region setting").
- **The user-owned file** (from the old "finance key" discussion): keep a
  working copy in the browser (IndexedDB, autosaved), and a strictly
  validated, versioned file as the portable backup and exchange format.
  M3 and M5 carry this forward, as JSON rather than `.xlsx`: it's robust to
  parse and fits the household model. A spreadsheet export is covered by
  CSV.

---

## Roadmap strategy

Settle is built in a deliberate order: **useful, then used, then loved,
then paid.**

1. **Free local-first core (Phase 1):** receipts, households, the expense
   ledger, balances, settling up, backup and sharing, deployed as an
   installable PWA. It runs in the browser for €0, with no account. This is
   the product, not a demo of it.
2. **Just enough instrumentation (Phase 2):** anonymous, aggregate events
   and a minimal developer BO, so every later decision can use evidence.
   Nobody's finances are ever seen.
3. **Personal use (Phase 3):** the developer's own household runs on
   Settle for weeks. Edge cases and data-model problems get fixed while
   they're cheap.
4. **Design (Phase 4):** the proven workflows get a coherent identity and
   an effortless mobile experience. Polish follows function; it never
   replaces validation.
5. **Real users (Phase 5):** a closed beta with student and roommate
   households, measured and interviewed, to learn what they actually
   value.
6. **Paid exploration (Phase 6), then the paid layer (Phases 7–8):** only
   now are paid features chosen, from observed demand and tested
   willingness to pay. Pricing starts as hypotheses. Accounts, sync,
   billing, a student plan, the business BO and landlord experiments are
   each built only if the evidence supports them.

**Why the business layer comes last.** A paid layer built before the free
product has proven itself monetises a guess. Building it after validation
means selling convenience, automation, sync and power around behaviour
people already repeat. That's more likely to be paid for, and it keeps the
free product honest. It also keeps running costs at €0 until there's
revenue to cover them. The principle is simple: **do not monetise the
idea; monetise validated behaviour.**
