# Active Milestone

## Milestone

**M3 — Design foundations** (work item `milestone-3`, a new milestone
the user inserted on 2026-10-07; households and every later milestone
moved down one in `docs/ROADMAP.md`). Plan revision 5,
`docs/milestones/milestone-3-PLAN.md`, approved on 2026-10-08 (both plan
reviews APPROVE; approval commit `ced7c3b`), on `feature/milestone-3`,
PR #10. Phase `AWAITING_LOCAL_IMPLEMENTATION_REVIEW` (implementation
revision 2).

## Next action

Implementation review round 3 of revision 2 (same content, CI evidence
added): the local review (`/review-implementation milestone-3`), then
the manual external review.

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
  - A flaky timing in the gallery's route test (a lazy import over the
    default 1 s wait under a full run) slipped into the CP3 commit; CP4's
    commit raises that wait to 10 s.
- **CP4 — The shell and the simple pages: complete.**
  - The shell: the wordmark links to Home; Split, Household and Settings
    are a bottom tab bar with icons and words under 640 px and a header
    menu from 640 px, the active one bold and underlined in rust, next to
    the compact theme toggle. One theme state for the app
    (`ThemeProvider`), so the toggle and Settings agree.
  - Home: two lines, then "Split a bill", or "Continue your bill" when the
    saved draft has content (`billHasContent`), and the privacy line.
  - `/household`: the placeholder ("Coming in M4: households, members and
    the expense ledger.", a link to the split), no household state.
    `/finances` redirects there; `FinancesPage` and `PlaceholderPage` are
    gone.
  - Settings on the kit: Language, Theme (System, Light, Dark), Region
    (the example as an `Amount`), Receipt reading with the licences.
  - Not found on the kit.
  - Tests: the routes, the redirect, the tabs' `aria-current`, icons and
    words, the wordmark link; Home's button with no draft, a saved fresh
    bill and a draft with content; Settings' Theme field driving the
    header toggle; Portuguese labels for the tabs and the Theme options.
  - Checked in headless Brave: Home at 390 px, Settings at 1280 px.
  - Verified: `npm run check` (68 files, 1347 passed, 1 skipped).
  - Design check (S14): the shell and pages follow the canvas's navigation
    map; the Settings screen (Language and Theme) goes onto the canvas
    with CP6's update.
- **CP5 — The split flow: complete.**
  - Three steps, Receipt, Who had what and The split, named in a steps
    indicator and kept in the URL (`/split?step=`): Back, Forward and a
    reload keep the step. With no step, a bill without content
    (`billHasContent`) opens on Receipt and one with content on Who had
    what, and the step is written into the URL. All three stay mounted,
    the others `hidden`, so switching loses nothing typed. Each step's
    heading takes focus when the step changes.
  - Receipt: the scan, and "Type it in". An import ends on Who had what
    with the check's heading focused (the CI smoke contract). From
    1024 px (`useMediaQuery`, narrow without `matchMedia`) Who had what
    shows The split beside the items, live; under it, "See the split".
    The result's error and notice links go to their field or panel on
    Who had what.
  - Person-first assignment: a person picker (native radios as person
    chips), item rows that toggle the chosen person (`aria-pressed`, the
    sharers as a description, each change announced), "Everyone", and
    today's editor behind Edit (open at first for an empty item, and for
    an item with an error). Both ways dispatch `toggleAssignee`. A row
    that gains or loses a person flashes for 200 ms (reduced motion: no
    flash).
  - New bill on every step, with today's confirmation and hint; it
    resets everything and replaces the history entry with
    `?step=receipt`, focusing the Receipt heading.
  - The receipt panels and the result on the kit and tokens: icons
    instead of the ⚠/✓ glyphs, amber notices with an icon, a swatch
    instead of a coloured edge in Review lines, the share bars in each
    person's colour, `Amount` with the true minus sign. The CP1 token
    aliases are gone.
  - Existing suites: harness, selector and navigation changes only
    (`src/test/splitSteps.tsx`: a router, `showStep`, `openEditors`, and a
    wide screen so the result sits beside the items). One judgment call:
    one receipt test asserted the status text with its decorative "⚠ "
    glyph, which S5 replaces with an icon; it now asserts the same words
    and the hidden icon. The "See result" link it checked is replaced by
    "See the split", tested in the new suite.
  - New tests (`SplitPage.steps.test.tsx`, 23): the step names, the
    default step (no draft, a saved fresh bill, a priced item), reload,
    Back and Forward with focus, "Type it in", both layouts, the error
    link across steps, the smoke contract in jsdom, person-first
    assignment (pointer, keyboard elements, Everyone, the editor agreeing,
    the flag), New bill from Who had what and The split (cancel, confirm,
    the fresh bill, the replace by one Back).
  - The three CI smoke steps, locally in headless Brave on the production
    build: samples 1 and 12 pass (27 clean requests, no CSP violation,
    the bill as expected), and the wrong expected bill fails on the bill
    alone.
  - Verified: `npm run check` (69 files, 1370 passed, 1 skipped);
    `npm run build` and `check-build.mjs`.
  - Design check (S14): checked in Brave at 390 px (Receipt, Who had
    what, The split) and 1280 px (beside, light and dark); the canvas's
    split screens get the shipped details (the Edit button, "Type it in")
    in CP6.
