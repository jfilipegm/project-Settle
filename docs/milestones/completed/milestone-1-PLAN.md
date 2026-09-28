# Milestone 1 — Bill splitter (manual entry): execution plan (Revision 3)

- **Work item:** `milestone-1` (product, governing workflow version `2.1`)
- **Plan revision:** 3 (revision 1 → 2 applies local plan review round 1,
  and 2 → 3 applies round 2; see "Review dispositions")
- **Base commit:** `7728f52e8b3d393cff4d9f749ac50299392240d2` (`master` after
  M0 and PRs #2 and #3 were merged; release `v0.1.0`)
- **Branch / PR:** `feature/milestone-1`. The PR to `master` opens after the
  first commit, which is this plan's approval commit (CLAUDE.md, "Git and
  GitHub workflow").
- **Roadmap entry:** `docs/ROADMAP.md` → "M1 — Bill splitter (manual entry)"
- **Registry:** `docs/ai-workflow/registry/milestone-1-registry.json`
- **Requirement mapping:** `docs/ai-workflow/requirements/milestone-1-mapping.json`
- **Artifact declarations:** `docs/ai-workflow/registry/milestone-1-artifacts.json`

## Goal

Split a real bill correctly with items typed in by hand, on a phone or a
desktop, before OCR (M2) adds uncertainty. After M1 a user can:

- enter a bill: its items (name, quantity, unit price) and the people
  sharing it;
- assign each item to one or more people, with equal or custom shares;
- add tax, tip/service and a discount;
- see who owes what, down to the cent, with totals that always add up to
  the bill total, and copy the result as text;
- choose their locale and currency (default `pt-PT` / `EUR`).

The repository also gets a simple root `README.md`.

## Decisions taken in this plan

| # | Decision | Chosen | Source |
|---|----------|--------|--------|
| D1 | Where the split logic lives | A pure, framework-free module `app/src/features/split/` (`model.ts`, `split.ts`), separate from React. The UI only calls `computeSplit(bill)`. | Plan default: keeps the math unit-testable and reusable by M2 (parsed receipts open in this editor) and M7 |
| D2 | Item price semantics | Each item has a **unit price** and a **quantity**. `lineTotal = quantity × unitPrice`, rounded **once per item**, half away from zero (`multiplyRatio`). Quantity is a positive decimal (`parseRatio`: `2`, `0,75`), default `1`. Prices are `≥ 0`. A bill stores every quantity and percentage as a ratio `{ numerator, denominator }` with a safe-integer `numerator ≥ 0` and `denominator ∈ {1, 10, 100, 1000}`. `toBillRatio` (in `model.ts`) builds one from `parseRatio`'s output and strips trailing zeros first, so `1,0000` is stored as `1 / 1`. | Plan default: receipts print a rounded line total per item. Negative lines (item-level discounts) are out of scope: use the bill discount (D5). |
| D3 | Shares | Each assignment is a positive integer share weight (default `1`, max `99`). An item with assignees `{A: 2, B: 1}` splits 2 : 1. A new item is assigned to **everyone**, and the user deselects people. | Plan default: covers "equal by default, custom shares possible" without fractional input |
| D4 | Rounding policy (the heart of M1) | See "Split algorithm" below. There are exactly three rounding points: (1) each line total, (2) each percentage adjustment, computed once at bill level, (3) **one** exact largest-remainder allocation of the bill total over every person's exact share. The breakdown's display rounding (step 6) happens inside each person's already-fixed total and never changes a total. | M0 plan "Notes for M1 planning": allocate once per bill, never item by item |
| D5 | Adjustments | **Tax**, **tip/service** and **discount**, each entered as a fixed amount or a percentage **of the items subtotal**. Bill total = items subtotal + tax + tip − discount. Tax and tip can each be split **proportionally** to each person's items subtotal (default) or **equally** among all people. The discount is always split proportionally, and it can't exceed the items subtotal. | Roadmap "(or equally, as an option)". A proportional-only discount guarantees no person's share goes negative. Open question 1 |
| D6 | Tax meaning | "Tax" is extra tax **not already included** in the prices (e.g. US-style receipts). Portuguese receipts include IVA in prices, so it defaults to none, and its UI label says so. | Plan default |
| D7 | Tie-break for leftover cents | Largest remainder, with ties going to the person listed first. It applies once per bill, so no person absorbs a cent per item. | `allocate`'s documented rule (M0) |
| D8 | Who owes whom | One payer (default: the first person, changeable). Every other person with a non-zero total owes the payer their total. Multiple payers and settling up across bills are out of scope ("Later ideas"). | Roadmap "one payer by default" |
| D9 | Region setting | Locale `pt-PT` / `en-GB` / `en-US` × currency `EUR` / `GBP` / `USD`, chosen independently in Settings → Region. Stored under `localStorage['project-w.region']`, validated on read (unknown → default). Changing the currency **relabels** amounts and never converts them; the Settings page says so. | User decision at M0 acceptance (roadmap M1 scope) |
| D10 | Currency symbols in input | `parseAmount` gains a `currency` parameter (default `DEFAULT_CURRENCY`) and accepts exactly that currency's symbols, in the same prefix/suffix positions as `€` today (`-` before a prefix symbol included). The table is `{ EUR: ['€'], GBP: ['£'], USD: ['US$', '$'] }`, matched longest first. `US$` is needed because `Intl` prints USD as `1234,56 US$` under pt-PT and `US$1,234.56` under en-GB, and only en-US prints a bare `$`. Any other currency's symbol (e.g. `US$` or `$` under EUR, `€` under GBP) is `invalid`. | Roadmap M1: "its symbol set grows with the currencies offered"; round-1 review I-1 |
| D11 | Draft persistence | The bill being edited is kept in `localStorage['project-w.bill']` as `{ version: 1, bill }`, so a refresh doesn't lose a 10-item bill. It's validated on load: an unknown version or an invalid shape starts a fresh bill and never crashes. "New bill" clears it. There's one draft, and no history. | Plan default, per "Simple first", with no database. Open question 2 |
| D12 | Export | "Copy as text" (Clipboard API) of the result: the bill total, each person's total, and who owes whom. Image/PDF export and the Web Share API are out of scope (roadmap marks image/PDF optional; sharing fits M8). | Plan default |
| D13 | New helpers in `money.ts` | `allocateExact(total, weights: readonly bigint[])` (same largest-remainder rules as `allocate`, BigInt weights, no safe-sum limit) and `percentOf(amount, ratio)` (`multiplyRatio` by `numerator / (denominator × 100)`, half away from zero, `RangeError` if `denominator × 100` isn't a safe integer). `allocate` becomes a thin wrapper over `allocateExact`. | M0 plan "Notes for M1 planning" (`percentOf`); D4 needs weights beyond 2⁵³ |
| D14 | Limits | 1–20 people, 1–100 items, item name ≤ 60 characters. Each share weight is an integer 1–99 (D3). Amounts: each unit price and each fixed adjustment is 0 to `1 000 000,00` (10⁸ cents). Quantity is greater than 0 and at most `10 000`, with at most 3 decimals. Each percentage is 0 to `1000 %`, with at most 3 decimals. "At most 3 decimals" counts significant decimals: trailing zeros are stripped first (`toBillRatio`), and a stored ratio must then have `denominator ∈ {1, 10, 100, 1000}`. The UI enforces these limits, and `validateBill` rejects anything past them with a typed error. With them, `T ≤ 100 · 10⁸ · 10⁴ = 10¹⁴` cents and `G ≤ T + 2 · 10 · T + 2 · 10⁸ < 3 · 10¹⁵ < 2⁵³`, and every `percentOf`/`multiplyRatio` denominator is ≤ `10⁵`. Every item's `Wᵢ ≥ 1`, because an assigned item has at least one weight ≥ 1. So no money helper, BigInt conversion or division can throw on a bill that passes validation. | Plan default: bounds keep the exact arithmetic cheap and the UI usable; round-1 review I-3, round-2 review I-4 |

## Split algorithm (D4, specified exactly)

Inputs: items `i` with line total `Lᵢ` (Cents, D2) and share weights `wᵢₚ`
(for each assignee `p`), with `Wᵢ = Σₚ wᵢₚ`; the adjustments; the people.

1. **Items subtotal** `T = Σᵢ Lᵢ`, exactly.
2. **Adjustment amounts**: a fixed amount is taken as entered. A
   percentage `r` is `percentOf(T, r)`, one rounding each. Then
   `tax`, `tip`, `discount` ≥ 0, and `discount ≤ T` (otherwise it's a
   validation error).
3. **Bill total** `G = T + tax + tip − discount` (exact integer, ≥ 0).
4. **Exact share of each person `p`**, as a BigInt rational:
   - items: `Sₚ = Σᵢ Lᵢ·wᵢₚ / Wᵢ`;
   - proportional adjustment `A`: `A·Sₚ / T` (if `T = 0` then `A`
     must be 0; otherwise it's a validation error);
   - equal adjustment `A`: `A / n`, over all `n` people;
   - discount: `−discount·Sₚ / T`.

   `Eₚ` is the sum of these. By construction, `Σₚ Eₚ = G` and every
   `Eₚ ≥ 0`.
5. **One allocation**: scale every `Eₚ` by the common denominator
   `D = T′ · lcm(Wᵢ) · n`, where `T′ = T` if `T > 0` and `T′ = 1`
   otherwise (with `T = 0` every `Sₚ` and every proportional term is
   0), to get integer BigInt weights `Eₚ·D`. Then call
   `allocateExact(G, weights)`. The result is each person's **total**.
   Guarantees: the totals sum to exactly `G`; each total is the floor or
   the ceiling of `Eₚ`; a person with `Eₚ = 0` pays 0.
6. **Breakdown (display only, sums exactly, with no "Rounding" line)**.
   Each person's lines are rounded **within that person's own total**,
   never item by item across people. Revision 1 used a per-item
   `allocate(Lᵢ, wᵢ)` here. That reintroduced the item-by-item unfairness D4
   rejects, then hid it in a "Rounding" line: `−0,66 €` for 100 × `1,00 €`
   split three ways (round-1 review I-2). For person `p` with authoritative
   total `Rₚ` from step 5:
   - **Discount line** `d̂ₚ`: the person's part of **one** bill-level
     `allocateExact(discount, Sₚ·lcm(Wᵢ))`, shown negated. The discount
     lines sum to the discount across people.
   - **Positive lines**: the exact values `xⱼ` of the person's item shares
     (`Lᵢ·wᵢₚ/Wᵢ`), then the tax part and the tip part, in that order,
     each of them exact.
     They are `allocateExact(Rₚ + d̂ₚ, xⱼ·D)`. `Rₚ + d̂ₚ ≥ 0` and, when
     `Σⱼ xⱼ = 0`, `Rₚ = d̂ₚ = 0`, so the call never fails.
   - So the lines sum to `Rₚ` exactly, by construction. Each line is the
     floor or the ceiling of its exact value rescaled by
     `(Rₚ + d̂ₚ) / Σⱼ xⱼ`. That rescale moves the person's positive total
     by less than 2 cents (`|Rₚ − Eₚ| < 1`, `|d̂ₚ − dₚ| < 1`), so each line
     is within 3 cents of its exact value (proven bound, property-tested).
     In the fairness case, every line is within 1 cent.
   - Ties go to the person's earlier line. That only reorders cents within
     one person's own total, never between people. The trade-off: an item's
     displayed shares across people can differ from `Lᵢ` by a few cents. The
     per-person totals, not the per-item columns, are authoritative, and
     the UI never shows a per-item cross-person sum.
7. **Settle-up** (D8): each non-payer with a total > 0 owes the payer that
   total.

`computeSplit(bill)` returns either `{ ok: true, result }` or
`{ ok: false, errors }`. The errors are typed and one of:

- an unassigned item;
- a discount above the subtotal;
- a proportional adjustment with a zero subtotal;
- a count limit exceeded (people, items or name length);
- `amountOutOfRange` (a unit price or fixed adjustment that isn't a safe
  integer in D14's range);
- `quantityOutOfRange` (0, above `10 000`, or a malformed ratio: a
  `numerator` that isn't a safe integer ≥ 0, or a `denominator` outside
  `{1, 10, 100, 1000}`, which covers 0, 3 and more than 3 decimals);
- `percentOutOfRange` (below 0, above `1000 %`, or a malformed ratio, as
  for quantities);
- `shareOutOfRange` (a share weight that isn't an integer 1–99, e.g. `0`,
  `1.5` or `100`);
- `invalidReference` (an assignment to a person id that isn't in
  `people`, a duplicate person or item id, a person assigned twice to one
  item, or a payer that isn't one of the people).

`computeSplit` runs `validateBill` first and computes only a valid bill.
`validateBill` has a rule for every numeric and reference field of `Bill`,
and D14's bounds keep every intermediate value in the safe range. So
`computeSplit` never throws for any value the `Bill` types allow,
including one built outside the UI (a loaded draft, or M2's parsed
receipt).

## Prerequisites (before `/milestone-implement`)

- Node 24 and npm, as in M0 (installed: `node --version` → v24.21.0).
- No new runtime dependency. Every feature uses React, React Router and
  browser APIs already available (Clipboard API, `localStorage`). A new
  dependency would be a stop condition.

## Checkpoints

<!-- Generated by workflow_state.render_registry_markdown(registry); do not edit by hand. -->
| id | name | depends_on | complexity | session_target |
| --- | --- | --- | --- | --- |
| M1-CP1 | Money extensions + Region setting (locale/currency, Settings page) | - | 3 | 1 |
| M1-CP2 | Split engine: bill model, validation, exact per-bill allocation, settle-up | M1-CP1 | 3 | 1 |
| M1-CP3 | Bill state: reducer, actions and versioned local draft | M1-CP2 | 2 | 2 |
| M1-CP4 | Split page UI: people, items, assignments, adjustments, results, copy as text | M1-CP3 | 3 | 2 |
| M1-CP5 | Root README, app README/home updates, end-to-end 10-item/3-person test | M1-CP4 | 2 | 3 |
<!-- End generated table. -->

### M1-CP1 — Money extensions + Region setting

**Requirements:** REQ-4, REQ-5, REQ-8

**Files**
- `app/src/lib/money.ts`:
  - `allocateExact` and `percentOf` (D13); `allocate` delegates to
    `allocateExact`, and its behaviour and errors are unchanged;
  - `parseAmount(input, locale?, currency?)` (D10), with a symbol table
    `{ EUR: ['€'], GBP: ['£'], USD: ['US$', '$'] }` matched longest
    first;
  - `MoneyCurrency` (the union of those keys), `SUPPORTED_LOCALES` and
    `SUPPORTED_CURRENCIES`.
- `app/src/app/region.ts` (+ `RegionProvider`/`useRegion` in
  `region.tsx`):
  - reads and writes `project-w.region`, with every access in try/catch;
  - a missing, unknown or unreadable value falls back to
    `{ locale: 'pt-PT', currency: 'EUR' }`;
  - the provider wraps the app in `App.tsx`.
- `app/src/pages/SettingsPage.tsx`: a real "Region" section with two
  labelled `<select>`s, a live example (`formatAmount(123456)` →
  "1234,56 €"), and the note that changing the currency doesn't convert
  amounts. Below it, a short "Receipt reading: coming in M3" line.

**Tests**
- `allocateExact`:
  - weights beyond 2⁵³ with exact expected parts;
  - `G = 0` with all-zero weights returns zeros (the zero-bill case);
  - it agrees with `allocate` on M0's seeded sweep;
  - the same errors as `allocate` (empty, negative, all-zero with a
    non-zero total).
- `percentOf`:
  - `percentOf(cents(1000), parseRatio('12,5'))` → 125;
  - the `.5` boundary, both signs;
  - a `RangeError` when `denominator × 100` is unsafe.
- `parseAmount`:
  - `£12.50` under en-GB/GBP and `$12.50` under en-US/USD are accepted;
  - `€12,50` under GBP is `invalid`;
  - under USD, `US$1,234.56` and `-US$3.20` (en-GB), `1234,56 US$` and
    `-3,20 US$` (pt-PT), and `$12.50` are accepted. `US$12.50` and `$12.50`
    under EUR or GBP are `invalid`;
  - every M0 case is unchanged under the default EUR (the existing table
    passes untouched);
  - the round trip `formatAmount` → `parseAmount` holds for each of the
    9 locale × currency pairs, for positive and negative amounts.
- Region:
  - the stored value is validated (unknown locale or currency, bad JSON,
    and a throwing storage all fall back to the default);
  - Settings changes update the example and persist across re-renders;
  - both selects have accessible labels.

### M1-CP2 — Split engine

**Requirements:** REQ-3, REQ-4, REQ-5, REQ-6

**Files**
- `app/src/features/split/model.ts`: the types `Bill`, `Person`, `Item`,
  `Assignment`, `Adjustment` (`{ kind: 'amount', value: Cents } |
  { kind: 'percent', ratio }`, plus the split mode for tax and tip),
  `toBillRatio` (D2) and `validateBill`.
- `app/src/features/split/split.ts`: `computeSplit(bill)`, implementing
  "Split algorithm" steps 1–7 with BigInt rationals (a small internal
  `Fraction` of `{ num: bigint, den: bigint }`, never floats).
- `app/src/features/split/format.ts`: `resultAsText(result, region)` for
  D12.

**Tests (Vitest)**
- **Properties**, over a seeded generated sweep: 1–8 people, 1–15 items,
  prices 0–50 000 cents, quantities `1`, `2`, `0,5` and `1,25`, weights
  1–5, random adjustments in both modes. For each case:
  - the totals sum to `G` exactly;
  - each total is the floor or the ceiling of the exact `Eₚ`, checked
    against an independent BigInt reference in the test;
  - each person's breakdown lines sum to their total, with no
    "Rounding" line;
  - each breakdown line is within 3 cents of its exact value (step 6's
    bound), and the discount lines sum to the discount;
  - no total is `-0`;
  - the result is identical when the same bill is computed twice.
- **Examples** with hand-computed expected results:
  - one item split three ways (`10,00 €` → `3,34 / 3,33 / 3,33`);
  - a 2 : 1 custom share;
  - a quantity of `0,75` × `3,99 €`, where the line total rounds once;
  - 10 % tip proportional vs equal;
  - a fixed discount proportional;
  - a percentage tax;
  - a person with no items: they pay 0 with proportional adjustments,
    and a share with an equal tip;
  - the fairness case: ten `1,00 €` items each split three ways. The
    result is `3,34 / 3,33 / 3,33` once for the whole bill, not
    `3,40 / 3,30 / 3,30` as item-by-item allocation would give. Item by
    item, the first person would absorb the leftover cent ten times.
    The breakdown lines are asserted too: the first person gets
    `0,34 €` × 4 and `0,33 €` × 6, the others `0,34 €` × 3 and `0,33 €` × 7,
    and nobody gets a "Rounding" line;
  - the zero bill: every price `0,00 €` and an Equal tip of `0` gives
    `T = G = 0`. Everyone pays 0, and the `T′ = 1` branch runs end to end.
- **Validation errors**: an unassigned item, a discount > subtotal, a
  proportional adjustment with a zero subtotal, 21 people, 101 items, a
  unit price of `1 000 000,01`, a quantity of `0` and of `10 000,5`, a
  quantity with 4 significant decimals, and a `1000,5 %` tip. Then, each
  passed straight to `computeSplit`:
  - a share weight of `0` for all of an item's assignees, `1.5` and `100`
    (`shareOutOfRange`);
  - a quantity ratio with denominator `0` and with denominator `3`
    (`quantityOutOfRange`);
  - a percentage with a negative numerator (`percentOutOfRange`);
  - an assignment to an unknown person id, a duplicate item id and a
    payer who isn't one of the people (`invalidReference`);
  - a unit price of `1.5` cents (`amountOutOfRange`).

  Each returns its typed error and never throws, even when an unbounded
  bill is passed directly to `computeSplit` (bypassing the UI).
- **`toBillRatio`**: `1,0000` → `1 / 1` and `10,500` → `105 / 10` are
  accepted, and `0,0001` → `quantityOutOfRange`.
- **Settle-up**: the payer is excluded; people with a zero total are
  omitted; changing the payer changes the lines.
- **Text export**: it contains every person's formatted total and the
  settle-up lines, and uses the region's locale and currency.

### M1-CP3 — Bill state and local draft

**Requirements:** REQ-1, REQ-2, REQ-3

**Files**
- `app/src/features/split/billReducer.ts`: a pure reducer with typed
  actions:
  - items: `addItem`, `updateItem`, `removeItem`;
  - people: `setPeopleCount`, `renamePerson`, `removePerson`;
  - assignment: `toggleAssignee`, `setShare`;
  - bill-level: `setAdjustment`, `setAdjustmentMode`, `setPayer`,
    `newBill`.

  Ids are generated once and kept stable. Removing a person removes
  their assignments and moves the payer to the first remaining person.
  `setPeopleCount` adds default-named people ("Person 3") or removes them
  from the end.
- `app/src/features/split/draft.ts`: `loadDraft`/`saveDraft` for D11, with
  try/catch around storage. `loadDraft` checks two things itself:
  - the **shape** (every field present, with the right JSON type);
  - the **references** (`invalidReference`: unknown or duplicate ids, or an
    invalid payer), because the reducer relies on stable, unique ids.

  Either failure starts a fresh bill. Out-of-range values (a share of
  `0`, a price above D14's cap, a malformed ratio) are left to
  `validateBill`: the draft loads as an editable bill, and its errors
  show in place of the result (CP4) until the user fixes them.
- `app/src/features/split/useBill.ts`: the reducer, loaded from the draft
  and saved on every change.

**Tests**
- Every action's effect, including the edge cases:
  - removing the payer;
  - removing the last assignee of an item, which becomes unassigned and
    is reported by `validateBill`;
  - `setPeopleCount` down to 1 and up to 20;
  - a new item is assigned to everyone.
- The draft:
  - a round trip;
  - version ≠ 1 → a fresh bill;
  - a malformed shape (missing fields, a string where a number is
    expected) → a fresh bill;
  - an unknown assignee id, a duplicate person id, or a payer who isn't a
    person → a fresh bill;
  - a share weight of `0` or a price of `1.5` cents → the draft loads,
    `validateBill` reports `shareOutOfRange`/`amountOutOfRange`, and
    rendering doesn't throw;
  - throwing storage → a fresh bill, and saving is a silent no-op.

### M1-CP4 — Split page UI

**Requirements:** REQ-1, REQ-2, REQ-3, REQ-4, REQ-6, REQ-7

**Files** (under `app/src/features/split/components/` +
`app/src/pages/SplitPage.tsx`, CSS Modules, tokens only)
- **People**: a count stepper (1–20) and name inputs ("Person n"
  placeholder), plus the payer choice (radio group).
- **Items**: one row per item, with name, quantity (default `1`) and unit
  price.
  - Amounts are parsed with `parseAmount`/`parseRatio` in the current
    region, and the typed text is kept while it's invalid.
  - A typed-error message sits under the field (`subCent` → "Use at
    most 2 decimal places"). Quantities and percentages go through
    `toBillRatio`, so `1,0000` is accepted, and more than 3 significant
    decimals shows "Use at most 3 decimal places".
  - Each row has its line total, a Remove button, and assignee chips
    (toggle buttons with `aria-pressed`, one per person). A "Shares"
    disclosure holds the per-person share steppers.
  - An "Add item" button moves focus to the new row's name field.
- **Adjustments**: tax, tip and discount, each an amount/percent toggle
  plus an input. Tax and tip also have a Proportional/Equal choice. Tax
  carries D6's hint.
- **Result** ("Who owes what"):
  - the items subtotal, adjustments and bill total;
  - one card per person with their total and a disclosure holding the
    breakdown (step 6: item, tax, tip and discount lines that sum to the
    total, with no "Rounding" line). The disclosure has a one-line hint:
    "Lines are rounded within your total, so one item's shares can add
    up to a cent or two more or less than its price.";
  - the settle-up lines;
  - a "Copy as text" button with a status message (`role="status"`) for
    copied or failed;
  - validation errors shown in place of the result, each linking to its
    field.
- **Mobile layout:** single column at 360 px, with no horizontal scroll
  and the M0 tab bar clearance. The result is also reachable through a
  "See result" link at the top.
- "New bill" asks for confirmation (`window.confirm`) before it clears
  the draft. A one-line note next to it makes D11's trade-off visible:
  "This bill is saved on this device until you start a new one."
- Inputs past D14's limits show their typed error under the field, e.g.
  "At most 1 000 000,00 €" or "Quantity must be more than 0".

**Tests (Testing Library)**
- Add, edit and remove an item; invalid price text shows its error and
  never changes the result.
- Toggling chips and shares updates the per-person totals.
- Switching an adjustment between percent and amount, and between modes.
- Changing the payer updates the settle-up.
- The region drives input and output: under en-GB/GBP, `12.50` and
  `£12.50` are accepted, `€12,50` shows the invalid-amount error, and
  totals render as `£…`.
- "Copy as text" calls `navigator.clipboard.writeText` (stubbed) with the
  expected text, and failures show the error status.
- Validation errors render instead of the result.
- Accessibility: every input has a label, and the chips expose
  `aria-pressed`.

### M1-CP5 — READMEs, home page and end-to-end test

**Requirements:** REQ-9, REQ-10

**Files**
- `README.md` (repository root, new): what project-W is (one paragraph);
  what works today (the M1 bill splitter, and the Region setting); how to
  try it (run it locally with a link to `app/README.md`, with no hosted
  version yet, D11 in the ADR); the roadmap (`docs/ROADMAP.md`) and the
  releases (GitHub Releases, versions from PR titles); and privacy:
  everything stays in your browser, with no accounts and no server.
- `app/README.md`: the folder layout gains `features/split/`, and the
  money section mentions `allocateExact`/`percentOf` and the currency
  parameter.
- `app/src/pages/HomePage.tsx`: replace "Coming soon." with a short
  description and a "Split a bill" link to `/split`.
- `app/src/pages/SplitPage.e2e.test.tsx` (next to the page it drives): a
  full UI test that
  enters a realistic 12-item receipt for 3 people, with shared items, a
  2 : 1 share, a 10 % tip split proportionally and a `5,00 €` discount.
  It asserts each person's total against hand-computed values, that they
  sum to the bill total, and the settle-up and copied text.

**Done when** (milestone):
- `npm run check` and `npm run build` pass, and the `app`,
  `workflow-conformance` and `pr-title` checks are green on the M1 PR.
- The roadmap's M1 "Done when" holds: the unit tests cover rounding,
  shared items, tax, tip and discounts, the per-person totals always equal
  the bill total, and a real 10+ item bill splits between 3 people end to
  end, both in the e2e test and by hand in functional review.
- The root `README.md` exists and is accurate (roadmap "Every milestone").

## Requirement coverage

| Requirement | Checkpoints |
|-------------|-------------|
| REQ-1 Items: add/edit/remove, validated input | M1-CP3, M1-CP4 |
| REQ-2 People: count and names | M1-CP3, M1-CP4 |
| REQ-3 Assignment, equal by default, custom shares | M1-CP2, M1-CP3, M1-CP4 |
| REQ-4 Tax, tip, discount (amount or %; proportional or equal) | M1-CP1, M1-CP2, M1-CP4 |
| REQ-5 Deterministic rounding, exact totals | M1-CP1, M1-CP2 |
| REQ-6 "Who owes what" results and settle-up | M1-CP2, M1-CP4 |
| REQ-7 Copy result as text | M1-CP4 |
| REQ-8 Region setting (locale, currency) | M1-CP1 |
| REQ-9 Root README (+ app README) | M1-CP5 |
| REQ-10 End-to-end 10+ items, 3 people | M1-CP5 |

The machine-checked version is
`docs/ai-workflow/requirements/milestone-1-mapping.json`.

## Files touched and review classification

Implementation output lands under paths that
`milestone-1-artifacts.json` protects at the implementation stage:

- `app/**` (the `app/` prefix): the money changes, the region, the split
  feature, pages, tests and `app/README.md`;
- `README.md` (repository root): protected by an exact-path entry added
  during self-review. The inherited template excludes the root README,
  but here it's a deliverable (REQ-9);
- `.github/workflows/app-ci.yml`: stays protected by exact path, as in
  M0. M1 doesn't plan to change it.

`docs/ROADMAP.md` and `docs/ACTIVE_MILESTONE.md` stay excluded
(workflow bookkeeping). The inherited Gradle-shaped template entries are
harmless: M1 creates none of those paths.

## Migration, data and backup implications

- **New browser storage.** There are two new keys, both per-device and
  disposable, and both validated on read with a safe fallback:
  - `project-w.region`: `{ locale, currency }`;
  - `project-w.bill`: `{ version: 1, bill }`.
  
  The theme key from M0 is unchanged.
- **Versioning.** The draft carries `version: 1`. A future shape change
  bumps it, and an unknown version starts a fresh bill (the draft is
  scratch data, not a record). No migration code is needed in M1.
- **No server, no export format.** Copy-as-text is for people to read,
  not a data format, so there's no backup compatibility to keep.

## Out of scope for M1

- Receipt upload or OCR (M2/M3), and splitting across several bills or
  groups.
- Multiple payers, partial payments, and settling up across bills.
- Negative line items (use the bill discount), and custom per-person
  amounts (use shares).
- Currency conversion, and currencies other than EUR/GBP/USD. Currencies
  without 2 minor digits (JPY, KWD) remain unsupported by `formatAmount`.
- Image/PDF export, the Web Share API, and a saved bill history.

## Open questions (for the plan reviewer / user)

1. **Equal split for discounts** (D5). The roadmap allows "or equally" for
   tax, tip and discounts. The plan offers Equal for tax and tip but keeps
   the discount **proportional only**: an equal discount can push a
   person with few items below zero, which needs a rule of its own (cap
   at zero and redistribute?). Is proportional-only acceptable for M1?
2. **Draft persistence** (D11). Keeping the current bill in
   `localStorage` survives a refresh, but it does leave the last bill on
   the device until "New bill". Keep it, or keep the bill in memory only?
3. **Percentages base** (D5). Tax, tip and discount percentages are all
   taken from the items subtotal, with no compounding (tip isn't computed
   on subtotal + tax). This is simpler and matches most PT receipts.
   Confirm?

No `docs/TECHNICAL_DECISIONS.md` exists in this repository, so there are
no "Open decision" rows for this plan to finalise.

## Review dispositions

### Local plan review, round 1 (`LOCAL_MODEL_PLAN_REVIEW`, revision 1 → 2)

Each finding was checked against the repository before it was applied.

| Finding | Disposition | Evidence and change |
|---------|-------------|---------------------|
| I-1: USD can't round-trip under pt-PT/en-GB | **Accepted** | Node v24 `Intl.NumberFormat` prints `1234,56 US$` (pt-PT), `US$1,234.56` / `-US$3.20` (en-GB) and `$1,234.56` (en-US). D10's table becomes `USD: ['US$', '$']`, matched longest first. CP1 adds `US$` accept/reject cases, and the round trip covers negatives. |
| I-2: "Rounding" line isn't a few cents | **Accepted**, option (a) | Running the revision-1 display on 100 × `1,00 €` / 3 through `app/src/lib/money.ts` `allocate` gave item lines `3400 / 3300 / 3300` against totals `3334 / 3333 / 3333`. Step 6 now rounds each person's lines within their own total, with no "Rounding" line and a proven 3-cent bound per line. CP2 asserts the fairness case's lines (`allocate(334, ten 1s)` → four `34`s, six `33`s, checked with the real helper) and the bound. |
| I-3: "never throws" unsupported; zero quantity | **Accepted**, option (a) | `checked`/`checkedBig` in `app/src/lib/money.ts` throw `RangeError` outside ±2⁵³, and `parseRatio('0')` returns `{ ok: true, numerator: 0 }`. D14 adds amount, quantity and percentage bounds, with the arithmetic showing `G < 3 · 10¹⁵`. There are three new typed errors, and CP2 tests them, including an unbounded bill passed straight to `computeSplit`. |
| O-1: zero bill through `computeSplit` | **Accepted** | Added to CP2's examples. |
| O-2: e2e test location | **Accepted** | Moved to `app/src/pages/SplitPage.e2e.test.tsx`, next to the page it drives. `*.test.tsx` still matches it. |
| O-3: open questions / draft privacy | **Accepted** (the note); the questions stay open | CP4 adds a one-line "saved on this device" note by "New bill". Open questions 1–3 are still for the user. |
| O-4: D10 backward compatibility | **No change** (the reviewer confirmed it) | Every existing call passes at most `(input, locale)`, and `currency` is a trailing optional parameter. |

### Local plan review, round 2 (`LOCAL_MODEL_PLAN_REVIEW`, revision 2 → 3)

Each finding was checked against the repository before it was applied.

| Finding | Disposition | Evidence and change |
|---------|-------------|---------------------|
| I-4: `validateBill` doesn't cover every field that can make the engine throw | **Accepted** | In Node v24, `1n / 0n` throws `RangeError: Division by zero` and `BigInt(1.5)` throws `RangeError`. `allocate` in `app/src/lib/money.ts` rejects negative weights, and `parseRatio` returns `n / 10ᵏ` for any `k`. The model now stores ratios with `denominator ∈ {1, 10, 100, 1000}` (D2, D14). The typed error list gains `shareOutOfRange` and `invalidReference`, and widens `quantityOutOfRange`, `percentOutOfRange` and `amountOutOfRange` to malformed and negative values. CP2 adds each case, passed straight to `computeSplit`. CP3's `loadDraft` rejects shape and reference errors, and leaves range errors to `validateBill`, which renders them as editable errors. |
| O-5: stale review request (the "Rounding" line) | **Accepted** | Not a plan change: this round's regenerated `REVIEW_REQUEST.md` rewrites "Areas to challenge" #1 for step 6's per-person rounding and its 3-cent bound. |
| O-6: trailing zeros rejected | **Accepted** | `parseRatio('1,0000')` returns `10000 / 10000`. The new `toBillRatio` strips trailing zeros before the 3-decimal check (D2, D14). CP2 tests it, and CP4's message says "Use at most 3 decimal places". |
| O-7: per-item shares can exceed the price | **Accepted** | CP4's breakdown disclosure gains a one-line hint about rounding within each person's total. |
