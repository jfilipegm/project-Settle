# Active Milestone

## Milestone

**M2.5 — Accurate receipt reading** (work item `milestone-2-5`, plan
revision 6, `docs/milestones/milestone-2-5-PLAN.md`), on
`feature/milestone-2.5` (PR #9). Phase `IMPLEMENTING`.

## Next action

`/milestone-implement milestone-2-5` for **CP2** (the PaddleOCR reader).
Before that, the user checks the nine drafted expected files and decides
the name-rule question below.

## Checkpoints

- [x] **CP1** — the local test set (format v2) and the accuracy measure,
  in Node and a real browser, with the Tesseract baseline.
- [ ] CP2 — the PaddleOCR reader.
- [ ] CP3 — tuning on the local set.
- [ ] CP4 — corpus, small-image advice, Tesseract retired.
- [ ] CP5 — the row-by-row review.
- [ ] CP6 — acceptance measurement, phone, privacy, documentation.

### CP1 — done

- `accuracy.ts` (pure): P2's measure. Recognisable product
  (`nameMatches`), maximum one-to-one pairing (receipt order breaks ties),
  the adjustments as amounts, the total and the check, false matches on
  money only, distinct-receipt accuracy, strict name accuracy, and R19's
  coverage kept as `amountCoverage`. `matchedCoverage.ts` is gone (folded
  in). An import that fails (`noItems`, …) is scored as every row
  missing, never a false match.
- Format v2 (P1) in `localFixtures.node.ts`: loading, validation (each
  error names the case), `sameReceiptAs` linking, distinct receipts, and
  P14's held-out selection. R17's guards unchanged.
- `decodeImage.node.ts`: JPEG in Node with `jpeg-js` (dev dependency,
  **BSD-3-Clause**, not MIT as the plan guessed; still permissive) and
  EXIF orientation applied as the browser does. HEIC is browser-only.
- `receipts.local.ocr.test.ts` reads v2 cases (JPEG or PNG), scores them,
  checks `minRowAccuracy`, logs numbers only and writes the full report to
  the git-ignored `.ai-review/local-measure/`. `scripts/measure-node.mjs
  [--held-out]` runs it (Vitest rejects unknown flags, so the flag goes
  through `SETTLE_HELD_OUT`).
- `scripts/measure-local.mjs [--held-out]`: P3's browser run on the
  production build in headless Brave, scoring the bill and summary read
  from `localStorage`. The DevTools client, `vite preview` and Brave
  start-up moved to `scripts/browser.mjs`, shared with
  `check-requests.mjs` (behaviour unchanged: `page-load` and `scan` on
  `sample-1.jpg` pass).
- `app/README.md`, "Local real-receipt fixtures": format v2 and both
  measurements.
- The nine local expected files are drafted (git-ignored, never
  committed): the five M2 cases converted (the image is now the original
  JPEG; names added; prices after each row's own promotion), the four new
  ones drafted. While drafting, **lidl1's M2 file was wrong**: the Monster
  line is 1,74 × 7 = 12,18, not 12,16 (the tax table confirms it).

**The name rule, checked on the set's own names (P2 allows tightening
only, with a reason).** Of 3 624 pairs of different expected names, the
plan's thresholds paired 14. Two tightenings, applied before the
baseline:
- **Numbers must be read exactly** (after look-alike folding): two
  deposit lines differing only in their amount were one edit apart.
- **The whole-name allowance is ⌊n/4⌋, not ⌊n/3⌋** (names over 5
  characters): a product paired with its longer, different variant.
  No right-price row Tesseract read needed more than ⌊n/4⌋.

After them: **0 collisions**. 31 identical products appear on several
receipts (listed, not counted), and 1 pair is one name printed cut short
(most likely the same product, two croissant lines; listed, for the user
to confirm).

**For the user to decide (P2: thresholds aren't loosened without you).**
On Tesseract's rows read at the right price, the distinctive-word rule's
allowance (max(1, ⌊length/4⌋)) rejects some ordinary 2-error OCR noise on
6–7-letter words, such as a `J`→`L` plus `O`→`D` in one word and a
`ç`→`g` plus `õ`→`d` in another. Under the plan, those rows don't pair,
so their receipt can't pass, though its money may be right. Options:
keep it (strict), or allow 2 edits from 6 letters. The baseline below
uses the plan's rule (with the two tightenings).

**Floors (`minRowAccuracy`)**, the lower of Tesseract's row accuracy in
Node and the M2 coverage floor: continente 0.55, lidl1 0.10, lidl2 0,
lidl3 0, tiffosi 0.40. The four new cases have none.

**Tesseract's baseline** (9 images, 8 distinct receipts, all tuning, all
`shared` or `screenshot`; no camera original yet):

| case | capture | rows paired / expected | extra rows | exact names | check | no edit | browser: rows paired | browser: check | browser: s |
|---|---|---|---|---|---|---|---|---|---|
| boutique | shared | import failed (`noItems`) | – | – | – | no | import failed | – | 9.5 |
| continente | shared | 9 / 14 | 4 | 7 | mismatch | no | 9 / 14 (5 extra) | mismatch | 9.1 |
| jackjone | shared | import failed (`noItems`) | – | – | – | no | import failed | – | 10.6 |
| lidl1 | screenshot | 3 / 25 | 19 | 1 | mismatch | no | 1 / 25 (19 extra) | mismatch | 7.5 |
| lidl2 | screenshot | 0 / 29 | 23 | 0 | mismatch | no | 0 / 29 (23 extra) | mismatch | 7.7 |
| lidl3 | screenshot | 0 / 5 | 4 | 0 | mismatch | no | 0 / 5 (3 extra) | mismatch | 5.9 |
| sushi1 | shared | 0 / 3 | 0 | 0 | match (stand-in item) | no | 0 / 3 (1 extra) | mismatch | 5.4 |
| sushi2 (= sushi1) | shared | 0 / 3 | 0 | 0 | match (stand-in item) | no | 0 / 3 (1 extra) | mismatch | 12.2 |
| tiffosi | shared | 2 / 5 | 3 | 2 | match | no | 2 / 5 (3 extra) | match | 7.7 |

Totals:

| measure | Node | browser (reference) |
|---|---|---|
| receipt accuracy | 0 / 9 (0 %) | 0 / 9 (0 %) |
| distinct-receipt accuracy | 0 / 8 | 0 / 8 |
| row accuracy | 16.3 % | 14.0 % |
| extra rows | 53 | 55 |
| name accuracy (paired rows) | 71.4 % | 75.0 % |
| false matches | 2 | 0 |

Node's two false matches are sushi1 and sushi2: no row was read, the
bill holds only the "Not read from the receipt" stand-in at the QR total,
so the check says "match" while the rows are wrong. In the browser those
two read a different total, so the check doesn't match. Tiffosi's
"match" isn't false: every price is right; three names aren't
recognisable (two carry the barcode column).

Verification: `npm run check` (`tsc -b`, ESLint, Prettier, Vitest: 43
files, 989 passed, 1 skipped) and `npm run build` pass; the local test is
skipped where the folder is missing, as in CI.

## Receipts still needed (CP6)

At least 30 distinct receipts (8 now), at least 10 held out (added after
CP3's last change), at least 10 camera originals (0 now), a HEIC one if
the phone saves HEIC.

## Last completed: M2 — Receipt upload and built-in parsing

Upload a photo or PDF of a receipt and get M1's item list filled in,
entirely in the browser:

- **CP1:** pure receipt logic: the `ReceiptReader` interface, the
  rule-based parser, the Portuguese fiscal QR code, the bill conversion
  and the receipt check.
- **CP2:** file intake (JPEG, PNG, HEIC, PDF, with size limits), the image
  pipeline, the self-hosted reader assets and the Content-Security-Policy.
- **CP3:** the built-in reader (Tesseract.js in a worker), QR scanning
  (zxing-wasm), the import pipeline and the sample corpus.
- **CP4:** the review step: the "Receipt check" panel, "⚠ Check" markers,
  and the fallback to typing on every failure.
- **CP5:** the READMEs, Settings' "Receipt reading" section and the
  licence notices, and the end-to-end scans.

Remediation child `milestone-2-remediation-1` (M2's functional review,
round 1: real receipts read badly):

- **M2R1-CP1:** image clean-up scaled by text size, flattening of photo
  backgrounds, one channel, and reading tall pages in strips.
- **M2R1-CP2:** parser and bill-conversion rules for real Portuguese
  supermarket, app and shop layouts.
- **M2R1-CP3:** invented real-layout corpus receipts (11–13), and the
  user's five real receipts as **local-only** fixtures, git-ignored and
  guarded against ever being committed.
- **M2R1-CP4:** a gap from the receipt's total can't be missed (the check
  panel and the result), "Add the difference" closes it in one click,
  and lines left out to match the total are shown until confirmed.

Verification:
- `tsc -b`, `eslint . --max-warnings=0`, `prettier --check .`,
  `vitest run` (913 tests, 1 skipped) and `npm run build` pass; the
  request-privacy scans (`check-requests.mjs`) pass, with logs in
  `docs/milestones/milestone-2-evidence/` and
  `docs/milestones/milestone-2-remediation-1-evidence/`.
- `app`, `workflow-conformance` and `pr-title` are green on GitHub
  (PR #6).
- M2: implementation review round 1 REVISE, round 2 APPROVE; technical
  approval `24e8227`. The child: two REVISE rounds, then APPROVE;
  technical approval `ca2bf35`.
- Functional review: M2 round 1 found four real-receipt defects (F-I-1 to
  F-I-4), deferred to the child. The child's checklist (`ff03b38`) and
  M2's round 2 (`e84f0f6`) passed; the user accepted both.

Carried forward (not blockers):
- **Switch the built-in reader to PaddleOCR** (the user's decision,
  2026-09-29). It was meant to be M2's next remediation child; it's now
  M2.5. A local spike (branch `spike/paddleocr`, not pushed:
  `ppu-paddle-ocr` with ONNX Runtime Web, PP-OCRv5 mobile models, about
  13 MB, MIT and Apache-2.0) scored lidl1 44 %, lidl2 73 %, lidl3 all 5
  items, Continente 94 % and Tiffosi 100 %, against Tesseract's accepted
  floors (Continente 56 %, Lidl 11–22 %; the plan's targets were 75 % and
  60 %), with cleaner names and 0.5–2 s per read on the desktop.
- Two requests from the same session, for later: a row-by-row review of
  what the reader found (the receipt image with each line's role, and
  adding a missed line), and remembering the user's corrections on the
  device.
- Workflow defect: `request_plan_amendment` accepts only checkpoint ids
  shaped `CP<digits>[A-Z]?`, so a remediation child's `M2R1-CP*`
  checkpoints can't be amended (also in workflow 2.6.0).
- **The phone reading time** (R21: a 12.6-MP photo within 60 s, a small
  screenshot within 20 s) was waived for Tesseract, to be measured on
  PaddleOCR's reader.
- O-EXT-1 (M2's review): the saved receipt summary isn't bound to the
  bill it came from; future hardening.
- "Matches after leaving out N lines…" and its buttons aren't reached by
  any sample receipt; they're covered by `SplitPage.review.test.tsx`.
- Not in M2: cropping and perspective correction, handwriting, currency
  conversion, offline caching of the reader (M6).

## Current blockers

None.

## Active plan

`docs/milestones/milestone-2-5-PLAN.md` (revision 6). M2's plans are archived at
`docs/milestones/completed/milestone-2-PLAN.md` and
`docs/milestones/completed/milestone-2-remediation-1-PLAN.md` (M0's and
M1's are in the same folder).

## Functional review checklist

None. M2's round-2 checklist is in commit `e84f0f6`, the remediation
child's in `ff03b38`, and M2's round 1 in `4b75b09`.

<!--
This file is `workflow_state.FUNCTIONAL_CHECKLIST_PATH`. It is
repository-local state: workflow-manager generates it once at bootstrap and
never overwrites it on update.
-->
