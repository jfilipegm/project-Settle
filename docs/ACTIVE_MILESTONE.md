# Active Milestone

## Milestone

**M2 — Receipt upload and built-in parsing** (work item `milestone-2`),
phase `AWAITING_FUNCTIONAL_REVIEW`. Plan revision 10, approved in commit `3af0e18`.
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

### External implementation review, round 1 (REVISE)

- **B-EXT-1** (CI on the reviewed head): no change needed. The required
  checks had finished green on the reviewed head `8075476` (`app` on push
  and on the PR, `workflow-conformance`, `pr-title`) and on `9a09273`.
- **I-EXT-1** (worker header evidence), `15197e5`: `check-requests.mjs`
  serves the app through a logging proxy in front of `vite preview`, so
  every request that reaches the origin is recorded with its headers as
  received and gets the same checks. Each one must also be in the
  protocol's log. For the Tesseract model request in sample 1's scan,
  the protocol reported 2 headers and the proxy received 11, all standard,
  none with a receipt value. The logs keep every header value, the value
  set and the proxy log, and `check-requests.mjs audit --log <file>`
  re-checks one offline (a copy with a receipt value or a custom header
  added fails). All six evidence logs were regenerated with the same
  arguments: all pass (the CSP probe fails as it must), with the same app
  reads as before, and all pass the audit.
- **O-EXT-2** (QR scan after a reader failure), `4171976`: the QR scan
  gets its own signal, aborted with the caller's and whenever the import
  ends; four new tests.
- **O-EXT-1** (summary not bound to the bill): not applied. It needs a
  change to D15's saved format, for a recovery case that ordinary use
  doesn't reach (the reviewer marked it as future hardening).

Verified: `npm run check` (37 files, 739 tests) and `npm run build`.

### Technical approval

Implementation revision 2 approved in `24e8227` (basis
`EXTERNAL_APPROVE`, bundle `986c118407bd`). No code has changed since the
verification above.

## Remediation child: `milestone-2-remediation-1`

Plan revision 12 (`docs/milestones/milestone-2-remediation-1-PLAN.md`),
approved in `5a42485` (basis `EXTERNAL_APPROVE`). Lands on
`feature/milestone-2`, PR #6.

| id | name | status |
|----|------|--------|
| M2R1-CP1 | Image clean-up: text-size scaling, flattening, one channel, strips | Complete |
| M2R1-CP2 | Parser and bill-conversion rules for real layouts | Complete |
| M2R1-CP3 | Synthetic real-layout corpus and local real-receipt fixtures | Complete |
| M2R1-CP4 | Review step: gaps, add-the-difference, READMEs, verification | Not started |

### M2R1-CP1 — verified state

