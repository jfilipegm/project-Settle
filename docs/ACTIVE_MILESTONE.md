# Active Milestone

## Milestone

M0 — Project foundation (work item `milestone-0`, product, governing
workflow version `2.1`). Phase: `AWAITING_FUNCTIONAL_REVIEW`.

## Goal

An empty but deployable app skeleton with tooling in place, so M1 (bill
splitter) can start straight on product code: the web app builds and runs
locally and in CI and shows a placeholder home page; lint, format check,
type check and unit tests run in CI and pass; money is handled as integer
cents through one shared, tested module.

## Current checkpoint

None in progress. All five checkpoints are complete, and the implementation is approved (technical approval `0dbeb45`, implementation revision 1). Next: the manual functional review below, then `/accept-milestone`.

| Checkpoint | Status | Verified state |
|---|---|---|
| M0-CP1 — Stack ADR + Vite/React/TS scaffold in `app/` | Complete | `npm ci && npm run build` pass from `app/` (Node 24.21.0, npm 12.1.0, TypeScript 6.0.3, Vite 8.3.1). `npm run dev` served the placeholder page. ADR at `docs/adr/0001-web-app-tech-stack.md`. |
| M0-CP2 — Quality tooling | Complete | `npm run check` (typecheck, lint with `--max-warnings=0`, format:check, test) passes, both in the working tree and in a clean copy after `npm ci`; `npm run build` still passes. ESLint 10.11 + typescript-eslint 8.70, Prettier 3.9, Vitest 5.0 + jsdom 30 + Testing Library. |
| M0-CP3 — Money module | Complete | `app/src/lib/money.ts` + `money.test.ts` (144 tests). `npm run check` passes (145 tests in total). Mutation spot checks: dropping the `-0` guard, reversing the tie-break, rounding half down, truncating sub-cent input, formatting `value / 100`, disabling the lone-separator reading, and computing `allocate` in floats (quotients only, or everything) each fail at least one test. |
| M0-CP4 — App shell | Complete | React Router 8 routes (`/`, `/split`, `/finances`, `/settings`, not found) inside `Layout` (header + theme toggle, top bar ≥ 640 px, bottom tab bar with safe-area padding below it, skip link, `<main>`). `useTheme` + `public/theme-init.js` share key `project-w.theme` and the `theme-color` values. `npm run check` passes (186 tests), `npm run build` passes and copies `theme-init.js` to `dist/`. Mutation spot checks (a different colour or key or a miscased mode in `theme-init.js`, a changed `--color-surface`, a changed `index.html` meta, a wrong cycle order, a mode not stored) each fail at least one test. The manual 360/768/desktop check is deferred to the functional-review checklist, per the plan. |
| M0-CP5 — CI workflow, web manifest, developer README | Complete | `.github/workflows/app-ci.yml` passes a PyYAML structural check (triggers, `working-directory: app`, `setup-node` from `.nvmrc` with the npm cache on the lockfile, the six steps in order); `actionlint`/`act` are still not installed. The same six steps pass locally, in order, from `npm ci` (197 tests). Headless Brave (CDP `Page.getAppManifest`, the parser DevTools uses) parses the manifest with no errors and no installability errors, and all four icons load (200). Icons rendered with `rsvg-convert`; `manifest.test.ts` checks colours against tokens, icon files and PNG sizes, and the `index.html` links. `workflow-conformance.yml` is unchanged. A look at DevTools → Application → Manifest by eye goes into the functional-review checklist. |

Implementation notes:

- TypeScript is pinned to `~6.0.2`, not the current 7.x, because
  `typescript-eslint` (CP2) supports only TypeScript `<6.1.0`. This is
  recorded in the ADR's consequences.
