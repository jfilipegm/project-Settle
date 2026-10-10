# Settle's design system

How Settle looks, reads and behaves, and how to check new UI against it.
It was set in M3 (Design foundations, `docs/milestones/completed/milestone-3-PLAN.md`,
decisions S1 to S14) and every later milestone builds on it. The visual
reference is the design canvas, a private artifact
(`https://claude.ai/artifact/YLBvTe9jnLx1WqUzmty6wG`): the foundations
sheet, the split and the household at phone and desktop widths in both
themes, and the navigation map. When a change here or in the code alters
what a screen looks like, the canvas is updated with it.

Settle is one responsive web app (`PRODUCT.md`, Platform). The quick
split is tuned first for phone width, the household for desktop width,
and every screen works at every width from 360 px.

## Colour

Cool slate neutrals and one rust accent. Every role exists in both
themes, as a custom property in `app/src/styles/tokens.css`.

| Role                       | Token                      | Light                  | Dark                   |
| -------------------------- | -------------------------- | ---------------------- | ---------------------- |
| Ground (page)              | `--color-ground`           | `#ECEEF1`              | `#12141C`              |
| Card / surface             | `--color-card`             | `#FFFFFF`              | `#1C1F2B`              |
| Line                       | `--color-line`             | `#DCE0E5`              | `#2E3240`              |
| Control border             | `--color-control-border`   | `#C9CED6`              | `#3A3F4E`              |
| Quiet text                 | `--color-quiet`            | `#565C6B`              | `#A3A9B7`              |
| Ink (text, primary button) | `--color-ink`              | `#191C27`              | `#EEF0F4`              |
| Text on ink                | `--color-on-ink`           | `#FFFFFF`              | `#12141C`              |
| Rust accent                | `--color-accent`           | `#B83F1E`              | `#F07A52`              |
| Success text / fill        | `--color-success`, `-fill` | `#1F6B44` on `#E3F1E8` | `#8FD3AC` on `#17382A` |
| Warning text / fill        | `--color-warning`, `-fill` | `#7A5208` on `#FBF0D9` | `#F0C46A` on `#3A2E12` |
| Error text / fill          | `--color-error`, `-fill`   | `#A3221B` on `#FBE4E1` | `#F4A39A` on `#3D1C1A` |

- **One accent per screen.** Rust is for links, the focus ring, the
  active destination and step, and the browser's own checkboxes and radios
  (`accent-color`). Category icons are ink or quiet text (M4). Primary
  buttons are ink (light) or near-white (dark), never rust.
- **Green, amber and red** belong to the receipt check and errors only,
  always with an icon and words.
- **The header colour** (`theme-color`) is the card colour, kept in step
  by `THEME_COLORS` in `app/src/app/theme.ts` and its tests.

### People

Six colours, in this order, each with its initial's colour (`--person-1`
to `--person-6`, `--person-on-1` to `--person-on-6`):

|                          | Indigo    | Teal      | Raspberry | Violet    | Olive     | Lake      |
| ------------------------ | --------- | --------- | --------- | --------- | --------- | --------- |
| Light (white initial)    | `#3D57A3` | `#1D7268` | `#A3365A` | `#6A4C98` | `#56651A` | `#2C6585` |
| Dark (`#12141C` initial) | `#7F97E0` | `#45B3A3` | `#DB7398` | `#A18BD6` | `#A3B55A` | `#6AA8CB` |

A person's colour comes from their position in the bill (index mod 6):
no stored field, so removing someone shifts the colours after them, and
colours repeat from the seventh person. A colour never appears without
the initial or the name, and never means good or bad.
`app/src/ui/personColor.ts` gives the slot, the initial and the style.

### Contrast

`app/src/styles/tokens.test.ts` measures every pair: each text and fill
pair at least 4.5:1, the people colours and the focus ring at least 3:1 on
the card and the ground, in both themes. The lowest text pair is rust on
the light ground, 4.79:1. The control border is quiet (about 1.6:1 on the
card), as the approved design has it, so a field is always identified by
its visible label, never by its border alone.

