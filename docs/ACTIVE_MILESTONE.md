# Active Milestone

## Milestone

**M2 — Receipt upload and built-in parsing** (work item `milestone-2`),
phase `IMPLEMENTING`. Plan revision 10, approved in commit `3af0e18`.
Branch `feature/milestone-2`, PR #6.

## Checkpoints

| id | name | status |
|----|------|--------|
| M2-CP1 | Pure receipt logic | Complete |
| M2-CP2 | File intake, image pipeline, assets and CSP | Complete |
| M2-CP3 | Built-in reader, QR scanning, import pipeline, sample corpus | Not started |
| M2-CP4 | Review step UI | Not started |
| M2-CP5 | READMEs, Settings, end-to-end, verification | Not started |

### M2-CP1 — verified state

Built in the plan's order (manual review M-O-4), each step's tests
passing before the next started:

1. `app/src/features/receipt/model.ts` (the reader interface, D2; the
   receipt, D3; `ReadError`, D16; `ReceiptSummary`, D15),
   `parse/amounts.ts` (rules 1–2: normalisation, OCR digit fixes, and
   the tokens a line is made of, with dates, times, rates, currencies
   and tax codes told apart) and `parse/keywords.ts` (rule 3's tables,
   whole-word phrase matching). 49 tests.
2. `parse/parseReceiptText.ts` (rules 3–10), with `classifyLine` exported
   so the one-line classification tests stay separate from the
   whole-receipt ones. 42 unit tests, then 25 text fixtures under
   `receipt/fixtures/text/` (PT restaurants, cafés and supermarkets, a UK
   pub and supermarket, US diners, OCR-damaged and low-confidence
   variants, quantity-only lines, columns, payments, no total, no items),
   each compared as a whole object with its `.expected.json`. Breaking
   one expectation on purpose makes its fixture fail.
3. `fiscalQr.ts`: `parseFiscalQr` (A/F/O required, D, N, H and the
   I/J/K regions optional, `D:NC` → `creditNote`) and `isValidNif`.
   Includes a 2000-string seeded property test: nothing throws.
4. `toBill.ts` (`receiptToBill`, D12/D13) and `reconcile.ts`
   (`checkReceipt`, D14). Every fixture's bill passes `validateBill`.

Choices made where the plan left room, all covered by tests:
- `receiptToBill(receipt, qr, currentBill, nextId, options)`: `nextId`
  is a function (called once per item kept), and `options.regionCurrency`
  gives D18's `currencyDiffers`, which needs the region.
- Rule 6: a quantity of 1 at the start or end of a one-amount line is
  taken as the quantity without a quantity column, because it only
  changes the name. That's what the plan's own example needs
  (`1 Bitoque 23% 9,50` → `Bitoque`). Other leading numbers still need
  the column (`3 Queijos`, `7 Up`). A unit price may carry its unit
  (`£0.95/kg`). The `x` form's quantity leaves the name even when its
  arithmetic doesn't close.
- Rule 7: a run of discount lines under one item all reduce that item.
- Rule 8: a bare percentage line under a tip line is a tip line (so a
  suggested-tip block is never read as an IVA table). A tax line's tax
  is its only amount, or the amount that is its rate of an earlier one
  (within 2 cents), or the middle of base/tax/total.
- Rule 5: besides the plan's exclusions, the merchant is never a line
  with an amount, a date, or a NIF/phone/date keyword. The date falls
  back to the whole receipt when the header has none. The NIF is read
  from the header only.
- `parseReceiptText` never throws: out-of-range numbers read as an
  empty receipt.
- `receiptToBill` keeps every bill valid: out-of-range quantities or
  prices become 1 × the line total, and a receipt with no items gets one
  empty item.

Verified: `tsc -b`, `eslint . --max-warnings=0`, `prettier --check .`
and `vitest run` (581 tests, 194 of them new) pass.

### M2-CP2 — verified state

- Dependencies installed as the plan lists them: `tesseract.js` 7.0.0
  (with `tesseract.js-core` 7.0.0), `@tesseract.js-data/por` and `/eng`
  1.0.0, `zxing-wasm` 3.1.4, `pdfjs-dist` 6.3.289, `heic-to` 1.5.2, and the
  dev dependency `pngjs` 7.0.0. Nothing else (`@types/pngjs` was removed
  again: CP3 can declare the types it needs).
