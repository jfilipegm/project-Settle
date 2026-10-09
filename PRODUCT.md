# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

People who share costs with the same group: university students sharing
a house, and roommates in shared households (the primary use case);
anyone who regularly splits expenses with the same people. Possibly,
later, landlords reconciling shared costs across rooms or units (to be
validated, not assumed).

Settle is **one responsive web app** (confirmed by the user, 2026-10-07):
web only for now, working well in phone browsers as well as on larger
screens. Two jobs shape where each part is tuned first:

- **The quick split, usually in a phone browser.** Right after paying:
  scan or type the receipt, say who had what, show everyone what they
  owe. Fast, one-handed, often at the table or in the shop.
- **The household, usually on a larger screen.** Later and calmer: the
  household's expense history, balances, settling up, finances and
  other in-depth views. Still fully usable at phone width.

A native app is considered only if the product gets users.

## Product Purpose

Make living together financially painless: record shared expenses
(typed in or read from a receipt), split them fairly (equally, by
shares, or item by item), always see who owes whom, settle up with the
fewest payments, and keep a history people can correct, export and take
with them. Success: the developer and real households use it instead of
spreadsheets and mental arithmetic.

## Positioning

Free, local-first and private: it works without an account, runs
entirely in the browser at €0 operating cost, and reads receipts on the
device (PaddleOCR in the browser, plus the Portuguese fiscal QR code), so
financial data never leaves the device.

## Operating Context

- Receipts from Portuguese supermarkets, restaurants, cafés and shops
  (Continente, Lidl, …), as phone photos, app screenshots and PDFs;
  English-language receipts too.
- Money is exact: integer cents, splits that always add up.
- Installable PWA and public deployment come in a later milestone.
- Phone-width layouts use web patterns only (bottom tab bar under 640 px,
  Web Share, file input with camera capture), never native-only ones.

## Capabilities and Constraints

- Today: a bill splitter (people, items, who had what, tax/tip/discount
  adjustments, result to the cent), receipt scanning with a "Receipt
  check" against the total, a row-by-row review of what was read,
  Settings, light/dark/system theme.
- Coming: households, members and an expense ledger (next feature
  milestone), balances and settling up, export/import, PWA, analytics
  without personal data.
- Strict Content-Security-Policy: everything self-hosted, no third-party
  requests (fonts and assets must be served from the app itself).
- **Languages: English and Portuguese** (confirmed 2026-10-07): text
  length, number, currency and date formats must work for both.
- No account needed; nothing in the free product may require one.

## Brand Commitments

- Name: **Settle**. Tagline: "Split bills. Settle up. Stay private."
- Voice (confirmed 2026-10-07): calm, precise and friendly, with some
  casual warmth: plain words, exact numbers, a light touch; never
  mocking about money or debt.
- Visual references the user supplied: `design-ideas/` (local only, not
  committed).

## Evidence on Hand

- The user's real receipts are local test fixtures only, never committed
  (personal data); never show them in public material.
- No users, testimonials or usage data yet. Do not invent any.

## Product Principles

- Useful for free, never crippled.
- The data stays the user's: on the device, exportable.
- Money is exact and explainable: every number can be traced.
- Fast for the quick split; thorough for the household view; both work
  at every screen width.
- Simple first; build only what real use asks for.

## Accessibility & Inclusion

Mobile-friendly from day one, keyboard and screen-reader usable, visible
focus, light and dark themes; roles and states never shown by colour
alone (an existing rule in the review UI).
