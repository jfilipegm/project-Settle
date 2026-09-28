# project-W web app

Split bills and keep track of your finances, all in your browser. A
React + TypeScript single-page app built with Vite. The stack and the
reasons for it are in
[`docs/adr/0001-web-app-tech-stack.md`](../docs/adr/0001-web-app-tech-stack.md).

## Prerequisites

- Node.js, the LTS major pinned in [`.nvmrc`](.nvmrc). `fnm use` or
  `nvm use` in this folder picks it up.
- npm, which ships with Node.

## Install

Run everything from this `app/` folder.

```sh
npm ci
```

## Commands

| Command           | What it does                                                    |
| ----------------- | --------------------------------------------------------------- |
| `npm run dev`     | Dev server with hot reload.                                     |
| `npm run build`   | Type-checks, then builds the static site into `dist/`.          |
| `npm run preview` | Serves the built `dist/` locally.                               |
| `npm run check`   | Type check, lint (no warnings allowed), format check and tests. |

Also: `npm test` (tests once), `npm run test:watch`, `npm run lint`,
`npm run typecheck`, `npm run format` (rewrites files) and
`npm run format:check`.

CI (`.github/workflows/app-ci.yml`) runs `npm ci`, `typecheck`, `lint`,
`format:check`, `test` and `build`, in that order.

## Folder layout

```text
app/
├── index.html            Page shell: metas, manifest, theme-init script
├── public/               Served and copied as is, unbundled
│   ├── theme-init.js     Applies the stored theme before first paint
│   ├── manifest.webmanifest
│   └── icons/            SVG sources and the PNGs rendered from them
└── src/
    ├── main.tsx          Entry point: global styles, then <App />
    ├── App.tsx           The region provider and the router
    ├── app/              Shell: routes, layout, theme, region
    ├── pages/            One component per route
    ├── features/
    │   └── split/        The bill splitter: model and validation,
    │       │             the split engine, bill reducer, saved draft
    │       └── components/  The Split page's sections and inputs
    ├── lib/              Framework-free logic (money.ts)
    ├── styles/           Design tokens and global CSS
    └── test/             Test setup and helpers
```

Tests sit next to the code they cover, as `*.test.ts(x)`.

## Money

**Never use floats for money.** Every amount is an integer number of cents
(the `Cents` type), and every parse, format, sum and split goes through
[`src/lib/money.ts`](src/lib/money.ts). Don't write `amount / 100`,
`toFixed` or your own rounding. If `money.ts` lacks what you need, add it
there, with tests.

- `parseAmount(input, locale, currency)` reads typed amounts in the user's
  Region: the locale's separators and the currency's symbols (`€`, `£`,
  `US$` or `$`). `formatAmount` shows them.
- `allocate` and `allocateExact` split a total by weights with the
  largest-remainder method, exactly. `allocateExact` takes BigInt weights
  of any size.
- `multiplyRatio` and `percentOf` apply exact quantities and percentages,
  rounding half away from zero.

The split engine (`src/features/split/split.ts`) rounds in exactly three
places: each line total, each percentage adjustment, and one allocation of
the bill total over everyone's exact share. Its algorithm is specified in
[`docs/milestones/completed/milestone-1-PLAN.md`](../docs/milestones/completed/milestone-1-PLAN.md)
("Split algorithm").

## Browser storage

Each key is validated when read, and anything unreadable falls back to a
default:

| Key                | Holds                                             |
| ------------------ | ------------------------------------------------- |
| `project-w.theme`  | The theme mode.                                   |
| `project-w.region` | `{ locale, currency }`.                           |
| `project-w.bill`   | The bill being edited, as `{ version: 1, bill }`. |

## Hosting

The app isn't deployed yet, but the build assumes a host that:

- serves the site at the domain root, `/` (Vite `base: '/'` and the
  manifest's `start_url: "/"`), and
- rewrites unknown paths to `index.html` (SPA fallback).

Routes are path-based (`/split`, not `/#/split`), so without the rewrite,
a refresh or a deep link to any page other than `/` returns 404. Cloudflare
Pages and Netlify do the rewrite; plain GitHub Pages does not. See decision
D11 in the ADR.

## Icons

`public/icons/icon.svg` is the mark. `icon-maskable.svg` is the same mark
on a full-bleed background, scaled to stay inside the central 80 % safe
zone. The PNGs are rendered from them once and committed; no image tool is
a project dependency. After changing an SVG, re-render from `public/icons/`
with [`rsvg-convert`](https://gitlab.gnome.org/GNOME/librsvg):

```sh
rsvg-convert -w 192 -h 192 icon.svg -o icon-192.png
rsvg-convert -w 512 -h 512 icon.svg -o icon-512.png
rsvg-convert -w 512 -h 512 icon-maskable.svg -o icon-maskable-512.png
rsvg-convert -w 180 -h 180 icon-maskable.svg -o apple-touch-icon.png
```

With ImageMagick instead, use for example
`magick -background none -density 384 icon.svg -resize 192x192 icon-192.png`.

The apple-touch icon uses the maskable, full-bleed version because iOS
rounds the corners itself and fills any transparency with black.
