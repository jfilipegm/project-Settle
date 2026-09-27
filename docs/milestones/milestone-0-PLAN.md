# Milestone 0 — Project foundation: execution plan (Revision 2)

- **Work item:** `milestone-0` (product, governing workflow version `2.1`)
- **Plan revision:** 2 (revision 2 applies local plan review round 1,
  `LOCAL_MODEL_PLAN_REVIEW`, verdict `REVISE`; see "Review round 1
  dispositions")
- **Base commit:** `dcf1b3b0cc912fff554a1d59783afa9e771d3838` (baseline
  commit: workflow install and `docs/ROADMAP.md`)
- **Roadmap entry:** `docs/ROADMAP.md` → "M0 — Project foundation"
- **Registry:** `docs/ai-workflow/registry/milestone-0-registry.json`
- **Requirement mapping:** `docs/ai-workflow/requirements/milestone-0-mapping.json`
- **Artifact declarations:** `docs/ai-workflow/registry/milestone-0-artifacts.json`

## Goal

An empty but deployable app skeleton with tooling in place, so M1 (bill
splitter) can start straight on product code. After M0:

- the web app builds and runs locally and in CI and shows a placeholder home
  page;
- lint, format check, type check and unit tests run in CI and pass;
- money is handled as integer cents through one shared, tested module.

## Decisions taken in this plan

| # | Decision | Chosen | Source |
|---|----------|--------|--------|
| D1 | Language / UI / build | TypeScript (strict) + React + Vite | User choice during `/milestone-plan` (2026-09-27), per `docs/ROADMAP.md` recommendation |
| D2 | Where the app lives | Everything under `app/` (own `package.json`, lockfile, configs, `.gitignore`) | Matches the product deliverable prefix the workflow protects (`app/`); keeps the repo root for workflow tooling |
| D3 | Package manager | npm (ships with Node; no extra install) | Plan default, open to reviewer challenge |
| D4 | Node version | Current Node LTS line (24.x), pinned in `app/.nvmrc` and `package.json` `engines` | Plan default |
| D5 | Router | React Router (library/"declarative" mode, no framework mode) with path-based routes (`/split`, not `/#/split`); hosting consequence in D11 | Plan default; path vs hash routing is Open question 5 |
| D6 | Styling | Plain CSS with design tokens as CSS custom properties, CSS Modules per component; no UI kit | Plan default: minimal dependencies (supports the M3 BYOK key-safety principle of few third-party scripts) |
| D7 | Unit tests | Vitest + React Testing Library + jsdom | Plan default (native to Vite) |
| D8 | Lint / format | ESLint flat config (`typescript-eslint`, `react-hooks`, `react-refresh`) + Prettier | Plan default |
| D9 | Default locale/currency | `pt-PT` / `EUR`, defined once as `DEFAULT_LOCALE`/`DEFAULT_CURRENCY` in `app/src/lib/money.ts` and used as the default parameter of **both** `parseAmount` and `formatAmount`; no other code hard-codes a locale or currency | Roadmap open question; M0 only sets a default, see "Open questions". Revised in revision 2 (LPR-R1-O07) |
| D10 | PWA | M0 ships only the web manifest, icons and meta tags; service worker/offline is **M8** | Keeps M0 small; roadmap M8 owns PWA |
| D11 | Deployment / hosting assumption | M0 deploys nowhere. "Deployable" means a static `npm run build` output served **at the domain root `/`** (Vite `base: '/'`, manifest `start_url: "/"`) by a host that **rewrites unknown paths to `index.html`** (SPA fallback), which D5's path routes need for refreshes and deep links. Hosts such as Cloudflare Pages or Netlify do this; plain GitHub Pages does not. The hosting target stays an open question (roadmap). | Plan default; corrected in revision 2 (LPR-R1-I04). Revision 1 wrongly said "any static host". |

D1 is recorded as `docs/adr/0001-web-app-tech-stack.md` in CP1, with D2–D8
and D11's hosting assumption listed as its consequences.

### Review round 1 dispositions

Local plan review round 1 (`LOCAL_MODEL_PLAN_REVIEW`, plan revision 1,
verdict `REVISE`, no blocking findings) raised 4 Important and 7 Optional
findings. Each one was checked against the repository before it was
applied.

| Finding | Disposition | Applied in |
|---|---|---|
| LPR-R1-I01 negative zero leaks out of the money module | **Adopted.** Every function returning `Cents` goes through one guard that normalizes `-0` to `0`, with `Object.is` tests. | CP3 "Core rules", tests |
| LPR-R1-I02 `allocate` arithmetic not specified as exact | **Adopted.** Floor quotients and remainders are computed in `BigInt`. Weights and their sum must be safe integers. Remainders are compared exactly. A within-1-cent sweep uses a `BigInt` reference. | CP3 "Allocation", tests |
| LPR-R1-I03 `parseAmount` grammar gaps | **Adopted (all four parts).** Sub-cent input is rejected (`subCent`). Separators come from a hand-written per-locale table, never `Intl`. Every listed form is decided and tested. Only `€` is accepted in M0. A format→parse round-trip property is added. | CP3 "Parsing amounts", tests |
| LPR-R1-I04 "any static host" is inaccurate with path routing | **Adopted.** Path routing is kept. The SPA-fallback + root-path assumption is recorded in D11, the ADR (CP1) and `app/README.md` (CP5). The path-vs-hash choice goes to the user as Open question 5. | D5, D11, CP1, CP5, Open questions |
| LPR-R1-O01 `formatAmount` wrong for non-2-digit currencies | **Adopted (both parts).** `RangeError` unless the currency has 2 minor-unit digits; formatting uses an exact decimal string, never `value / 100`. | CP3 "Formatting" |
| LPR-R1-O02 inline theme script vs M3's strict CSP | **Adopted.** `app/public/theme-init.js` is loaded as a blocking classic `<script src>`. | CP4 |
| LPR-R1-O03 icon generation tool not named | **Adopted.** Icons are rendered once with `rsvg-convert` (installed: `/usr/bin/rsvg-convert`; `magick` is the fallback). The PNGs are committed, no image tool becomes a dependency, and the maskable mark sits in the central 80 % safe zone. | CP5 |
| LPR-R1-O04 "runs … in CI" can't be met without a remote | **Adopted as Open question 4.** Making `actionlint` a *mandatory* check is **declined**: `actionlint` and `act` are not installed (`which actionlint act` → not found, 2026-09-27). CP5 uses `actionlint` if present at implementation time. Otherwise it runs a structural check with PyYAML (6.0.3, installed). | CP5, Open questions |
| LPR-R1-O05 ESLint type-aware config and Prettier lockfile pitfalls | **Adopted (both).** | CP2 |
| LPR-R1-O06 `parseRatio`/`multiplyRatio` edges unspecified | **Adopted.** Return shape, separator rule, negatives and `denominator ≤ 0` are all decided. | CP3 "Arithmetic" |
| LPR-R1-O07 D9 vs `formatAmount`'s default locale | **Adopted.** Shared `DEFAULT_LOCALE`/`DEFAULT_CURRENCY` defaults for both functions. This removes revision 1's "no locale → ambiguous" case. | D9, CP3 |
| I01 aside: `signDisplay: "negative"` in `formatAmount` | **Declined.** With O01's exact-string formatting, a zero amount never reaches `Intl` as `-0`: `Cents` can't hold it and the sign comes from `value < 0`. `"negative"` is also an Intl.NumberFormat v3 value that older engines reject with `RangeError` instead of degrading. | — |
| Missing tests (negative zero, `allocate` sweep, `parseAmount`, `matchMedia` stub, toggle name) | **Adopted.** | CP3, CP4 tests |
| Architecture: lowest-index tie-break favours index 0 item by item | **Adopted as M1 guidance** (JSDoc on `allocate` + "Notes for M1 planning"). | CP3, Notes for M1 |
| Architecture: a named `percentOf` helper | **Deferred to M1.** The reviewer notes that the rounding order across chained operations is an M1 policy decision. Until then, `multiplyRatio` with `parseRatio`'s denominator × 100 covers percentages. | Notes for M1 |
| Data: namespaced theme key, unknown value → `system` | **Adopted** (`project-w.theme`). | CP4 |
| Usability: safe-area insets, forced-mode `theme-color`, toggle label | **Adopted.** | CP1 (viewport meta), CP4 |

The registry, mapping and artifact declarations are unchanged, as the
review's acceptance criterion 6 expects. The only change is the registry's
`plan_revision`, which moves from 1 to 2.

## Prerequisites (before `/milestone-implement`)

- **Node.js is not installed on the development machine** (checked during
  planning: `node`/`npm` not found). Install the current Node LTS (24.x)
  with a version manager (`fnm`, `mise` or `nvm`, which will honour
  `app/.nvmrc`) or the distribution package, then confirm `node --version`
  and `npm --version`. Implementation cannot start without it.
- Network access for `npm install` during implementation.

## Checkpoints

<!-- Generated by workflow_state.render_registry_markdown(registry); do not edit by hand. -->
| id | name | depends_on | complexity | session_target |
| --- | --- | --- | --- | --- |
| M0-CP1 | Stack ADR + Vite/React/TS scaffold in app/ | - | 2 | 1 |
| M0-CP2 | Quality tooling: ESLint, Prettier, Vitest + Testing Library | M0-CP1 | 2 | 1 |
| M0-CP3 | Money module: integer cents, parse/format, deterministic allocation | M0-CP2 | 3 | 2 |
| M0-CP4 | App shell: routing, responsive layout, light/dark theme | M0-CP2 | 3 | 2 |
| M0-CP5 | CI workflow + web manifest + developer README | M0-CP3, M0-CP4 | 2 | 3 |
<!-- End generated table. -->

### M0-CP1 — Stack ADR + Vite/React/TS scaffold in `app/`

**Requirements:** REQ-1, REQ-2

**Files**
- `docs/adr/0001-web-app-tech-stack.md`: context (roadmap principles: no
  server early, mobile-first, later native wrapper), decision D1, the
  consequences D2–D8 plus D11's hosting assumption (served at `/`, host
  must rewrite unknown paths to `index.html`), and alternatives considered
  (Next.js, SvelteKit, Flutter) with why they were not chosen.
