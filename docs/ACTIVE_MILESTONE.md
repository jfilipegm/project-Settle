# Active Milestone

## Milestone

**M3 — Design foundations** (work item `milestone-3`, a new milestone
the user inserted on 2026-10-07; households and every later milestone
moved down one in `docs/ROADMAP.md`). Plan revision 5,
`docs/milestones/milestone-3-PLAN.md`, approved on 2026-10-08 (both plan
reviews APPROVE; approval commit `ced7c3b`), on `feature/milestone-3`,
PR #10. Phase `IMPLEMENTING`.

## Next action

**CP4 — The shell and the simple pages.**

## Progress

- **CP1 — Foundations: complete.**
  - `docs/ROADMAP.md`: M3 Design foundations inserted after M2.5, every
    later milestone moved down one (M17 is now the last) with every
    cross-reference; the old design pass (now M11) keeps the logo and
    the polish informed by real use; Phase 1's "Not yet" reworded.
  - `PRODUCT.md` committed at the root.
  - `app/src/styles/tokens.css`: the S1 palette, S2's six people colours
    with their initials, S3's faces and type scale, S6's radii, shadow
    and motion, in both themes. Today's token names stay as aliases until
    CP5.
  - Fonts bundled from `@fontsource` (Unbounded 500/600, JetBrains Mono
    400/500, Source Sans 3 400/600/700; latin and latin-ext with their
    unicode ranges, woff2 only) through `src/styles/fonts.css`;
    `@tabler/icons-react` and `src/ui/Icon.tsx` (stroke 1.75; 16, 20 or
    24 px; always `aria-hidden`).
  - `global.css`: the new body, title faces, tabular figures for
    `.amount`/`<data>`/`<time>`, the rust focus ring, selection, caret,
    `accent-color`, scrollbars, reduced motion.
  - Header colours: `THEME_COLORS` `#ffffff`/`#1c1f2b`, in `theme-init.js`,
    `index.html` and the manifest (background `#eceef1`).
  - Tests: contrast (every text and fill pair at least 4.5:1, people
    colours and the focus ring at least 3:1 on card and ground, both
    themes), every role in both palettes, `fonts.css` against the build
    check, and `scripts/check-build.mjs`'s new font check (14 same-origin
    woff2 files, no remote URL, the budgets).
  - Verified: `npm run check` (54 files, 1173 passed, 1 skipped);
    `npm run build` and `check-build.mjs` (fonts 343,772 bytes in all,
    131,652 for a first view, against 400 kB and 250 kB); the page-load
    request check in headless Brave passes (12 same-origin requests, the
    five fonts used included, no CSP violation).
  - Notes for later checkpoints: the lowest text pair is rust on the
    light ground (4.79:1). Control borders (`#C9CED6`/`#3A3F4E`) are about
    1.6:1 on the card, as the approved canvas has them; every field keeps
    a visible label, and CP3's fields should not rely on the border alone.
    Until CP5, the receipt panels' warning edge now shows amber (the old
    fallback token is now defined); CP5 restyles them without the stripe
    (S7). The licence notices for the fonts and Tabler land in CP6.
- **CP2 — English and Portuguese: complete.**
  - `app/src/i18n/`: `en.ts` (the source catalogue), `pt.ts` (European
    Portuguese, typed against it), `t.ts` (lookup, `{name}` parameters,
    `Intl.PluralRules` plurals), `language.ts` and `LanguageProvider.tsx`
    (System, English or Português under `settle.language`; System takes
    the first `pt`/`en` browser language, else English; `<html lang>` is
    `en` or `pt-PT`), `notRead.ts` (`isNotReadItemName`, either language).
  - Every interface text moved: the components, the plain modules (which
    now take `t`: `fields.ts`, `messages.ts`, `review.ts`, `format.ts`;
    `lineReview.ts` maps roles to keys), the display maps and both
    `window.confirm` prompts. `model.ts`'s `displayName` takes `t`;
    `computeSplit` takes an optional name function, so the maths is
    unchanged. The stand-in name reaches `toBill.ts` as an import option,
    English by default, so `readRows`, `localReport.node.ts` and the CI
    expected-bill check are untouched.
  - Settings has a Language field next to Region; switching re-renders
    without a reload.
  - Tests: key, plural and parameter parity, and every Portuguese text
    translated apart from six named exceptions; the literal-text guard
    (TypeScript compiler API, all of `src/` by default, one exclusion:
    the parser and its keywords; the allowlist: the wordmark, `'Files'`,
    one developer-only error detail and the key names) with its own
    negative and positive snippets; every page in Portuguese with no
    English sentinel; Settings' options, the navigation and theme
    labels, the adjustment names and hints asserted exactly; every
    validation message, read error, warning, photo advice, line role,
    notice and the copied summary in Portuguese; the stand-in in both
    languages through `review.ts` and `accuracy.ts`, renamed and
    price-only, and "Add the difference" in Portuguese next to an English
    stand-in.
  - The existing suites kept their results with only harness changes:
    tests that call a message function pass an English translator.
  - Verified: `npm run check` (59 files, 1291 passed, 1 skipped).
  - Design check (S14): the new Language field in Settings goes onto the
    canvas with CP6's update; nothing else changed visually.