- ESLint's type-aware `recommendedTypeChecked` rules apply only to
  `**/*.{ts,tsx}`; plain JS (`eslint.config.js`, CP4's `public/*.js`) gets
  the untyped recommended rules. Checked with `eslint --print-config` and
  throwaway files, not only by the clean run.
- `theme.ts` reads a `theme-color` meta's scheme with
  `getAttribute('media')`, not `meta.media`: that property is missing from
  jsdom and from some older engines.
- Vitest stubs every CSS import, `?raw` included, to an empty string, so
  `tokens.test.ts` reads `tokens.css` from disk. `theme-init.test.ts` runs
  the real `public/theme-init.js` (through `?raw`) and compares its result
  with `theme.ts` for the same stored values.
- The apple-touch icon is rendered from the maskable (full-bleed) SVG,
  because iOS rounds the corners itself and fills transparency with black.
- The app CI runs on every `push` and `pull_request`, as the plan says. It
  has not run on GitHub yet: there is no remote (Open question 4).
- Vitest globals are off, so `src/test/setup.ts` calls Testing Library's
  `cleanup()` in `afterEach` itself.
- `formatAmount`'s `locale` option has the same `MoneyLocale` type as
  `parseAmount`'s, so the app can't format an amount in a locale it can't
  parse back.
- The plan's example large-weight `allocate` case happened to come out the
  same in float arithmetic, so it could not tell an exact implementation
  from a float one. It was replaced by two constructed cases where float
  arithmetic gives the wrong answer: a share of `k − 1/W`, and two
  remainders 1 apart that float sees as a tie. Their expected parts were
  computed separately with Python integers.

## Current blockers

None.

## Active plan

`docs/milestones/milestone-0-PLAN.md` (plan revision 2, approved).

## Functional review checklist

M0 functional review, implementation revision 1. Report findings in
`.ai-review/milestone-0/feedback/FUNCTIONAL_REVIEW.md`: the item number,
what you did, what you saw, and what you expected.

**Setup**

- From `app/`: `npm ci`.
- Items 1–7: `npm run dev`, then open http://localhost:5173.
- Items 8–9: `npm run build && npm run preview`, then open
  http://localhost:4173. The production build is needed for the manifest.
- Use a Chromium browser (Brave works). DevTools' device toolbar
  (Ctrl+Shift+M) sets the width. **Rendering → Emulate CSS
  prefers-color-scheme** switches the system theme.
- No test data is needed: M0 stores nothing except the theme choice.

**Checklist**

1. **Home page.** Open `/`.
   *Expected:* the heading "project-W", a one-line description and
   "Coming soon.", inside the shell (header with "project-W" and a theme
   button). No console errors.
2. **Navigation at desktop width** (≥ 1024 px). Click Home, Split,
   Finances and Settings in turn, then use the browser's Back button.
   *Expected:* the nav sits in the header. Each page shows its heading,
   and the placeholders name their milestone ("Coming in M1: Bill
   splitter.", "Coming in M5: …", "Coming in M3: …"). The current page's
   link is highlighted in colour, bold and with an underline bar. Back
   returns to the previous page, and the URL is a clean path such as
   `/split`.
3. **Deep link and refresh.** Go to `/finances` and press F5. Then open
   `/no/such/page`.
   *Expected:* the refresh stays on Finances. The unknown path shows "Page
   not found" inside the shell, no nav link is highlighted, and "Go to the
   home page" returns to `/`.
4. **Phone width: 360 px** (device toolbar, 360 × 640). Visit each page
   and scroll.
   *Expected:* the nav is a tab bar fixed at the bottom with four equal
   tabs, and the active one is marked. There is no horizontal scrolling
   anywhere. The header shows "project-W" and the theme button on one
   line. Nothing is hidden behind the tab bar: zoom to 200 % (Ctrl +) on
   Home and scroll to the bottom, and the last line of text must sit
   above the bar.
5. **Tablet width: 768 px.**
   *Expected:* the nav moves back into the header as a top bar. There is
   no bottom bar and no horizontal scrolling.
6. **Theme toggle.** Click the header button repeatedly, then reload in
   each mode.
   *Expected:* it cycles "Theme: System" → "Theme: Light" → "Theme: Dark"
   → "Theme: System", and the page colours follow. After a reload the
   chosen mode is kept, and a forced Dark reloads dark with no white flash.
   In System mode, switching DevTools' emulated `prefers-color-scheme`
   between light and dark switches the page. A forced mode ignores it.
   Text and nav stay readable in both themes, at all three widths.
7. **Keyboard and screen-reader basics.** Reload, then press Tab once.
   *Expected:* a "Skip to content" link appears at the top left, and
   Enter moves focus to the page content. Tabbing on shows a visible
   focus ring on the brand, each nav link and the theme button.
   Optional, with a screen reader: the theme button announces e.g.
   "Theme: system. Switch to light."
8. **Web manifest and icons** (preview build). DevTools → Application →
   Manifest.
   *Expected:* no errors or warnings about the manifest. Name and short
   name "project-W", start URL `/`, display standalone, theme colour
   `#ffffff`, background `#f5f6f8`. Four icons show: 192, 512, the
   maskable 512 (the blue tile with a white "W"; tick "Show only the
   minimum safe area for maskable icons" and the W must stay inside the
   circle) and the SVG. The browser tab shows the W favicon.
9. **CI on GitHub** (settles plan Open question 4). Open
   https://github.com/jfilipegm/project-W/pull/1.
   *Expected:* the `app` and `workflow-conformance` checks are green, so
   the app builds and its tests pass in CI.

**Known limitations (not findings for M0)**

- Split, Finances and Settings are placeholders. The bill splitter is M1,
  receipt reading M3 and finance import M5. The money module has no UI yet.
- There is no service worker or offline mode (M8), so the browser may not
  offer to install the app even though the manifest is valid.
- An installed app's splash screen and title bar use the light
  `theme_color` until the page loads, then follow the theme.
- A theme change in one tab reaches other open tabs only after a reload.
- There is no release yet: releases start once PR #2 is merged.

**Your decisions before acceptance** (plan Open questions 1, 2, 3 and 5;
reply here or with your findings):

1. Is `pt-PT` / `EUR` the right default locale and currency?
2. Keep npm, or switch to pnpm?
3. Node comes from a version manager or the distribution package: no
   action needed if `node --version` shows 24.
4. Keep path routes (`/split`), which need a host that sends unknown paths
   to `index.html`, or switch to hash routes (`/#/split`)?

<!--
This file is `workflow_state.FUNCTIONAL_CHECKLIST_PATH`. It is
repository-local state: workflow-manager generates it once at bootstrap and
never overwrites it on update.
-->