- `app/package.json`: `"private": true`, `"type": "module"`, `engines.node`
  pinned to the LTS major, scripts `dev`, `build` (`tsc -b && vite build`),
  `preview`, `typecheck` (`tsc -b`; the tsconfigs set `noEmit`, so `-b` only
  type-checks).
- `app/package-lock.json` (committed).
- `app/.nvmrc`, `app/.gitignore` (`node_modules/`, `dist/`, `coverage/`,
  `*.local`).
- `app/index.html` (`lang="en"`, viewport meta
  `width=device-width, initial-scale=1, viewport-fit=cover` so CP4 can pad
  for safe areas, title), `app/vite.config.ts` (`base: '/'` set explicitly,
  with a comment pointing at D11).
- `app/tsconfig.json` + `tsconfig.app.json` + `tsconfig.node.json` with
  `strict: true`, `noUncheckedIndexedAccess: true`,
  `noImplicitOverride: true`, `exactOptionalPropertyTypes: false`
  (deliberately off: it fights React prop typing for little gain here).
- `app/src/main.tsx`, `app/src/App.tsx` showing a placeholder home page.
- Remove Vite template demo assets (logos, counter, demo CSS).

**Done when:** `npm ci && npm run build` succeeds from `app/`, and
`npm run dev` serves the placeholder page.