Built:
- `preprocess.ts`: R1's working copy and text-height estimate
  (`workingCopy`, `characterHeight`, `estimateTextHeight`), R1's
  `scaleFactor`/`fitSize` (D10's rule kept as the no-estimate fallback),
  R2's `blur`/`flatten` (three box passes by running sums, rounded after
  each pass, so a strip with a 3r margin gives exactly the whole page's
  pixels), and the chain rebuilt around one 8-bit channel (`GrayPage`):
  `grayPlane` (one-pass shrink and grayscale when the factor is under 1),
  `rotate`, `resizeRows` (a strip scaled on the page's grid),
  `stretchContrast`. `preprocessPage` is an async generator of cleaned
  strips that yields to the event loop between steps and stops there on
  abort.
- `strips.ts`: `planStrips` (R20: overlap max(200, 8t), margin 3r, cores
  spread evenly, own-zone boundaries in the middle of each overlap) and
  `ownLines`.
- `builtInReader.ts`: the strip loop, `linesOf` keeping each line's box,
  progress `(page + (strip + p) / strips) / pages`, cancel during the
  clean-up.
- `encodePage.ts`/`encodePage.node.ts`: accept the one-channel page (the
  browser expands it to RGBA; Node writes a grayscale PNG).

Decided during CP1 (plan deviations, recorded for review):
- **Flattening only on uneven pages** (the user's decision, 2026-09-29).
  R2 flattened every page, but that broke sample 02 in CI: its dotted
  zeros read as 6 with flattening (0 of 5 item amounts right at ×1 and at
  ×2.34), and all 5 right without it. It also lowered the Lidl
  screenshots' reading. A page is now flattened only when the median of
  its coarse blur (on R1's working copy) is under 200
  (`UNEVEN_BACKGROUND`): the two real photos measure 157 and 173, every
  screenshot and corpus sample 219 or more. R1's estimate and the skew
  still read the coarsely flattened copy.
- **R1's working copy is bounded by area** (at most 800 × 800 px), not by
  an 800-px long side. A long-side bound halves a 223 × 1600 screenshot,
  and its 4–5-px text would fall under the 3-px component minimum: the
  case the plan's own wording says the copy must protect.
- R1's thresholds are unchanged (24 / 64 px, 14 MP).

Measurements (this machine, Node 24, Tesseract.js 7):
- R1 on the real receipts: the three screenshots' text is 4.0–5.0 px
  (×4, 5.7–6.7 MP; lidl3 is read in 4 strips); the photos' 15.5 and
  11.1 px (×2.06 to 13.4 MP, and ×2.11 limited by 14 MP). The largest
  strip planned for any corpus or real receipt is 5.78 MP.
- Page-level steps: R1's estimate on a 40-MP source 235 ms (14 MP:
  125 ms); the one-pass shrink and grayscale 40 → 14 MP 214 ms; grayscale
  of 14 MP 45 ms; the full-page `rotate` of 14 MP 100 ms.
- A 6-MP strip: scaling 26 ms, flattening 217 ms, contrast 57 ms, about
  18 MB of buffers besides the page plane. No step is over 300 ms, so
  none is split into chunks, and the strip budget stays 6 MP.
- Whole reads (worker start-up included): the Tiffosi-sized photo
  (14 MP, 4 strips) 6.3 s, a 12-MP camera-sized page 6.3 s, lidl1 6.4 s,
  within the 15-s engineering budget.
- The five real receipts (item amounts read exactly, one to one, before
  CP2's parser rules; coverage as R19's local coverage):

  | receipt | item amounts read | coverage | total's amount read | target |
  |---|---|---|---|---|
  | Tiffosi | 5 of 5 | 100 % | yes (next line) | "Matches": on track |
  | Continente | 12 of 14 | 71 % | yes | 75 %: not met yet |
  | lidl1 | 5 of 25 | 11 % | no | 60 %: accepted as measured |
  | lidl2 | 8 of 29 | 21 % | one digit off | 60 %: accepted as measured |
  | lidl3 | 1 of 5 | 22 % | yes (label garbled) | 60 %: accepted as measured |

  Continente's two lost lines are the one on a paper fold (as in the
  spike) and one whose amount flips between right and one digit off with
  a few pixels' change in scale. **The Lidl target is not reachable with
  Tesseract** at this resolution: the best of every variant tried
  (ImageMagick ×3/×4/×6, Lanczos, with and without flattening, and the
  spike's own ×4 with the 5.5.3 CLI) read 8 of 25 amounts on lidl1; the
  spike's "amounts mostly right" doesn't hold under exact amounts. The
  user accepted the measured result (2026-09-29): the gap stays visible
  (R12) and closes in one click (R13/R14).
- Per Lidl receipt (R23's anchor, counts only): the tax-table header was
  read with at least two of R18's column words on all three, so each has
  an anchor. The `MULTIBANCO` line was read as a recognised payment
  phrase on lidl3 only (garbled on lidl1 and lidl2). No separator row was
  read on any. Footer lines between the items and the anchor with an
  amount near the QR total (R23's "near"): 0 on lidl1, 1 on lidl2 (one
  digit off), 1 on lidl3 (equal). Negative lines read with their sign
  (candidates for the bill discount): 0 on all three; every `Promoção`
  line lost its sign or its amount.
- Per photo: separator-shaped lines above the last expected item line:
  0 on both.
- The phone measurement (R21): not taken. The user ran the preview build
  on their phone (2026-09-29) but didn't time it, judging the reading
  quality the priority. Per R21 the measurement, with the same 60-s and
  20-s thresholds, moves to M2's functional re-test.
- Continente's 75 % target is not met at CP1 (71 %). CP3 checks it end to
  end, after CP2's parser rules.

Verified: `tsc -b`, `eslint . --max-warnings=0`, `prettier --check .`
and `vitest run` (779 tests) pass; the corpus test (samples 01–10) keeps
every result.

Found and fixed during CP1, outside its scope: `/split` was blank when the
app was opened over plain HTTP from another device (a phone on the local
network), because `newId()` used `crypto.randomUUID`, which only exists in
a secure context. Fixed in `9d4348d` (a fallback on
`crypto.getRandomValues`).

### Engine comparison (PaddleOCR), for the next remediation child

After CP1 the user asked whether a better reader exists. A local spike
(branch `spike/paddleocr` in a separate worktree, not pushed, not part of
this plan) ran PaddleOCR (`ppu-paddle-ocr` with ONNX Runtime Web, the
PP-OCRv5 mobile detection and Latin recognition models, about 13 MB, MIT
and Apache-2.0, in the browser) on the five real receipts, with the same
scoring as above:

| receipt | Tesseract (CP1) | PaddleOCR | target |
|---|---|---|---|
| lidl1 | 11 % | 44 % | 60 % |
| lidl2 | 21 % | 73 % | 60 % |
| lidl3 | 22 % | all 5 items | 60 % |
| Continente | 71 % | 94 % | 75 % |
| Tiffosi | 100 % | 100 % | "Matches" |

Item names came out much cleaner, and a read took 0.5–2 s on this
machine. In the app, with M2's parser, the Tiffosi photo reached
"Matches". The user confirmed the improvement on their phone.

Switching engines needs a plan amendment, and the amendment tooling
refuses this plan: `request_plan_amendment` accepts only checkpoint ids
of the shape `CP<digits>[A-Z]?`, so `M2R1-CP1`…`M2R1-CP4` can never be
amended (a workflow defect, present in workflow 2.6.0 too). The user
decided (2026-09-29) to finish this child as planned, on Tesseract, and
to switch to PaddleOCR in a new remediation child afterwards. The same
session collected two requests for later: a row-by-row review of what
the reader found (the receipt image with each line's role, and adding a
missed line), and remembering the user's corrections on the device.

### M2R1-CP2 — verified state

Built:
- The parser (`parse/parseReceiptText.ts`, `parse/keywords.ts`): R3's
  price-first quantities (`Name P x Q L`, also `a`, `s`, `*` and `xQ`,
  only when `round(P × Q) = L`); R4's name line joined with the quantity
  line under it, a garbled quantity line (`1X0,8`) as 1 × the total,
  flagged, and category headers (`Padaria:`) never a name; R5's leading
  tax codes and barcodes left out of names, and code-and-size lines
  ignored; R6's total on the next line; R7's informational promotion
  lines ignored; R8's unsigned savings lines recorded on their item as
  `savingsCandidate` (negative lines still reduce it); R10's currency
  marks counted only next to an amount; R11's fuzzy total (one
  substitution); R18's tax-table header and separator row ending the
  items after an item; R22's `endEvidence` on item lines; R23's
  `itemsEndedBy`.
- The bill conversion (`toBill.ts`): `reconcileWithTrustedTotal` (R22),
  holding R8's decision (applied, then dropped) and the three cuts, R23,
  R9 and R18, each closing with no adjustment but the read bill-level
  discount; R24's `removedLines` in the summary; R10's euros from any
  Portuguese QR code; R14's single "Not read from the receipt" item.
- `receiptStore.ts` reads and checks `removedLines` (an empty list reads
  as absent); `importReceipt.ts` awaits the QR scan before giving up on a
  read with no items (R14).

Changed tests, as the plan says: rule 7's unsigned-discount tests now
state R8 (a candidate on the item; applied by the bill conversion with no
total); text fixture 20 records its candidate instead of a bill discount;
the import's "noItems even with a QR code" test is now R14's two cases.

Verified: `tsc -b`, `eslint . --max-warnings=0`, `prettier --check .`
and `vitest run` (854 tests, 73 more than before CP2) pass, the corpus test (samples
01–10) included. Two rules were checked against a deliberate break of
the code: disabling R23's cut fails 4 tests, and reversing R8's order
fails the test added for it.

### M2R1-CP3 — verified state

Built:
- `scripts/make-sample-receipts.mjs`: corpus receipts 11 (a narrow app
  receipt, Lidl-like), 12 (a supermarket photo on a table, Continente-like)
  and 13 (a clothes-shop photo, Tiffosi-like), invented, with valid QR
  payloads (customer NIF `999999990`), plus `fixtures/browser/sample-12.jpg`
  for CP4's browser scan. `--only=` regenerates just the named samples;
  01–10 and the other browser files are untouched. Each new sample's
  `.expected.json` records `removedLines: []` (no cut); the corpus test
  now checks it.
- R17: `app/.gitignore` ignores `src/features/receipt/fixtures/local/`;
  `localFixtures.node.ts` and `localFixtures.test.ts` check that the
  folder is ignored, that nothing under it is tracked or staged, and that
  no commit in the whole history touches it (refusing to pass on a shallow
  clone). Each check is shown able to fail on a throwaway repository:
  `git add -f`, a commit then a deletion, and a `--depth 1` clone.
  `app-ci.yml` checks out with `fetch-depth: 0`.
- `matchedCoverage.ts` (R19's local coverage) and
  `receipts.local.ocr.test.ts`, which reads the local receipts with the
  real OCR and is skipped where the folder is empty, as in CI. The offline
  Node setup it shares with the corpus test moved to `importDeps.node.ts`.
- `app/README.md`: "Local real-receipt fixtures", including what to do if
  a guard ever fires (the user's decision; no automatic rewrite).

Deviations, recorded for review:
- **Edge-noise rule** (the user's decision, 2026-09-29; `trimEdgeNoise`
  in the parser). A photo's table and paper edges leave stray characters
  around lines (`é. POUPANCA 0,60`, `AMENDOIM 1,15 : : Gi,`, `5 - 2 X 6,50
  13,00`), and a line that doesn't end in an amount isn't an item. The
  plan named this as a cause of Continente's under-reading without a
  rule. Now: up to two noise tokens are dropped at a line's start, up to
  three before a quantity, and up to four short ones after its last
  amount (keeping a tax code), and a name line never loses its end. A
  lone colon (`BOX VEGGIE :`) no longer makes a line a category header.
- **Gentler synthetic degradation** than the plan's wording: sample 11 is
  about 360 px wide (not 230; at 230 px Tesseract confuses 0 with 9 and
  B with 8, the limit the real Lidl receipts hit) and 11–13 use Liberation
  Mono, whose zero is plain (DejaVu Sans Mono's dotted zero reads as 8 or
  6 at small sizes). The photos keep the table, shading, tilt, noise and
  JPEG, at lighter noise.

Measured on the five real receipts (numbers only; R19's local coverage):

| receipt | items | sum | local coverage | unmatched | in-app | check |
|---|---|---|---|---|---|---|
| Tiffosi | 5 | 76,11 | 100 % | 0,00 | 100 % | match |
| Continente | 13 | 38,81 | 56 % | 10,06 | 76 % | mismatch |
| lidl1 | 19 | 65,12 | 11 % | 56,94 | 86 % | mismatch |
| lidl2 | 23 | 67,45 | 21 % | 51,07 | 88 % | mismatch |
| lidl3 | 3 | 12,20 | 22 % | 10,46 | 100 % | mismatch |

- No receipt's unmatched sum falsely closes its gap (no items' sum equals
  its QR total). On all three Lidl receipts the junk pushes the in-app
  coverage over 80 % while local coverage is under it, so R15's
  "Only X of Z was read" wording won't show there; the mismatch does.
- Lidl: no cut (R23, R9 or R18) fired, no line was dropped, and no
  bill-level discount was read. lidl3 keeps one footer line near its QR
  total: R23 finds it but the items above don't close, too few being read.
- Photos: neither photo's items were ended early by a separator (a total
  ended both).
- **Targets:** Tiffosi's is met. Continente's 75 % is missed (56 %): three
  lines the OCR misreads (one on a paper fold, one garbled, one price a
  digit off), and, because the list then doesn't close, R8's fallback
  applies two informational savings lines. The Lidl 60 % targets are
  missed, as measured in CP1, and lidl3's leftover footer line is a stop
  condition. The user accepted the measured results (2026-09-29): the
  local targets are the measured floors (0.55; 0.10, 0.20, 0.20), each
  noting the plan's target, to be raised back by the PaddleOCR
  remediation child.

Verified: `tsc -b`, `eslint . --max-warnings=0`, `prettier --check .`
and `vitest run` pass with the local folder filled in (896 tests, 1
skipped: the "absent" note). CI will skip the local receipts.

## Current blockers

M2 can't be accepted until its remediation child,
`milestone-2-remediation-1`, is accepted (functional review round 1,
below). The child is implementing; M2R1-CP1 to M2R1-CP3 are complete.

## Active plan

`docs/milestones/milestone-2-PLAN.md` (revision 10). M1's plan is
archived at `docs/milestones/completed/milestone-1-PLAN.md`.

## Functional review checklist

M2 functional review, implementation revision 2. Report findings in
`.ai-review/feedback/FUNCTIONAL_REVIEW.md`: the item number, what you
did, what you saw, and what you expected. For a receipt that reads badly,
note the device, whether it was a photo or a file, and, if you can, attach
or describe the receipt (blur out anything private).

### Functional review, round 1: findings and routing

You tested five real receipts (three Lidl app receipts, 223-261 px wide
screenshots, and WhatsApp photos of a Continente and a Tiffosi receipt).
Reproduced offline with the real Tesseract.js, parser and zxing-wasm:

- **Lidl ×3** (F-I-1): OCR reads almost nothing (line confidences mostly
  0-50). The screenshots are 223-261 px wide, so the text is about
  5 px tall. D10's scaling doesn't enlarge them: doubling the short side
  would take the long side (1600 px) past the 2400 px cap. Result: no
  items, `noItems`.
- **Tiffosi** (F-I-2): the photo's grey table and paper texture become
  noise lines. The item rows (barcode, then a two-line description and
  price) are unreadable or don't match D11's item layouts. Result: no
  items.
- **Continente** (F-I-3): most item lines are read, but only 5 items
  (8,71 €) are kept. The parser drops items whose quantity and price are
  on the next line (`2 X 4,04 8,08`), items followed by OCR noise after
  the amount (`2,69 D'`), and everything after a garbled line. `TOTAL A
  PAGAR 51,25` was read as `51,0`, so no printed total was found.
- **The fiscal QR code decodes correctly on all five** (totals 75,68,
  76,77, 7,76, 51,25 and 76,11 €), so in the app Continente shows a
  mismatch against 51,25 €, and the others fall back to typing.

Classification:

| Finding | Class | Routing |
|---------|-------|---------|
| F-I-1 Lidl screenshots, no items | defect | broad → `milestone-2-remediation-1` |
| F-I-2 Tiffosi photo, no items | defect | broad → `milestone-2-remediation-1` |
| F-I-3 Continente under-read (and an incomplete import that can be split without further steps) | defect + usability issue | broad → `milestone-2-remediation-1` |
| F-I-4 the corpus doesn't represent real receipts | missing requirement (test coverage) | broad → `milestone-2-remediation-1` |

**Why broad, not a bounded fix:** it needs work in three areas that
depend on each other. Image clean-up: scale by text size rather than page
size, and handle photo backgrounds, which touches cropping, out of M2's
scope. The parser: multi-line items, category headers, `POUPANCA` and
`DESCONTO DIRETO` lines, noise after amounts, barcode-column layouts. The
review step: make a large gap from the QR total impossible to miss before
splitting. How much of this is needed to pass the acceptance criteria is
genuinely uncertain, so it gets its own plan and review instead of an
inline fix. **Decided (user, 2026-09-29):** the five receipts contain
personal data (a customer NIF, card digits, a loyalty-card number). They
can be used as test fixtures **locally only** and must never be
committed. They stay under the git-ignored `.ai-review/` (or another
git-ignored path), and any test that reads them skips when they're absent,
as they will be in CI. Committed fixtures that cover the same layouts
must be re-created with no real personal data.

No code changed in M2 for this round, and M2's technical approval stays
current. **To re-test after the child is accepted:** items 2, 7, 8, 9 and
11 below, and your five receipts.

**Setup**

- From `app/`: `npm ci`, then `npm run build && npm run preview -- --host`.
  Open the "Local" address (http://localhost:4173) on the desktop, and
  the "Network" address (http://<your-computer's-IP>:4173) on a phone on
  the same Wi-Fi. Use the preview build, not `npm run dev`: only the
  build has the Content-Security-Policy.
- Desktop: a Chromium browser, with DevTools open to the Network and
  Console tabs for items 2 and 12. Phone: its normal browser (Safari on
  iPhone, Chrome on Android).
- Start clean: in DevTools → Application, delete the `settle.bill` and
  `settle.receipt` local-storage keys, and the IndexedDB databases
  (Tesseract's model cache), or use a private window. On the phone, use a
  private tab for the first scan.
- The sample files are in `app/src/features/receipt/fixtures/`:
  `browser/sample-1.jpg`, `browser/sample-3.heic`,
  `browser/sample-6-scanned.pdf`, `browser/sample-9.pdf`,
  `receipts/08-pt-linha-borrada.png` and `receipts/10-nao-e-recibo.png`.
- Settings → Region should be Portuguese / Euro unless an item says
  otherwise.

**Checklist**

1. **The scan section.** Open Split.
   *Expected:* a "Scan a receipt" section at the top, with "Read on this
   device. The receipt never leaves your browser.", "Choose file", "Take
   photo" and "Or drop a JPEG, PNG, HEIC or PDF file here." Settings → "Receipt
   reading" says "Built-in: read on this device.", and its About section
   links "Third-party licences", which opens the notices page.
2. **First scan, a JPEG with a fiscal QR code** (desktop, clean profile).
   Choose file → `sample-1.jpg`.
   *Expected:*
   - The status line shows "Opening the file…", then "Loading the reader
     (first time only)…", then "Reading the text…" with a percentage, then
     "Checking the QR code…". A Cancel button shows while it reads, and
     the bill below can’t be edited until it ends.
   - Five items, each shared by everyone: Imperial 2 × 1,60 (3,20 €),
     Bitoque 9,50 €, Salada Mista 4,20 €, Café 2 × 0,80 (1,60 €), Água das
     Pedras 1,50 €. No tax, tip or discount.
   - Focus moves to a "Receipt check" panel: Merchant "Restaurante A
     Tasquinha", Date 28/09/2026, NIF 507342186, Receipt total 20,00 €
     from the fiscal QR code, IVA included 2,30 €, and "✓ Matches the
     receipt total."
   - "Show receipt image" opens the photo.
   - In DevTools: every request goes to the preview's own address (the
     reader's files under `/vendor/`, about 9 MB in all). Nothing goes to
     another site, and the Console has no CSP errors.
3. **The live check.** Change Bitoque's price to `10,00`.
   *Expected:* the panel changes at once to "⚠ Items add up to 20,50 €,
   0,50 € more than the receipt." Set it back to `9,50` and it says
   "Matches" again.
4. **Split the scanned receipt.** Add people until there are 3 (Ana, Rui,
   Maria; Ana paid). Give Bitoque to Rui only and Salada Mista to Maria
   only, and leave the other items shared.
   *Expected:* the per-person totals add up to 20,00 €, the settle-up
   says Rui and Maria owe Ana, and "Matches" stays.
5. **Kept after a reload, cleared by New bill.** Reload the page (F5).
   *Expected:* the bill and the Receipt check panel are both still there
   (the image is not: it's never saved). Then "Dismiss" the panel: the
   bill stays and the panel goes. Scan `sample-1.jpg` again, then "New
   bill" → OK: the bill and the panel are both cleared.
6. **Replacing a bill asks first.** Type an item by hand, then scan
   `sample-1.jpg`.
   *Expected:* "Replace the current items with the receipt's? People stay
   as they are." Cancel keeps your item unchanged. OK replaces the items
   and keeps the people and payer.
7. **Second scan, other file types.** Scan each of these in turn (OK the
   replace prompt each time).
   *Expected:*
   - The reader isn't downloaded again (no "Loading the reader" pause, and
     no model files in the Network tab).
   - `sample-3.heic` (a supermarket receipt): 6 items, from Leite Meio
     Gordo to Vinho Tinto Reserva, "Supermercado Pomar", total 13,50 €
     from the QR code, "Matches". (Chrome can't decode HEIC itself, so
     this also tests the fallback decoder.)
   - `sample-6-scanned.pdf` (a UK pub bill, scanned with no text in the
     PDF): Pint of Bitter, Steak and Ale Pie, Sticky Toffee Pudding, a
     service charge of 3,93 as the tip, total 35,38 read from the receipt,
     "Matches", and a warning that the receipt is in pounds (GBP), not
     your region's currency.
   - `sample-9.pdf` (a Portuguese e-fatura with a text layer): 4 items
     (Mudança de óleo … Mão de obra), "Oficina Auto Ribeiro, Lda.", total
     172,82 € from the QR code, "Matches". This one reads almost at once:
     there's no OCR.
8. **Doubtful lines are marked.** Scan `08-pt-linha-borrada.png` (a
   receipt with a smudged line).
   *Expected:* at least one item shows "⚠ Check" (or the panel shows a
   mismatch or a warning). Editing that item's name, quantity or price
   removes its marker. Changing who shares it doesn't. After a reload, a
   cleared marker stays cleared.
9. **Failures fall back to typing.** Starting from a bill with a typed
   item, try each of these.
   *Expected:* each shows its message ending "You can type the items in
   below.", and the typed bill is unchanged:
   - `10-nao-e-recibo.png` (not a receipt): "No items were found on this
     receipt."
   - A file that isn't an image or PDF (a `.txt` or `.docx`, chosen with
     the file dialog's "All files"): "This file type can't be read. Use a
     JPEG, PNG, HEIC or PDF."
   - Start a scan of `sample-6-scanned.pdf` and press Cancel while it
     reads: "Reading was cancelled.", and the bill becomes editable again.
   - In a fresh private window, DevTools → Network → Offline, then a
     scan: "The receipt reader couldn't load. Check your connection: the
     first scan downloads it."
10. **Drag and drop** (desktop). Drag `sample-1.jpg` from the file manager
    onto the scan section.
    *Expected:* an outline shows while dragging over it, and dropping
    starts the scan exactly as in item 2.
11. **Your own receipts, on a phone and on the desktop** (the milestone's
    "Done when"). On the phone, use "Take photo" on at least 3 real
    receipts: one with a Portuguese fiscal QR code (a supermarket or
    restaurant fatura), one without, and one long or crumpled. On the
    desktop, "Choose file" with a photo from your phone's gallery (HEIC on
    an iPhone) and, if you have one, a PDF invoice.
    *Expected:* each either fills the items and shows "Matches", or shows
    clearly what doesn't add up (a mismatch, "⚠ Check" markers or a
    warning), so you know what to fix before splitting. Nothing freezes or
    crashes, and the camera opens straight from "Take photo". Note which
    receipts read badly: the milestone accepts some misreads as long as
    they're flagged.
12. **Nothing leaves the browser.** During any real-receipt scan on the
    desktop, watch the Network tab.
    *Expected:* only `GET`s to the app's own address. No request's URL
    contains a merchant, an amount or item text from the receipt.
13. **Phone layout, dark mode and keyboard.** On the phone (or DevTools at
    360 px), and with the theme on Dark.
    *Expected:* the scan section, status line, Cancel and check panel fit
    with no horizontal scrolling, and stay readable in dark mode. With
    Tab only, you can reach "Choose file", "Take photo", Cancel, "Show
    receipt image" and "Dismiss", and each shows a focus ring.

**Known limitations (not findings)**

- No perspective correction or cropping: a photo taken at a steep angle,
  or sideways with no rotation data, reads badly and is flagged ("This
  photo was hard to read").
- Portuguese and English receipts only. No handwriting, and one receipt
  per image.
- Amounts are never converted between currencies; a receipt in another
  currency only gets a warning.
- The receipt image is never saved: after a reload, "Show receipt image"
  is gone.
- The first scan needs a connection to the app (about 9 MB). Offline
  caching comes with M6.
- Photos over 40 megapixels and files over 20 MB are refused on purpose,
  to avoid running a phone out of memory.
- Items come in shared by everyone; you assign them yourself, as in M1.
- `npm run dev` has no Content-Security-Policy; only the build does.

M1's checklist (implementation revision 2) is in commit `5c00e07`.

<!--
This file is `workflow_state.FUNCTIONAL_CHECKLIST_PATH`. It is
repository-local state: workflow-manager generates it once at bootstrap and
never overwrites it on update.
-->
