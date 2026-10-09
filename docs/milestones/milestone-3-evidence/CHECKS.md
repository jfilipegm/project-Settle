# M3 quality checks (CP6)

The evidence for the plan's quality gates (S13), taken on 2026-10-09 from
the production build (`npm run build`), in headless Brave, by
`app/scripts/screens.mjs`. Only invented names and amounts appear: the
bill is seeded in storage like a saved draft, and no receipt is read.

## Screens

Every screen at 390 and 1440 px, light and dark, in `screens/`: a
screenshot (`.webp`) and its rendered DOM (`.html`, with the built CSS as
`screens/app.css`). The development-only gallery isn't in the production
build, so it isn't here.

| Screen                              | File prefix     |
| ----------------------------------- | --------------- |
| Home                                | `home-`         |
| Receipt                             | `receipt-`      |
| Who had what (with a receipt check) | `who-had-what-` |
| The split                           | `the-split-`    |
| Household placeholder               | `household-`    |
| Settings                            | `settings-`     |
| Not found                           | `not-found-`    |

## 360 px

No screen scrolls sideways at 360 px, in either theme:
`scrollWidth <= clientWidth` on all 14 (`screens/report.json`).

## Keyboard

Tab through each screen at 1440 px: every stop is a control, in reading
order (skip link, wordmark, the three destinations, the theme toggle, the
steps, then the page), and every one shows the focus ring. Stops per
screen: Home 7, Receipt 13, Who had what 46, The split 15, Household 7,
Settings 11, Not found 7 (`screens/report.json`, `keyboard`). A step
change moves focus to the step's heading (tests in
`SplitPage.steps.test.tsx`).

## The design checkers

Run on each screen's rendered DOM and on `app/src/**/*.css`.

### Impeccable (`impeccable detect`)

- The CSS: **0 findings**. (The detector was checked on a planted gradient
  text, which it reports.)
- The 28 rendered screens: **4 findings, one rule, not applicable**:
  `repeated-container-text`, "Item 1" 7 times in one item row, on the
  Receipt screen only (both widths, both themes). It's the fresh bill's
  one empty item, in the Who had what panel, which is `hidden` on Receipt:
  a sighted person never sees it. The repeats are the screen-reader
  prefixes on each field ("Item 1 Name", "Item 1 Quantity", ...), kept
  from M1 so a field read out on its own says which item it belongs to.

### ux-lint (`ux-lint.sh --ci`)

On the 28 rendered screens and the built CSS, 28 findings from six rules;
on `app/src/**/*.css`, 8 findings from four rules (two of them the same as
the built CSS's). Each was checked against the markup and the CSS, and
none applies:

| Rule                                                                                         | Where                   | Why it doesn't apply                                                                                                                                                                                            |
| -------------------------------------------------------------------------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 22 Icon-only button without `aria-label` (Critical)                                          | the Split screens       | Every button has words or an `aria-label`: a parse of each saved DOM finds no button without a name. The icons inside buttons are `aria-hidden` decoration.                                                     |
| 25 Placeholder used as label (High)                                                          | the Split screens       | Every input with a placeholder has its own `<label for>`; the placeholder only repeats the default name ("Person 1").                                                                                           |
| 27 `outline: none` without a focus-visible replacement (Critical)                            | `app.css`               | Only on headings and `<main>`, which take focus from script (`tabIndex=-1`) when a step changes; they aren't controls and aren't in the Tab order. Every control keeps the rust ring (the keyboard pass above). |
| 26 Animating `width`, `height`, `top`, `left` (High)                                         | `app.css`               | Nothing animates those: the only transitions are `transform` (the press scale), and the row flash animates the background colour.                                                                               |
| 28 `cursor: pointer` on non-interactive elements (Medium)                                    | `app.css`               | Each one is clickable: labels that wrap a file input or a radio, `<summary>`, and the receipt image's line boxes.                                                                                               |
| 3 Pure white canvas on premium marketing (Medium)                                            | `app.css`               | White is the card colour of the approved palette (S1), on a `#ECEEF1` ground, in app screens, not a marketing page.                                                                                             |
| 13 `h-screen` on a mobile hero, 15 fixed `100vh` on a mobile container (the source CSS only) | `src/styles/global.css` | The body has `min-height: 100vh` only as the fallback before `min-height: 100dvh`, the mobile-safe unit the rules ask for.                                                                                      |

## Privacy

On the same build, the request checks pass (`check-requests.mjs`):

- Page load (`requests-page-load.json`): 12 requests, all to the app's own
  origin (the five font files a first view uses among them), none
  failing, no CSP violation, and the planted leak caught.
- A scan of committed sample 1 (`requests-scan-sample-1.json`): 27 clean
  requests, no CSP violation, and the bill read as expected.

## Fonts

`check-build.mjs`: 14 same-origin woff2 files, 343,772 bytes in all
(budget 400 kB), 131,652 bytes for a first view, the latin files (budget
250 kB). The latin-ext files load only for a name that needs them.