### M0-CP2 — Quality tooling

**Requirements:** REQ-2, REQ-3

**Files**
- `app/eslint.config.js`: flat config with `eslint-plugin-react-hooks`,
  `eslint-plugin-react-refresh`, and `eslint-config-prettier` last. The
  `typescript-eslint` type-aware `recommendedTypeChecked` configs are
  **scoped to `**/*.{ts,tsx}`** with `parserOptions.projectService: true`
  (LPR-R1-O05). Plain JS files (`eslint.config.js` itself and CP4's
  `public/theme-init.js`) get the untyped JS recommended rules, so
  `eslint .` never tries to type-check a file that no tsconfig includes.
- `app/tsconfig.node.json` includes `vite.config.ts` and, if it exists,
  `vitest.config.ts`.
- `app/.prettierrc.json` and `app/.prettierignore`, which lists
  `package-lock.json` (npm writes short `os`/`cpu` arrays across several
  lines and Prettier would reflow them, failing `format:check`).
- `app/vitest.config.ts` (or a `test` block in `vite.config.ts`):
  `environment: 'jsdom'`, setup file `app/src/test/setup.ts` loading
  `@testing-library/jest-dom/vitest`.
- Scripts: `lint` (`eslint .`, zero warnings allowed:
  `--max-warnings=0`), `format` (`prettier --write .`), `format:check`
  (`prettier --check .`), `test` (`vitest run`), `test:watch`, and
  `check` (typecheck, then lint, then format:check, then test).
- `app/src/App.test.tsx`: smoke test that the app renders the home
  heading.

**Done when:** `npm run check` passes on a clean checkout.

### M0-CP3 — Money module

**Requirements:** REQ-4

This is the foundation for M1's split math, so it is specified precisely.
Revision 2 tightens it after review round 1 (LPR-R1-I01–I03, O01, O06,
O07).

**Files:** `app/src/lib/money.ts`, `app/src/lib/money.test.ts`

**Core rules**
- `type Cents = number & { readonly __brand: 'Cents' }`: a branded safe
  integer. `cents(n)` constructs one and throws `RangeError` unless
  `Number.isSafeInteger(n)`.
- **Every function that returns `Cents` (or `Cents[]`) returns through one
  internal guard.** The guard re-checks `Number.isSafeInteger` (throwing
  `RangeError`) and normalizes `-0` to `0` (LPR-R1-I01). JavaScript
  produces `-0` from ordinary integer operations such as `-x` or `x * -1`
  on a zero. Left in, it prints as `-0,00 €` and fails the `Object.is`
  comparison Vitest's `toBe`/`toEqual` use. `cents(-0)` returns `0`.
