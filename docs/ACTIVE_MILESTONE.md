# Active Milestone

## Milestone

**M2.5 — Accurate receipt reading** (work item `milestone-2-5`, plan
revision 6, `docs/milestones/milestone-2-5-PLAN.md`), on
`feature/milestone-2.5` (PR #9). Phase `IMPLEMENTING`.

## Next action

**CP3 is done** (the user accepted its plateau, 2026-10-03). Before CP4:
a plan revision (`/milestone-plan milestone-2-5`), agreed with the user,
turning CP4's small-image advice into a photo quality check (text size
from the detection boxes before reading, then blur, lighting and framing,
and the PDF export tip for app receipts), and setting CP6's targets to
the receipts the user can collect. Then the held-out receipts (P14).

## Checkpoints

- [x] **CP1** — the local test set (format v2) and the accuracy measure,
  in Node and a real browser, with the Tesseract baseline.
- [x] **CP2** — the PaddleOCR reader (behind a build flag; Tesseract is
  still the default).
- [x] **CP3** — tuning on the local set (plateau accepted at 83–89 %).
- [ ] CP4 — corpus, small-image advice, Tesseract retired.
- [ ] CP5 — the row-by-row review.
- [ ] CP6 — acceptance measurement, phone, privacy, documentation.

### CP3 — done

**The user's decision (2026-10-03): the plateau is accepted** at Node 15
of 18 (83.3 %), browser 16 and 14 of 18, rows 96 %, 0 false matches,
below the 94 % target. The failures left are OCR on the narrowest images
(doc3, doc5: 540 px) and boutique's missed name line; the photo quality
check in the revised CP4 is the answer to the first.

The set: 11 images, 10 distinct receipts, all tuning (two Lidl photos
added on 2026-10-01, `lidl-foto1` and `lidl-foto2`, both `shared`).
Starting point with PaddleOCR: 4 of 11 in the browser (36.4 %), rows
41.9 %, no false match.

Kept, each measured in Node and confirmed in the browser:

| # | change | browser receipts | browser rows | gained |
|---|---|---|---|---|
| 1 | Line grouping corrected for the page's slope (a photo at an angle), rows no longer growing into their neighbours | 4 → 5 of 11 | 41.9 → 48.4 % | lidl-foto1 |
| 2 | A VAT rate printed against the quantity (`23%3`) is two tokens | 5 → 6 of 11 (54.5 %) | 48.4 → 50.5 % (51.6 % re-scored) | sushi1 |
| 3 | German and Italian totals, payments and tax-table words; a quantity line printed **above** its item (`6 X 0,22` / `ACQUA 1,32`, weights too, `0,5484kg`) completes it when the arithmetic agrees, and a unit-price-only line no longer replaces the price of an already priced item above it (`MERLOT 1,39` became 2,49); a later total after a bill-level discount wins (`Summe 34,97`, `-0,88`, `Summe 34,09`) | 6 of 11 (unchanged) | 51.6 → 53.8 % (lidl1/lidl2, a row or two, within the run-to-run noise) | extra set 1 → 4 of 9 |
| 4 | A box taller than two lines is read again on its own, enlarged (`splitTall`), keeping only parts inside it that no other box covers (`1.15` over two prices → `1,15`, `1,79`) | with 5: 6 → 7 of 11 (63.6 %) | 53.8 → 55.9 % | continente (with 5) |
| 5 | A name-only line takes the price on the line under it (`BOCADOS HEURA` / `04 8,08`) | see 4 | see 4 | continente |
| 6 | P9's code-then-description layout (`1792212 1 23,0% 153,30` / description, attribute lines after); the first word of a longer total phrase one substitution off (`Totai do documento`) | 7 of 11 | 55.9 → 57.0 % | boutique gets its price and total; its name only when the detector sees the line (1 run in 4) |
| 7 | A price with its tax code glued on and read as a digit, after another amount (`Deposito 0.20 0.201`) | 7 of 11, 0 false (two runs) | 57.0 / 55.9 % | removes a false match (below) |

