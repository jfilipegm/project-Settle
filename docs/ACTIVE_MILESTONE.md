# Active Milestone

## Milestone

**M2 — Receipt upload and built-in parsing** (work item `milestone-2`),
phase `SELF_REVIEWING_IMPLEMENTATION`. Plan revision 10, approved in commit `3af0e18`.
Branch `feature/milestone-2`, PR #6.

## Checkpoints

| id | name | status |
|----|------|--------|
| M2-CP1 | Pure receipt logic | Complete |
| M2-CP2 | File intake, image pipeline, assets and CSP | Complete |
| M2-CP3 | Built-in reader, QR scanning, import pipeline, sample corpus | Complete |
| M2-CP4 | Review step UI | Complete |
| M2-CP5 | READMEs, Settings, end-to-end, verification | Complete |

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

### M2-CP3 — verified state

- `app/src/features/receipt/`:
  - `builtInReader.ts`: `createBuiltInReader({ assets, encodePage })`. A
    text layer is parsed directly; otherwise each page goes through
    `preprocessPage` (D10) and the injected encoder (D2) to a Tesseract.js
    worker (`por` + `eng`, LSTM only), created per read and terminated
    after it, on success, failure or abort, including a worker that
    finishes loading after the abort. Tesseract's statuses map to D17's
    phases, and the reading progress runs across the pages. A worker that
    can't load is `assetsUnavailable`; a failed recognition is `ocrFailed`.
  - `qrScanner.ts`: `scanFiscalQr(pages)` with zxing-wasm's reader, its
    wasm through `assets.ts` (D8). Each page is tried whole, then its bottom
    half scaled 2× (D5), capped at 12 MP so a large photo's crop stays
    small. The first payload `parseFiscalQr` accepts wins.
  - `importReceipt.ts`: `importReceipt(file, deps, options)`: decode, then
    the reader and the QR scan side by side, then `receiptToBill`. `deps`
    are `decode`, `reader`, `scanQr`, and an optional `previewUrl` for the
    check panel's image (D14). It never touches the current bill. A read
    receipt with no items is `noItems` (for every reader, so it lives
    here). A decoder or reader that throws becomes `decodeFailed` or
    `ocrFailed`; a QR scan that fails only means there's no QR code. Abort
    is checked after every step.
  - `encodePage.node.ts` (test support): the pngjs encoder, and a PNG
    decoder for the tests. `src/test/pngjs.d.ts` declares the part of
    pngjs they use (no `@types/pngjs`).
- The sample corpus, `receipt/fixtures/receipts/`: the plan's 10 samples,
  each defined once in `app/scripts/make-sample-receipts.mjs` (its lines,
  what the receipt really says, its fiscal QR payload, its photo effects),
  which writes the SVG source, the PNG (or, for sample 9, the text-layer
  PDF, through cairo) and `.expected.json`. The fiscal QR codes are drawn
  with zxing-wasm's own writer, which is already installed. The outputs
  are reproducible byte for byte (fixed seeds, `SOURCE_DATE_EPOCH` and
  pinned PDF dates).
- The browser-check files, `receipt/fixtures/browser/`: `sample-1.jpg`,
  `sample-3.heic` (an 8-bit 4:2:0 `heic` from `heif-enc`, libheif 1.23.5
  with x265, installed by the user for this checkpoint), `sample-6-scanned.pdf`
  (image only) and `sample-9.pdf`, each with its `.expected.json`.

Real-OCR corpus test (`receipts.ocr.test.ts`, Node, offline): every sample
behaves as the plan requires. Samples 1–4, 6, 7 and 9 match, with the
right item count and trusted total. The fiscal QR code gives the trusted
total on samples 1, 2 and 3, including the rotated, noisy photo. Sample 5
(faded) matches too. Sample 8 is caught as a mismatch (the smudged salad
line is lost, 2,50 short). Sample 10 is `noItems`. The whole file takes
about 8 s. In Node, the PDF's pages aren't rendered (no canvas), so sample
9's QR code isn't scanned there; its printed total is the trusted one. The
browser renders it (CP4).

`fetch` is stubbed to fail on any http(s) URL. It reaches zxing-wasm and
pdf.js, which run on the test's own thread. Node's Tesseract.js runs in a
worker thread the stub doesn't reach: its only download is the models, from
`langPath`, which the test sets to a local directory, so it reads them from
disk.