- `DEFAULT_LOCALE = 'pt-PT'` and `DEFAULT_CURRENCY = 'EUR'` are exported
  from this module (D9) and are the default parameters of both
  `parseAmount` and `formatAmount`.
- No float arithmetic on money anywhere. Any product that can exceed 2⁵³
  is computed with `BigInt`.

**Arithmetic**
- `add(...values)`, `subtract(a, b)`, `sum(values)`, `negate(a)`: integer
  arithmetic, with the guard applied after every operation. An integer
  result inside the safe range is always computed exactly. One outside it
  can't round back into the range, so the check catches every overflow.
- `multiply(a, quantity)`: integer quantity (a safe integer of any sign) ×
  unit price. Exact, and checked the same way.
- `multiplyRatio(a, numerator, denominator)`: for fractional quantities
  (0.75 kg is `3/4`) and percentages (12.5 % is `125/1000`). `numerator`
  must be a safe integer (any sign) and `denominator` a safe integer
  `> 0`; anything else throws `RangeError` (LPR-R1-O06). It computes
  `BigInt(a) × BigInt(numerator)`, divides by `denominator` rounding half
  away from zero, and returns through the guard.
- `parseRatio(input)`: turns a decimal string into a ratio without
  `Number(...)` (LPR-R1-O06). It returns `{ ok: true, numerator,
  denominator }` or `{ ok: false, error: 'empty' | 'invalid' |
  'outOfRange' }`, the same typed-result style as `parseAmount`, and never
  throws for user input. Grammar:
  - optional surrounding whitespace, then one or more ASCII digits,
    optionally followed by **one** decimal separator and one or more
    digits;
  - the separator may be `.` or `,` in any locale;
  - no sign: quantities and percentages are non-negative, and a discount
    is a negative *amount*, not a negative ratio;
  - no grouping and no exponent.

  So `"1.234"` means 1.234 (`1234/1000`), unlike
  `parseAmount("1.234", 'pt-PT')`, which reads 1 234 €. The JSDoc says so.
  `denominator` is `10^k` for `k` fraction digits (`"2"` → `2/1`). If
  either value exceeds `Number.MAX_SAFE_INTEGER`, the result is
  `outOfRange`. The fraction is not reduced.

**Allocation**
- `allocate(total, weights)` splits `total` into parts proportional to
  `weights` using the **largest-remainder method, computed exactly with
  `BigInt`** (LPR-R1-I02).
  - It throws `RangeError` when `weights` is empty, or when any weight is
    not a non-negative safe integer (`Number.isSafeInteger(w) && w >= 0`,
    so `0.5`, `NaN` and `1e300` are all rejected). It also throws when the
    weights' sum exceeds `Number.MAX_SAFE_INTEGER`, or when all weights
    are 0 while `total ≠ 0`. All-zero weights with `total = 0` return all
    zeros.
  - Let `T = |total|` and `W = Σwᵢ`. Each part starts at the floor
    quotient `qᵢ = ⌊T·wᵢ / W⌋` with the exact remainder
    `rᵢ = T·wᵢ mod W`, both computed in `BigInt`. The `T − Σqᵢ` leftover
    cents go one each to the entries with the largest `rᵢ`, compared as
    exact integers. Ties go to the lowest index, so the result is
    deterministic.
  - A negative `total` (refunds, discounts) is allocated as `|total|`,
    then each part is negated through the guard, so no part is `-0`.
  - Guarantees:
    - `sum(parts) === total`;
    - every part is the floor or the ceiling of its exact share
      `total·wᵢ / W`, so it is within 1 cent of it;
    - zero-weight entries get exactly 0. A zero weight's remainder is 0,
      and since `Σrᵢ = leftover·W` with every `rᵢ < W`, more entries have
      positive remainders than there are leftover cents.
  - The JSDoc carries the M1 fairness note from "Notes for M1 planning".
- `allocateEvenly(total, n)`: `allocate` with `n` equal weights. `n` must
  be a positive safe integer; otherwise it throws `RangeError`.

**Parsing amounts:** `parseAmount(input, locale = DEFAULT_LOCALE)`
(LPR-R1-I03)

It returns `{ ok: true, value: Cents }` or `{ ok: false, error }`, where
`error` is one of `'empty' | 'invalid' | 'subCent' | 'outOfRange'`. It
never throws for user input, so later UI can show a specific message.
Money is never silently rounded: input with more than 2 decimal digits is
`subCent`, never rounded or truncated.

Separators come from a small hand-written table in `money.ts`, **never
from `Intl`**. CLDR's pt-PT grouping separator is a no-break space, and
pt-PT groups only from five integer digits. A parser derived from
`Intl.NumberFormat(...).formatToParts` would therefore misread the
`.`-grouped input people type.