- **CP6 — Quality pass and documentation: complete.**
  - `app/scripts/screens.mjs`: every screen of the production build in
    headless Brave at 390 and 1440 px, light and dark (screenshot and
    rendered DOM), the 360 px check and a Tab pass. Results and evidence in
    `docs/milestones/milestone-3-evidence/` (`CHECKS.md`): no sideways
    scroll at 360 px on any screen; every Tab stop a control with the
    focus ring.
  - The checkers: Impeccable 0 findings on the CSS; on the screens 4
    findings of one rule (`repeated-container-text`, the screen-reader
    field prefixes in the hidden editor on Receipt), not applicable.
    ux-lint's findings (six rules on the screens and built CSS, four on
    the source CSS) each checked and named as not applicable in
    `CHECKS.md`.
  - Privacy on the same build: page load 12 same-origin requests, a scan
    of sample 1 27 clean requests, no CSP violation. Fonts: 343,772 bytes,
    131,652 for a first view.
  - `docs/DESIGN.md` (tokens, type, icons, components, motion, layout,
    house rules, languages, how to check new UI) and
    `docs/adr/0004-design-system-and-languages.md`.
  - `app/public/THIRD_PARTY_NOTICES.md` lists the three fonts and Tabler;
    `vendor-assets.mjs` copies their licences to `/vendor/licenses/`
    (`BUNDLED_PACKAGES`), and the vendor tests cover them.
  - `README.md` (the three steps, two languages, a screenshot, the
    roadmap line) and `app/README.md` (Design and Languages sections, how
    to add a text, the new folders and storage key).
  - The design canvas: a new "As shipped in M3" board with the production
    screens (phone light and dark, desktop), and the navigation map
    updated (Settings built, recent splits planned, Back and the step
    default). The target boards are kept as the target.
  - Verified: `npm run check` (69 files, 1370 passed, 1 skipped);
    `npm run build` and `check-build.mjs`.
- **Implementation review, round 1** (revision 1, local review:
  REVISE). Every finding was reproduced and fixed; none was rejected.
  - **R1-I1** (`1051ba2`): a step-less `/split`, which the tab bar's
    Split link opens, used the default step from when the page first
    mounted, so tapping it from The split after a scan opened Receipt.
    The default now reads the current bill. A regression test failed
    before the fix.
  - **R1-O1** (`07f97bb`): `useMediaQuery` subscribed again on every
    render; now once per query, with its own tests.
  - **R1-O2** (`d098a6b`): the literal-text guard now checks braced
    label attributes (`aria-label={'remove'}`). No new finding in `src/`.
    The allowlist still applies in every position, which is harmless
    for its nine entries; left as is.
  - **R1-O3, R1-O4** (`e7b220a`): Home's Portuguese privacy line reads
    "Sem registo." instead of "Sem conta.", and `pt.ts` names its parity
    test.
  - Verified: `npm run check` (70 files, 1378 passed, 1 skipped);
    `npm run build` and `check-build.mjs` (unchanged: 343,772 bytes of
    fonts, 131,652 for a first view, no gallery).
- **Implementation review, round 2** (revision 2). The local review
  approved. The manual external review asked for changes (REVISE), with
  one blocking finding and no code defect.
  - **B-EXT-1** (evidence only): the bundle didn't show completed
    required CI for the revision-2 code. All four required checks have
    since passed on `dfb6b55`:
    - App CI on the push (run 37894899945);
    - App CI on the pull request (37894905619);
    - workflow-conformance (37894905562);
    - pr-title (37894905541).
    `git diff e7b220a dfb6b55` touches only `docs/ACTIVE_MILESTONE.md`
    and `WORKFLOW_STATE.json`, and `app/` and `.github/` are identical.
    So CI tested the reviewed code. Recorded in the bundle's
    `TEST_RESULTS.md`. No code change.
  - **O-EXT-1, O-EXT-2**: keep the step and focus regression tests, and
    keep the migrated suites' assertions intact. Both already hold, so
    nothing changed.
  - **R2-O1** (local, optional): some forms still pass the literal-text
    guard: a ternary or a template with substitutions in a label
    attribute, a parenthesised or `as` literal, and a kit `label` prop.
    It also reports `alt=""`. Deferred, because nothing in `src/` uses
    these forms, and fixing it now would change the reviewed content
    for an optional finding.
  - The bundle was regenerated at the same content (same review content
    ID), and revision 2 is unchanged.

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