**Fixed in CP2's code:** in pdf.js 6, `PDFDocumentProxy` has no `destroy()`
(the loading task has it). `decode.ts` called `pdf.destroy()` in a
`finally`, which threw, so **every PDF would have failed as
`decodeFailed`** in the browser. The CP2 fake had a `destroy`, so its tests
passed. `decode.ts` now destroys the loading task, the fake follows the
real shape, and a Node test checks the real pdf.js's shape. Also found:
pdf.js 6 dropped the `isEvalSupported` option (it no longer evaluates code
at all). `decode.ts` still passes it, harmlessly, and D9's CSP forbids eval
regardless.

Other choices, covered by tests:
- Each `.expected.json` carries, beside the receipt's values, its QR
  payload (`qr`) and what the corpus test requires (`check`: `match`,
  `matchOrFlagged` for sample 5, `flagged` for sample 8, `noItems` for
  sample 10).
- The corpus test also checks that the four browser-check files pass
  intake: the right type, and the pixel size from the header (the HEIC's
  from its `ispe` box).

Verified: `npm run check` (`tsc -b`, `eslint . --max-warnings=0`,
`prettier --check .`, `vitest run`: 698 tests, 50 of them new) and
`npm run build` pass.

### M2-CP4 — verified state

- `app/src/features/receipt/components/`:
  - `ScanReceipt.tsx`: "Scan a receipt" at the top of the Split page:
    "Choose file" (JPEG, PNG, HEIC/HEIF, PDF), "Take photo"
    (`accept="image/*" capture="environment"`), a drop zone over the
    section with an outline while dragging, and "Read on this device. The
    receipt never leaves your browser." It asks the plan's
    `window.confirm` question first when the bill has content. While
    reading: the `role="status"` phase line (opening, loading the reader
    (first time only), reading with a percentage, checking the QR code),
    Cancel, and the file buttons disabled. A failure shows D16's message
    (`role="alert"`) and changes nothing. Leaving the page aborts a scan.
  - `ReceiptCheck.tsx` (D14, `data-receipt-check`): merchant, date, NIF,
    the trusted total and its source, IVA included; the live comparison
    as text with a decorative ✓/⚠ ("Matches the receipt total." or "Items
    add up to X, Y less/more than the receipt."), the warnings list
    (`messages.ts` has a message for each), "Show receipt image" and
    Dismiss.
  - `receipt.module.css` (tokens only).
- `receipt/receiptStore.ts` (D15: `settle.receipt`, `{ version: 1,
  receipt }`, rebuilt from known fields, anything bad dropped),
  `receiptImport.ts` (the context and `useReceiptImport`),
  `ReceiptImportProvider.tsx` (the real importer, in `App.tsx`), and
  `browserImport.ts`, which the provider loads on the first scan, so the
  parser, reader, QR scanner, pdf.js, Tesseract.js and zxing stay out of
  the main bundle (they build as their own chunks); the main bundle grows
  by the UI only, 294 → 306 kB. `importUi.ts`: `billHasContent` and
  `revokeImageUrl`.
- M1 changes: `ItemsSection.tsx` shows a "⚠ Check" marker on flagged rows
  (read as "Item 3: check this line"), cleared by any change in that row's
  name, quantity or unit price field (a change listener on the field group,
  so even text that doesn't parse yet counts), never by assignment or
  shares; `split.module.css` has its style. `billReducer` gains
  `replaceBill`. `SplitPage.tsx` puts it together: after an import it
  replaces the bill, remounts the editor and focuses the panel's heading;
  the editor is `inert` and `aria-busy` while scanning; New bill and
  Dismiss clear the summary and the image; the image's object URL is
  revoked when replaced or when leaving the page. The M1 page and router
  tests render inside `ReceiptImportProvider`.
- `scripts/check-requests.mjs`: `--qr` defaults to the `.expected.json`'s
  `qr`, and scan mode records what the app read (`appRead`: item count,
  trusted total and its source).

Tests (fake import, `SplitPage.receipt.test.tsx`, 17): every plan item.
Picking a file uses `fireEvent.change`, not `user.upload`:
`@testing-library/user-event` isn't installed, and adding it would be a new
dependency (a stop condition). Plus `receiptStore.test.ts` and
`importUi.test.ts`.

**Real-browser scans** (headless Brave, `npm run build`, then
`check-requests.mjs scan` per file, each its own Brave process with a fresh
profile), logs in `docs/milestones/milestone-2-evidence/cp4-scan-*.json`.
**All four pass**: the planted leak caught by both rules, no failures, no
CSP violation, and every expected worker request present.

| file | the app read | worker requests (session) |
|------|--------------|---------------------------|
| `sample-1.jpg` | 5 items, 20,00 from the QR code | Tesseract core and `por`/`eng` models (Tesseract worker); zxing wasm (page) |
| `sample-3.heic` | 6 items, 13,50 from the QR code | heic-to (page) and its `blob:` decoder worker (attached, no requests); Tesseract as above |
| `sample-6-scanned.pdf` | 3 items, 35,38 printed | pdf.js worker (attached; script fetched by the page); Tesseract as above |
| `sample-9.pdf` | 4 items, 172,82 from the QR code | pdf.js worker (attached); zxing wasm (page) |

Every request is a same-origin `GET` of a build file. The pdf.js worker
made no requests of its own: these PDFs embed their fonts and need none of
its wasm decoders ("where the file needs them"). Sample 9's QR code, read
from the page pdf.js rendered, also confirms CP3's `destroy` fix in a real
browser. **A limit, recorded:** for requests from worker sessions, Chromium
sent no `requestWillBeSentExtraInfo`, so their logged headers are the ones
`requestWillBeSent` reports (`headersAsSent: false` in the log), without
browser-added headers such as `Cookie`. Their names and values still pass
the checks, and the page session's requests, logged as sent, carry no
cookie (the profile is fresh and the app sets none).

Verified: `npm run check` (`tsc -b`, `eslint . --max-warnings=0`,
`prettier --check .`, `vitest run`: 733 tests) and `npm run build` pass.

### M2-CP5 — verified state

- `README.md`: "What works today" gains **Scan a receipt** (the formats,
  the fiscal QR code, the receipt check, read on the device, the manual
  fallback), and the M2 "on the roadmap" wording is gone. The privacy
  section says receipts are read on the device and never uploaded, that
  the image is never saved, and that the first scan downloads the reader,
  **about 9 MB** (measured: Tesseract core 3.9 MB + `por`/`eng` models
  4.3 MB + zxing 0.95 MB + the worker and chunks; the plan estimated about
  8 MB), from Settle itself. A new "Third-party licences" section names the
  libraries, the LGPL-3.0 `heic-to` shipped as its own unmodified file,
  and links to `app/public/THIRD_PARTY_NOTICES.md`.
- `app/README.md`: the `features/receipt/` layout, the self-hosted reader
  files and `vendor-assets.mjs` (D8), the CSP, the static-only lint rule
  and `check-requests.mjs` (D9), regenerating the sample receipts, the
  `settle.receipt` key and Tesseract's IndexedDB cache.
- `SettingsPage.tsx`: "Receipt reading" says "Built-in: read on this
  device." with no milestone promised, and a new "About" section links
  "Third-party licences" to `/THIRD_PARTY_NOTICES.md`. The M3 test is
  replaced by tests of both.
- `SplitPage.e2e.test.tsx`, a new scan-to-split test: `importReceipt` with
  fake decoding and QR scanning (sample 1's QR payload) but the real
  reader, parser and bill conversion, fed sample 1's **real OCR
  transcript** (`fixtures/receipts/01-pt-restaurante-qr.ocr.txt`, from
  Tesseract.js after the clean-up, QR-code noise lines included). It
  uploads a file, checks the 5 items and "Matches" (20,00 € from the QR
  code), splits them between Ana, Rui and Maria, and checks the hand-
  computed totals (3,27 €, 11,97 €, 4,76 €: equal remainders, so the 2
  leftover cents go to the first people) and the settle-up.

Milestone "Done when":
- `npm run check` (735 tests) and `npm run build` pass. On the PR, `app`
  and `pr-title` passed for the CP4 push; the CP5 push's checks are
  reported at the self-review below.
- The sample corpus matches or is flagged (CP3's corpus test); every
  failure falls back to the manual editor (CP3 and CP4 tests); no receipt
  data leaves the browser (the D9 CSP and static-only rule, CP2's page-load
  log and CP4's four real-scan logs, with the limit recorded under CP4);
  the READMEs are updated.
- Still to come: the user's functional review with real receipts on a
  phone and a desktop.

### Self-review (whole milestone)

Reviewed the milestone diff against `74cf84a`: the import pipeline,
bill conversion, receipt check, saved summary, the Split page wiring,
cancellation and resource clean-up (workers, pdf.js documents, bitmaps,
object URLs). One fix:

- `SplitPage.tsx`: after an import, focus moves to the check panel's
  heading in a layout effect, in the same commit that shows the panel.
  As a passive effect it could run after the panel was already on
  screen, and the full `npm run check` failed once on
  `SplitPage.receipt.test.tsx`'s focus assertion under load (it passed
  when that file ran alone).

Verified after the fix: `npm run check` twice (37 files, 735 tests,
both passing) and `npm run build`. On PR #6 the CP5 push's `app`,
`pr-title` and `workflow-conformance` checks passed.

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