| Locale | Decimal separator | Accepted grouping separators |
|---|---|---|
| `pt-PT` | `,` | `.`, space (U+0020), no-break space (U+00A0), narrow no-break space (U+202F) |
| `en-GB`, `en-US` | `.` | `,` |

`locale` is typed as the union of the table's keys and re-checked at
runtime. Any other value throws `RangeError`, because the locale comes
from app settings, never from user input, so a bad value is a
programming error. Adding a locale means adding a row and its tests.

Grammar, applied in order:
1. Trim surrounding whitespace (JavaScript `\s`, which covers U+00A0 and
   U+202F). Nothing left → `empty`.
2. Accept at most one currency symbol, and only `€`. It may be a prefix
   or a suffix, with optional whitespace between it and the number. M0
   scope is EUR: any other symbol or letters → `invalid`. Widening the
   set belongs to whichever milestone first adds a second currency.
3. Accept at most one sign, an ASCII `-`, immediately before the digits
   or immediately before a prefix `€`: `"-3,20"`, `"-€3,20"`, `"€-3,20"`,
   `"-3,20 €"`. No `+`, no trailing minus, no parentheses.
4. The remaining body may contain only ASCII digits and the locale's
   decimal and grouping separators. Anything else (letters, `e`, other
   whitespace, a second sign) → `invalid`.
5. Find the decimal separator:
   - If the body contains the locale's decimal separator, it must occur
     exactly once, with at least one digit before it. After it, 1–2
     digits are the cents. No digits (`"12,"`) is `invalid`. Three or
     more digits (`"12,505"`; `"1,234"` under pt-PT) is `subCent`.
     Anything other than digits after it (`"1.234,56"` under en-GB) is
     `invalid`.
   - Otherwise, a `.` or `,` that is the body's **only** separator and is
     followed by exactly 1 or 2 digits at the end is read as the decimal
     separator (`"12.50"` under pt-PT, `"12,5"` under en-GB). This
     reading is unambiguous, because a grouping separator is always
     followed by exactly 3 digits, and it accepts what phone keypads and
     foreign habits produce.
   - Otherwise the body has no fraction part.

   A body that starts with a separator (`",50"`, `".50"`) is `invalid`;
   the user writes `0,50`.
6. The integer part is either plain digits (`"1234"`, leading zeros
   allowed), or 1–3 digits followed by one or more groups of *one*
   grouping separator plus exactly 3 digits, with the same separator
   character throughout (`"1.234.567"`, `"12 345"`). Anything else is
   `invalid`: `"1.23,45"`, `"12.3456"` (pt-PT), `"12 34"`, `"1.234 567"`,
   and `"1 234.56"` (pt-PT: space grouping with a `.` fraction).
7. Compute the value exactly with `BigInt` from the digit strings:
   integer part × 100 + cents, where a 1-digit fraction is tenths
   (`"12,5"` → 1250). A value beyond `Number.MAX_SAFE_INTEGER` →
   `outOfRange`. The sign is applied last, through the guard, so
   `"-0,00"` gives `0`, never `-0`.

**Formatting:**
`formatAmount(value, { locale = DEFAULT_LOCALE, currency = DEFAULT_CURRENCY } = {})`
(LPR-R1-O01)
- Uses `Intl.NumberFormat(locale, { style: 'currency', currency })`. It
  throws `RangeError` unless that formatter's
  `resolvedOptions().maximumFractionDigits === 2`, because cents are
  hundredths: JPY (0 minor digits) would display 100× too large and KWD
  (3) 10× too small. EUR, GBP and USD pass.
- Formats an **exact decimal string** built from the integer
  (`-123456` → `"-1234.56"`), never `value / 100`. Engines that implement
  Intl.NumberFormat v3 (ES2023, including Node 24) format the string
  exactly. Older engines convert it to a number, which is still exact
  for any amount below about 7·10¹³ €.
- A zero amount never shows a minus sign: `Cents` can't hold `-0`, and
  the string's sign comes from `value < 0`.

**Tests (Vitest)**
- Guard: `cents(1.5)`, `cents(2 ** 53)` and `cents(NaN)` throw;
  `Object.is(cents(-0), 0)`; overflow in `add` and `multiply` throws.
- Negative zero (LPR-R1-I01), each asserted with `Object.is(…, 0)`:
  - `negate(cents(0))`, `multiply(cents(0), -3)` and
    `multiplyRatio(cents(0), -1, 2)`;
  - the zero parts of `allocate(cents(-1), [1, 1, 1])` (expected
    `[-1, 0, 0]`);
  - `parseAmount("-0,00")`;
  - also, `formatAmount(cents(0))` contains no minus sign.