- `app/src/features/receipt/`:
  - `intake.ts`: `sniffType` (magic numbers; AVIF refused; MIME type or
    extension only when the bytes are inconclusive), `checkFile` (20 MB),
    `readDimensions` (PNG `IHDR`, JPEG start-of-frame, HEIC `ispe`, the
    largest one for grid photos) and `checkPixels` (40 MP).
  - `decode.ts` (browser adapter): raster through `createImageBitmap`
    with EXIF orientation; HEIC native first, then heic-to loaded from
    `vendor/` with a dynamic `import()`; PDF through a lazy pdf.js with
    same-origin paths and `isEvalSupported: false`, up to 3 pages rendered
    at `pdfRenderSize` (≤ 40 MP), and the text layer when every page read
    has one. The pixel limit is checked from the header, or right after
    decoding when the header can't say. The libraries are injected, so the
    tests capture what pdf.js and heic-to are given.
  - `pdfTextLines.ts` (baseline grouping against the line's mean baseline,
    so the result doesn't depend on fragment order), `preprocess.ts`
    (`fitSize`, `resize`, `toGrayscale`, `stretchContrast`,
    `estimateSkew`, `rotate`, `straighten`, `preprocessPage`),
    `encodePage.ts`, `assets.ts` (the one list of URLs, plus the Tesseract,
    pdf.js and zxing options) and `messages.ts` (D16's messages).
- `app/scripts/vendor-assets.mjs` (48 files, 23 MB, into the git-ignored
  `public/vendor/`; fails naming any missing source) as `predev`,
  `prebuild` and `prepreview`.
- `app/cspMeta.ts`, used by `vite.config.ts`: the CSP `<meta>`, build
  only. `eslint.config.js`: the static-only rule for production files
  under `src/`.
- `app/public/THIRD_PARTY_NOTICES.md` and
  `docs/adr/0002-in-browser-receipt-reading.md`.
- `app/scripts/check-requests.mjs`, page-load and scan modes. The planted
  leak is a tagged request, checked on its own (it must fail both the value
  search and the header-name rule) and left out of the clean log, which
  must pass (local round 10 R10-O-1, manual round 3 O-EXT-1).

**Deviation from the approved plan (the user's decision, 2026-09-29).**
Every heic-to build starts its decoder with
`new Worker(URL.createObjectURL(blob))`, which D9's `worker-src 'self'`
blocks, so the HEIC fallback would fail in Chrome and Firefox. D9 makes
loosening the policy the user's call; the user chose to allow `blob:`
workers (over dropping the fallback or reopening the plan). The policy is
D9's with `worker-src 'self' blob:`. A `blob:` worker inherits the page's
own policy, `connect-src 'self'` included. Recorded in ADR 0002 and
`cspMeta.ts`.

Other choices, covered by tests:
- `sniffType` treats bytes as inconclusive only when they're under 12
  bytes, or an `ftyp` box with HEIF-family compatible brands but an
  unknown major brand; any other unknown signature is `unsupportedType`,
  which the plan's "text file named .png" test needs.
- `@tesseract.js-data/*` ship no licence file: the vendor script writes a
  notice with the declared MIT licence, author and source. heic-to ships no
  separate licence file for libheif and libde265 (both LGPL-3.0): a notice
  says so, next to heic-to's full LGPL-3.0 text.
- Until CP3's sample corpus exists, the page-load run's value set (and
  its planted value) comes from text fixture 01, standing in for "sample
  1".
- `check-requests.mjs --probe-csp yes` inserts an inline script, which the
  policy must block, to prove violations are captured.

Real-browser check (headless Brave, `npm run build`, then
`node scripts/check-requests.mjs page-load --values
src/features/receipt/fixtures/text/01-pt-restaurante-qtd.expected.json`),
log in `docs/milestones/milestone-2-evidence/cp2-page-load.json`: **pass**.
7 clean requests (the `/split` document, `theme-init.js`, the manifest, the
JS and CSS bundles, the icon twice), all same-origin `GET`s for build files
with no body or query, every header name in the allowlist
(`Upgrade-Insecure-Requests` and lowercase `sec-ch-ua*` included); no
receipt value in any request; no CSP violation. The planted leak was
caught by both rules. The CSP probe run
(`cp2-csp-probe.json`) fails as it must, with the inline-script
violation. No worker runs on page load; worker capture is proven by CP4's
scans. The dev server's page has no CSP `<meta>`; the built one has the
exact policy.

Verified: `tsc -b`, `eslint . --max-warnings=0`, `prettier --check .`,
`vitest run` (648 tests) and `npm run build` pass.

## Current blockers

None.

## Active plan

`docs/milestones/milestone-2-PLAN.md` (revision 10). M1's plan is
archived at `docs/milestones/completed/milestone-1-PLAN.md`.

## Functional review checklist

None yet for M2. M1's checklist (implementation revision 2) is in commit
`5c00e07`.

<!--
This file is `workflow_state.FUNCTIONAL_CHECKLIST_PATH`. It is
repository-local state: workflow-manager generates it once at bootstrap and
never overwrites it on update.
-->