False matches: 0 throughout. Tried and not kept: per-box recognition
(4 → 2), a larger detection input, space recovery, smaller box padding
(each made a receipt fail), a lower confidence cut-off (no change);
enlarging narrow screenshots and reading them in strips (P8's upscaling
and tiling, the user's "cut it in pieces"): lines separate better, but the
enlarged blur loses the spaces between words and some amounts, so lidl1–3
read worse; removed. With no receipt gained in the browser: `s` → `5`
after a number's last digit (`o,3s` → `0,35`; gains lidl3 in Node, not in
the browser, which misreads that receipt's first price), and total and
payment keywords misread by one letter (`NULTIBANCO`, `Totai`).

**The user's decision (2026-10-01): a missing number doesn't fail a
name.** `Deposito` is recognisable for `Deposito 0.10` (Portugal's
deposit on bottles and cans); a *different* number still fails
(`Deposito 0.20`). This replaces CP1's rule that every number must be
read. Re-scored from the saved reports: no recorded receipt count changes
(change 2's browser rows 50.5 → 51.6 %); CP1's Tesseract reports predate
the saved rows and are re-measured at CP3's end.

What still fails, and why (browser):
- **lidl1, lidl2, lidl3**: 223–261-px-wide copies of app screenshots, too
  small to read reliably at their size or enlarged (P11's case: the
  advice to send a full-resolution screenshot).
- **boutique**: the OCR drops the item's description line, and the fiscal
  QR code isn't read from the photo.
- **continente**: the detector draws one box over two prices, losing one
  row, and most of a `2 X 4,04` quantity line.

**An extra set (the user's decision, 2026-10-01): receipts from
elsewhere, reported beside the set, never counted** in its totals, its
94 % or its 30 receipts (`"part": "extra"`). Nine freely licensed photos
from Wikimedia Commons (public domain, CC0, CC BY, CC BY-SA), local only,
each expected file naming its source and licence: an Italian supermarket,
four German receipts (a restaurant, a pet shop with a bill-level VAT
discount, a supermarket with weighed items, a crumpled museum-shop
receipt), and four from the US (a dollar store with sub-cent prices and
sales tax, three restaurants with sales tax). None from Portugal exists
there. First numbers (browser): 1 of 9 with no edit (Node: 2 of 9), no
false match. Most fail because the parser doesn't know their total words
(`Summe`, `TOTALE COMPLESSIVO`): the next general change to try. A change
made for them is kept only if the set itself doesn't fall. After
change 3 (2026-10-02): **4 of 9 in the browser (Node: 5 of 9)**, extra
rows 19 → 6, no false match; augustiner, fressnapf and the Italian
supermarket read fully. Still failing: bauhaus (crumpled, unreadable),
99cents (sub-cent prices, `1@ .9999`), harpoon (blurred), real (the
browser misreads `1,70` as `6:78`), orodinapoli (browser only).

**Plateau (2026-10-02).** Two browser runs after change 7: **7 of 11
(63.6 %), distinct receipts 7 of 10, rows 55.9–57.0 %, prices 72.0 %,
check "match" 8 of 11, false matches 0**; Node the same (7 of 11). Extra
set: 4 of 9 (Node 5 of 9), no false match. What still fails can't be
fixed in the parser:
- **lidl1, lidl2, lidl3**: 223–261-px-wide app screenshots; text 12 px
  high misreads (`1,74` → `174A`, `0,35` → `0,15`, `Total` → `Toiul`).
  P11's answer is the advice to send a full-resolution screenshot (CP4).
- **boutique**: the detector misses the description line (and `Total a
  pagar`, the tax table) in most runs. A smaller vertical box padding
  (0.2) or a native-size detection input (1600) finds it, but each
  breaks other receipts (jackjone, lidl-foto2, the Italian one; 1600 a
  false match too), as in CP3's first attempts. Its price and total are
  right; the name shows as `Marca : TH Watches`, to be corrected.

**Seven more Lidl receipts (2026-10-02), `lidl4`–`lidl10`, tuning
cases**, expected files drafted from the images and checked against each
receipt's own VAT table and total (local only). Sent as WhatsApp
documents, they are still 225–270 × ~1600 px: the files were that small
on the phone, so WhatsApp's photo compression isn't the cause. Node: **0
of 7**; the set falls to **7 of 18 (38.9 %)**, rows 49.4 %, prices 66.2 %,
no false match. The parser reads their structure (quantities `1,74 x 4`,
weights, totals, the VAT table); the OCR misreads digits at this size
(`6,96` → `8,96`, `0,40` → `0.10`, `1,49` → `1.42`, `6,58` → `6,52`) and
names (lidl9: every price right, `FOLHADO SALSICHA` → `FOLADO
SAISTCIA`). Where the small images come from is open with the user.

**A Lidl Plus PDF (2026-10-03), `lidl_pdf1`.** The app's PDF export
has a full text layer (iText), so it's read with no OCR (D6): **21 of
21 rows, total and check right, no edit, 0.4 s** in the browser, and the
same in Node. The local set now takes PDF cases (`imageType: 'pdf'`; the
diagnostic skips them, having no OCR to show).

**The cause of the small Lidl images (2026-10-03).** The Lidl Plus
app's "share" gives a full-size image (`lidl_as_doc1`: 892 × 5120 px);
the small copies came from saving the received picture by hand, which
shrank it. Full size, sent as a WhatsApp document: **no edit needed**,
2 of 2 rows, the check matches, OCR confidence 96–100 (the small copies:
66–90), 9.1 s in the browser. One short receipt so far; the full-size
`lidl1`–`lidl10` are on their way.

**Full-size Lidl images replace the small copies (2026-10-03).** The
user set aside `lidl1`–`lidl10` (their expected files moved to
`fixtures/local/small-copies/`, kept) and added `lidl_as_doc2`–`9`, the
Lidl Plus "share" images sent as WhatsApp documents (540–892 px wide):
doc4, doc7 and doc9 are lidl5, lidl1 and lidl2 (their expected files
reused), doc6 is doc1 again (`sameReceiptAs`), doc2, doc3, doc5 and doc8
are new (drafted from the images, each checked against its total). The
crisp images showed three errors in names drafted from the small copies
(`PASTEL DE NATA 58GR`, `PLENO TISANAS`), corrected.

| # | change | Node receipts | browser receipts (two runs) | rows | gained |
|---|---|---|---|---|---|
| – | the set as above, before 8–9 | – | 11 of 18 (61.1 %), **1 false match** | 92.7 % | – |
| 8 | A weighed item's weight line printed under it (`ESPETADAS 2,66` / `0,190 kg × 13,99 EUR/kg`) completes it when the arithmetic agrees, so the promotion under it is the item's, not the bill's (the false match); `EUR/kg` is a unit marker | 15 of 18 | 16 and 14 of 18 | 96.1–96.6 % | doc2 |
| 9 | A tax code glued to the line's last price (`2,69A`) and a quote mark before a price (`'3,29`) | (with 8) | (with 8) | (with 8) | doc7 |

**Now: Node 15 of 18 (83.3 %), browser 16 and 14 of 18 (88.9 %, 77.8 %),
rows 96 %, prices 97–98 %, precision 97–98 %, false matches 0** (three
runs). Failing: **doc3 and doc5**, the two 540-px-wide images, on digits
the OCR misreads (`4,99` → `1,99`, `6,95` → `6,55`, `1,19` → `1,1S`,
the total `66,51` → `65,51`); boutique (its name line, as before); doc9
in one browser run of two.

**Browser readings vary from run to run** on the small screenshots
(lidl3: three runs, three outcomes, one fully right). One reading gave a
**false match** that the committed parser gives too: the promotion
`0,35` read as `0,15` exactly offset a `Deposito 0.20` line lost to a
glued tax code, and R22's cut closed the QR total. Change 7 reads that
line; the coincidence of two offsetting misreads remains possible in
principle on very small images.

**More numbers in the report (2026-10-02)**, after the review of an
outside receipt-parsing proposal: beside row accuracy (price **and**
recognisable name), the set now reports `priceRowAccuracy` (expected rows
whose price was read, names aside), `rowPrecision` (read rows that pair
an expected row: 1 − the false-item rate) and `checkMatches` (images
whose check says "match"). Browser, after change 3: the set **rows 53.8 %
but prices 68.8 %**, precision 58.8 %, check 6 of 11; extra rows 39.6 %,
prices 43.8 %, precision 76.0 %, check 5 of 9. So about 15 points of the
set's rows are lost to names, not amounts; the false items are mostly
the three small Lidl screenshots. Quantities aren't scored: the expected
files (P1) don't record them.

Tools: `scripts/diag-lines.mjs` shows what the browser reads, line by
line, for chosen cases (receipt text, so to the git-ignored
`.ai-review/` only). `measure-local.mjs` now waits until the saved bill
is stable before reading it (one run had read the bill before the app
saved it).

Note: two browser runs of the same build gave lidl1 and lidl2 a row or two
apart; per-case pass/fail didn't change.

### CP2 — done

- `paddleEngine.ts`: PaddleOCR (`ppu-paddle-ocr` 6.6.0, its `web` entry)
  on ONNX Runtime Web 1.30.0's plain wasm build, single-threaded
  (`numThreads = 1`, `executionProviders: ['wasm']`, no WebGPU), the
  result cache off (`noCache`). It takes the models as same-origin URLs,
  which the library fetches (the app's code still opens no network
  channel), or as bytes in Node.
- `paddle.worker.ts` (a module worker) and `paddleReader.ts` (id
  `paddle`): the models load once, on the first scan (`loadingReader`),
  pages go to the worker as transferred copies, progress per page; a
  failed load is `assetsUnavailable`, a failed read `ocrFailed`;
  cancelling or any failure terminates the worker and the next scan
  starts a new one; a PDF text layer is parsed with no OCR.
- `paddleLines.ts` (P7, pure): boxes into lines by vertical overlap, left
  to right, the weakest confidence, number repair, and an optional wide-gap
  marker (off; CP3 decides).
- `browserImport.ts`: `VITE_RECEIPT_READER=paddle` builds with PaddleOCR;
  Tesseract stays the default (P10).
- `vite.config.ts`: `onnxruntime-web` resolves to its wasm-only build in
  the app build, and workers are ES modules. `scripts/check-build.mjs`
  (in CI after both builds): `dist/` holds exactly one ONNX Runtime wasm,
  `vendor/ort/ort-wasm-simd-threaded.wasm`.
- `scripts/vendor-paddle.mjs` (after `vendor-assets.mjs`, and as
  `pretest`): copies only ONNX Runtime's plain SIMD `.mjs` and `.wasm`;
  downloads the PP-OCRv5 mobile detection model, the PP-OCRv5 Latin
  recognition model, its dictionary and the mirror's licence, pinned to
  revision `bf1d5edb0335d3262be7caf13f766ba274b4cadd` and a SHA-256 each,
  cached in the git-ignored `app/.paddle-models/` (and by
  `actions/cache` in CI, keyed on the script). Licence notices for ONNX
  Runtime and the models go to `vendor/licenses/`
  (`THIRD_PARTY_NOTICES.md` is CP6's).
- Node route (`importDeps.node.ts`): the same engine in-process, the
  models from `public/vendor/paddle/`, `@napi-rs/canvas` (dev dependency,
  MIT) as ppu-ocv's canvas, still offline. The local test and
  `measure-node.mjs` read with PaddleOCR (`--reader tesseract` to
  compare); `measure-local.mjs` gained `--warm` and `--time`.
- The corpus is also read with PaddleOCR in Node, recorded and not yet
  enforced: **10 of 13** meet their expected check (02, 03 and 12 miss).

**Licences (for CP6's ADR).** ppu-paddle-ocr 6.6.0 MIT; ppu-ocv 4.0.0
MIT (its canvas-only entry in the browser: OpenCV.js, which it installs,
is never bundled); onnxruntime-web 1.30.0 MIT (no licence file in the
package: a generated notice); the models are PaddleOCR's (Apache-2.0),
converted to ONNX and served by the ppu-paddle-ocr mirror on Hugging
Face, whose licence is Apache-2.0 (its `LICENSE` at the pinned revision
is vendored). Dev only: @napi-rs/canvas 1.0.9 MIT, jpeg-js BSD-3-Clause.
All permissive.

**Download (P12).** A first scan fetches 27.18 MB raw (15.57 MB
gzipped): the runtime wasm 14.24 MB, the detection model 4.75 MB, the
recognition model 8.07 MB, and about 0.1 MB of loader, dictionary and
JS. Within the 30 MB budget.

**Privacy and CSP.** With the flag on, `check-requests.mjs scan` passes on
`sample-1.jpg` (5 items, QR total) and `sample-12.jpg` (6 items, QR
total): 19 same-origin GETs each, the models and runtime fetched from the
worker, no CSP violation, under the production policy unchanged. Logs in
the git-ignored `.ai-review/cp2/`.

**PaddleOCR's first numbers (no tuning)**, all 9 tuning cases:

| case | Node: rows paired / expected (extra) | Node: no edit | browser: rows paired (extra) | browser: check | browser: no edit |
|---|---|---|---|---|---|
| boutique | 0 / 1 (1) | no | 0 / 1 (1) | no total | no |
| continente | 9 / 14 (3) | no | 9 / 14 (3) | mismatch | no |
| jackjone | 1 / 1 | **yes** | 1 / 1 | match | **yes** |
| lidl1 | 5 / 25 (17) | no | 6 / 25 (16) | mismatch | no |
| lidl2 | 7 / 29 (13) | no | 8 / 29 (14) | mismatch | no |
| lidl3 | 2 / 5 (4) | no | 2 / 5 (3) | mismatch | no |
| sushi1 | 2 / 3 (1) | no | 2 / 3 (1) | match | no |
| sushi2 (= sushi1) | 3 / 3 | **yes** | 3 / 3 | match | **yes** |
| tiffosi | 5 / 5 | **yes** | 5 / 5 | match | **yes** |

| measure | Tesseract (browser) | PaddleOCR, Node | PaddleOCR, browser |
|---|---|---|---|
| receipt accuracy | 0 / 9 | 3 / 9 (33 %) | 3 / 9 (33 %) |
| distinct-receipt accuracy | 0 / 8 | 2 / 8 | 2 / 8 |
| row accuracy | 14.0 % | 39.5 % | 41.9 % |
| extra rows | 55 | 39 | 38 |
| name accuracy | 75.0 % | 64.7 % | 58.3 % |
| false matches | 0 | 0 | 0 |

**Node against the browser.** The browser can't expose the worker's
lines, so the comparison is of the imported rows (name and price, in
order), the parser's output from those lines: identical on 5 cases
(boutique, jackjone, sushi1, sushi2, tiffosi), different on 4 (continente
3 rows, lidl1 13, lidl2 20, lidl3 4). **Cause found: canvas resampling.**
On the lossless PNG copies of those four the rows still differ, so it
isn't JPEG decoding; changing Node's canvas smoothing changes what is
read, so the scale-downs PaddleOCR does with `drawImage` (the detector's
input, every 48-px-high crop) feed recognition, and `@napi-rs/canvas`'s
resampling isn't Chromium's (no smoothing setting matches). It shows on
the 223–261-px screenshots and the one creased photo. The totals agree
(3 of 9 either way), but per case the Node test can't stand in for the
browser: the browser stays the reference (P3), and CP3 confirms every
kept change in the browser, as planned.

**Speed (P13): over the engineering gate.** Times from choosing the file
to the check panel, desktop headless Brave, the reader already loaded:

| image | warm | first scan (models loaded) |
|---|---|---|
| (a) no camera original in the set yet; a 12-MP proxy (Tiffosi upscaled to 3000 × 4000) | **8.0 s** (gate 5 s) | 9.0 s |
| (b) Tiffosi as received, 3.1 MP | 6.3 s | 7.1 s |
| (c) lidl1, 223 × 1600 | 7.5 s | 8.1 s |

Almost all of it is recognition: about 50 ms per text box on one thread
(lidl1 has 160 boxes: detection 0.2 s, recognition about 8 s); decoding,
the QR scan and the conversion take milliseconds. Batched recognition and
the cross-line strategy didn't help. The spike's 0.5–2 s most likely ran
on WebGPU, which P4 rules out. A phone typically 3–8× slower would put
(c) well over its 10 s. This is a stop condition (P13): the user decides.

**The user's decision (2026-10-01): accuracy before speed.** Reading
every item and its price correctly (P2's 94–100 %) matters more than
speed; a receipt taking **20–30 s** to read is acceptable. So:
- P13's desktop engineering gate (5 s) is waived, and the phone
  thresholds become **up to 30 s** for the whole import, for images (a),
  (b) and (c) alike (instead of 20 s and 10 s). CP6 still measures and
  reports them, with the first load separately.
- CP3 may keep a change that makes reading slower when it raises
  accuracy, as long as the phone stays within 30 s. Speed-ups (threads,
  a lighter model, WebGPU) aren't pursued now.
- Unchanged: P12's 30 MB download budget, single-threaded ONNX Runtime
  with no WebGPU (P4), and the accuracy targets.

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

**The user's decisions (2026-10-01).** The expected files stand as
drafted: prices after each row's own promotion, the description (not the
code column) as the name, and the two croissant lines are the same
product. The name rule **stays strict**: a row's name must be one a
person can recognise, so the distinctive-word allowance (max(1,
⌊length/4⌋)) is kept even where it rejects 2-error OCR noise on a 6–7
letter word. Captures confirmed: the Lidl cases are app screenshots; all
the others are phone photos sent through WhatsApp (`shared`).

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
- **Promotion lines, for a later plan** (the user, 2026-10-01): when a
  receipt prints a promotion or savings line, the row-by-row review could
  ask whether it's only informative or should come off the item's price.
  Today R8 decides with the trusted total. Not in M2.5's plan.
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