- `allocate`:
  - A generated sweep from a fixed seed, with no new dependency: totals
    in −10 000…10 000 × weight vectors of length 1–6 with weights 0–1 000,
    zeros included. Each case asserts the exact sum, that every part is
    the floor or ceiling of its exact share (checked against a `BigInt`
    reference), and that zero-weight entries get 0.
  - One large-weight case whose `total·w` exceeds 2⁵³ (for example
    1 000 000 cents over weights around 10¹⁰), with exact expected parts.
  - Tie-break determinism: `allocate(cents(100), [1, 1, 1])` →
    `[34, 33, 33]`.
  - Error cases: empty weights, a negative weight, `0.5`, `1e300`, `NaN`,
    a weight sum above `MAX_SAFE_INTEGER`, and all-zero weights with a
    non-zero total. All-zero weights with total 0 return zeros.
- `multiplyRatio`: rounding at the `.5` boundary, positive and negative
  (`multiplyRatio(cents(5), 1, 2)` → 3 and `(cents(-5), 1, 2)` → −3). A
  case whose intermediate product exceeds 2⁵³ but whose result is safe.
  `denominator` 0 or negative → `RangeError`.
- `parseRatio`:
  - accepts `"0.75"` → 75/100, `"0,75"` → 75/100, `"2"` → 2/1 and
    `"1.234"` → 1234/1000;
  - rejects `"1e3"`, `"-1"`, `"1.2.3"`, `"1,234.5"` and `".5"`;
  - returns `empty` for `""`.
- `parseAmount`: one table-driven test with rows `(input, locale,
  expected result)` covering every example in the grammar above:
  - accepted forms with and without `€`, sign, surrounding whitespace and
    grouping, including `"12 345,67"`, `"12 345,67"`,
    `"12 345,67"` and `"1.234.567"`, plus the lenient single-separator
    reading;
  - `subCent`: `"12,505"`, `"1,234"` (pt-PT), `"1.234"` (en-GB);
  - `invalid`: `"12,5,0"`, `"abc"`, `"1e3"`, `"12,"`, `",50"`, `"1.23,45"`,
    `"12.3456"`, `"12 34"`, `"1.234 567"`, `"£12.50"`, `"+12"`, `"12-"`;
  - `empty`: `""`, `"   "`;
  - `outOfRange`: `"99999999999999999999"`;
  - an unknown locale throws `RangeError`.
- Round trip (LPR-R1-I03). The inputs are a fixed list plus a seeded
  sweep: 0, ±1, ±99, ±100, ±123 456, and amounts from 1 000 000 cents
  (10 000 €, where pt-PT grouping starts) up to
  `±Number.MAX_SAFE_INTEGER`. Both `parseAmount(formatAmount(x), 'pt-PT')`
  and `parseAmount(formatAmount(x, { locale: 'en-GB' }), 'en-GB')` return
  `{ ok: true, value: x }`.
- `formatAmount`:
  - `pt-PT`/EUR and `en-GB`/GBP, asserting on the digits, separators and
    symbol, not on which space character `Intl` uses;
  - currencies `JPY` and `KWD` throw `RangeError`;
  - `formatAmount(cents(Number.MAX_SAFE_INTEGER))` shows the exact digits
    `90071992547409` and `91`.

**Done when:** all tests pass and the module has no float arithmetic on
money anywhere.

### M0-CP4 — App shell

**Requirements:** REQ-5

**Files (indicative)**
- `app/src/app/router.tsx`: routes `/` (Home), `/split`, `/finances`,
  `/settings` (each a "coming in Mx" placeholder page naming its roadmap
  milestone), `*` (not found, with a link home).
- `app/src/app/Layout.tsx` (+ `.module.css`):
  - a header with the app name and the theme toggle;
  - navigation as a top bar on wide screens and a bottom tab bar under
    640 px;
  - a `<main>` landmark and a skip-to-content link.

  The bottom tab bar pads itself with `env(safe-area-inset-bottom)` (the
  viewport meta sets `viewport-fit=cover`, see CP1). `<main>` gets
  matching bottom padding, so in standalone PWA mode the bar never covers
  content.
- `app/src/styles/tokens.css`: colour, spacing, radius and type-scale tokens
  on `:root`, with the dark palette under
  `@media (prefers-color-scheme: dark)` and overrides under
  `:root[data-theme="light"|"dark"]`. `app/src/styles/global.css`: reset,
  `body` background/colour from tokens, 16 px side gutter, no horizontal
  scroll at 360 px.
- `app/src/app/theme.ts`: `useTheme()` hook with modes `system | light |
  dark`.
  - The mode is stored in `localStorage` under the namespaced key
    `project-w.theme`. Every access is wrapped in try/catch, and a
    missing, unknown or unreadable value means `system`.
  - It is applied as `data-theme` on `<html>`, removed for `system`.
  - The static light/dark `theme-color` metas follow only the system
    scheme. So when the mode is forced, `useTheme` also sets both metas
    to the forced palette's colour, and `system` restores them.
