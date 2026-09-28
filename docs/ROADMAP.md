# Roadmap

Product milestone ordering for Settle (repository `project-Settle`). `/milestone-plan` picks the first
milestone whose status is not **Complete**; `/accept-milestone` marks it
complete here. Each milestone should ship something usable on its own.

Last updated: 2026-09-27

## Product vision

A web app (built so it can later become an installable/mobile app) that:

1. **Splits bills.** Upload a receipt, pick how many people are splitting it,
   assign each item to whoever bought it, and see a dashboard of how much
   each person owes.
2. **Grows into a personal finance helper.** You keep your finances in a file
   that follows a documented format. Uploading it turns it into interactive
   dashboards (income, expenses, categories, trends, and so on). You edit
   in the app, then download an updated file that you bring back next time.
   That file acts as your "key".
3. **Connects the two.** When you split a receipt and mark which part is
   yours, your share is added to your expenses automatically.

Guiding principles:

- **Simple first.** No database and no accounts in the early milestones.
- **Your data stays yours.** Processing happens in the browser wherever
  possible. Nothing is stored on a server until accounts exist (M9).
- **No running costs for the project.** Built-in features are free and run
  in the browser. Paid or AI-powered extras run on the user's own API key
  ("bring your own key"), never on a project-owned key.
- **Mobile-friendly from day one.** Responsive layout and PWA-ready, so
  moving to an app later is a wrapper, not a rewrite.

## Milestone overview

| #  | Milestone                                   | Status      |
|----|---------------------------------------------|-------------|
| M0 | Project foundation                          | Complete    |
| M1 | Bill splitter (manual entry)                | Complete    |
| M2 | Receipt upload and built-in parsing         | Not started |
| M3 | Bring-your-own-key receipt reading          | Not started |
| M4 | Finance file format ("the key")             | Not started |
| M5 | Finance file import and dashboards          | Not started |
| M6 | Interactive editing and export              | Not started |
| M7 | Bill split to expenses integration          | Not started |
| M8 | Installable app (PWA / mobile polish)       | Not started |
| M9 | Accounts and sync                           | Not started |

### Every milestone

From M1 on, every milestone ends by checking the root `README.md`,
the page people see first on GitHub:

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

---

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

**Status:** Not started

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
  structured receipt out), so M3 can plug in other readers without changes
  elsewhere.

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

## M3 — Bring-your-own-key receipt reading

**Status:** Not started

**Goal:** Users who want better accuracy can connect their own AI or
receipt-reading service. It runs on their account and their costs, never
the project's.

**Scope**
- Settings page, "Receipt reading": choose **Built-in (free, private)** or
  a provider, then paste your API key. Include a "Test key" button.