## Type

Three faces, bundled with the app (`app/src/styles/fonts.css`), never
fetched from a font service:

- **Unbounded** 500 and 600 (`--font-display`): page titles, card titles
  and the one key number on a screen. Never body text or buttons, never
  700 or heavier.
- **JetBrains Mono** 400 and 500 (`--font-mono`): every amount, date and
  count, with tabular figures (`.amount`, `<data>`, `<time>`).
- **Source Sans 3** 400, 600 and 700 (`--font-body`): everything else.

Sizes 12, 13, 14, 15, 16, 17, 19, 22, 28 and 40 px (`--text-12` to
`--text-40`), body 16 px, line height 1.5 for text and 1.1 for titles.
Amounts show a true minus sign (U+2212) through the `Amount` component.

Only the latin files load on a first view (132 kB); latin-ext loads only
for a name that needs it. `scripts/check-build.mjs` fails the build over
400 kB in all or 250 kB for a first view.

## Icons

One set, Tabler (`@tabler/icons-react`), each icon imported by name,
always through `app/src/ui/Icon.tsx`: stroke 1.75, 16, 20 or 24 px,
`aria-hidden`. The words next to an icon, or an icon-only button's
`aria-label`, carry the meaning. No Unicode stand-ins (⚠, ✓) in the
interface.

## Shape, depth and motion

- **Radii:** 8 px for chips, 12 px for controls, 16 px for cards. Nothing
  else (`--radius-chip`, `--radius-control`, `--radius-card`).
- **Depth:** cards sit flat on a 1 px line. Only menus and sheets are
  raised, with a shadow tinted from the ink (`--shadow-raised`).
- **Motion:** a pressed button scales to 0.97 in 140 ms. Anything that
  appears uses one ease-out, `cubic-bezier(0.23, 1, 0.32, 1)`
  (`--ease-out`), in 150 to 250 ms. Nothing animates on page load. An item
  row that gains or loses a person flashes for 200 ms.
  `prefers-reduced-motion: reduce` makes every movement an instant change.
- **The browser's own parts** take the palette: the focus ring (2 px
  rust, 2 px offset), text selection, the caret and `accent-color`.

## House rules

1. No gradient text, buttons or bars.
2. No coloured stripe on a card's edge: a card shows its owner with the
   initial.
3. No small spaced capitals above titles.
4. One accent per screen.
5. Commas and line breaks separate details, never rows of dots or dashes,
   and no em dash in the interface copy.
6. Controls carry real labels.
7. Every state says what happened and what to do.

## Components

`app/src/ui/`, each with a CSS module on the tokens and a test file. The
development-only gallery at `/_kit` (`npm run dev`) shows them all, with
light/dark and English/Portuguese switches.