- The theme toggle is one button that cycles system → light → dark. Its
  accessible name states the current mode and the next one, for example
  "Theme: system. Switch to light."
- `app/public/theme-init.js` (LPR-R1-O02) is a tiny classic script, loaded
  with a blocking `<script src="/theme-init.js">` in `<head>`, not inline.
  Before first paint it applies the stored mode with the same key, the
  same validation and the same `theme-color` update, which avoids a flash
  of the wrong theme. As an external same-origin file, it keeps M3's
  planned strict CSP (`script-src 'self'`) possible without a hash or
  `'unsafe-inline'`. Vite serves and copies `public/` unbundled.
- `app/src/test/setup.ts` gains a `window.matchMedia` stub, because jsdom
  has none and `system` mode reads it.
- Placeholder pages under `app/src/pages/`.

**Tests**
- Router: each route renders its page heading, and an unknown path renders
  not found (using `MemoryRouter`/`createMemoryRouter`).
- Theme:
  - toggling cycles the mode, sets or removes `data-theme`, and persists
    under `project-w.theme`;
  - an unknown stored value and a throwing `localStorage` both fall back
    to `system` without crashing;
  - the toggle's accessible name follows the current mode;
  - forcing a mode updates the `theme-color` metas.
- `theme-init.js`: run it against jsdom with each stored value (`light`,
  `dark`, unknown, and a throwing storage) and assert `data-theme`. This
  also catches drift between the script and `theme.ts`.
- Accessibility smoke: nav links have accessible names, and the active
  link has `aria-current="page"`.

**Done when:** tests pass, and a manual check at 360 px, 768 px and desktop
widths shows no horizontal scroll, readable navigation in both themes, and
a bottom tab bar that never covers page content. This manual check goes
into the functional-review checklist.

### M0-CP5 — CI workflow, web manifest, developer README

**Requirements:** REQ-6, REQ-7

**Files**
- `.github/workflows/app-ci.yml`: runs on `push` and `pull_request`;
  `defaults.run.working-directory: app`; `actions/setup-node` with
  `node-version-file: app/.nvmrc` and npm cache keyed on
  `app/package-lock.json`; steps `npm ci`, `npm run typecheck`,
  `npm run lint`, `npm run format:check`, `npm test`, `npm run build`.
  Separate from the existing `workflow-conformance.yml`, which it must not
  modify.
- `app/public/manifest.webmanifest` (name, short_name, `start_url: "/"`,
  `display: "standalone"`, theme/background colours matching tokens,
  icons).
- `app/public/icons/` (LPR-R1-O03):
  - `icon.svg` is the mark;
  - `icon-maskable.svg` is the same mark inside the central 80 % safe
    zone on a full-bleed background;
  - both are rendered once with `rsvg-convert` (installed on the dev
    machine; `magick` is the fallback) to `icon-192.png`, `icon-512.png`,
    `icon-maskable-512.png` and a 180 px `apple-touch-icon.png`.

  The PNGs are committed and the exact commands go in `app/README.md`. No
  image tool becomes a project dependency.
- `index.html` gets the `<link rel="manifest">`, the `theme-color` metas
  (light and dark) and the apple-touch-icon.