- **CP3 — The component kit: complete.**
  - `app/src/ui/`: `Button` (primary ink, secondary, quiet; 40 to 52 px;
    optional icon; the 0.97 press), `IconButton` (required label),
    `TextField` and `SelectField` (label above, hint and error below,
    both in `aria-describedby`, `aria-invalid`, the error with an icon),
    `Card` (flat on a 1 px line; a title makes it a named section),
    `StatusChip` (success, warning, error: an icon and words), `PersonBadge`
    (S2's colour by position through CSS custom properties in the
    `style` prop, the initial or the person's number, the name shown or
    read out), `Amount` (a `<data>` in cents, the region's format, the
    minus sign U+2212, an optional plus), `Steps` (named step links,
    `aria-current="step"`), and `Icon` from CP1.
  - The gallery at `/_kit`: `routeTable({ dev })` in `app/routes.tsx`, the
    gallery a lazy import behind `import.meta.env.DEV`; tests for both
    `dev` values; `check-build.mjs` now also fails any built file carrying
    the gallery. It shows every component, with switches for light and
    dark and for English and Portuguese. Checked in headless Brave in
    both themes and both languages.
  - The literal-text guard excludes `ui/gallery/` (development only).
  - Verified: `npm run check` (66 files, 1339 passed, 1 skipped);
    `npm run build` and `check-build.mjs` (no gallery in `dist/`).
  - Design check (S14): the kit matches the canvas's foundations sheet;
    nothing to update yet.

## Last completed: M2.5 — Accurate receipt reading

Receipts are read by PaddleOCR instead of Tesseract.js, still for free
and entirely in the browser:

- **CP1:** the local test set (format v2, real receipts kept local only,
  never committed) and one accuracy measure, in Node and a real browser,
  with the Tesseract baseline.
- **CP2:** the PaddleOCR reader (`ppu-paddle-ocr` on ONNX Runtime Web,
  PP-OCRv5 mobile models) behind M2's `ReceiptReader` interface, in a
  worker, its assets self-hosted under the existing CSP.
- **CP3:** image clean-up and parser tuning on the local set.
- **CP4:** the committed corpus moved to PaddleOCR, the photo quality
  check (tips for blurred, dark, small or cut-off photos), and Tesseract
  retired.
- **CP5:** the row-by-row review ("Review lines"): the image with a box
  per read line, each line's role, "Add as item" and "Add a missed line".
- **CP6:** the acceptance measurement, privacy scans, ADR 0003, the
  licence notices, Settings and the READMEs.
- **CP6A** (plan amendment, revisions 9–10): browsers that can't run the
  reader (no WebAssembly, e.g. Lockdown Mode, or no SIMD) get a note
  naming the cause, Choose PDF only, and `readerUnsupported` instead of
  a wrong "check your connection".

Measured (browser, two runs, 21 local images, 18 tuning and 3 held out):
tuning receipts with no edit 15 of 18 (83.3 %) in both runs; held out 5
of 6 run-results; rows 96.0–96.5 %; prices 97.5 %; **0 false
"Matches"**. Below the roadmap's 94 % aim: the plateau was accepted by
the user at CP3 (2026-10-03) and the measurement at CP6 (2026-10-04).

Verification:
- `npm run check` (typecheck, lint, format, 52 test files: 1084 passed,
  1 skipped) and `npm run build` pass; the request-privacy scans
  (`check-requests.mjs`) pass, with logs in
  `docs/milestones/milestone-2-5-evidence/`.
- `app`, `workflow-conformance` and `pr-title` are green on GitHub
  (PR #9).
- Implementation review: three external rounds (REVISE, REVISE, then
  APPROVE); technical approval `64a2b1d`.
- Functional review: round 1 checklist `f1727fe`; no findings were
  written; the user accepted the milestone on 2026-10-07.

Carried forward (not blockers):
- **The 94 % aim.** More real receipts first (the set has 19 distinct
  receipts, 3 held out, against the plan's 20 and 5; the roadmap's 30),
  then, if the local route stays short, the opt-in "enhanced reading"
  with the user's own AI key (the user's decision; it changes a guiding
  principle).
- **The phone reading times** (P13) were not timed, the user's decision
  (2026-10-04); the reading was found fast on the iPhone 13.
- **The CP6A iPhone checks** (Lockdown Mode on and off for the site,
  checklist flows 8–9) were deferred by the user on 2026-10-05; no
  result for them is recorded here. The behaviour is covered by the
  headless-Brave runs with WebAssembly removed.
- Remembering the user's corrections on the device (roadmap: Future).
- Receipts from other countries: prefer general parser rules; revisit
  now that M2.5 is done.
- Not in M2.5: cropping and perspective correction, handwriting, editing
  a read line's text in "Review lines", offline caching of the reader
  (M7, after the M3 renumbering).

## Current blockers

None.

## Active plan

`docs/milestones/milestone-3-PLAN.md` (revision 5). M2.5's plan is archived at
`docs/milestones/completed/milestone-2-5-PLAN.md` (M0's, M1's, M2's and
M2's remediation child's are in the same folder).

## Functional review checklist

None. M2.5's round-1 checklist is in commit `f1727fe`.

<!--
This file is `workflow_state.FUNCTIONAL_CHECKLIST_PATH`. It is
repository-local state: workflow-manager generates it once at bootstrap and
never overwrites it on update.
-->
