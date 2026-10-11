# M6 quality checks (CP6)

The evidence for the plan's acceptance targets (design, privacy,
performance). It was taken on 2026-10-12 from the production build
(`npm run build`) in headless Brave by `app/scripts/screens.mjs` and
`app/scripts/check-requests.mjs`.

Only invented names and amounts appear:

- the bill is seeded in storage, like a saved draft;
- the household ledger is seeded in the browser's own IndexedDB: the
  script rebuilds the `settle` database at **version 3** before each load
  (M6's schema, with the `versions` store and a device id), empty or with
  the invented household, one payment, and one record version (e1, edited
  twice on "this phone");
- the Settle file the import screens open is generated from that
  household: e1 changed on "the other phone" too (a conflict), a new
  expense (e9), and e4 deleted there;
- no receipt is read.

## Screens

Every screen is captured at 390, 1024 and 1440 px, in light and dark, in
`screens/`. Each has a screenshot (`.webp`) and its rendered DOM (`.html`,
with the built CSS as `screens/app.css`). M6 adds seven screens; the
Members and Settings screens now show the "Share and export" and "Your
data" cards.

| Screen                                                       | File prefix               |
| ------------------------------------------------------------ | ------------------------- |
| Home                                                         | `home-`                   |
| Receipt                                                      | `receipt-`                |
| Who had what (with a receipt check)                          | `who-had-what-`           |
| The split                                                    | `the-split-`              |
| Save to a household (the dialog over The split)              | `save-to-household-`      |
| Households, none yet (now with Restore from a backup)        | `households-empty-`       |
| Households (now with Open a Settle file)                     | `households-`             |
| A household's overview                                       | `household-overview-`     |
| Its expenses                                                 | `household-expenses-`     |
| Its members (now with Share and export)                      | `household-members-`      |
| A new quick expense                                          | `new-expense-`            |
| An itemised expense                                          | `itemised-expense-`       |
| A quick expense dialog                                       | `expense-dialog-`         |
| The Balances tab                                             | `household-balances-`     |
| A balance explained                                          | `balance-explanation-`    |
| Record a payment, empty                                      | `payment-dialog-empty-`   |
| Mark as paid, filled                                         | `payment-dialog-filled-`  |
| A payment's dialog                                           | `payment-dialog-`         |
| Settings (now with Your data)                                | `settings-`               |
| **Households with the backup reminder** (M6)                 | `households-reminder-`    |
| **Open a Settle file: the picker**                           | `import-`                 |
| **The preview: a conflict, undecided** (Apply disabled)      | `import-preview-`         |
| **The preview: decided** (Use theirs, Apply enabled)         | `import-decided-`         |
| **A refused file** (a bad time, no household)                | `import-error-`           |
| **Done** (after Apply)                                       | `import-done-`            |
| **A household new on this device** (the same file, empty DB) | `import-new-household-`   |
| Not found                                                    | `not-found-`              |

## 360 px

No screen scrolls sideways at 360 px, in either theme, in English and in
Portuguese: `scrollWidth <= clientWidth` on all 108 (54 per language,
`screens/report.json`). The conflict pair stacks its two sides and wraps
its two choices; long Portuguese labels ("Partilhar o ficheiro da casa",
"Restaurar de um ficheiro") wrap within their cards.

## Keyboard

At 1440 px, Tab goes through each screen. Every stop is a control, in
reading order, and every one shows the focus ring (`screens/report.json`,
`keyboard`).

| Screen                          | Stops |
| ------------------------------- | ----- |
| Households, none yet            | 9     |
| Households                      | 9     |
| Its members                     | 36    |
| Settings                        | 13    |
| Households with the reminder    | 11    |
| Open a Settle file              | 7     |
| The preview, undecided          | 9     |
| The preview, decided            | 10    |
| A refused file                  | 7     |
| Done                            | 7     |
| A household new on this device  | 9     |

Each conflict's Keep mine and Use theirs are one radio group, so one Tab
stop, chosen with the arrow keys; Apply joins the order once it is
enabled. The other screens keep M5's counts.

## The design checkers

Both checkers ran on each screen's rendered DOM and on the source.

### Impeccable (`impeccable detect`)

- **The 162 rendered screens: 6 findings, one rule, not applicable.** It
  is `repeated-container-text` on the Receipt screen only, the finding M3
  reasoned (`milestone-3-evidence/CHECKS.md`): the fresh bill's hidden
  item and its screen-reader prefixes.
- **`app/src`: 2 findings, not applicable.** Both are `broken-image` on
  `<img alt={…} />` probe strings inside `i18n/literalText.test.ts`, never
  rendered (as in M5).
- No M6 screen has a finding.

### ux-lint (`ux-lint.sh --ci`)

On the 162 rendered screens and the built CSS: 52 findings, the same as
M5's, from the same rules M3 reasoned one by one
(`milestone-3-evidence/CHECKS.md`, "ux-lint"):

- **22, 25:** only on the split's own markup (and the save dialog over it).
- **26, 28 and 3:** in `app.css`.

No household, export, backup or import screen has a finding.

## Privacy

The request checks pass on the same build (`app/scripts/check-requests.mjs`):

- **Page load** (`requests-page-load.json`): 12 requests, all to the
  app's own origin. None fails, there is no CSP violation, and the planted
  leak is caught.
- **Exchange** (`requests-exchange.json`, new in M6): opens a generated
  Settle file at `/import` and applies it, then, moving through the app's
  own links, shares the household file, exports the CSV and backs up. 14
  clean requests, all same-origin build files; none carries a value from
  the file (the household's name, the members' names, the descriptions,
  the note and the amounts, 13 values searched); no CSP violation; the
  planted leak (the household's name in a custom header) is caught both in
  the protocol log and at the proxy. The file, the CSV and the backup are
  `blob:` downloads, never requests. The CSP is unchanged.
- **CI's three smoke steps, run locally in Brave:** sample 1 and sample
  12 pass with `--expect-bill`; a wrong expected bill (the first line
  total `3.10`) fails, on the bill only.

## Migration in a real browser

Every household screen opens a database the script built at version 3,
so the production build reads M6's schema in Brave. The upgrade from
version 2 is tested under fake-indexeddb: from `v2.json` and from the
completion scenario, byte for byte, creating no version entry and one
device id; a failed version-3 step leaves version 2 intact
(`data/db.test.ts`, `data/completion.test.ts`).

## Performance and budgets

- **The merge** (`merge.integrity.test.ts`): a 2000-expense household with
  200 changes from another phone previews (plan and resolution) well
  within 500 ms; reading a 5 MB Settle file takes well under 1 s.
- **The property sweep** (`merge.sweep.test.ts`): 500 seeded runs on three
  devices, 175 with a database set back and 145 of those with an equal
  clock made on purpose, 824 conflict decisions, in about 30 s.
- **`check-build.mjs`:** 14 same-origin woff2 files, 343,772 bytes in all
  (budget 400 kB), and 131,652 bytes for a first view (budget 250 kB). One
  ONNX Runtime wasm, no Tesseract file, no gallery. M6 adds no font and no
  dependency.
