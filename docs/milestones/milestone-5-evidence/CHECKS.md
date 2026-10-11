# M5 quality checks (CP6)

The evidence for the plan's acceptance targets (design, privacy,
performance). It was taken on 2026-10-10 from the production build
(`npm run build`) in headless Brave by `app/scripts/screens.mjs`, and taken again after the local
implementation review of round 1 (the Portuguese and share-bar checks).

Only invented names and amounts appear:

- the bill is seeded in storage, like a saved draft;
- the household ledger is seeded in the browser's own IndexedDB: the
  script rebuilds the `settle` database at **version 2** before each load
  (M5's schema, with the `settlements` store), empty or with the invented
  household and one payment ("Tiago paid Marta, 20,00, Electricity
  share");
- no receipt is read.

## Screens

Every screen is captured at 390, **1024** (new in M5) and 1440 px, in
light and dark, in `screens/`. Each has a screenshot (`.webp`) and its
rendered DOM (`.html`, with the built CSS as `screens/app.css`). M5 adds
five screens, and the overview and Expenses screens now show the balances
card and a payment.

| Screen                                                 | File prefix              |
| ------------------------------------------------------ | ------------------------ |
| Home                                                   | `home-`                  |
| Receipt                                                | `receipt-`               |
| Who had what (with a receipt check)                    | `who-had-what-`          |
| The split                                              | `the-split-`             |
| Save to a household (the dialog over The split)        | `save-to-household-`     |
| Households, none yet                                   | `households-empty-`      |
| Households                                             | `households-`            |
| A household's overview (with the balances card)        | `household-overview-`    |
| Its expenses (with a payment among them)               | `household-expenses-`    |
| Its members (with one who left)                        | `household-members-`     |
| A new quick expense                                    | `new-expense-`           |
| An itemised expense (its dialog over Expenses)         | `itemised-expense-`      |
| A quick expense (its dialog over Expenses)             | `expense-dialog-`        |
| **The Balances tab** (M5)                              | `household-balances-`    |
| **A balance explained** (Ana's)                        | `balance-explanation-`   |
| **Record a payment, empty** (the dialog over Balances) | `payment-dialog-empty-`  |
| **Mark as paid, filled** (the dialog over Balances)    | `payment-dialog-filled-` |
| **A payment** (its dialog over Expenses)               | `payment-dialog-`        |
| Settings                                               | `settings-`              |
| Not found                                              | `not-found-`             |

## 360 px

No screen scrolls sideways at 360 px, in either theme, in English and in
Portuguese: `scrollWidth <= clientWidth` on all 80 (40 per language,
`screens/report.json`; the Portuguese entries carry `"language": "pt"`).

**Found and fixed here: four tabs at 360 px.** The first run reported
every household screen 12 px too wide at 360 px: the fourth tab,
Balances, left each tab about 77 px, and "Overview" in bold with the
tabs' 12 px side padding didn't fit. Under 400 px the tabs now take 4 px
of side padding and 14 px text (`ui/Tabs.module.css`), still 44 px tall.

**Added after the local implementation review (O-1):** the Portuguese
pass. Round 1 said the Portuguese labels fit because they are shorter;
`screens.mjs` now loads every screen again at 360 px in Portuguese and
measures it. None scrolls.

## The chart tips at 360 px

On the overview at 360 px, in both themes, the script hovers the first
and the last bar of each bar chart (Day by day, The last six months) and
measures the tip against its card: every tip stays inside its card (2
charts each, `screens/report.json`, `chart-tips`).

**Added after the local implementation review (O-3):** in the expense
dialog at 360 px, the script hovers the share bar's first and last
segments; each tip stays inside the dialog (`share-bar-tips`, both
themes).

## Keyboard

At 1440 px, Tab goes through each screen. Every stop is a control, in
reading order, and every one shows the focus ring (`screens/report.json`,
`keyboard`).

| Screen                 | Stops |
| ---------------------- | ----- |
| Home                   | 7     |
| Receipt                | 13    |
| Who had what           | 46    |
| The split              | 15    |
| Save to a household    | 12    |
| Households, none yet   | 7     |
| Households             | 8     |
| A household's overview | 23    |
| Its expenses           | 25    |
| Its members            | 34    |
| A new quick expense    | 26    |
| An itemised expense    | 4     |
| A quick expense dialog | 2     |
| The Balances tab       | 24    |
| A balance explained    | 22    |
| Record a payment       | 9     |
| Mark as paid           | 9     |
| A payment's dialog     | 3     |
| Settings               | 11    |
| Not found              | 7     |

What changed from M4:

- **The overview:** each bar chart is now one Tab stop with roving focus
  (B1). "The last six months" was six link stops and is now one; "Day by
  day", which was an image, gains one. The balances card adds its Details
  link, and the household's tabs gain Balances.
- **Its expenses, members and new expense:** the fourth tab, and the
  seeded payment's row in Expenses.
- **A payment's dialog** opens with the focus on its Close button, then
  Edit and Delete. The payment dialogs are modal, so Tab stays inside.

## The design checkers

Both checkers ran on each screen's rendered DOM and on the source.

### Impeccable (`impeccable detect`)

- **The 120 rendered screens: 6 findings, one rule, not applicable.** It
  is `repeated-container-text` on the Receipt screen only (now at three
  widths), the same finding M3 reasoned
  (`milestone-3-evidence/CHECKS.md`): the fresh bill's hidden item and its
  screen-reader prefixes.
- **`app/src`: 2 findings, not applicable.** Both are `broken-image` on
  `<img alt={…} />` strings inside `i18n/literalText.test.ts`: probe source
  that the literal-text guard's own tests parse, never rendered. One is
  M3's, one is the new template-literal probe (R2-O1).
- No balances, payment or explanation screen has a finding.

### ux-lint (`ux-lint.sh --ci`)

On the 120 rendered screens and the built CSS: 52 findings, from the same
six rules M3 reasoned one by one (`milestone-3-evidence/CHECKS.md`,
"ux-lint"). The count rose from M4's 36 only because each screen is now
also captured at 1024 px.

- **22, 25:** only on the split's own markup. The save dialog's screens
  appear because the dialog sits over The split.
- **26, 27, 28 and 3:** in `app.css`.

No household screen has a finding: the Balances tab, the explanation,
the payment dialogs and the payment in the history included. Rule 22 (an
icon-only button without a name) was checked again by parsing every saved
DOM: there are 980 buttons, and every one has words or an `aria-label`
(Mark as paid's carries the payment it records, "Mark as paid: Marta pays
Ana 242,22 €").

## Privacy

The request checks pass on the same build (`app/scripts/check-requests.mjs`):

- **Page load** (`requests-page-load.json`): 12 requests, all to the app's
  own origin. None fails, there is no CSP violation, and the planted leak
  is caught. Payments are in IndexedDB on the device, so they make no
  request; Copy as text and Share hand text only to the clipboard or the
  device's share sheet. The CSP is unchanged.
- **A scan of committed sample 1** (`requests-scan-sample-1.json`): 27
  clean requests, no CSP violation, and the bill is read as expected.
- **CI's three smoke steps, run locally in Brave:** sample 1 and sample
  12 pass with `--expect-bill`. A wrong expected bill (the first line total
  `3.10`) fails, on the bill only.

## Migration in a real browser

Every household screen opens a database the script built at version 2,
so the production build reads the M5 schema in Brave. The upgrade itself
from version 1 is tested under fake-indexeddb: from an empty database,
from M4's fixture byte for byte with the same shares and month totals,
from the completion scenario with the same balances, suggestion and
explanations, and a failed step leaving version 1 intact
(`data/db.test.ts`, `data/completion.test.ts`).

## Performance and budgets

- **The balances engine** (`balances.test.ts`): 1000 expenses and 200
  payments give the balances, the suggestion and an explanation well
  within the 500 ms budget under jsdom, and the grouping programme stays
  within it on adversarial 16-member vectors (many zero-sum subsets).
- **`check-build.mjs`:** 14 same-origin woff2 files, 343,772 bytes in all
  (budget 400 kB), and 131,652 bytes for a first view (budget 250 kB). One
  ONNX Runtime wasm, no Tesseract file, no gallery. M5 adds no font and no
  dependency.