- `app/README.md`:
  - prerequisites (Node LTS via `.nvmrc`), install, and the
    `dev`/`build`/`preview`/`check` commands;
  - folder layout;
  - the money rule ("never use floats for money; use
    `src/lib/money.ts`");
  - a **Hosting** section stating D11's assumption: served at `/`, and
    the host must rewrite unknown paths to `index.html`;
  - the icon regeneration commands.

**Done when:**
- `app-ci.yml` parses as YAML and has the expected triggers and steps. It
  is checked with `actionlint` if that is installed at implementation
  time, otherwise with a PyYAML structural check. Neither `actionlint`
  nor `act` is installed now.
- The same steps as the workflow pass locally, in order.
- A Chromium browser's DevTools (Brave is installed) → Application →
  Manifest parses without errors and shows the icons, the maskable one
  included.

Running the workflow on GitHub isn't possible until a remote exists. Open
question 4 decides whether local-equivalent verification is enough for
M0.

## Requirement coverage

| Requirement | Checkpoints |
|-------------|-------------|
| REQ-1 Stack ADR | M0-CP1 |
| REQ-2 Buildable app in `app/` with scripts | M0-CP1, M0-CP2 |
| REQ-3 Formatter, linter, typecheck, tests pass | M0-CP2 |
| REQ-4 Money as integer cents, shared module | M0-CP3 |
| REQ-5 Routing, responsive layout, light/dark | M0-CP4 |
| REQ-6 CI | M0-CP5 |
| REQ-7 Manifest/icons groundwork + README | M0-CP5 |

The machine-checked version of this table is
`docs/ai-workflow/requirements/milestone-0-mapping.json`.

## Files touched and review classification

All implementation output lands under the paths
`milestone-0-artifacts.json` protects at the implementation stage:

- `app/**`: protected by the `app/` prefix (this includes revision 2's
  `app/public/theme-init.js` and the icon sources);
- `docs/adr/0001-web-app-tech-stack.md`: protected by the `docs/adr/`
  prefix;
- `.github/workflows/app-ci.yml`: protected by an exact-path entry added
  during self-review (the inherited template excludes `.github/`, and
  protected-first ordering keeps this one file protected).

Nothing at the repository root changes (no root `package.json`, no root
`.gitignore` edit). The generated template's Gradle-shaped entries
(`gradle/`, `config/`, `build.gradle.kts`, …) are inherited from the
Android-oriented template and are harmless here: this milestone creates
none of those paths.

## Migration, data and backup implications

None. There is no persisted data yet. The only browser storage is the
theme preference under `project-w.theme`, which is disposable. An unknown
stored value reads as `system`.

## Testing strategy

- Unit and component tests with Vitest (CP2–CP4), all run by `npm run
  check` and CI.
- The money module carries the invariant-heavy tests, because M1's
  correctness depends on it. These are the `allocate` sweep against a
  `BigInt` reference, `-0` checks with `Object.is`, the full
  `parseAmount` grammar table and the format→parse round trip.
- Manual functional review (via `/prepare-functional-review`):
  fresh-clone install, `dev` server, the four routes, theme toggle, layout at
  phone width (including the bottom bar against page content), manifest
  recognised, production `build` + `preview`.

## Notes for M1 planning

These come from review round 1's architecture answers. They are recorded
here so M1's plan starts from them, not as M0 work.

- **Allocation fairness.** `allocate` breaks remainder ties by lowest
  index. Called item by item with equal weights, it makes the same person
  absorb every leftover cent. M1 should allocate once per bill, over the
  aggregated exact per-person shares (common-denominator weights, which
  `allocate` handles exactly however large they get), or rotate the
  tie-break.
- **Percentages.** For a percentage `p`, `parseRatio(p)` with its
  denominator × 100 gives `multiplyRatio`'s ratio. The rounding order
  across chained operations (item → discount → tip) is an M1 policy
  decision. A named `percentOf` helper can arrive with that decision.

## Out of scope for M0

Bill splitting (M1), receipt reading (M2/M3), finance file handling
(M4+), service worker/offline (M8), hosting/deployment configuration,
analytics, i18n framework (strings are English for now; locale only affects
money formatting).

## Known limitations

- The repository has no Git remote yet, so `app-ci.yml` can't be seen
  running on GitHub within this milestone. It's verified by running the
  same commands locally, and it runs for real the first time the repo is
  pushed (see Open question 4).
- `parseAmount` knows only the pt-PT, en-GB and en-US separator
  conventions and only the `€` symbol. Other locales throw, and other
  symbols are `invalid`.
- `formatAmount` supports only currencies with 2 minor-unit digits.
- Deep links and refreshes need a host with SPA fallback at the domain
  root (D11).

## Open questions (for the plan reviewer / user)

1. **Default locale/currency** (roadmap open question): M0 defaults to
   `pt-PT`/`EUR`, defined once in `money.ts` as the shared default of
   `parseAmount` and `formatAmount` (D9). Confirm, or name another
   default.
2. **npm vs pnpm** (D3): npm is chosen for zero extra setup; pnpm is faster
   and stricter about dependencies. Low stakes; can be switched in any
   later milestone.
3. **Where Node comes from**: version manager vs distribution package is
   the user's call; the plan only requires that it matches `app/.nvmrc`.
4. **"Runs in CI" without a remote** (LPR-R1-O04). The roadmap's M0
   done-when says the app builds and the tests pass "in CI". With no
   remote, M0 can only show the workflow's steps passing locally. Choose
   one before `/accept-milestone`:
   - add a GitHub remote and push, so `app-ci.yml` runs for real. Claude
     never pushes, so that step is yours;
   - or explicitly accept local-equivalent verification for M0, in which
     case the workflow first runs on the first push.

   Implementation proceeds either way; the answer only changes what the
   functional-review checklist asks you to confirm.
5. **Path vs hash routing** (LPR-R1-I04). The plan keeps path routes
   (`/settings`). These need a host with SPA fallback at the domain root
   (D11). Hash routes (`/#/settings`) work on any static host, including
   plain GitHub Pages or a sub-path, at the cost of less clean URLs. The
   default is path routing. Say if you'd rather switch: in M0 it is a
   one-line router change, and it gets costlier once links are shared.

No `docs/TECHNICAL_DECISIONS.md` exists in this repository, so there are no
"Open decision" rows for this plan to finalise. Stack decisions are recorded
as ADRs under `docs/adr/` starting with this milestone.
