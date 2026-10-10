# M4 quality checks (CP6)

The evidence for the plan's acceptance targets (design, privacy,
performance). It was taken on 2026-10-10 from the production build
(`npm run build`) in headless Brave by `app/scripts/screens.mjs`.

Only invented names and amounts appear:
- the bill is seeded in storage, like a saved draft;
- the household ledger is seeded in the browser's own IndexedDB: the
  script rebuilds the `settle` database at version 1 before each load,
  empty or with the invented household;
- no receipt is read.

## Screens

Every screen is captured at 390 and 1440 px, in light and dark, in
`screens/`. Each has a screenshot (`.webp`) and its rendered DOM
(`.html`, with the built CSS as `screens/app.css`). M4 adds the household
screens; the old Household placeholder is gone.

| Screen                                                 | File prefix           |
| ------------------------------------------------------ | --------------------- |
| Home                                                   | `home-`               |
| Receipt                                                | `receipt-`            |
| Who had what (with a receipt check)                    | `who-had-what-`       |
| The split                                              | `the-split-`          |
| Save to a household (the dialog over The split)        | `save-to-household-`  |
| Households, none yet                                   | `households-empty-`   |
| Households                                             | `households-`         |
| A household's overview                                 | `household-overview-` |
| Its expenses (history)                                 | `household-expenses-` |
| Its members (with one who left)                        | `household-members-`  |
| A new quick expense                                    | `new-expense-`        |
| An itemised expense                                    | `itemised-expense-`   |
| Settings                                               | `settings-`           |
| Not found                                              | `not-found-`          |

## 360 px

No screen scrolls sideways at 360 px, in either theme:
`scrollWidth <= clientWidth` on all 28 (`screens/report.json`).

## Keyboard

At 1440 px, Tab goes through each screen. Every stop is a control, in
reading order, and every one shows the focus ring (`screens/report.json`,
`keyboard`).

| Screen                  | Stops |
| ----------------------- | ----- |
| Home                    | 7     |
| Receipt                 | 13    |
| Who had what            | 46    |
| The split               | 15    |
| Save to a household     | 12    |
| Households, none yet    | 7     |
| Households              | 8     |
| A household's overview  | 19    |
| Its expenses            | 18    |
| Its members             | 33    |
| A new quick expense     | 25    |
| An itemised expense     | 13    |
| Settings                | 11    |
| Not found               | 7     |

The dialog is modal (`showModal`), so Tab stays inside it.

**Found and fixed here: date fields.** The first run reported a stop with
no ring in each screen with a date field (Members, New expense and the save
dialog). A date input takes four Tab stops: day, month, year, then the
calendar button. On the last, the input matches neither `:focus-visible`
nor `:focus`. `ui/Field.module.css` now gives `.control[type='date']`
the house ring on `:focus` and `:focus-within`. After the fix, every stop
shows the ring.

## The design checkers

Both checkers ran on each screen's rendered DOM and on `app/src/**/*.css`.

### Impeccable (`impeccable detect`)

- **The CSS: 0 findings.**
- **The 56 rendered screens: 4 findings, one rule, not applicable.** It is
  `repeated-container-text` on the Receipt screen only, the same finding M3
  reasoned (`milestone-3-evidence/CHECKS.md`). It is the fresh bill's
  hidden item and its screen-reader prefixes.
- **Found and fixed here: `cramped-padding` on the overview.** The first
  run reported 20 findings. The "Where it went" rows centred their text by
  a minimum height, with no padding against their top border. They now have
  `padding: var(--space-2) 0`, like the other rows, and the finding is
  gone.

### ux-lint (`ux-lint.sh --ci`)

On the 56 rendered screens and the built CSS: 36 findings, from the six
rules M3 reasoned one by one (`milestone-3-evidence/CHECKS.md`, "ux-lint").
- **22, 25:** only on the split's own markup. The save dialog's screens
  appear because the dialog sits over The split.
- **26, 27, 28 and 3:** in `app.css`.

No household screen has a finding. Rule 22 (an icon-only button without a
name) was checked again by parsing every saved DOM: there are 528 buttons,
and every one has words or an `aria-label`. Every input with a placeholder
has its own id and `<label for>`.

## Privacy

The request checks pass on the same build (`app/scripts/check-requests.mjs`):

- **Page load** (`requests-page-load.json`): 12 requests, all to the app's
  own origin. None fails, there is no CSP violation, and the planted leak
  is caught. The ledger is IndexedDB on the device, so it makes no
  request.
- **A scan of committed sample 1** (`requests-scan-sample-1.json`): 27
  clean requests, no CSP violation, and the bill is read as expected.
- **CI's three smoke steps, run locally in Brave:** sample 1 and sample
  12 pass with `--expect-bill`. A wrong expected bill (the first line total
  `3.10`) fails, on the bill only.

## Performance and budgets

- **1000 expenses** render and filter on the Expenses tab in about 2 s
  under jsdom, against a budget of 15 s to render and 5 s to filter
  (`history.test.tsx`).
- **`check-build.mjs`:** 14 same-origin woff2 files, 343,772 bytes in all
  (budget 400 kB), and 131,652 bytes for a first view (budget 250 kB). One
  ONNX Runtime wasm, no Tesseract file, no gallery. M4 adds no font.
