# ADR 0004 — A design system and two languages

- **Status:** Accepted
- **Date:** 2026-10-09
- **Milestone:** M3 — Design foundations
  (`docs/milestones/completed/milestone-3-PLAN.md`, decisions S1 to S14)
- **Builds on:** ADR 0001 (the web app's stack and its CSP), ADR 0002 and
  0003 (everything served from Settle's own origin).

## Context

After M2.5 the user chose design work over the next feature: one coherent
design system before the household features multiply the screens, and
the whole interface in English and European Portuguese. Until then the
app used system fonts, a blue accent, Unicode glyphs as icons, one long
Split page and English only. The direction was worked out with the user
in a design canvas and checked with two anti-"AI look" detectors.

These decisions bind every later milestone: their screens use the same
tokens, components, fonts, icons, catalogue and step model.

## Decisions

### Tokens and house rules (S1, S2, S6, S7)

Cool slate neutrals, one rust accent, six people colours by position,
green/amber/red only for the receipt check and errors, three radii, flat
cards, one ease-out. All are CSS custom properties in
`app/src/styles/tokens.css`, identical roles in both themes, with a
contrast test. `docs/DESIGN.md` holds the values and the house rules.

### Fonts bundled, not fetched (S3, S4)

Unbounded, JetBrains Mono and Source Sans 3 come from the `@fontsource`
npm packages (SIL OFL 1.1). Static weights only, latin and latin-ext with
their unicode ranges, woff2 only, declared in `app/src/styles/fonts.css`.
Vite emits them as the app's own assets, so `font-src 'self'` holds and
no request goes to a font service. Budget: 400 kB in all, 250 kB for a
first view, enforced by `scripts/check-build.mjs` (344 kB and 132 kB at
M3).

_Rejected:_ a font service (a third-party request on every load, against
the privacy promise); variable fonts (larger than the weights used).

### One icon set (S5)

`@tabler/icons-react` (MIT), each icon imported by name so only the used
ones ship, always through one `Icon` wrapper (stroke 1.75; 16, 20 or
24 px; `aria-hidden`).

### A component kit (S12)

`app/src/ui/`: Button, IconButton, TextField, SelectField, Card,
StatusChip, PersonBadge, Amount, Steps and Icon, each tested. A gallery
at `/_kit` exists in development only: the route table is built by
`routeTable({ dev })`, the gallery a lazy import behind
`import.meta.env.DEV`, and `check-build.mjs` fails a build that carries
it.

### A library-free catalogue (S11)

`app/src/i18n/en.ts` is the source catalogue; `pt.ts` is typed against
it, so a missing or extra key fails `tsc`. `t(key, params)` fills
`{name}` parameters, and plurals use `Intl.PluralRules`. A Language
setting (System, English, Português) is stored as `settle.language`,
separate from Region, which formats numbers and money. Text is
translated when shown, never stored, with one exception: the stand-in
item "Not read from the receipt" is saved as an item name in the
language of the moment, and recognised by its name in either language
(`isNotReadItemName`).

A test using the TypeScript compiler API guards all of `src/` against
literal interface text (any language-like string in any position, with a
reasoned exclusion list and allowlist), and each page is rendered in
Portuguese with English sentinels.

_Rejected:_ an i18n library (react-i18next, FormatJS): more code and
runtime than two languages need, and the typed catalogue already gives
compile-time key checks.

### The split as steps in the URL (S9, S10)

`/split?step=receipt|items|split`: the browser's Back and Forward move
between steps and a reload keeps the step. With no step, a bill with
content (`billHasContent`) opens on Who had what, otherwise on Receipt.
All steps stay mounted, the others `hidden`, so nothing typed is lost.
From 1024 px Who had what shows the split beside the items. Assignment is
person-first (choose a person, tap their items), with today's item editor
kept behind Edit; both dispatch the same reducer action. New bill
replaces the history entry, so Back never returns to a cleared step.

_Rejected:_ a step held only in component state (Back would leave the
page instead of the step); one long page (the result was far from the
items on a phone).

## Consequences

- New screens use the tokens and the kit; a hex value or a literal text
  in a component fails review or a test.
- Each new interface text needs both catalogues; `tsc` and the catalogue
  tests catch a gap.
- The CSP is unchanged; per-element colours and widths go through React's
  `style` prop as custom properties.
- The fonts and Tabler are listed in `app/public/THIRD_PARTY_NOTICES.md`,
  their licences under `/vendor/licenses/`.
- Later milestones: M4's household screens on the canvas are the target,
  built on this kit, with a segmented Tabs component added then.
