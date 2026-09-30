# Milestone 2, remediation 1 — Reading real receipts: execution plan (Revision 12)

- **Work item:** `milestone-2-remediation-1` (product, governing workflow
  version `2.1`), a remediation child of `milestone-2`, created by
  `/apply-functional-review`'s broad branch for M2's functional review
  round 1.
- **Plan revision:** 12 (revisions 2, 3 and 4 apply local plan review
  rounds 1, 2 and 3; revision 5 applies the manual external plan review,
  round 1, and local round 4's optional findings; revision 6 applies local
  round 5, which confirmed the manual external review of revision 5;
  revision 7 applies local round 6; revision 8 is the user's own change
  after reading the Lidl spike transcripts, R23; revision 9 applies
  local round 7; revision 10 applies local round 8; revision 11 applies
  the manual external plan review, round 2, and local round 9's optional
  findings; revision 12 applies local round 10; see "Review
  dispositions")
- **Base commit:** `4b75b092804be374ae7ebd0e0d1d9e8ef4efb3af` (M2's
  checklist-evidence commit, implementation revision 2, after M2's
  technical approval `24e8227`)
- **Branch / PR:** `feature/milestone-2`, PR #6. This child finishes M2's
  scope, so it lands on M2's branch and M2's PR. M2 can't be accepted until
  this child is (`IncompleteChildWorkItemError`).
- **Registry:** `docs/ai-workflow/registry/milestone-2-remediation-1-registry.json`
- **Requirement mapping:** `docs/ai-workflow/requirements/milestone-2-remediation-1-mapping.json`
- **Artifact declarations:** `docs/ai-workflow/registry/milestone-2-remediation-1-artifacts.json`
- **Parent plan:** `docs/milestones/milestone-2-PLAN.md` (revision 10). Its
  decisions D1–D18 and parsing rules stay in force except where this plan
  changes them by name.

## Goal

The user tested M2 on five real receipts: three Lidl Plus app receipts
(screenshots 223–261 px wide) and two WhatsApp photos of paper receipts on
a table (Continente and Tiffosi). Three gave no items at all, and
Continente gave 5 items worth 8,71 € out of 51,25 €. The findings (in
`docs/ACTIVE_MILESTONE.md`, "Functional review, round 1"):

- **F-I-1** Lidl app receipts: no items.
- **F-I-2** Tiffosi photo: no items.
- **F-I-3** Continente photo: severely under-read, and an incomplete
  import can be split without any extra step.
- **F-I-4** The sample corpus doesn't represent the receipts people
  actually share.

After this child:

- a small, low-resolution receipt screenshot and a phone photo of a
  receipt on a table are read well enough to give a useful item list;
- the parser reads the Portuguese supermarket and shop layouts seen in
  these receipts;
- a gap between the items and the receipt total can't be missed, in the
  check panel **and** in the result, and closing it takes one click;
- lines the import leaves out to match the receipt's total are shown,
  in the check panel and in the result, until the user confirms they
  aren't items or puts them back (R24);
- the committed corpus has synthetic receipts in the three new layouts,
  tested in CI, and the five real receipts are regression fixtures **on
  the user's machine only**.

## Evidence (reproduced before planning)

Reproduced offline on the base commit with the real Tesseract.js 7, the
real parser and the real zxing-wasm, then tried variants with the
Tesseract 5.5.3 CLI and the same `por`/`eng` `best_int` models:

| Receipt | Today | Cause | What fixed it in the spike |
|---------|-------|-------|----------------------------|
| Lidl ×3 (223–261 × 1600 px) | Line confidences 0–50, no items | Text about 5–6 px tall. D10 doesn't enlarge the page: doubling the short side would take the long side past 2400 px. | Scaling ×4 (892 × 6400 px): amounts mostly right, names partly garbled. |
| Continente photo (1536 × 2048) | 5 items, 8,71 €; `TOTAL A PAGAR 51,25` read as `51,0` | The grey table, paper texture and shading. Tesseract splits the right-hand amount column off as a separate block. | Illumination flattening (the grayscale page divided by a heavily blurred copy of itself), no cropping: 12 of the 14 item lines and `TOTAL A PAGAR 51,25` read. The other two sit on folds in the paper and stayed unreadable at every scale tried (×1, ×1.5, ×2): `BEB SOJA … 2,69` lost its amount, and `BOCADOS …` / `2 X 4,04 8,08` came out as noise. Those two are 10,77 €, so about **79 %** of the total is readable with a perfect parser. |
| Tiffosi photo (1536 × 2048) | Noise lines, no items | Same as Continente. | Flattening alone: 4 of 5 items (the first lost its name line) and no amount under `Total (Euro):`. Flattening after enlarging ×2 (its text is about 16 px tall): **all 5 items** with their prices (19,99 + 17,99 + 17,99 + 19,99 + 0,15 = 76,11 €) and `76,11` under `Total (Euro):` (with a noise character before it). |

**Reading in strips** (revision 3): the same clean-up applied to
overlapping horizontal strips of the enlarged page (1800 px tall, 240 px
of overlap, each strip cropped from the source with a margin, enlarged,
flattened and read on its own; a line is kept only from the strip whose
own zone contains its centre) reads exactly as well as the whole page:
Tiffosi ×2 in 3 strips gives all five items with the right prices
(summing to the QR total, 76,11 €), Continente ×1.45 in 2 strips the same
12 of 14 lines as before, lidl1 ×4 in 5 strips the same lines as the
whole page, and no line appears twice. At ×1.38, the most a single
6-MP page allows for these photos, Tiffosi misread one price (`17,89`)
and lost the total's amount, so strips are what make its target
reachable. The spike's margin, own-zone placement and join order were
not recorded, and its script wasn't kept, so R20 below fixes them by rule
(revision 4). CP1's local-receipt measurement, which runs the real
reader, is what confirms the strip result.

These spike parameters were chosen by hand (×4, ×2, blur radius 25–50 px).
R1 and R2 below derive them from an estimate of the text size, which the
spike didn't implement, so CP1 measures the real clean-up on the local
receipts before the targets are relied on (see "Acceptance targets").

Then, the current parser run on the spike's improved transcripts:

- **Lidl:** no total found. `Total` was misread (`lozal`, `Tazal`,
  `Tu.ul`), so the IVA table and payment lines became items. On lidl1 the
  total line's amount was garbled too (`lozal (2,0%`), so no item equals
  the QR total there (R9 alone can't end the items; R18 can). The
  price-first quantity layout `1,74 x 7 12,16` isn't recognised.
- **Lidl footers (revision 8).** The three receipts print the same
  layout; only the OCR noise differs, because the text is about 5 px
  tall. The printed footer is always `Total <QR total>`, then a
  **separator row**, then `MULTIBANCO <QR total>`, then the tax-table
  header `Taxa Base Inc. Val.Total Val. IVA`. The separator was read on
  two of the three (lidl1 as `..... ......`, 11 dots with a space;
  lidl2 as `======`, 6 characters) and lost on lidl3. The ×4 transcripts read the `Total` line as
  `lozal (2,0%` (amount lost), `Tazal 78,77` (one digit wrong, QR
  76,77) and `Tu.ul 7.76` (right amount, four letters), and the
  `MULTIBANCO` line as `AULTEBANÇCO 73,0%`, `MULT IBANCO 76,77` and
  `MULTIBANCO 7,76`. The tax-table header survived on all three with at
  least two of R18's column words. Applying revision 7's rules to those
  transcripts by hand, as counts: the lines left in the item list after
  the last real item are 1 (lidl1, a deposit summary), 2 (lidl2, the
  `Total` and `MULTIBANCO` lines) and 1 (lidl3, the `Total` line).
  `totalLike` marks 0, 1 and 0 of them, `taxTable` 0, 0 and 0: the
  tax-table header ends the items before any tax-table row can become
  one. **So revision 7's R22 cut none of the three.** lidl2's `Tazal`
  line is kept because its amount is misread, and lidl3's `Tu.ul`
  isn't total-like and nothing follows it in the list, since the
  recognised `MULTIBANCO` ended the items. On lidl2 and lidl3 the
  leftover lines roughly double the items' sum. Neither separator
  counted as R18's separator row in revision 7's wording (lidl1's has a
  space, lidl2's is too short); with R18's spaces rule (revision 9)
  lidl1's does. **Bill-level discounts:** 1, 0 and 0 on the three
  transcripts. lidl1's is an orphaned `Promoção`-style negative line
  whose item above it wasn't read as an item, so rule 7 sent it to the
  bill discount (R22's step 2 then blocks every cut there). lidl1 can't be cut by
  any rule: its items are missing, not over-read. R23 uses what doesn't
  vary, the footer's layout, instead of how the words were garbled.
- **Continente:** 11 items. Missing: a quantity line with a dropped digit
  (`1X0,8 0,89`), lines with OCR noise after the amount. The unsigned
  `POUPANCA 0,60` lines were applied as item discounts, but on this
  receipt they're informational: the item prices already add up to the
  total (51,25 €), and `Total de descontos e poupancas 3,75` is their
  sum.
- **Tiffosi** (the flattened transcript, before enlarging): 4 items,
  with the barcode in the name (`5606324559542 / Polo S/S`). `Total
  (Euro):` has its amount on the next line (read only in the ×2
  transcript), so no total was found. `currencyHint` came out `USD` from a stray
  `$` in the OCR text.
- **The fiscal QR code decoded on all five** (75,68, 76,77, 7,76, 51,25
  and 76,11 €), so a trusted total is available for every one of them.

Timing (Tesseract CLI, one native thread): the ×4 Lidl page takes 3.4 s
(0.4 s at today's size), the flattened photo 1.5 s. The WebAssembly build
on a phone is several times slower. **The phone's slowdown hasn't been
measured**: 4× is an assumption, used only to set the development
machine's engineering budget (15 s for the photo read at ×2 in strips,
12.6 MP). At 4×, a small screenshot would take 10–20 s on a phone and
that photo about 40 s to a minute. What binds is a real phone
measurement (R21): CP1 asks the user for one, and the functional re-test
repeats it. The status line shows progress moving across the strips
(R20).

## Decisions taken in this plan

| # | Decision | Chosen | Changes |
|---|----------|--------|---------|
| R1 | Scaling by text size | Replace D10's page-size rule. Estimate the **text height** on a small working copy (the page scaled to at most 800 px on its long side, or left as is when smaller, so a 5-px screenshot's text isn't shrunk away): grayscale, a **coarse flatten** (R2 with a fixed radius of 1/20 of the copy's width), Otsu binarization, then the **median height of the connected dark components** that look like characters (height 3–200 px, width at most 3× their height, and not touching the border), scaled back to the page. Measuring characters rather than rows of pixels is what makes it hold up on a tilted photo (a 2° tilt smears a text row over about 20 px across 600 px, merging neighbouring rows) and on a dark table around the paper (whole bands of dark rows). Fewer than 20 such components means no estimate. Scale so the character height reaches a **target of 32 px** (Tesseract's comfortable range is roughly 20–40 px), but only when the estimate is under 24 px (enlarge) or over 64 px (shrink). The factor is clamped to 0.5–4. Memory is bounded **per strip** (R20), not per page, so the whole page is limited by reading time: **every** page, whatever its text size, is at most **14 megapixels** once scaled, and this limit wins over the thresholds and the clamp. So a page is also **shrunk** to 14 MP when it's larger, even when its text is already in the 24–64-px range; intake accepts up to 40 MP (`MAX_PIXELS`), and that needs at least ×0.59. Two more limits keep every strip within 6 MP (R20 derives the bound from them), and they also win over the thresholds: the scaled page is at most **4000 px wide**; and a page that is still over 6 MP after these limits (so it's read in strips) has its text brought down to at most **40 px**: a larger estimate is shrunk to the 32-px target, the factor going as low as 0.2 for this case only. The steps, in order: the thresholds and clamp give a factor; the 14-MP and 4000-px limits lower it; if the page is then over 6 MP with text over 40 px, the factor becomes 32 / estimate. If that would need a factor under 0.2, D10's fallback below applies instead. Examples: a 223 × 1600 screenshot gets the full ×4, 5.7 MP; a 1536 × 2048 photo with 16–22-px text gets ×1.45–2, 6.6–12.6 MP; a 3000 × 4000 camera photo with 40-px text is left as is (12 MP, in strips); the same photo with 64-px text is shrunk to 32-px text (×0.5, 3 MP, one strip); a 40-MP page is shrunk to 14 MP; a 4000 × 3000 landscape photo with 20-px text gets ×1 (the width limit), 12 MP. With no estimate (a blank or noisy page), D10's old rule applies (long side at most 2400 px, so at most 5.8 MP: always one strip). CP1 may tune the thresholds within 20–28 px (enlarge), 48–80 px (shrink) and 8–16 MP in all, keeping the whole corpus green, and records the final values. | D10 scaling |
| R2 | Illumination flattening | A new step after scaling and grayscale: divide each pixel by a **box-blurred copy** of the page (a blur radius r of 3× the scaled text height from R1, at least 15 px, or 1/20 of the page width with no estimate; three passes of a box blur approximate a Gaussian, computed in linear time with running sums, so an output pixel depends on inputs up to **3r** away: the blur's full support), then map the result to 0–255 by a **fixed** rule, `min(255, 255 × pixel / blurred)`, so the background, where the ratio is about 1, becomes white. The mapping uses no page or strip statistic, so a strip flattened with its margin (R20) gives exactly the whole page's **flattened** pixels. (The contrast stretch that follows is per strip, so the final pixels the OCR sees do differ between overlapping strips and from a whole-page clean-up. That's intended; the own-zone tests and CP1's local measurement are what show it's harmless.) Memory: today every step (`resize`, `toGrayscale`, `stretchContrast`, `rotate`) returns a full RGBA page, which for a 12-MP enlarged page would be 48 MB per copy. So the chain is **restructured around one 8-bit channel and strips** (R20). The page is converted to grayscale once, one byte per pixel. When R1's factor is 1 or more, that's done at the source resolution, and scaling happens per strip. When it's **below 1**, the source is resized and converted to grayscale in the same pass, straight to the final size, before anything else. Either way, no step works on more pixels than the smaller of the source and the final page, which is at most 14 MP. Straightening is applied to that plane. Its skew is estimated on R1's coarsely flattened 800-px working copy (the one the text-height estimate already builds), not on the raw page, so a dark table or a shading gradient can't take the text's place in `estimateSkew`'s Otsu split. Each strip is then cut from it, scaled (when the factor is over 1) on the **page's grid** (a strip is rows [a, b) of the scaled page, sampled with the page's own ratio from a crop with one extra source row on each side, so its pixels are exactly those rows of a whole scaled page, and its lines' boxes map back with the same ratio), flattened and contrast-stretched on its own (the 1st–99th percentile stretch uses **that strip's** histogram), and goes back to RGBA only inside the PNG encoder. A strip, **margin included**, is at most 6 MP (R20 derives this from R1's limits). The clean-up's own share per strip is about 6 MB of pixels plus one running-sum buffer of 4 bytes per strip pixel (at most 24 MB), and only one strip exists at a time. The whole main-thread working set is larger: the straightened page plane stays alive through the strip loop (up to 14 MB, and twice that while the full-page `rotate` builds its output, before any strip exists), and `encodePage` expands the strip to RGBA (24 MB for a 6-MP strip, plus the canvas's own copy in the browser). So the peak is roughly 14 + 6 + 24 + 24 ≈ 70 MB on the main thread, plus the OCR worker's own decoded copy of the strip. CP1 measures the real peak. The clean-up runs on the main thread (`builtInReader.ts` calls `encodePage(preprocess(source))` before handing the image to the OCR worker), so it becomes an async function that yields to the event loop between steps and between strips and checks the abort signal there, keeping the status line and Cancel responsive. CP1 records, on the development machine, the peak memory and each step's time for a 6-MP strip, and for the page-level steps too: the one-pass shrink and grayscale of a 40-MP source, the grayscale conversion and full-page `rotate` of a 14-MP page, and R1's estimate. Any step over 300 ms there is split into chunks of rows that yield. If that isn't enough for a strip step, the strip budget is lowered, at most down to R20's minimum strip. This removes shading, the table around the paper and the paper texture, which is what broke both photos. It runs on every page: on a clean scan it's close to a no-op. The contrast stretch then runs on the flattened page, as today. No cropping (the spike didn't need it, and perspective correction stays out of scope). | D10 order: (shrink, when R1's factor is below 1,) grayscale, straighten, then per strip: scale up, **flatten**, contrast |
| R3 | Price-first quantities | A new item form, `Name P x Q L` (Lidl: `Monster Ultra White 1,74 x 7 12,16`), accepted when `round(P × Q) = L`. The `x` also matches its usual OCR misreads (`X`, `×`, `*`, `a`, `s`), but only on a line where the arithmetic holds, so a stray letter can't create a quantity. | Rule 6 |
| R4 | Name line, then quantity line | Rule 6's "a quantity-only line completes the item line before it" is extended: a line with a description but **no amount**, followed by a quantity-only line (`2 X 6,50 13,00`, `1 X 0,89 0,89`), is one item. A quantity-only line whose unit price is unreadable (`1X0,8 0,89`) still completes it, as `1 × L` flagged `needsCheck`. A category header (`Padaria:`, a line ending in `:` with no amount) is never an item name. | Rule 6 |
| R5 | Codes in names | Removed from the item name: a leading tax code in brackets (`(A)`, `(C)`) or `NS`, and a leading barcode or article code of 8–14 digits (`5606324559542`). A following line that is only a code and a size (`71014475 C10 M`) is ignored. A bare leading letter (`A Vaca Que Ri`) is left in the name: it may be an article, and a stray code letter only costs a cosmetic character. | Rule 6 (the name) |
| R6 | Total on the next line | A *total* line with no amount, followed by a line that is only an amount, takes that amount (`Total (Euro):` / `76,11`). The same for *subtotal* and *tax summary*. | Rule 8 |
| R7 | Informational promotion lines | A line whose amounts are only inside brackets or form a formula (`Promoção (25.99-6.00)`) is ignored: it's never an item or a discount. | Rule 3 |
| R8 | Unsigned savings lines | Rule 7 applied a savings line under an item whether printed `-0,40` or `0,40`. Real receipts do both: Lidl prints `Promoção -2,45`, which **does** reduce the price; Continente prints `POUPANCA 0,60`, which is **already** in the price. So: a **negative** savings line reduces the item, as today. An **unsigned** one is recorded as a candidate, and the bill conversion decides with the trusted total, in R22's reconciliation: it applies all the unsigned candidates if that closes the total exactly, drops them all if that closes it, and otherwise applies them (today's behaviour) and the mismatch shows. With no trusted total, they're applied, as today. "Applied" means exactly rule 7: the item becomes `1 × (L − d)`, and a candidate larger than its item (Continente's `POUPANCA 1,75` under a 1,74 € item) goes to the bill discount instead. D13's tax/tip/discount combinations are part of the "closes" test (R22). | Rule 7, D13 |
| R9 | The trusted total ends the items | When the fiscal QR code gives a total, the parser found **no printed total**, and R22's cut conditions hold (the full list doesn't already close the total, the cut list closes exactly with no adjustment beyond a read bill-level discount, and **structural evidence** corroborates the cut: the matched line's label is total-like, or a dropped line looks like a tax table, R22), the item list is cut at the first item whose line total equals the QR total: that line and everything after it (IVA table, payment and deposit-summary lines the parser took for items) are dropped, because it's the total line with a garbled label. One exception: if that match is the **first** item, it's kept as the only item (a one-item receipt whose price is the total) and only what follows is dropped. The kept list must then close the QR total exactly with no adjustment (beyond a read bill-level discount, R22), or the cut isn't made. This runs in the bill conversion (it needs the QR code, which the reader doesn't see), so every reader gets it. It relies on the total's amount being read exactly; R18 covers the case where it wasn't. | D12, D13 |
| R10 | Currency | With any valid Portuguese fiscal QR code (mainland `I1`, the Azores `J1` or Madeira `K1`, all `PT`), the currency is EUR and no stray symbol can override it. Without one, a currency symbol or code counts only when it's attached to an amount token (`12,50 €`, `£3.20`), never a lone `$`. | D18 |
| R11 | Fuzzy total label | A line in or right after the items whose label is within one OCR edit of `total` (`t0tal`, `tota1`, `lotal`; exactly 5 letters, one substitution) and that carries an amount is treated as *total*. Kept deliberately narrow: `lozal`/`Tazal` (two edits) are left to R9. | Rule 3 |
| R12 | A gap can't pass silently | While the check panel shows a mismatch, the **result section** ("Who owes what") shows a notice above the totals: "⚠ These totals don't match the receipt: the items add up to X, Y less (or more) than the receipt's Z." with a link to the check panel. "Copy as text" adds the same line at the end. It's not a blocking error: a user may legitimately split only part of a receipt. While lines left out by a cut are unconfirmed (R24), R24's notice is shown too, also when the totals match. When both apply (a cut, then an edit that breaks the match), both lines are shown, this one first, and "Copy as text" adds both (revision 12). | D14, M1's result section |
| R13 | Close the gap in one click | When the items add up to **less** than the trusted total, the check panel offers a button: "Add the difference (Y) as an item". It adds one item, "Not read from the receipt", quantity 1, price Y, shared by everyone, flagged "Check" (D14's flag), and the panel then shows "Matches". That holds when the bill's tax and tip are none or fixed amounts, which is what an import produces (D13 applies adjustments only as fixed amounts that close the total). If the user has set a **percentage** tax or tip, adding Y would raise the total by more than Y, so the button isn't shown; the panel says instead: "Add the missing items, or change the tax or tip to an amount, to match the receipt." At the 100-item limit (`LIMITS.maxItems`) the button isn't shown either. It's never added automatically, with one exception (R14). Undo is ordinary editing: delete the item. | D14 |
| R14 | No items read, but a QR total | Today that's `noItems` and nothing is imported. Instead, with a trusted QR total and no items read, the import succeeds with a single flagged item, "Not read from the receipt", priced at the QR total and shared by everyone, and the panel says: "None of the items could be read. The receipt's total was added as one item: split it as it is, or type the items in." That sentence is the panel's status line, right under its heading, which already receives focus after an import, so a screen reader reads it first. Without a QR total, `noItems` stays. | D16 |
| R15 | Incomplete-read wording | When the coverage (R19, on the live bill) is under **80 %**, the panel's status line says "Only X of the receipt's Z was read. Add the missing items, or add the difference as one item." instead of the plain mismatch sentence. It's computed live from the check, like the mismatch itself, so it's never stored: the saved summary's format and its warning codes don't change. | D14 |
| R16 | Committed synthetic fixtures | Three new corpus receipts, generated by `make-sample-receipts.mjs` with invented merchants, items, NIFs (valid check digits) and QR codes (customer NIF `999999990`): **11** a narrow, low-resolution app receipt (Lidl-like layout: price-first quantities, negative `Promoção` lines, deposits, IVA table, rendered at about 230 px wide and passed through JPEG compression), **12** a supermarket photo (Continente-like: category headers, `(A)` codes, name-then-quantity lines, unsigned `POUPANCA` and `DESCONTO DIRETO` lines, composited on a grey textured background with a shading gradient, a 2° tilt and JPEG compression), **13** a clothes-shop photo (Tiffosi-like: barcode and name columns, two-line items, a `Promoção (a-b)` line, `Total (Euro):` with the amount on the next line). All three must reach "Matches" in the corpus test (CI). | M2 CP3's corpus |
| R17 | Real receipts, local only | The user's decision (2026-09-29): the five real receipts are regression fixtures **only on the user's machine**. They must never be committed, and committed checks detect any that is tracked, staged or reachable in history, so a violation can't progress unnoticed (the exact guarantee is stated below). They live in `app/src/features/receipt/fixtures/local/` (added to `app/.gitignore`), as PNG (converted from the JPEGs with `magick`, since the Node tests decode PNG only) plus a local `<name>.expected.json` (the QR total, the expected check, a minimum coverage). A new test file, `receipts.local.ocr.test.ts`, runs them with the real OCR and **skips** when the folder is empty or missing, as it is in CI. Two committed tests guard this. The first checks that `app/.gitignore` ignores that folder, which stops an ordinary `git add`. The second is the actual enforcement: **no path under the folder is tracked or staged** (`git ls-files -- app/src/features/receipt/fixtures/local/` is empty). A file added with `git add -f`, or tracked before the ignore rule, stays tracked despite `.gitignore`. That test fails on it, locally and in CI. A third committed test checks **history**: no commit reachable from any ref touches the folder (`git log --all --format=%H -- app/src/features/receipt/fixtures/local/` is empty), so a file committed and then deleted is still caught. The history check needs the whole history to mean anything: in a **shallow** repository (`git rev-parse --is-shallow-repository` is `true`) `git log --all` sees only the commits fetched, so it would pass on exactly the commit-then-delete case it exists for. So in a shallow repository the test **fails** and says why ("history check needs a full clone: `git fetch --unshallow`"); it never passes there. CI makes it meaningful: `app-ci.yml`'s checkout gets `fetch-depth: 0`, as `release.yml`'s already has, so CI has every branch and tag and their history. **What is enforced, stated exactly:** nothing under the folder is tracked, staged, or reachable in the repository's history. No test can stop a commit from being made (a test runs after it), so these are detection: locally whenever the test suite runs, which `npm run check` does before a push, and in CI after a push (with the full history). Whether to add a push-time guard is open question 7. **If a check ever fires:** the real receipt is in a commit, and the check stays red on every run until the history no longer has it; `app` is a required check, so the PR can't be merged meanwhile. The workflow never rewrites history (no amend, rebase or force-push, `CLAUDE.md`), so Claude stops and reports it, naming the commits. What happens next is the **user's** decision and action. If the commit hasn't been pushed, the user removes it locally (for example `git reset` to the commit before it, then recommitting the rest) before any push. If it has, the user rewrites the branch's history (for example `git filter-repo --path app/src/features/receipt/fixtures/local/ --invert-paths`) and force-pushes it themselves, and asks GitHub support to purge the PR's cached refs, since `refs/pull/<n>/head` keeps the old commit. The app README (CP3) states this procedure. The real OCR transcripts contain personal data too, so no full transcript, no local `.expected.json` and no personal identifier from the receipts (the customer NIF, card digits, the loyalty-card number the user's decision names) is committed either. Short layout excerpts (an item line's shape, a total's amount) appear in this plan's Evidence section as reproduced evidence; they carry none of those identifiers. The parser unit tests use invented lines with invented amounts in the same layouts. | M2 CP3 |
| R18 | More end-of-items signals | Two parser signals, added to rule 4's list of lines that end the items region: a **tax-table header** (a line with no amount made of the column titles `taxa`, `base`, `inc`, `iva`, `%iva`, `total liq`, `liq`, `valor`, `val`, `total`, at least two of them, such as `Taxa Base Inc. Val.Total Val. IVA` or `%IVA Total Liq. IVA Total`) **after at least one item** (a receipt's own column header above the items, such as `IVA DESCRICAO VALOR`, matches the same words and must not end anything), and a **separator row** (only `=`, `-`, `_`, `*` or `.`, and spaces between them; at least 8 of those characters, spaces not counted, so `..... ......` counts and `======` doesn't) after at least one item. Then one bill-conversion signal, in R22's reconciliation with R9, under the same cut conditions: with a QR total and no printed total, when the **running sum** of the items (after rule 7 and R8) first equals the QR total exactly at item k and there are items after k, and at least one of those later items carries R22's tax-table evidence, those later items are dropped. It doesn't fire when the sum only reaches the total at the last item, and it never drops items when the sum never equals the total. The QR-dependent decisions (R8's choice, R9 and this cut) live in one function, `reconcileWithTrustedTotal`, in `toBill.ts` (R22); the parser-only signals live in rule 4, in the parser. | Rule 4, D12 |
| R19 | Coverage | Two measures, for two purposes. **Local coverage** (the acceptance targets, on the five real receipts) counts only items **matched** to the receipt's expected list: each read item (after rule 7, R8 and R22; never R13's or R14's "Not read from the receipt" item) is matched to an expected item with the **same price** (line total), one to one: an expected item is used at most once, so a price read twice counts once. Local coverage is the sum of the matched items' line totals over the QR total, so it can't go over 100 %. The sum of the **unmatched** read items is recorded beside it: that's what the parser read that isn't an item (an un-cut tax-table row, a deposit summary, a garbled payment line) or an item read with a wrong price. Junk can never raise local coverage, however much of it R22 leaves in. The matching is a pure, committed function (`matchedCoverage`) with its own unit tests on invented values; the expected lists it's run against stay local. **In-app coverage** (R15's 80 %, on the live bill) is the sum of all items except the "Not read from the receipt" one, over the QR total: the app has no expected list. Un-cut junk **inflates** it, and can push it over 80 % (or the items' sum over the total) while real items are missing; the mismatch still shows either way (R12), only R15's wording differs. CP3 records, per real receipt, whether its unmatched sum would do that. | Acceptance targets, R15 |
| R20 | Reading in strips | A page whose scaled size is over **6 MP** is cleaned up and read in horizontal strips; a smaller one is one strip, as today (with no margin: it's the whole page). `planStrips` (pure) splits the scaled height into strips. Each overlaps the next by **8× the scaled text height** (at least 200 px), and flattening needs a **margin of 3r** above and below (R2's full blur support; at the page's top and bottom there's no margin, as on the whole page). A strip's rows, margin included, are at most `floor(6 MP / width)` and at most 1800 + 2 × 3r, but its **core** (the strip without its margin) is never shorter than 2× the overlap, so the strips always advance. **The bound, derived:** with the scaled text height t (and t ≥ 25, where the 200-px overlap floor doesn't apply), the smallest possible strip is its minimum core, 2 × 8t, plus its two margins, 2 × 9t, so **34t rows**. R1 guarantees that a page read in strips has t ≤ 40 and a width W ≤ 4000. So the minimum strip is at most 34 × 40 = 1360 rows, and 1360 × 4000 = 5.44 MP, within 6 MP. The budget `floor(6 MP / W)` is at least 1500 rows at W = 4000, above the 1360-row minimum, so the 6-MP budget can always be met. Every strip, margin included, is therefore **at most 6 MP**, over the whole allowed input range. A page of 6 MP or less is one strip, so it's within 6 MP too. The one lower limit is the **minimum strip**, 34t rows (for t < 25, 400 + 18t rows): the budget can be lowered for memory or time (R2), but never below it, because the overlap and margins are what make the own zones and the flattening correct. Each strip has an **own zone**. The own zones tile the page exactly, with no gap and no overlap, and each boundary between two strips sits in the **middle of their overlap**, so it's at least 4× the text height from both strips' edges. Any line whose centre is in a strip's own zone therefore lies wholly inside that strip, and a line a strip's edge cuts is never kept from that strip. Each strip is cut from the straightened plane with its margin, scaled, flattened, trimmed back to its core, contrast-stretched on its own histogram, and read by the same OCR worker. Every line Tesseract returns carries its bounding box (`linesOf` keeps `bbox`, mapped back to page coordinates). A line is kept only from the strip whose own zone contains its vertical centre, so no line is taken twice. **Join order:** strips in top-to-bottom order, and within each strip the lines in Tesseract's own order (block → paragraph → line), exactly as `linesOf` gives them today. Lines are never re-sorted by position, so a one-strip page gives exactly today's line sequence, and the corpus samples 01–10 see no change from the join. (On a strip boundary crossed by two Tesseract blocks, such as a name column and a split-off amount column, the result is each strip's names then its amounts. The whole page would give all the names, then all the amounts. The parser can't pair either sequence, so neither is worse.) Progress is reported per strip within the page, `(page + (strip + p) / strips) / pages`, so it moves steadily through a long read. | New (reader and clean-up) |
| R21 | Phone reading time | The 4× phone slowdown is an **assumption**, not evidence. The development machine's 15-s budget for the 12.6-MP photo stays as an engineering gate, but what binds is a phone measurement. At the end of CP1, the user times two reads on their own phone: the Tiffosi photo and lidl1, in the preview build served on the local network (`vite preview --host`, a fresh profile). The ratio to the development machine replaces the 4×, and the README's phone times (CP4) come from these measured times. Each measurement records its conditions so a later re-test is comparable: the phone model and browser, the image, the preview build's commit, whether the profile was cold (first read after loading) or warm, and the total read time. The phone acceptance threshold: the 12.6-MP photo read completes within **60 s** and a small screenshot within **20 s**. Over that is a stop condition. If the phone can't reach the preview build, CP1 records that, the same measurement and thresholds move to the user's functional re-test (M2's functional review), and a result over the threshold there blocks acceptance the same way. | New (acceptance) |
| R22 | Reconciliation with the trusted total | The QR-dependent decisions (R8's unsigned savings, R9's cut, R18's running-sum cut) are made in one stage, `reconcileWithTrustedTotal` in `toBill.ts`. It uses two kinds of evidence and keeps them apart. **Arithmetic evidence** (a list, or a prefix of it, closes the QR total) says which amounts add up; it can't say whether the lines after a prefix are receipt footer or real items paired with a discount the OCR never read. **Structural evidence** (what the dropped lines look like) is what says the lines after the cut aren't items. The parser records it on each item, since only the parser sees the text: `ParsedItem.endEvidence?: 'totalLike' \| 'taxTable'`. It's defined **only on lines that reach the item list**, which means lines rule 3 classified `item` (`classify` in `parseReceiptText.ts`: at least two letters, ending in an amount, not negative, and not matched by an earlier rule) inside the items region. `totalLike`: the item's description is **one word** of exactly 5 letters within **two** substitutions of `total` (`lozal`, `Tazal`), and nothing else besides amounts, rates, tax codes and currency marks. One substitution never reaches the list, since R11 already classifies it as a total. `taxTable`: the item line carries a rate token (`23%`, `6,0 %`, `13.0%`), or at least two of R18's column words. A rate line whose description is only tax words, with one or two amounts after the rate, never reaches the list either: it's already classified `tax` (`isTaxTable`). So `taxTable` marks what does get through: a tax-table row whose words the OCR garbled (`lVA 23% 10,00 2,30 12,30`, where `lva` isn't a tax word), or one with three or more amounts after its rate. **There's no payment evidence.** A line with a recognised payment phrase (`PAYMENT_WORDS`, `CARD_PAYMENT`, `CARD_ALONE`) is classified `ignore` and ends the items region (`classify`, and the region loop in `parse`), so it's never an item and no item follows it. A garbled payment line, the only kind that can become an item, doesn't match those phrases by definition. That behaviour is unchanged, and a recognised payment line needs no cut: it already ended the items. The stage tries candidate item lists in a fixed order and takes the **first that closes the trusted total exactly**. (1) The full item list, with R8's candidates applied, then dropped; D13's combinations are allowed. If either closes, it's used and nothing is cut: a list that already closes is never shortened. (2) The cuts are tried only when the trusted total is a QR total and the parser found no printed total. The **read bill-level discount** is defined per candidate list and per R8 variant (revision 10): the parser's `receipt.discount`, which holds only **negative** lines (an orphaned one, or one larger than its item, rule 7), plus, in the variant with R8's candidates **applied**, the overflow of each candidate larger than its item **on a kept item**. In the variant with the candidates dropped there is no candidate overflow, and a candidate on a dropped item contributes nothing in either variant. The parser never puts a candidate or its overflow into `receipt.discount`: a candidate stays on its item (`savingsCandidate`), and its overflow exists only when the bill conversion applies it. So an informational `POUPANCA 1,75` under a 1,74 € item (R8) is never subtracted from a list tried with the candidates dropped. **With no read bill-level discount** for that list and variant, a cut list must close the QR total exactly with no adjustment. **With one**, a cut list must close it exactly with that discount applied and no other adjustment (revision 9). This matters on Lidl receipts: a `Promoção` line whose item line above it wasn't read as an item (garbled, or a noise line in between) is sent to the bill discount by rule 7, and under revision 8's "no bill-level discount" it blocked every cut on that receipt (lidl1's transcript has one). It stays safe against the manual review's counterexamples: a list that closes whole with its discount is taken in step 1 and never cut, and a misread discount doesn't close a cut list either. Often an orphaned discount means its item was lost too, so the cut list won't close and the gap shows, as it should. Then R23's footer-anchor cut; then R9's cut, only when the matched item is `totalLike` or at least one dropped item after it is `taxTable`; and after it R18's running-sum cut, only when at least one dropped item is `taxTable`. Each is tried with the candidates applied and then dropped, and each must close the QR total with **no adjustment** (D13's empty combination) beyond the read bill-level discount, if any. (3) Otherwise it takes the full list with the candidates applied (today's behaviour), and the mismatch shows (R12, R15). What this guarantees: a cut needs both kinds of evidence, the arithmetic (the kept prefix closes exactly) and the structural (R23's anchor below the dropped lines, a total-like matched line, or a tax-table line in the dropped part). A receipt whose discount was read (items 10,00 + 5,00 + 5,00, discount 10,00, QR 10,00) closes in step 1 and is kept whole. A discount read with the wrong amount closes no cut list, so nothing is cut. A discount the OCR **missed entirely**, with only ordinary item lines after the match, has no structural evidence, so nothing is cut and the gap shows. What it doesn't guarantee: an unread discount **and** a line that looks structural could still cut. That line may be a garbled footer line that looks like a total or a tax-table row, or a real item that happens to look like one: a one-word item within two substitutions of `total` (`Natal 10,00`, a Christmas cake, as the matched line) or an item whose name carries a rate (`Iogurte 0% 1,20`, after the match). It needs an unread discount and a prefix that closes exactly as well, and it's the price of reading receipts whose total label is garbled at all (lidl1). **When a receipt has no structural evidence** (its footer lines reached the list with no rate token, no two column words and no total-like label), R22 cuts nothing: the footer junk stays as items, the items add up to more than the QR total, and the mismatch shows (R12) for the user to delete them. Local coverage (R19) isn't raised by that junk. The spike transcripts show the three Lidl receipts have almost none of this per-item evidence (Evidence, "Lidl footers"), which is why R23 adds the footer anchor. What CP1's real clean-up reads is still measured (CP1 and CP3, "Acceptance targets"). So neither the arithmetic nor the structure **alone** deletes items, and "Matches" only ever comes from a list that closes exactly, decided in this one stage. Because the residual above exists, a list closed **by a cut** is never presented as a plain "Matches": the stage returns the lines it left out, and R24 shows them until the user confirms them (revision 11). **Which discount, exactly** (revision 11, local round 9's optional findings): step 1's D13 `discount` uses the same per-variant definition as step 2 (the full list is one candidate list). Several unsigned savings lines under one item are summed into its one `savingsCandidate`, as rule 7 already lets a run of discount lines reduce one item. A negative line reduces its item when the parser reads it, whatever order the lines were printed in, so in the applied variant a candidate's overflow is measured against the item's price after its negative lines. A negative line larger than its item goes to `receipt.discount` (rule 7) with no record of its item, so it **always** counts, even when a cut drops that item. That asymmetry with a candidate on a dropped item is accepted: the lines a cut drops are footer lines, a `Promoção -x` directly under one is implausible, and the effect can only block a cut or allow one that still needs structural evidence and an exact close, which R24 then shows. | R8, R9, R18, D13 |
| R23 | The footer anchor | The Lidl footer's layout is stable even when its words aren't (Evidence, "Lidl footers"). The parser records **how the items region ended**, a receipt-level fact, since the line that ends it is never an item: `ParsedReceipt.itemsEndedBy?: 'taxTableHeader' \| 'separator' \| 'payment'`, set when the region was ended by R18's tax-table header, by R18's separator row, or by a recognised payment line (`PAYMENT_WORDS`, `CARD_PAYMENT`, `CARD_ALONE`), and absent for any other ending (a total, a subtotal, the end of the text). The separator is an anchor because the Lidl footer prints one between `Total` and `MULTIBANCO`: when the OCR reads it well enough for R18, it ends the items right after the `Total` line, and without it as an anchor R23 would then never fire. A third cut in R22's step 2, under the same conditions (a QR total, no printed total, and R22's discount rule), tried **before** R9's and R18's: when `itemsEndedBy` is set, look at the **last items** in the list, the ones directly above the anchor line. Walking back from the last, drop each item whose line total is **near the QR total**, at most **two** of them (the footer's `Total` and payment lines), and stop at the first that isn't. "Near" means equal, or the same number of digits with exactly **one digit different** (`78,77` against `76,77`: one misread digit). The kept list must then close the QR total exactly with no adjustment beyond a read bill-level discount (R22; tried with R8's candidates applied, then dropped), or nothing is cut. Both kinds of evidence are there: the arithmetic (what's left closes exactly) and the structure (the anchor line ends the items right below lines carrying the receipt's total). It doesn't depend on how `Total` or `Multibanco` came out. On the transcripts it would drop `Tazal 78,77` and `MULT IBANCO 76,77` on lidl2, and `Tu.ul 7.76` on lidl3, provided the real items above them are read (then they close; otherwise nothing is cut and the gap shows). It does nothing for lidl1. What it doesn't guarantee: a real last item priced within one digit of the whole receipt's total, directly above a payment line, a tax-table header or a separator row, together with a discount the OCR missed that exactly offsets it, would be dropped. As with R22's residual, that takes an unread discount **and** a prefix that closes exactly. **The separator makes the anchor common** (revision 10): many receipts, not only Lidl's, print a separator row under their items, so `itemsEndedBy` will often be set on ordinary receipts. That doesn't widen the residual's kind: R23 runs only in R22's step 2, which needs a QR total and **no printed total** found (an ordinary receipt whose `TOTAL` is read never reaches it), and a drop still needs a trailing item near the QR total and an exact close. It does mean the residual can occur on more receipts than Lidl's. When the residual happens, it isn't silent: an R23 cut, like any step-2 cut, is shown with the lines it left out until the user confirms them (R24). An example, pinned in CP2: items 4,00, 6,00 and 20,00, a separator row under them, a −20,00 discount the OCR missed, QR 10,00, no printed total. `20,00` is near `10,00` (four digits, one different) and `6,00` isn't (three digits), so R23 drops `20,00`, and 4,00 + 6,00 closes. | R22, R18 |
| R24 | A cut is shown until confirmed | Revision 11, from the manual external review's M-I-7. Every cut R22's step 2 makes (R23, R9 or R18) rests on structural evidence that a real item can also carry, plus an exact close that a missed discount can also produce (R22's and R23's residuals). So it can drop a real item and still close. A cut therefore never gives a plain "Matches". `reconcileWithTrustedTotal` returns the lines it left out, each as its name as read and its line total, in receipt order. `receiptToBill` records them in the summary as `removedLines?: { name: string; amount: Cents }[]`. The field is absent when nothing was cut: step 1 (the full list, with R8's choice) drops no item and never sets it. **Check panel:** R24 adds to the live check, never replaces it (revision 12, local round 10). While `removedLines` is present **and the check is `match`**, the status line says "Matches after leaving out N lines read below the items as the receipt's footer. Check they aren't items:". While it's present and the check is anything else (an edit after the import made it `mismatch` or `billInvalid`), the status line is the live one, exactly as without a cut (the mismatch with R13's button or sentence and R15's wording, or `billInvalid`'s), followed by "N lines were left out below the items as the receipt's footer. Check they aren't items:". Either way, each left-out line's name and amount follow as text, with two buttons. "They aren't items" removes `removedLines`, and the panel shows the ordinary "Matches". "Put them back" adds each line as an item (quantity 1, shared by everyone, flagged "Check") and removes `removedLines`; the panel then shows the mismatch they cause, with R13 and R15 as usual. "Put them back" isn't shown when the lines wouldn't all fit under `LIMITS.maxItems`; the listed names and amounts let the user type them in. **Result section:** while `removedLines` is present, R12's place shows "⚠ N lines were left out of this receipt to match its total. Check them before settling up.", with the same link to the check panel, and "Copy as text" adds that line. When the totals also differ, R12's gap line is shown as well, first, and copied as well: R24's line never hides the gap. Neither is blocking. Editing the items doesn't clear it: only the two buttons, a new import (which replaces the summary) or clearing the summary, as today (`updateSummary` in `SplitPage.tsx`). **Saved:** `removedLines` is saved with the summary, so a reload keeps the notice ("Migration"). `readSummary` reads a stored empty list (`removedLines: []`, which the app never writes) as **absent**, so "0 lines" can never be shown; a list that isn't a list of `{ name: string, amount: Cents }` drops the summary, like any other bad field (revision 12). This keeps REQ-6 as an unconditional guarantee: whatever the heuristics decide, a list they shortened is shown as shortened until the user says otherwise. | R12, R22, R23, D14, D15 |

## Acceptance targets

- **CI (committed):** the whole corpus, 01–10 and the new 11–13, passes
  its expected check with the new clean-up. Samples 01–10 keep their
  current result (the clean-up change must not regress them).
- **Local (the five real receipts, `receipts.local.ocr.test.ts`),**
  local coverage as defined in R19 (matched items only, so junk the parser
  took for items can't meet a target):
  - Tiffosi: "Matches" (demonstrated by the ×2 strip spike: all five
    item prices read and sum to the QR total; the parser rules are still
    to be built);
  - Continente: coverage of at least **75 %**, and every item it does
    read has the right price. The spike's ceiling is about 79 %: two
    lines sit on folds in the paper. The gap then shows, and R13 closes
    it;
  - each Lidl receipt: coverage of at least **60 %** (its text is about
    5 px tall; this is set from the ×4 spike and not yet demonstrated end
    to end);
  - all five: a non-empty item list and the QR total as the trusted
    total. (Closing a remaining gap with R13 is tested in CP4, with
    invented bills.)
  - each Lidl receipt: no footer line whose amount is near the QR total
    (R23's "near") is left in the item list. R23 cuts them when the items
    above close the total. When they don't (items missing, as on lidl1),
    nothing is cut, and the leftover lines and their sum are recorded as
    counts and amounts only. A Lidl receipt with such a line left in the
    list is a **stop condition**: the user decides whether to accept it
    (the footer lines stay, the mismatch shows, and local coverage is
    unaffected) or to improve further. A leftover line that isn't near
    the total (lidl1's deposit summary) only counts in the unmatched
    sum.
  The local `.expected.json` of each receipt holds its QR total, its item
  list (name and price, as printed) and the target, so local coverage can
  be matched and "every item read has the right price" checked. It's
  local only, like the images.
- **When the targets are checked:** CP1 ends by running the real clean-up
  (R1 and R2 as built, not hand-picked parameters) on the five local
  receipts and recording, for each, which item lines and totals the OCR
  now reads, against the spike above. For each Lidl receipt it also
  records, as counts only, whether the tax-table header, the separator
  row or the `MULTIBANCO` line was read well enough to anchor R23 (at
  least two of R18's column words, R18's separator row, or a recognised
  payment phrase), how many negative lines went to the bill discount,
  and how many lines
  between the last item and that anchor carry an amount near the QR
  total (a text check on the transcript, which needs no CP2 code). For
  each photo (Continente, Tiffosi) it counts the lines shaped like R18's
  separator row (spaces allowed) that sit **above** the last expected
  item line, since such a line would end the items early once CP2 is
  built (revision 10). A Lidl
  receipt with no anchor is reported then, before CP2 relies on it. CP3
  then checks the targets end to end, including whether R23 cut each
  Lidl footer. A target that isn't met at either point is a **stop condition**:
  report the numbers and the cause to the user, who decides whether to
  improve further or accept the measured result. The targets are never
  loosened silently.
- **Phone reading time (R21):** on the user's phone, the 12.6-MP photo
  read within 60 s and a small screenshot within 20 s, measured at the
  end of CP1 (or, if the phone can't reach the preview build then, in the
  functional re-test). This is an acceptance target like the others.
- The user's functional re-test (M2 checklist items 2, 7, 8, 9 and 11 and
  the five receipts) is the final check, in M2's functional review. It
  repeats the phone timing.

## Checkpoints

<!-- Generated by workflow_state.render_registry_markdown(registry); do not edit by hand. -->
| id | name | depends_on | complexity | session_target |
| --- | --- | --- | --- | --- |
| M2R1-CP1 | Image clean-up for screenshots and photos: text-size-aware scaling, illumination flattening, one-channel pipeline, reading in strips | - | 3 | 1 |
| M2R1-CP2 | Parser and bill-conversion rules for real layouts: quantities, codes, next-line totals, savings lines, the QR total as the end of items, currency, no-items import | - | 3 | 1 |
| M2R1-CP3 | Synthetic real-layout corpus receipts (CI) and the local-only real-receipt fixtures | M2R1-CP1, M2R1-CP2 | 2 | 2 |
| M2R1-CP4 | Review step: gap notice in the result, add-the-difference, incomplete-read wording; READMEs and verification | M2R1-CP2, M2R1-CP3 | 2 | 2 |

### M2R1-CP1 — Image clean-up for screenshots and photos

**Requirements:** REQ-1, REQ-2

**Files**
- `app/src/features/receipt/preprocess.ts`: `estimateTextHeight`
  (R1, connected components on a coarsely flattened copy), the new
  `fitSize` (R1; the old rule kept as the fallback), `flatten` (R2, box
  blur by running sums), and `preprocessPage` restructured around one
  8-bit channel, async, yielding and checking the abort signal between
  steps (R2's memory and main-thread note).
- `app/src/features/receipt/builtInReader.ts`: the strip loop (R20):
  for each strip, await its clean-up (passing the signal), recognise it,
  keep the lines whose centre is in its own zone (`linesOf` keeps each
  line's bounding box), and join them in order; progress across strips.
- `app/src/features/receipt/strips.ts`: `planStrips` and the own-zone
  line filter (pure).
- `app/src/features/receipt/encodePage.ts`, `encodePage.node.ts`: accept
  the one-channel page (expanding to RGBA, or writing a grayscale PNG).
- `app/src/features/receipt/preprocess.test.ts`, `strips.test.ts`,
  `builtInReader.test.ts`: the new functions, the strips and the abort
  path.

**Tests**
- `estimateTextHeight`: synthetic pages of character-like blocks of
  known height (6, 12, 30, 90 px); the same page tilted 2°; the same page
  pasted onto a dark grey background with a shading gradient (all within
  15 % of the true height); a blank page and a page of noise (no
  estimate).
- `fitSize`: a 223 × 1600 page with 6-px lines is enlarged ×4; a
  1536 × 2048 page with 16-px lines is enlarged ×2 (12.6 MP, under the
  14-MP limit); a page whose factor would pass 14 MP is limited to it; a
  page with 30-px lines is unchanged; a 2000 × 3000 page with 120-px
  lines is halved (1.5 MP, one strip);
  a 3000 × 4000 page with 40-px lines is unchanged (12 MP); the same page
  with 64-px lines is shrunk to 32-px lines (the strip-page text limit);
  a 40-MP page with 40-px lines is shrunk to 14 MP; a 40-MP page with
  16-px lines is shrunk to 14 MP too (the limit wins over enlarging); a
  4000 × 3000 page with 20-px lines stays at 4000 px wide (the width
  limit); a 6000 × 2000 page with 30-px lines is shrunk to 4000 px wide;
  a page whose text would need a factor under 0.2 falls back to D10; no
  estimate falls back to D10. For every case, the resulting page has
  t ≤ 40 and W ≤ 4000 whenever it's over 6 MP.
- The shrink path: when the factor is below 1, the chain resizes and
  converts to grayscale in one pass before straightening, so it never
  builds a one-channel plane at the source resolution (checked with a
  spy on the resize step's input and output sizes).
- The skew estimate: the 2°-tilted page on a dark grey background with a
  shading gradient (the one `estimateTextHeight`'s tests build) is
  estimated within 0.5° from R1's coarsely flattened copy.
- `planStrips`: the owned zones tile the page exactly (every row in
  exactly one own zone) for several heights, widths and text sizes
  (24–64 px unscaled, 32 px scaled); every own-zone boundary is in the
  middle of its overlap, at least 4× the text height from both strips'
  edges; each strip's margin is 3r (none at the page's top and bottom);
  a strip's core is at least 2× the overlap; the overlap is at least 8×
  the text height; a page under 6 MP is one strip with no margin.
  **Geometry at the extremes:** a property test over R1's whole allowed
  range (widths up to 4000 px, heights up to the 14-MP limit, scaled text
  heights 8–40 px, and the portrait and landscape shapes R1 can produce)
  checks that every strip, margin included, is at most 6 MP and never
  larger than the page. With the budget lowered to the minimum strip, it
  checks that every strip is exactly 34t rows (400 + 18t for t < 25),
  apart from the last, and that the invariants above still hold.
  `planStrips` refuses a budget below the minimum strip.
- The strip line filter and join (fake worker returning lines with
  bounding boxes): a line inside one strip is kept once; a line in an
  overlap is kept once, from the strip that owns its centre; a line cut
  by a strip's edge (returned only partly by one strip, whole by the
  other) is kept whole, once; a strip whose lines come in two blocks (a
  name column, then an amount column) crossing a strip boundary gives
  each strip's lines in Tesseract's order, strip after strip, with no
  line lost or doubled; a one-strip page's lines are exactly `linesOf`'s
  output, in the same order.
- Progress: with three strips on one page, the reported progress rises
  within each strip and across the strips, and never goes back.
- `flatten`: a page with a left-to-right shading gradient under text
  comes out with a uniform background (the background's spread drops
  below a set bound) and the text still dark; a clean white page stays
  white; the output size equals the input size.
- The one-channel chain: the one-channel `resize`, grayscale,
  `stretchContrast` and `rotate` give the old RGBA functions' pixels (same
  values, within rounding), and no step allocates a full RGBA copy
  (checked by the types: the steps take and return the one-channel page).
- Flattening a strip with its 3r margin gives exactly the whole page's
  flattened pixels in the strip's core (the fixed mapping has no
  statistic to differ); with a margin of only r, the rows near the edge
  differ (a check that the test can fail). The same with scaling: with a
  factor over 1, scaling and flattening a strip on the page's grid gives
  exactly the rows of the whole page scaled and then flattened; a strip
  scaled with its own crop's ratio differs (again, a check that the test
  can fail).
- Cancel: aborting during the clean-up or between strips stops at the
  next step and the read returns `cancelled`; the worker is terminated.
- The whole existing corpus test (samples 01–10) still passes with the
  new `preprocessPage`.

**Measurements recorded in the checkpoint notes:** R1's final
thresholds; for a 6-MP strip, the peak working memory and each step's
time; each page-level step's time (R2: the one-pass shrink of a 40-MP
source, grayscale and `rotate` of a 14-MP page, R1's estimate); the
largest strip planned for any corpus or local receipt; the total read
time, in the development machine's browser, of the Tiffosi-sized case
(12.6 MP in strips), a 12-MP camera-sized page and lidl1. Then the
**phone measurement** (R21): the user times the Tiffosi photo and lidl1
on their phone in the preview build on the local network, and the notes
record both times with R21's conditions (phone and browser, image, build
commit, cold or warm profile), the ratio to the development machine, and pass/fail
against R21's thresholds (or that the phone couldn't reach the build,
which moves the measurement to the functional re-test). Then the
local-receipt OCR check described under "Acceptance targets" (per
receipt: which item lines, totals and amounts the OCR now reads, as
counts and pass/fail, with no receipt content), and, per Lidl receipt,
whether R23's anchor was read (and which), the count of footer lines
near the QR total, and the count of bill-level discounts read. Per photo, the count of
separator-shaped lines above the last expected item line.

### M2R1-CP2 — Parser and bill-conversion rules for real layouts

**Requirements:** REQ-3, REQ-4, REQ-6 (R24's record of a cut)

**Files**
- `app/src/features/receipt/parse/parseReceiptText.ts`,
  `parse/keywords.ts`, `parse/amounts.ts`: R3–R7, R8's candidates, R10's
  attached-symbol rule, R11, R18's tax-table header and separator row.
- `app/src/features/receipt/model.ts`: `ParsedItem` gains optional
  `savingsCandidate?: Cents` (R8) and `endEvidence?: 'totalLike' |
  'taxTable'` (R22's structural evidence, set by the parser on item
  lines); `ParsedReceipt` gains `itemsEndedBy?: 'taxTableHeader' |
  'separator' | 'payment'` (R23's anchor). `ReceiptSummary` gains
  optional `removedLines?: { name: string; amount: Cents }[]` (R24);
  `ReceiptWarning` is unchanged.
- `app/src/features/receipt/toBill.ts`: `reconcileWithTrustedTotal`
  (R22: R8's decision, R23's footer-anchor cut, R9's cut and R18's
  running-sum cut, in one stage, returning the lines a cut left out),
  R24's `removedLines` in the summary, R10's
  QR-country currency, R14's single-item import.
- `app/src/features/receipt/receiptStore.ts`: `readSummary` reads
  `removedLines` (a list of `{ name: string, amount: Cents }`; a bad
  shape drops the summary, like any other bad field; an empty list reads
  as absent).
- `app/src/features/receipt/importReceipt.ts`: R14. Today a read with no
  items returns `noItems` before the QR scan is awaited; it now awaits the
  scan first, and continues to the bill conversion when the scan gave a
  total.
- Tests next to each file.

**Tests (all with invented lines; no real transcript is committed)**
- R3: `Refrigerante Zero 1,35 x 6 8,10 A` is 6 × 1,35; the same line
  with `a 7` and with `x7`; a line where `P × Q ≠ L` stays `1 × L`,
  including `Massa 1,00 s 2 7,00`, where a misread-`x` letter sits before
  a number but the arithmetic fails, so no quantity is taken.
- R4: a name line then `2 X 6,50 13,00`; a name line then `1X0,8 0,89`
  (flagged); a category header before an item is not an item.
- R5: `(C) Bolachas Maria 1,15` → `Bolachas Maria`;
  `5601234567890 Polo S/S 17,99` → `Polo S/S`; `A Vaca Que Ri 2,49`
  keeps its name; a code-and-size line is ignored.
- R6: `Total (Euro):` then `76,11` gives total 76,11; a lone amount after
  an item is not a total.
- R7: `Promoção (25.99-6.00)` is neither an item nor a discount.
- R8: unsigned candidates dropped when that closes the QR total, applied
  when that closes it, applied when neither does; negative lines always
  applied; no trusted total → applied.
- R9: with a QR total and a garbled total line whose amount equals it,
  that line and the garbled IVA-table rows after it (items carrying
  `taxTable`) are dropped; a
  one-item receipt whose only item equals the total keeps that item;
  without a QR total, or when a printed total was found, nothing is cut.
- R10: a PT QR code (mainland, and one with `J1` for the Azores) forces
  EUR over a stray `$`; a lone `$` without a QR
  code gives no currency; `£3.20` still gives GBP.
- R11: `T0TAL 12,50` is a total; `Lozal 12,50` is not.
- R18: `Taxa Base Inc. Val.Total Val. IVA` and `%IVA Total Liq. IVA
  Total` end the items, and the lines after them aren't items; a column
  header `IVA DESCRICAO VALOR` above the first item ends nothing, and the
  items under it are read; a
  separator row after an item ends them, one before any item doesn't; the
  running-sum rule drops the items after the point where the sum equals
  the QR total, doesn't fire when the sum reaches it only at the last
  item, and drops nothing when the sum never equals it.
- R8 with a candidate larger than its item: applied, it goes to the bill
  discount (rule 7).
- R22's structural evidence (parser), each on a line that is an item
  under rule 3 (the test asserts it's in the item list, then its flag):
  `lozal 12,40` and `Tazal 12,40` are `totalLike`; `Salada 12,40` (six
  letters) and `Bolo lozal 12,40` (another description word) aren't;
  `Natal 10,00` is `totalLike` (R22's stated residual, pinned so a change
  shows); `lVA 23% 10,00 2,30 12,30` (a garbled tax word, three amounts)
  and `Taxa Base 10,00` (two column words, no rate) are `taxTable`;
  `Iogurte 0% 1,20` is `taxTable` (the residual again); an ordinary item
  line has none. Lines that never reach the list carry nothing: `IVA 23%
  2,30` is still classified `tax`, and `A 23% 10,00 2,30 12,30` (one
  letter) is still `text`.
- A recognised payment line is unchanged: `Multibanco 12,40` and `Pago
  com cartao 12,40` after an item are still classified `ignore` (payment),
  still end the items region, and the item-shaped lines after them aren't
  items.
- R22, the reconciliation (the manual external review's counterexamples):
  - an early item equal to the QR total, followed by legitimate items and
    a bill-level discount that brings the total back to the same value
    (10,00 + 5,00 + 5,00, discount 10,00, QR 10,00, no printed total):
    all three items are kept and the discount is applied ("Matches");
  - an early running sum equal to the QR total, followed by legitimate
    items and an offsetting discount (4,00 + 6,00 + 3,00 + 2,00,
    discount 5,00, QR 10,00): all items are kept;
  - the same two receipts with the discount misread (so nothing closes):
    nothing is cut, and the mismatch shows;
  - the same two receipts with the discount line **missing** from the
    parsed result entirely (10,00 + 5,00 + 5,00, QR 10,00; and
    4,00 + 6,00 + 3,00 + 2,00, QR 10,00; no discount read, and only
    ordinary item lines after the match): all items are kept, nothing is
    cut, and the check shows a mismatch;
  - the garbled-total case (items, a `lozal 12,40` line equal to the QR
    total, then garbled IVA-table rows that are items, no discount): still
    cut, because of its structural evidence, and it closes; the same with
    the matched line `lozal` and ordinary lines after it: still cut
    (`totalLike` alone suffices for R9);
  - the running-sum case (no total line, garbled IVA-table rows with a
    rate after the items, as item lines, no discount): still cut, because
    of its structural evidence;
  - the same amounts as the garbled-total and running-sum cases with the
    structural evidence taken away (the matched line named like an item,
    the lines after it ordinary items): not cut;
  - a cut that would close only with an adjustment is not made;
  - a list that closes as a whole is never cut, even when a prefix also
    closes;
  - R8's fallback (neither applying nor dropping closes): the candidates
    are applied, the check shows a mismatch, and no cut turns it into
    "Matches" unless the cut list itself closes exactly with no
    adjustment beyond a read bill-level discount (R22).
- R23, the anchor (parser): items ended by a tax-table header give
  `itemsEndedBy: 'taxTableHeader'`; by `==========`, `'separator'`; by
  `Multibanco 12,40`, `'payment'`; by a total line or the end of the
  text, nothing.
- R18's separator row: `..... ......` (11 dots, a space) after an item
  ends the items; `======` (6) doesn't; `.... ....` (8 dots) does.
- R23, the cut (invented Lidl-like receipts, no printed total, QR
  16,77): items summing 16,77, then `Tazal 18,77` and `MULT IBANCO
  16,77`, then the header: both dropped, "Matches"; items summing 2,50,
  then `Tu.ul 2,50`, then `MULTIBANCO 2,50` (QR 2,50): the one dropped;
  the same with a trailing amount two digits off (`18,78`): nothing
  dropped past it, so no cut; a third trailing near amount: at most two
  dropped, so no cut; items that don't close after the drop: nothing cut,
  mismatch shown; `itemsEndedBy` absent: no R23 cut; a read bill-level
  discount that doesn't close the kept list: no cut; a list that already closes whole: never cut; a
  one-digit difference with a different number of digits (`6,77` against
  `16,77`) isn't near. With the separator: `Tazal 18,77`, then
  `==========`, then `MULT IBANCO 16,77`, then the header (QR 16,77):
  the separator ends the items, `Tazal 18,77` is dropped, and it closes;
  the same with `======` (too short): the header is the anchor, both
  trailing lines are dropped, and it closes. With a bill-level discount:
  items, an orphaned `Promoção -1,00` (a noise line between it and its
  item), then the footer, where the kept list minus 1,00 is the QR total:
  cut, closes; where it isn't: no cut. The manual review's two receipts
  (10,00 + 5,00 + 5,00, discount 10,00, QR 10,00; 4,00 + 6,00 + 3,00 +
  2,00, discount 5,00, QR 10,00) are still kept whole, and with the
  discount misread nothing is cut. The residual pinned: a real last item priced one
  digit from the total, above a payment line, with an offsetting discount
  missing, is dropped (a test that states it).
- R22's read bill-level discount per R8 variant (revision 10): a
  Continente-shaped receipt, with an unsigned candidate larger than its
  item (`POUPANCA 1,75` under a 1,74 € item), items that close the QR
  total with the candidates dropped, then footer junk ended by an anchor:
  step 1 doesn't close, R23 cuts the junk, and the kept list closes in the
  dropped variant **without** the candidate's overflow ("Matches"); the
  same list in the applied variant subtracts the overflow and doesn't
  close. A candidate on a trailing item R23 drops: its overflow isn't
  applied to the kept list. The parser's `receipt.discount` never
  contains a candidate (only negative lines).
- The separator on an ordinary receipt (revision 10): items, then
  `----------`, then a readable `TOTAL 12,40`, with a QR total 12,40:
  `itemsEndedBy` is `'separator'`, the printed total is found, step 2
  isn't reached, and nothing is cut.
- R24, the cut's record: each step-2 cut (R23, R9, R18) returns the
  lines it left out, in receipt order, and the summary carries them as
  `removedLines`; step 1 (a full list that closes, with either R8
  variant) and a receipt with a printed total never set it. M-I-7's
  counterexample, pinned: items 4,00, 6,00 and 20,00, then
  `----------`, no printed total, a −20,00 discount missing from the
  parsed result, QR 10,00. R23 drops `20,00`, the bill closes, and the
  summary's `removedLines` is `[{ name, amount: 2000 }]`, so it can't be
  shown as a plain "Matches" (CP4 tests the display). `receiptStore`:
  `removedLines` survives a save and load; a bad shape drops the summary;
  a summary saved without it loads without it; a stored `removedLines: []`
  loads as absent (the summary is kept, with no `removedLines`).
- Which discount (revision 11): two unsigned savings lines under one item
  sum into its `savingsCandidate`; a negative line and an unsigned
  candidate under the same item, in either printed order, give an
  overflow measured after the negative line (applied variant) and none
  (dropped variant); step 1 with the candidates dropped doesn't subtract
  a candidate's overflow; a negative line larger than an item that a cut
  then drops still counts in the read bill-level discount (R22's stated
  asymmetry, pinned).
- R14: no items + QR total → one flagged item at the QR total; no items
  and no QR → `noItems`.
- The existing parser, fixture and toBill tests keep passing unchanged,
  except rule 7's "unsigned discount applies" tests, which now state R8's
  no-total case explicitly.

### M2R1-CP3 — Synthetic real-layout corpus and the local real-receipt fixtures

**Requirements:** REQ-5

**Files**
- `app/scripts/make-sample-receipts.mjs`: receipts 11–13 (R16), each an
  SVG, the rendered PNG (after the photo or screenshot degradation), the
  `.expected.json` and a valid synthetic QR payload; plus a browser-check
  JPEG of receipt 12 (`fixtures/browser/sample-12.jpg` and its
  `.expected.json`) for CP4's real-browser scan.
- `app/src/features/receipt/fixtures/receipts/11-*`, `12-*`, `13-*`.
- `app/.gitignore`: `src/features/receipt/fixtures/local/`.
- `app/src/features/receipt/receipts.local.ocr.test.ts` (R17), and the
  committed tests that the folder is git-ignored, untracked, and absent
  from history.
- `app/src/features/receipt/matchedCoverage.ts` and its test: R19's local
  coverage (one-to-one matching by price, and the unmatched sum), pure.
- `.github/workflows/app-ci.yml`: `fetch-depth: 0` on the checkout, so the
  history check sees the whole history in CI (R17).
- `app/README.md`: how to set up the local fixtures (convert with
  `magick`, write the `.expected.json`), that they must never be
  committed and that the committed checks detect it if one is, and what
  to do if the tracked-file or history check ever fires (R17's
  procedure: the user's decision and action, never an automatic
  rewrite).

**Tests**
- The corpus test: 11–13 reach "Matches" with the real OCR (CI). Each
  sample's `.expected.json` also states whether its match comes through
  a cut, with the expected `removedLines` (R24), so a cut that appears
  or disappears shows as a change.
- The local test runs the five real receipts on the user's machine and
  checks the acceptance targets above; in CI it's skipped (and says so).
- The ignore check: `git check-ignore` (or a parse of `app/.gitignore`)
  confirms the local folder is ignored.
- The tracked-file check (R17's enforcement): `git ls-files` lists no
  path under `app/src/features/receipt/fixtures/local/`, in the index or
  the tree. A deliberate check that it can fail: in a temporary
  repository, a file added there with `git add -f` makes the same check
  report it.
- The history check (R17): `git log --all --format=%H --
  app/src/features/receipt/fixtures/local/` is empty. A check that it can
  fail: in a temporary repository, a file force-added and committed there,
  then deleted in the next commit, passes the `ls-files` check but makes
  the history check report the commit. And the shallow case: a
  `git clone --depth 1` (over `file://`, so the depth applies) of that
  temporary repository makes the history check **fail** and say it needs
  a full clone; it never passes there.
- `matchedCoverage` (invented values): items matching the expected list
  give their sum over the QR total; a price read twice matches once; a
  read list of un-cut IVA-table rows whose amounts reach 60 % of the QR
  total, with none of the expected items, gives a local coverage of 0 %
  and an unmatched sum of those amounts; the coverage never exceeds 100 %.
- `npm run check` passes with the local folder filled in (Prettier 3
  skips git-ignored files by default; this confirms the local
  `.expected.json` files don't trip `format:check`, or ESLint or `tsc`).

**Verification recorded in the checkpoint notes:** the measured result
for each real receipt (items, sum, local coverage, unmatched sum, in-app
coverage, check), without any of its content beyond those numbers. For
each, whether its unmatched sum would falsely close the gap (the items'
sum equal to the QR total with items missing) or push the in-app
coverage over 80 % while local coverage is under it. For each Lidl
receipt, whether R23 (or R9 or R18) cut its footer, how many lines it
dropped, and how many bill-level discounts were read. For each photo,
whether a separator row ended its items before the last expected item
(the cause is named when a coverage target is missed); a footer line near the QR total left in the list is a stop
condition ("Acceptance targets"). The first
CI run after the `fetch-depth` change shows the history check ran
against the full history (not shallow).

### M2R1-CP4 — Review step: gaps can't pass silently, docs and verification

**Requirements:** REQ-6, REQ-7

**Files**
- `app/src/features/receipt/components/ReceiptCheck.tsx`: R13's button,
  R14's wording, R15's status line and warning, R24's status line, list
  of left-out lines and its two buttons.
- `app/src/features/split/components/ResultSection.tsx`,
  `app/src/features/split/format.ts`: R12's and R24's notices and their
  copied lines (the check and the left-out lines are passed in as
  optional props, so M1's result section is unchanged when there's no
  receipt).
- `app/src/pages/SplitPage.tsx`: wiring the check into the result
  section, R13's "add the difference" action (a reducer action that
  adds a flagged item, keeping `flaggedItemIds` in the saved summary),
  and R24's two actions ("They aren't items" removes `removedLines`
  through `updateSummary`; "Put them back" adds the lines as flagged
  items and removes it).
- `README.md`, `app/README.md`: what works now (screenshots from receipt
  apps, photos on a table), the local fixtures, and the known limits,
  including how long a read can take on a phone (a small screenshot and a
  photo, from R21's phone measurement, rounded up; if that measurement
  moved to the functional re-test, the README states the development
  machine's times and says a phone is slower, and is corrected after the
  re-test) and that a screenshot taken zoomed in reads better.
- Tests next to each file.

**Tests (Testing Library, fake import)**
- A mismatch shows R12's notice in the result section, with the right
  amounts; "Copy as text" includes the line; a match or no receipt shows
  no notice.
- R13: the button appears only when the items add up to less than the
  receipt; clicking it adds a flagged "Not read from the receipt" item
  shared by everyone, the panel shows "Matches", the result notice goes,
  and the flag survives a reload. With a fixed-amount tip it still
  closes; with a percentage tip or tax the button isn't shown and the
  panel shows R13's sentence instead; at 100 items it isn't shown.
- R14: an import with no items and a QR total shows the single item and
  the wording; editing the item clears its flag.
- R15: coverage (R19) under 80 % shows "Only X of the receipt's Z was
  read. …"; at or over 80 % shows the ordinary mismatch sentence; a
  "Not read from the receipt" item doesn't count towards coverage; the
  saved summary is unchanged by either.
- R24: an import whose summary has `removedLines` (M-I-7's
  counterexample from CP2: items 4,00 and 6,00 kept, `20,00` left out,
  QR 10,00) shows R24's status line with the left-out line's name and
  amount, **not** the plain "Matches". The result section shows R24's
  notice, although the totals match, and "Copy as text" includes it. The
  notice survives a reload and an edit to an item. "They aren't items"
  gives the plain "Matches" and removes both notices, and that survives
  a reload. "Put them back" adds `20,00` as a flagged item, the panel
  shows the mismatch (20,00 more than the receipt) and R12's notice
  replaces R24's. At 99 items with two left-out lines, "Put them back"
  isn't shown. A new import without a cut shows neither notice.
- R24 after an edit that breaks the match (revision 12): after the same
  cut import, change `6,00` to `6,50`. The panel shows the live mismatch
  (10,50, 0,50 more than the receipt), never the "Matches …" wording,
  then "1 line was left out …", the `20,00` line and both buttons. The
  result section and "Copy as text" carry R12's gap line and R24's line,
  in that order. Change it to `5,50` instead (under the total): R13's
  button is shown beside the left-out list. Make a price invalid: the
  panel shows `billInvalid`'s status plus the left-out list. Restore
  `6,00`: the "Matches after leaving out …" wording returns.
- Accessibility: the new buttons have labels, the result notices are
  text (not only an icon), and they're announced as part of the result.

**Verification**
- `npm run check` and `npm run build` pass.
- `check-requests.mjs` scan mode, re-run in the preview build for
  `sample-1.jpg` and the new sample 12 (as a JPEG browser-check file),
  each in a fresh profile: the same checks as M2 CP4 (same-origin `GET`s
  only, no receipt values in any request, no CSP violations, the worker
  requests present). The clean-up changes add no request, but they do
  change what the worker receives, so this is re-checked, not assumed.
- On PR #6, `app`, `workflow-conformance` and `pr-title` pass.

## Requirement coverage

| id | Requirement | Checkpoints |
|----|-------------|-------------|
| REQ-1 | Small, low-resolution receipt screenshots (receipt apps) are enlarged by text size before OCR (F-I-1). | M2R1-CP1 |
| REQ-2 | Phone photos of receipts on a table are read despite the background, shading and paper texture (F-I-2, F-I-3). | M2R1-CP1 |
| REQ-3 | The parser reads the Portuguese supermarket and shop layouts seen in the real receipts: price-first quantities, name-then-quantity lines, codes in names, totals on the next line, informational promotion lines, unsigned savings lines (F-I-1–F-I-3). | M2R1-CP2 |
| REQ-4 | The item list ends reliably when the printed total is garbled (the fiscal QR code's total, a running sum equal to it, a tax-table header, a separator row), a PT fiscal QR code fixes the currency, and a receipt with a QR total but no readable items still imports (F-I-1, F-I-2). | M2R1-CP2 |
| REQ-5 | Regression coverage for real layouts: synthetic committed receipts in CI, and the five real receipts as local-only fixtures that are never tracked and never in the repository's history, checked by committed tests (F-I-4, the user's decision). | M2R1-CP3 |
| REQ-6 | An incomplete import can't silently become a normal split: the gap shows in the result and the copied text, an incomplete read is called out, one click adds the difference, and lines the import left out to match the total are shown until the user confirms them or puts them back (F-I-3, the manual external review's M-I-7). | M2R1-CP2, M2R1-CP4 |
| REQ-7 | READMEs updated, and the no-data-leaves-the-browser checks re-run with the new clean-up. | M2R1-CP4 |

## Files touched and review classification

All under `app/`, the READMEs and `.github/workflows/app-ci.yml` (CP3's
`fetch-depth`) are implementation-stage protected (product deliverable,
by the artifact declarations), as for M2. This plan, its registry and mapping are
plan-stage protected. `docs/ACTIVE_MILESTONE.md` and the workflow state
are excluded bookkeeping. `app/src/features/receipt/fixtures/local/` is
git-ignored and never part of any bundle.

## Migration, data and backup implications

No migration. The saved bill (`settle.bill`, version 1) keeps its format
exactly: R13, R14 and R24's "Put them back" add ordinary items and use
the existing `flaggedItemIds`. R12 and R15 are computed live from the
check, and no warning code is added. (This matters: `receiptStore` drops a
saved summary with an unknown warning code, so a new stored code would
lose the check panel for any older build reading it.) The receipt summary
(`settle.receipt`) stays at version 1 and gains one **optional** field,
R24's `removedLines`. It's additive in both directions. A summary saved
before this change has no such field and loads as today. An older build
reading a newer summary ignores it, because `readSummary` rebuilds the
summary from the fields it knows (`receiptStore.ts`, `readSummary`); that
build loses only R24's notice. That's why R24 uses a field and not a
warning code.

## Out of scope

- Cropping to the receipt's edges and perspective correction (still M2's
  out-of-scope list). Flattening made them unnecessary for these photos.
- OCR of text smaller than about 5 px: a very small screenshot is read as
  well as R1 allows, and R13/R14 cover the rest.
- Reading item names perfectly: names from a 5-px screenshot will have
  typos; the amounts and the total check are what the split depends on.
- Any new dependency, an AI reader, or sending anything to a server.

## Open questions (for the plan reviewer / user)

1. **R14 adds an item automatically** when nothing could be read but the
   QR code gives a total. The alternative is to keep `noItems` and show
   the QR total in the error message. The default chosen: add it, loudly
   flagged, because for the roommate workflow "split this 7,76 € equally"
   is the most common next step.
2. **R8 chooses by the total.** A receipt with unsigned savings lines and
   no QR code keeps today's behaviour (applied). If Continente-style
   receipts without a readable QR code turn out common, a later rule
   could learn it from the `Total de descontos e poupancas` line.
3. **R15's 80 % threshold** is a judgment call: below it the wording
   changes from "doesn't match" to "only part was read".
4. **The Lidl target (60 % coverage)** is set from the spike: those
   screenshots have text about 5 px tall. A screenshot taken zoomed in
   reads better than any clean-up can make it; the READMEs say so (CP4),
   but the app doesn't advise it on screen.
5. **The Continente target (75 %)** accepts that lines on a paper fold
   may be unreadable. Flattening out folds (a local-contrast method)
   would be new work beyond this plan.
6. **R21's phone thresholds (60 s for a photo, 20 s for a screenshot)**
   are a judgment call about how long a user will wait with a progress
   line. They're set from the estimate the plan already published (about
   a minute, 10–20 s), and the user can change them before
   implementation.
7. **Stopping a real receipt before it leaves the machine.** R17's
   committed checks detect a real receipt in the index or history, but
   only after the commit exists: locally when the tests run (before a
   push, if `npm run check` is run first) and in CI after a push, with the
   full history (`fetch-depth: 0`). R17 states what the user does if one
   fires. A
   git pre-push hook (not committed, installed by hand) would stop the
   push itself. The default chosen: detection only, no hook. The user can
   ask for the hook instead.
8. **R24 shows every cut until it's confirmed.** The manual external
   review offered two ways out of M-I-7: keep REQ-6 as a guarantee and
   show heuristic cuts (its recommendation), or narrow REQ-6 to state the
   residual. The default chosen: the first. It costs one extra tap on
   receipts whose footer was cut (the Lidl screenshots, typically), and
   the user sees exactly what was left out. The user can choose the
   second instead, before implementation.

## Stop conditions

- An acceptance target that isn't met, at CP1's measurement or CP3's
  (report to the user, who decides; never loosened silently).
- R2's memory or main-thread measurement that stays over budget with
  the strip budget lowered to R20's minimum strip (34t rows, at most
  1360 × 4000 = 5.44 MP; for the Tiffosi case, 1088 × 3072 = 3.3 MP), or
  a total read time of the 12.6-MP case over **15 s** in the development
  machine's browser (the engineering gate).
- A phone reading time over R21's thresholds (60 s for the 12.6-MP
  photo, 20 s for a small screenshot), at CP1's phone measurement or in
  the functional re-test.
- Any existing corpus sample (01–10) that changes its result with the new
  clean-up and can't be restored within R1's stated tuning ranges.
- A Lidl receipt with a footer line near the QR total left in the item
  list (R23), or with no anchor read (CP1's count), at CP1's count or
  CP3's end-to-end check.
- A new dependency, a new network request in the check, or a real
  receipt, its transcript or its expected values staged for a commit.
- R17's tracked-file or history check failing on a real receipt: stop and
  report the commits; the user removes them (R17), never the workflow.

## Review dispositions

### Local plan review, round 1 (`LOCAL_MODEL_PLAN_REVIEW`, revision 1 → 2)

Verdict REVISE, run in the same session that wrote the plan. Every
finding was checked against the spike transcripts and the code before
applying.

| Finding | Disposition |
|---------|-------------|
| I-1 Evidence overstated the photos; targets unsupported | **Accepted.** Checked the transcripts: Continente lost `BEB SOJA … 2,69` and `2 X 4,04 8,08`, Tiffosi the `76,11`. Re-ran the photos enlarged ×1.5 and ×2 before flattening: Tiffosi then reads fully (all five items, 76,11 €); Continente's two lines sit on paper folds and stay unreadable (ceiling about 79 %). Evidence corrected; targets set from these results (Tiffosi "Matches", Continente 75 %, Lidl 60 %); CP1 now measures the real clean-up on the local receipts, and a missed target stops for the user's decision. |
| I-2 R9 needs the total's amount read exactly | **Accepted.** Confirmed on lidl1 (`lozal (2,0%`). New R18: tax-table header and separator row end the items (parser), and a running-sum rule next to R9 in one function (`trimItemsToTrustedTotal`), with its negative cases tested. |
| I-3 The row-run estimator fails on tilt and dark backgrounds | **Accepted.** R1 now measures the median height of character-like connected components on a coarsely flattened small copy; tests with a 2° tilt and a dark, shaded background. |
| I-4 Coverage undefined; R14 would satisfy it | **Accepted.** New R19 defines coverage without the "Not read from the receipt" item; R15 and the targets use it; the local expected files hold the item list. |
| I-5 R13 doesn't close with a percentage tip or tax; the 100-item cap | **Accepted.** Checked M1: tax and tip can be percentages. The button is shown only when they're none or fixed amounts, and not at 100 items; otherwise the panel says what to do. Tests added. |
| I-6 Memory and main-thread claims | **Accepted.** Checked `preprocess.ts` (every step returns RGBA) and `builtInReader.ts` (clean-up on the main thread). The chain is restructured around one 8-bit channel, async with abort checks between steps; CP1 measures peak memory and step times, with a 4-MP fallback. |
| O-1 Unsigned candidate larger than its item | **Accepted.** R8 states rule 7's move to the bill discount; test added. |
| O-2 Azores and Madeira QR codes | **Accepted.** R10 names `J1` and `K1`; test added. |
| O-3 `npm run check` with the local folder filled | **Accepted.** Added to CP3's tests. |
| O-4 A misread-`x` letter before a number | **Accepted.** R3 test with `Massa 1,00 s 2 7,00`. |
| Usability: R14's sentence first for screen readers | **Accepted.** It's the panel's status line, under the heading that gets focus (R14). |
| Usability: 10–20 s on a phone | **Accepted.** The READMEs say so (CP4); the status line already shows progress. |
| Architecture: end-of-items decisions in one place | **Accepted in part.** The QR-dependent cuts (R9, R18's running sum) share one function in `toBill.ts`; the text-only signals stay in the parser's rule 4, since they need no QR code and every reader's text goes through the parser. |

### Local plan review, round 2 (`LOCAL_MODEL_PLAN_REVIEW`, revision 2 → 3)

Verdict REVISE, again run in the same session.

| Finding | Disposition |
|---------|-------------|
| I-1 The CP2 heading was lost | **Accepted.** Restored (`### M2R1-CP2 — …`). |
| I-2 The 6-MP cap doesn't allow the Tiffosi ×2 scale | **Accepted, with strips (the user's choice, 2026-09-29).** Re-measured: at ×1.38 (6 MP) Tiffosi misread `17,89` and lost the total's amount. New R20 reads pages over 6 MP in overlapping strips, each strip cleaned up on its own, lines kept by an own-zone rule; memory is bounded per strip, and R1's page limit becomes 14 MP of reading time. A strip spike (Tesseract CLI) read Tiffosi ×2 with all five prices right (sum = QR total), and Continente and lidl1 as well as the whole page, with no duplicated line. R1's examples, R2, the targets, the stop conditions and CP1's files and tests updated; CP1's complexity goes from 2 to 3. |
| I-3 R18's header matches Continente's column header | **Accepted.** Confirmed: `IVA DESCRICAO VALOR` has `iva` and `valor`. The header signal now applies only after at least one item; test added. |
| O-1 A bare leading `A ` stripped as a tax code | **Accepted.** R5 strips only bracketed codes and `NS`; a bare letter stays in the name. |


### Local plan review, round 3 (`LOCAL_MODEL_PLAN_REVIEW`, revision 3 → 4)

Verdict REVISE, run in a fresh session. Each finding was re-checked
against the code before applying.

| Finding | Disposition |
|---------|-------------|
| I-1 The flattening margin is r, but three box-blur passes reach 3r | **Accepted.** Three passes of radius r have a support of 3r. R2 now states this, and R20's margin is 3r. R2's white point is now a fixed mapping, `min(255, 255 × pixel / blurred)`, with no page or strip statistic, so a strip with its margin gives exactly the whole page's flattened pixels. The contrast stretch is stated as per strip. CP1's equality test uses the 3r margin, and a margin of only r must fail it. |
| I-2 Large sources aren't bounded | **Accepted.** Checked: intake allows 40 MP (`intake.ts:17`), and R2 converted and straightened at source resolution. R1's 14-MP limit now applies to every page and wins over the thresholds. When the factor is below 1, resizing and grayscale happen in one pass, before straightening, so no step works on more than the final page's pixels. Added `fitSize` tests for a 3000 × 4000 page with 40-px lines and for 40-MP pages, plus a test of the shrink path. |
| I-3 "Page order" undefined | **Accepted.** The join is strip after strip, each in Tesseract's own order (`linesOf`, `builtInReader.ts:99`), never re-sorted, so a one-strip page gives exactly today's sequence. The spike's script wasn't kept, so its own join order can't be re-checked; the Evidence section says so, and CP1's local measurement with the real reader confirms the strip result. Added a test with two blocks crossing a strip boundary. |
| O-1 Where the own-zone boundary sits | **Accepted.** It's in the middle of the overlap, at least 4× the text height from both edges; this is a `planStrips` test. |
| O-2 The reading-time stop condition | **Accepted.** The development-machine budget is now 15 s for the 12.6-MP case, under an assumed 4× phone slowdown (about a minute on a phone). CP1 measures three cases, the README's phone times come from those measurements, and the user's re-test on their phone checks them. |
| O-3 The strip size with its margin | **Accepted.** R20 counts the margin in the strip's rows and keeps each core at least 2× the overlap. That fits in 6 MP on pages up to about 2750 px wide; beyond that, the exact worst case is stated (6.5 MP), and the 14-MP page is the hard bound. CP1 records the largest strip planned. |
| Missing test: R5's bare letter | **Accepted.** `A Vaca Que Ri 2,49` keeps its name. |
| Usability: progress through a long read | **Accepted.** Progress is reported per strip, and there's a test that it never goes back. |

### Manual external plan review, round 1 (`MANUAL_EXTERNAL_PLAN_REVIEW`, revision 4 → 5)

Verdict REVISE (four important, two optional findings), after local round
4's APPROVE. Each finding was checked against the code before applying.

| Finding | Disposition |
|---------|-------------|
| M-I-1 R9/R18 can silently delete legitimate items when an early item or running sum equals the QR total | **Accepted.** Confirmed in `toBill.ts`: `withAdjustments` tries D13's empty combination first, so a list cut to a prefix that equals the QR total closes as "Matches", and a read discount (`receipt.discount`, which the parser keeps separately, `parseReceiptText.ts:782`) is then simply not applied. New R22 makes R8, R9 and R18 one reconciliation stage: the full list is tried first and is never cut when it closes; cuts are allowed only with a QR total, no printed total and no bill-level discount, and must close with no adjustment. Otherwise the items are kept and the gap shows. CP2 tests both counterexamples, their misread-discount variants, and the garbled-total and running-sum cases, which must still cut. |
| M-I-2 R20's resource bound and 600-px fallback are inconsistent with the geometry | **Accepted.** Confirmed: the minimum strip is 2 × 8t + 2 × 9t = 34t rows, 2176 at t = 64, so 600 px was unreachable; and the width wasn't bounded. R1 now limits the width to 4000 px and a strip-read page's text to 40 px; R20 derives from that a single bound: every strip, margin included, is at most 6 MP (the minimum strip is at most 5.44 MP), so R2's 6-MB and 24-MB figures hold over the whole range. The fallback is the minimum strip, which `planStrips` never goes below. CP1 adds a property test over the whole allowed range and the new `fitSize` limits. |
| M-I-3 The 4× phone slowdown is assumed | **Accepted.** New R21: the 4× only sets the development machine's engineering gate. The user times the photo and a screenshot on their phone at the end of CP1 (or in the functional re-test if the phone can't reach the preview build), with thresholds of 60 s and 20 s as an acceptance target and a stop condition. The README's phone times come from that measurement. |
| M-I-4 `.gitignore` doesn't enforce "never committed" | **Accepted.** Confirmed: an ignore rule doesn't untrack a file added with `git add -f`. R17 and CP3 add a committed test that no path under `fixtures/local/` is in `git ls-files`, and a check that it can fail. |
| M-O-1 Per-strip contrast stretch isn't identical to the whole page | **Accepted.** R2 now says only the flattened pixels are identical; the per-strip stretch is intended, and the own-zone tests and the local measurement show it's harmless. |
| M-O-2 R8's fallback must stay visibly uncertain | **Accepted.** Covered by R22: "Matches" can only come from a list that closes exactly, all in one stage, so no later heuristic turns R8's fallback into a match. CP2 tests it. |
| Architecture: one reconciliation stage for R8, R9 and R18 | **Accepted.** That's R22's `reconcileWithTrustedTotal`, replacing `trimItemsToTrustedTotal`. |

### Local plan review, round 4 (`LOCAL_MODEL_PLAN_REVIEW`, revision 4, APPROVE): optional findings

Round 4 approved revision 4 with four optional findings, applied here
alongside the manual review.

| Finding | Disposition |
|---------|-------------|
| O-1 The skew estimate runs on an unflattened page | **Accepted.** R2 estimates the skew on R1's coarsely flattened working copy; CP1 tests a 2° tilt on a dark, shaded background. |
| O-2 Per-strip scaling must use the page's grid | **Accepted.** R2 defines a strip as rows of the scaled page, sampled with the page's ratio and one extra source row each side; CP1's equality test covers scaling too, with a check that it can fail. |
| O-3 The main-thread budget covers only strip steps | **Accepted.** R2 and CP1 measure and chunk the page-level steps too. |
| O-4 The strip-size figures assume a portrait page | **Accepted**, as part of M-I-2 above. |

### Local plan review, round 5 (`LOCAL_MODEL_PLAN_REVIEW`, revision 5 → 6)

Verdict REVISE, run in a fresh session. It confirmed the manual external
review of revision 5 (which had found M-I-5, M-I-6, M-O-1 and M-O-2 but
was never recorded) and carried its findings. Each finding was re-checked
against the code before applying.

| Finding | Disposition |
|---------|-------------|
| I-1 (M-I-5) R22 still cuts when a discount is missed entirely | **Accepted.** Confirmed: `receipt.discount` is only set from lines the parser classified as discounts (`parseReceiptText.ts:690-693,782`), so a discount line the OCR lost leaves no trace, and 10 + 5 + 5 with QR 10 would be cut to one item that "Matches". R22 now needs structural evidence for a cut: the parser marks items `totalLike` (within two substitutions of `total`), `taxTable` (a rate or two column words) or `payment` (`PAYMENT_WORDS`, `CARD_PAYMENT`, `parse/keywords.ts`), and R9's and R18's cuts need that evidence in the dropped part. R9, R18 and CP2 updated, with tests for a discount missing entirely and for the legitimate cuts with and without their evidence. |
| I-2 (M-I-6) "Never committed" isn't what `ls-files` proves | **Accepted.** R17 adds a committed history check (`git log --all -- …/fixtures/local/`), with a commit-then-delete case that must fail it, and states the enforced invariant exactly: not tracked, not staged, not in history, detected when the tests run. REQ-5 (and the mapping) now says the same. A push-time hook is open question 7, for the user. |
| O-1 (M-O-1) R22 mixes arithmetic and structural evidence | **Accepted.** R22 names the two kinds of evidence, says a cut needs both, and states what it doesn't guarantee (an unread discount **and** a garbled footer line after it). |
| O-2 (M-O-2) Record the phone measurement's conditions | **Accepted.** R21 and CP1's notes record the phone and browser, image, build commit, cold or warm profile and total time. |
| O-3 R17's "no excerpt is committed" contradicts the plan | **Accepted, by narrowing R17.** The user's decision (`docs/ACTIVE_MILESTONE.md`, commit `f511a80`) names the personal data: a customer NIF, card digits, a loyalty-card number. None of it is in this plan (`5606324559542` is a public product EAN, `999999990` the generic consumer NIF). R17 now says no image, full transcript, local `.expected.json` or personal identifier is committed, and that the Evidence section's short layout excerpts are allowed. CP2's R3 test no longer reuses a real line's amounts. |
| O-4 R2's memory figure leaves out the page plane and the encoder | **Accepted.** R2 states the whole main-thread peak (about 70 MB: the page plane, the strip, the running sums and `encodePage`'s RGBA copy), plus the worker's own copy; CP1 measures it. |

### Local plan review, round 6 (`LOCAL_MODEL_PLAN_REVIEW`, revision 6 → 7)

Verdict REVISE (three important, two optional findings), run in a fresh
session. Each finding was re-checked against the code before applying.

| Finding | Disposition |
|---------|-------------|
| I-1 R22's `payment` evidence can't reach an item; two CP2 examples aren't items | **Accepted.** Confirmed in `parseReceiptText.ts`: `classify` returns `{ group: 'ignore', payment: true }` for any `PAYMENT_WORDS`/`CARD_PAYMENT`/`CARD_ALONE` line before any other rule, the region loop in `parse` ends the items region on `found.payment`, and items are only collected in the `items` region, so no payment line is an item and none follows one. `A 23% 10,00 2,30 12,30` has one letter (`isItemShape` needs two), and a tax-words-only rate line with one or two amounts is `tax` (`isTaxTable`). `payment` is dropped from `endEvidence`; `totalLike` and `taxTable` are defined only on lines that reach the item list, with what each can and can't catch. CP2's evidence tests now use real item lines, assert they're items first, pin the lines that never reach the list, and check that a recognised payment line is still ignored and still ends the items. **Point 3 (counts from the spike transcripts):** not answered from the transcripts. They aren't in the repository or any bundle (R17), and weren't available in this session, so this revision states that it's unknown rather than claiming it. It takes the finding's alternative instead: CP1's local measurement counts the Lidl footer lines carrying each kind of evidence (a text check needing no CP2 code), CP3 checks that R22 actually cuts each Lidl footer, and a Lidl receipt it doesn't cut is a stop condition. R22 states what happens then (nothing is cut, the junk stays, the mismatch shows, and local coverage isn't raised). |
| I-2 R17's history check is vacuous in a shallow CI clone | **Accepted, with `fetch-depth: 0`.** Confirmed: `app-ci.yml` uses `actions/checkout@v4` with no `fetch-depth` (default 1), while `release.yml` sets `fetch-depth: 0`. CP3 adds `fetch-depth: 0` to `app-ci.yml` (already implementation-stage protected by the artifact declarations), and the history check **fails** in a shallow repository, saying it needs a full clone. CP3 tests it with a `git clone --depth 1` of the temporary repository. REQ-5 is unchanged: with the full history, "never in the repository's history, checked by committed tests" holds in CI too. |
| I-3 Coverage counts footer junk | **Accepted.** R19 now has two measures: local coverage (the targets) counts only read items matched one to one by price to the local expected list, with the unmatched sum recorded beside it; in-app coverage (R15) stays as it was, and R19 says junk can inflate it. A pure `matchedCoverage` function carries the matching, with a committed test that un-cut IVA rows worth 60 % of the total and no expected items give 0 %. CP3's notes record, per receipt, whether the unmatched sum would falsely close the gap or push in-app coverage over 80 %. |
| O-1 `totalLike` matches real five-letter words | **Accepted.** `totalLike` now needs the description to be that one word only (`Bolo lozal` isn't), and R22's residual names `Natal 10,00`; CP2 pins it with a test. |
| O-2 What happens if the history check fires | **Accepted.** R17 states it: the check stays red and blocks the PR (`app` is required); the workflow stops and reports the commits and never rewrites history; the user removes an unpushed commit locally, or rewrites a pushed branch and force-pushes it themselves and asks GitHub to purge the PR's cached refs. The app README (CP3) carries the procedure, and it's a stop condition. |

### User-directed change (revision 7 → 8, before revision 7 was reviewed)

After revision 7 was published, the ×4 Lidl spike transcripts were found
in the planning session's temporary folder (outside the repository) and
checked against revision 7's rules, answering local round 6's I-1 point 3
(counts only, now in the Evidence section's "Lidl footers"): R22's
per-item evidence would cut none of the three Lidl footers. The user
pointed out that the three receipts share one layout and only the OCR
noise differs, and chose a rule anchored on that layout: **R23**, the
footer anchor (the items end at a tax-table header or a recognised
payment line; up to two trailing items near the QR total, one misread
digit allowed, are dropped when what's left closes exactly). R22's
step 2, the acceptance targets, CP1's and CP3's measurements, CP2's files
and tests, and the stop conditions are updated to match.

### Local plan review, round 7 (`LOCAL_MODEL_PLAN_REVIEW`, revision 8 → 9)

Verdict REVISE (two important findings and one optional), run in the
same session that wrote revisions 7 and 8. Each finding was checked
against the local Lidl ×4 transcripts and the parser.

| Finding | Disposition |
|---------|-------------|
| I-1 The separator between `Total` and `MULTIBANCO` disables R23 | **Accepted.** Confirmed in the transcripts: a separator row right after the total line on lidl1 (`..... ......`) and lidl2 (`======`), lost on lidl3. The Evidence section now gives the footer with its separator and the counts. `itemsEndedBy` gains `'separator'`, so R23 anchors on R18's separator row too. CP2 tests the separator-anchored cut and the too-short case (header anchor). |
| I-2 An orphaned `Promoção` line blocks every cut | **Accepted, by refining R22's condition.** Confirmed: the items and discounts loop in `parse` (`parseReceiptText.ts`) resets `discountable` on any line that's neither an item nor a discount, so a negative line after an unread item goes to `billDiscounts`. The recorded parser output has `discount: 110` on lidl1. A cut is now allowed with a read bill-level discount when the cut list closes exactly with that discount applied and nothing else. It's still safe against M-I-1 (a whole list that closes is taken first, and a misread discount closes no cut list). CP1 and CP3 count bill-level discounts, and CP2 tests the Lidl-shaped case and M-I-1's two receipts under the new condition. |
| O-1 R18's separator row with spaces | **Accepted.** Spaces between the characters are allowed and not counted: `..... ......` counts (11), `======` doesn't (6). CP2 tests both. |

### Local plan review, round 8 (`LOCAL_MODEL_PLAN_REVIEW`, revision 9 → 10)

Verdict REVISE (two important findings and two optional), run in a
session other than the one that wrote revision 9. Each finding was
re-checked against the plan and the parser before applying.

| Finding | Disposition |
|---------|-------------|
| I-1 CP2 still carries revision 8 in two places | **Accepted.** Confirmed: CP2's `model.ts` entry declared `itemsEndedBy?: 'taxTableHeader' \| 'payment'`, without the `'separator'` that R23 and CP2's own parser test need, and CP2's R23 tests still said "a read bill-level discount: no cut", which contradicts revision 9's discount tests a few lines below. The type now has `'separator'`; the stale test is now "a read bill-level discount that doesn't close the kept list: no cut"; and the R8-fallback test states revision 9's condition ("no adjustment beyond a read bill-level discount"). The header's stale "Plan revision: 7" is corrected too. |
| I-2 "That discount applied" isn't defined for R8's dropped variant | **Accepted.** Confirmed in `parseReceiptText.ts` (lines 670–696, 782): today only negative lines reach `billDiscounts`, and R8's candidates are recorded on their item by the parser, applied in the bill conversion. R22 now defines the read bill-level discount per list and per variant: the parser's `receipt.discount` (negative lines only), plus, with the candidates applied, the overflow of candidates on kept items; none in the dropped variant, and nothing from a candidate on a dropped item. CP2 tests the Continente-shaped case (cut and closes without the overflow when dropped) and a candidate on a dropped trailing item. |
| O-1 R23's residual and the separator on ordinary receipts | **Accepted.** R23's residual names the separator row and says the anchor is now set on many ordinary receipts, while step 2 (no printed total) keeps the residual's kind unchanged. CP2 pins an ordinary receipt with `----------` and a readable `TOTAL`: no cut. |
| O-2 Spaced separators and OCR noise on photos | **Accepted.** CP1 counts, per photo, separator-shaped lines above the last expected item line (a transcript text check), and CP3 records whether a separator row ended a photo's items early, so a missed coverage target names that cause. |

### Local plan review, round 9 (`LOCAL_MODEL_PLAN_REVIEW`, revision 10, APPROVE): optional findings

Round 9 approved revision 10 with two optional findings, applied here
alongside the manual review.

| Finding | Disposition |
|---------|-------------|
| O-1 A negative line's overflow on a dropped item still counts | **Accepted, as a stated asymmetry.** Confirmed in `parseReceiptText.ts` (lines 677–694): a negative line larger than its item goes to `billDiscounts` with no record of its item. R22 now says it always counts, even when a cut drops its item, and why that's acceptable (it can only block a cut, or allow one that still needs structural evidence and an exact close, which R24 then shows). CP2 pins it. |
| O-2 Several savings lines under one item, and their order | **Accepted.** R22 now says: several unsigned lines under one item sum into its `savingsCandidate`; a candidate's overflow is measured after the item's negative lines, whatever the printed order; step 1's D13 `discount` uses the same per-variant definition. CP2 tests each. |

### Manual external plan review, round 2 (`MANUAL_EXTERNAL_PLAN_REVIEW`, revision 10 → 11)

Verdict REVISE (one important and two optional findings). The review
confirmed that M-I-5 and M-I-6 are resolved. Each finding was checked
against the plan and the code before applying.

| Finding | Disposition |
|---------|-------------|
| M-I-7 R23's documented residual can produce a silent false "Matches", contradicting REQ-6 | **Accepted, Option A (the review's recommendation).** The residual is real, and it's the plan's own statement (R23, and R22's for R9 and R18). The review's exact example (10,00, 20,00, QR 10,00) happens not to cut: walking back, `10,00` is near too, so both are dropped and the empty list doesn't close. But the class holds: items 4,00, 6,00 and 20,00 with a missed −20,00 discount and QR 10,00 cut to 4,00 + 6,00. New R24: every step-2 cut (R23, R9, R18, since all three share the residual's kind) returns the lines it left out. The summary records them (`removedLines`), and the check panel and the result section show them, never a plain "Matches", until the user confirms they aren't items or puts them back. It's saved with the summary as an optional field, not a warning code, because `readSummary` (`receiptStore.ts`) drops a summary with an unknown warning code but ignores unknown fields. So an older build loses only the notice. REQ-6 keeps its guarantee and names this; the mapping puts REQ-6 on CP2 too (the record) as well as CP4 (the display). The Goal, R12, R22, R23, CP2's and CP4's files and tests, and "Migration" are updated. Open question 8 records the choice. |
| O-EXT-1 R17 still opens with "never committed" | **Accepted.** R17's opening now says the receipts must never be committed and that committed checks detect one that is. CP3's README line says the same. |
| O-EXT-2 An explicit R23 false-positive fixture | **Accepted.** CP2 pins M-I-7's counterexample (the cut is made and `removedLines` records it), and CP4 tests how it's shown and both buttons. CP3's corpus files state whether each sample's match comes through a cut. |
| Architecture: confidence should survive reconciliation | **Accepted.** That's R24's `removedLines`, returned by `reconcileWithTrustedTotal` and kept through the summary to the UI. |

### Local plan review, round 10 (`LOCAL_MODEL_PLAN_REVIEW`, revision 11 → 12)

Verdict REVISE (one important and one optional finding, both accepted).
The review confirmed that M-I-7, O-EXT-1, O-EXT-2 and local round 9's
O-1/O-2 are resolved as stated.

| Finding | Disposition |
|---------|-------------|
| L10-I-1 R24 overrides the live check even when the totals no longer match | **Accepted.** Confirmed in the code: `CheckStatus` in `ReceiptCheck.tsx` (lines 32–70) is a live switch on `check.status`, and `SplitPage.tsx` clears the summary only on import, dismiss and New bill, while item edits touch only `flaggedItemIds`. So an edit after a cut could leave "Matches after leaving out …" on screen over a mismatch, and R12's "instead" hid the gap in the result and the copied text. R24 now adds to the live check. Its "Matches …" wording is used only while the check is `match`. Otherwise the live status is shown (with R13 and R15 as usual), then the left-out lines and both buttons. R12's gap line and R24's line are both shown and copied when both apply, the gap line first. CP4 tests the edit that breaks the match (over, under, invalid, restored). |
| L10-O-1 `removedLines: []` on load is unspecified | **Accepted.** `readSummary` reads a stored empty list as absent, so the summary is kept and "0 lines" can never be shown. A wrong shape still drops the summary. CP2 pins it. |