- Supported providers, starting with the ones that can be called directly
  from the browser (see
  [Bring your own key](#bring-your-own-key-byok)):
  - AI vision models, e.g. Anthropic (Claude), OpenAI, Google (Gemini).
    Each gets a prompt asking for the receipt as structured JSON.
  - Dedicated receipt services (e.g. Mindee, Veryfi, AWS Textract,
    Azure Document Intelligence), each added only if it works without a
    project-owned server.
- **The key is stored only in the user's browser** and sent only to the
  chosen provider, never to a project server. Option to keep it for this
  session only, or remember it on this device. A clear "Forget key"
  button.
- Clear consent text: the receipt image is sent to the chosen provider,
  and usage is billed to the user's account with them.
- If the provider call fails (bad key, no credit, rate limit, offline),
  show the error and fall back to the built-in reader.
- The provider's result goes through the same checks (fiscal QR total,
  items vs total) and the same review step as M2.

**Done when**
- With a valid key, a receipt is read through at least one AI provider and
  lands in the review step. With no key or a failing key, the built-in
  reader is used.
- Tests or inspection confirm the key never appears in any request except
  the one to the chosen provider.
- `README.md` (and `app/README.md` if setup changed) reviewed and
  updated for M3: outdated parts removed, new features added (see
  "Every milestone").

---

## M4 — Finance file format ("the key")

**Status:** Not started

**Goal:** A documented, versioned file format that the user owns and the
app can read reliably.

**Scope**
- Written rules for the file: required sheets, columns, types, allowed
  categories, and date and currency formats.
- A downloadable blank template with example rows.
- A hidden `_meta` sheet holding the schema version and app version, so
  future format changes can be migrated automatically.
- A validator that reports friendly, cell-level errors ("Sheet
  *Transactions*, row 14: amount is not a number") instead of failing
  silently.

**Suggested initial sheets:** `Transactions` (date, description, amount,
type income/expense, category, account, notes, source), `Categories`,
`Accounts`, `Budgets` (optional), `_meta`.

**Done when**
- The template, the rules document, and the validator exist.
- The validator has tests for valid files and for each class of error.
- `README.md` (and `app/README.md` if setup changed) reviewed and
  updated for M4: outdated parts removed, new features added (see
  "Every milestone").

---

## M5 — Finance file import and dashboards

**Status:** Not started

**Goal:** Upload the finance file and see useful dashboards right away.

**Scope**
- Parse the file in the browser (no upload to a server).
- Dashboards:
  - Overview: income, expenses, net, and savings rate for the selected
    period.
  - Expenses by category, and category trends month over month.
  - Income sources.
  - Cash flow over time.
  - Budget vs actual (if `Budgets` is filled in).
- Filters: date range, category, account.

**Done when**
- The template file and a realistic 12-month sample file render correctly.
- Dashboard numbers are checked against hand-calculated totals in tests.
- `README.md` (and `app/README.md` if setup changed) reviewed and
  updated for M5: outdated parts removed, new features added (see
  "Every milestone").

---

## M6 — Interactive editing and export

**Status:** Not started

**Goal:** Close the loop: edit in the app, then download the new key.

**Scope**
- Add, edit, and delete transactions and categories in the app.
- Dashboards update live as you edit.
- "Download updated file" writes a valid file in the M4 format.
- **Autosave the working copy in the browser**, so closing the tab doesn't
  lose work. Warn about unsaved changes that haven't been exported.
- Keep the original file's formatting and any extra user columns where
  possible.

**Done when**
- Round trip passes: import, then export, then re-import gives identical
  data (tested).
- The exported file passes the M4 validator.
- `README.md` (and `app/README.md` if setup changed) reviewed and
  updated for M6: outdated parts removed, new features added (see
  "Every milestone").

---

## M7 — Bill split to expenses integration

**Status:** Not started

**Goal:** Splitting a receipt feeds your finances automatically.

**Scope**
- While a finance file is loaded, the splitter lets you mark which person
  is "me".
- My share becomes an expense transaction, with category suggested from
  the receipt/merchant and editable before saving. The source links back
  to the split.
- Optional: if I paid the whole bill, track what others owe me as
  receivables, and mark them settled when repaid.
- Also works in reverse: splitting without a finance file loaded behaves as
  in M1–M3.

**Done when**
- Splitting a receipt and confirming adds exactly my share to
  `Transactions`, and it appears in dashboards and in the exported file.
- `README.md` (and `app/README.md` if setup changed) reviewed and
  updated for M7: outdated parts removed, new features added (see
  "Every milestone").

---

## M8 — Installable app (PWA / mobile polish)

**Status:** Not started

**Goal:** It feels like an app on a phone.

**Scope**
- PWA: installable, offline-capable app shell, camera-first receipt capture.
- Touch-friendly item assignment (for example, tap a person, then tap
  items).
- Optional: wrap as a native app (Capacitor or similar) if app store
  distribution is wanted.

**Done when**
- Installs and works offline on Android and iOS for the whole split flow and
  for a previously loaded finance file. (BYOK readers need a connection;
  the built-in reader does not.)
- `README.md` (and `app/README.md` if setup changed) reviewed and
  updated for M8: outdated parts removed, new features added (see
  "Every milestone").

---

## M9 — Accounts and sync

**Status:** Not started

**Goal:** Optional accounts, so data can follow you across devices without
passing files around.

**Scope**
- Sign-in, and server-side storage of the same data model.
- The file stays supported as import/export and backup, so nobody is
  locked in.
- Shared bills: friends can open a split link and see what they owe.
- BYOK keys stay on the device by default. Syncing them to the account is
  opt-in and only with encryption.
- Privacy and security review before launch.

**Done when**
- A signed-in user sees the same data on two devices. Import and export
  still work.
- `README.md` (and `app/README.md` if setup changed) reviewed and
  updated for M9: outdated parts removed, new features added (see
  "Every milestone").

---

## Later ideas (unscheduled)

- Recurring transactions and subscription detection.
- Multi-currency (for example, splitting bills on trips).
- Savings goals and alerts.
- Importing bank CSV/OFX exports into `Transactions`.
- Settle-up suggestions across several bills with the same group.
- BYOK AI for finance features too, e.g. auto-categorising transactions or
  a "what changed this month" summary.

---

## Decisions and open questions

### Is the Excel file the right "key"?

The idea behind it is good: no database, the user owns their data, and it
still opens in Excel. Using the file as the *only* place data lives has two
weak points, though:

- **Forgetting to download means losing work.** If the session is closed
  before exporting, the edits are gone.
- **Hand-edited spreadsheets break easily.** A renamed column or a typed
  "12,50€" in a number cell makes parsing fragile.

**Recommendation (reflected in M4 and M6): keep the file as the key, but
back it up.**

- Keep a working copy **in the browser (IndexedDB)** with autosave. No
  server or database needed. The app reopens where you left off on the same
  device.
- The **`.xlsx` stays the portable key**: the way to back up, move to
  another device, or view in Excel. It is strictly validated and
  versioned (the `_meta` sheet), with friendly error messages.
- When accounts arrive (M9), the server takes the place of the browser copy
  and the file stays as import/export. Nothing earlier is thrown away.

An alternative is a plain JSON/CSV key, which is simpler and more robust to
parse. The downside is that you lose "it opens nicely in Excel", so `.xlsx`
is still the default.

### Receipt parsing

Decision: two tiers, behind one shared reader interface.

| Tier                                  | Cost to project | Privacy                        | Accuracy                             |
|---------------------------------------|-----------------|--------------------------------|--------------------------------------|
| Built-in (M2): Tesseract.js + rule parser + fiscal QR | None | Nothing leaves the browser | Fine on clean receipts, weaker on crumpled or thermal paper |
| BYOK (M3): user's AI model or receipt service key | None (the user pays their provider) | Image sent to the user's chosen provider | Much better, returns items directly |

The review step applies to both, so a reader that is mostly right is still
usable.

### Bring your own key (BYOK)

- **Browser to provider, with no project server in between.** This keeps
  the "no server" principle and means the key never reaches the project.
  It only works for providers that accept requests straight from a browser.
  Anthropic (which needs an explicit opt-in header), OpenAI, and Google
  Gemini are expected to work; check each during M3 planning. Services
  that need request signing (e.g. AWS) or block browser requests would
  need a small relay server. Those are deferred unless one is really
  wanted, and a relay must pass the key through without storing or
  logging it.
- **Key safety.** A key stored in the browser can be stolen by any script
  injected into the page, so the app needs a strict Content Security
  Policy, no third-party scripts on pages that handle keys, and minimal
  dependencies. Recommend that users create a key with a spending limit
  just for this app.
- **Model and prompt choices** (which model, the JSON output format,
  cost per receipt) are decided in M3 planning using the providers'
  current documentation.

### Tech stack (to decide in M0)

**Decided in M0** (`docs/adr/0001-web-app-tech-stack.md`): TypeScript +
React + Vite, with npm as the package manager and path-based routes
(`/split`, not `/#/split`). Path routes need a host that serves the site
at `/` and rewrites unknown paths to `index.html`. Node comes from the
system package (Node 24 LTS, matching `app/.nvmrc`).

The original suggestion, for reference:

Suggested: **TypeScript + React + Vite**, SheetJS or ExcelJS for `.xlsx`,
a chart library (e.g. Recharts or ECharts), and PWA support via
`vite-plugin-pwa`. This keeps one codebase for web and a later Capacitor
app. Alternatives (Next.js, SvelteKit, Flutter) are worth considering.

### Other open questions

- ~~Default currency and locale~~ **Decided in M0:** `pt-PT` / `EUR` by
  default (`,` decimal separator), and changeable by the user (M1 scope,
  "Region setting").
- Should dashboards support several people in one household file, or is it
  one file per person?
- Hosting target for the web app (a static host is enough until M9, or
  until a BYOK relay is needed).