| Component                  | Use                                                                                                                                                                |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Button`                   | Primary (ink), secondary (card with a border), quiet (a text link look). Heights 40, 44, 48, 52 px; an optional icon; the press scale. `type="button"` by default. |
| `IconButton`               | A square button with an icon and a required `label`.                                                                                                               |
| `TextField`, `SelectField` | The label above; a hint and an error below, both in `aria-describedby`; `aria-invalid` and an icon with the error.                                                 |
| `Card`                     | A flat card; with a `title` it is a section named by its `h2`.                                                                                                     |
| `StatusChip`               | Success, warning or error: an icon and words.                                                                                                                      |
| `PersonBadge`              | A person's colour and initial (or number), with the name shown or read out.                                                                                        |
| `Amount`                   | An amount in the figures face, the region's format, a true minus sign, an optional plus.                                                                           |
| `Steps`                    | Named steps as links, the current one `aria-current="step"`.                                                                                                       |
| `Icon`                     | A Tabler icon at the house size and stroke.                                                                                                                        |
| `Tabs`                     | A segmented group of links (M4): a slate track, the current tab on the card colour, bold and `aria-current="page"`.                                                |
| `Dialog`                   | The native `<dialog>`, modal (M4): a sheet from the bottom under 640 px, a centred card from 640 px, raised. Its title names it; Escape closes it; focus returns.  |
| `Checkbox`                 | A labelled native checkbox in a 44 px row (M4), for choosing members.                                                                                              |

A date field (`TextField type="date"`) shows the house ring on `:focus`
and `:focus-within` too. Its parts (day, month, year, the calendar
button) take focus inside it, where `:focus-visible` doesn't reach.

## Layout and navigation

- **Under 640 px:** the header shows the wordmark (a link to Home); a
  bottom tab bar holds Split, Household and Settings, each with an icon
  and words, padded for the home indicator.
- **From 640 px:** the header holds the wordmark, the same three
  destinations as a menu (the active one underlined in rust) and a
  compact theme toggle. The theme is also in Settings.
- **The split** has three named steps, Receipt, Who had what and The
  split, kept in the URL (`/split?step=`) so Back, Forward and a reload
  keep the step. From 1024 px, Who had what shows the split beside the
  items. A step change moves focus to the step's heading.
- **Person-first assignment:** choose a person, then tap the items they
  had; "Everyone" shares an item with all; Edit opens the item's fields.

## The household (M4)

- **Its header:** the household's name is a button-like link to the list
  of households, to switch. Under it are the tabs Overview, Expenses and
  Members (Balances joins in M5).
- **The overview:** one month at a time, its title the month, then
  "{amount} shared across {count} expenses", one primary "Add expense",
  "Latest expenses" and "Where it went".
- **An expense row:** the date in the figures face, what it was (with its
  item count when itemised), the category with its icon, the payer's badge
  and the amount, right-aligned. It is two lines at phone width and one row
  of columns from 640 px.
- **A member's colour** comes from their position in the household (the
  order they were added), stored on the member. Someone who leaves keeps
  their colour, so their past expenses don't change colour.
- **Categories:** nine, each with a Tabler icon always shown beside its
  name. Groceries `shopping-cart`, Eating out `tools-kitchen-2`, Rent
  `key`, Utilities `bolt`, Internet `wifi`, Household `sofa`, Transport
  `bus`, Leisure `confetti`, Other `dots`. Category marks use the ink
  and the quiet text, never a colour of their own.
- **Saving a split into a household** happens in a dialog over The split.
  It says, before saving, that the bill moves into the household.

## Languages

English and European Portuguese, from one typed catalogue in
`app/src/i18n/` (no library). `app/README.md` says how to add a text.
Portuguese is pt-PT in spelling and vocabulary ("ecrã", "registo",
"partilhar"), with the impersonal "you", in the voice of `PRODUCT.md`:
calm, precise and friendly.

## Checking new UI

Before a UI change is done:

1. **Tokens only.** No hex values or one-off sizes in component CSS; use
   the roles above.
2. **The tests.** `npm run check`: the contrast test, the literal-text
   guard (every visible text comes from the catalogue, in both
   languages), and the component tests.
3. **The two checkers**, on the rendered screens and on the CSS:
   `impeccable detect` and `ux-lint`. `app/scripts/screens.mjs` takes the
   screenshots and saves each screen's DOM for them, and checks 360 px and
   the Tab order. Zero findings, or each remaining one named with why it
   doesn't apply (see `docs/milestones/milestone-3-evidence/CHECKS.md`).
4. **The privacy checks.** `node scripts/check-requests.mjs page-load`
   (and `scan`) on the production build: every request same-origin, no
   CSP violation. Per-element colours and widths go through React's
   `style` prop as custom properties, never a `style="…"` string, since
   the CSP has `style-src 'self'`.
5. **The canvas.** Check whether the design canvas needs the change too:
   the screens, light and dark, and the navigation map.
