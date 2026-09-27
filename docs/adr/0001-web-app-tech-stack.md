# ADR 0001 — Web app tech stack

- **Status:** Accepted
- **Date:** 2026-09-27
- **Milestone:** M0 — Project foundation (`docs/milestones/milestone-0-PLAN.md`)

## Context

project-W is a bill splitter that grows into a personal finance helper
(`docs/ROADMAP.md`). The roadmap's guiding principles constrain the stack:

- **No server early.** There are no accounts and no database until M9.
  Receipt reading, finance-file parsing and dashboards run in the browser,
  so the app must be a purely static client until then.
- **Your data stays yours.** Processing stays on the device. M3 stores
  users' own API keys in the browser, which calls for a strict Content
  Security Policy, no third-party scripts and few dependencies.
- **Mobile-friendly from day one.** Responsive from 360 px phone width and
  PWA-ready, so a native app later (M8, e.g. Capacitor) is a wrapper
  around the same codebase, not a rewrite.
- **Money must be exact.** Split totals must always add up to the bill
  total, so money needs one shared, well-tested module, and the language
  should make it hard to mix up units.

## Decision

Build the app as a **single-page web app in TypeScript (strict mode) with
React, bundled by Vite** (plan decision D1, chosen by the user during
milestone planning on 2026-09-27 from the roadmap's recommendation).

## Consequences

These follow from D1 and are recorded as plan decisions D2–D8 and D11:

- **D2 — Location.** The app lives entirely under `app/`, with its own
  `package.json`, lockfile, configs and `.gitignore`. The repository root
  stays reserved for workflow tooling.
- **D3 — Package manager.** npm, because it ships with Node and needs no
  extra install. The lockfile (`app/package-lock.json`) is committed and CI
  installs with `npm ci`.
- **D4 — Node version.** The current Node LTS line (24.x), pinned in
  `app/.nvmrc` and in `package.json` `engines`.
- **D5 — Routing.** React Router in library ("declarative") mode, not
  framework mode, with path-based routes (`/split`, not `/#/split`).
- **D6 — Styling.** Plain CSS with design tokens as CSS custom properties,
  and CSS Modules per component. No UI kit, which keeps dependencies (and
  M3's key-exposure surface) small.
- **D7 — Unit tests.** Vitest with React Testing Library and jsdom, native
  to the Vite toolchain.
- **D8 — Lint and format.** ESLint flat config (`typescript-eslint`,
  `react-hooks`, `react-refresh`) plus Prettier.
- **D11 — Hosting assumption.** M0 deploys nowhere. "Deployable" means the
  static `npm run build` output is served **at the domain root `/`** (Vite
  `base: '/'`, manifest `start_url: "/"`) by a host that **rewrites unknown
  paths to `index.html`** (SPA fallback). D5's path routes need this for
  page refreshes and deep links. Hosts such as Cloudflare Pages or Netlify
  do this; plain GitHub Pages does not. Choosing the actual host is still
  an open roadmap question.

Other consequences:

- TypeScript is held on the **6.0 line**. `typescript-eslint` (D8)
  supports TypeScript `<6.1.0` as of 2026-09-27, and the official Vite
  React template pins `~6.0.2` too. Moving to TypeScript 7 waits until the
  lint toolchain supports it.
- Everything is client-side, so all of it, including the money rules, is
  testable without a server.
- Service worker and offline support are deferred to M8. M0 only ships the
  web manifest, icons and meta tags.

## Alternatives considered

- **Next.js.** It is strong for server rendering, API routes and
  full-stack apps, but project-W has no server until M9. Its static export
  gives up much of what makes it attractive and adds framework
  conventions and a larger dependency tree. Plain React on Vite gives the
  same component model with less machinery. If M9 needs a server, it can
  be a separate service.
- **SvelteKit.** It has a smaller runtime and a good developer experience.
  But React has the larger ecosystem for what the roadmap needs next: chart
  libraries for M5, `.xlsx` libraries for M4/M6 and Capacitor examples for
  M8. React is also the stack the roadmap recommended and the user chose.
- **Flutter (web + mobile).** It gives one codebase for real native apps,
  but Flutter web renders to a canvas. That is heavier to load, weaker for
  accessibility and text selection, and awkward for browser-only libraries
  the roadmap depends on (Tesseract.js, zxing-js, SheetJS/ExcelJS). The
  roadmap's plan is web first with native as a wrapper, which fits a web
  stack better.
