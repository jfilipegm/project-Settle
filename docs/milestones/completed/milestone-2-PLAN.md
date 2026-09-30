# Milestone 2 — Receipt upload and built-in parsing: execution plan (Revision 10)

- **Work item:** `milestone-2` (product, governing workflow version `2.1`)
- **Plan revision:** 10 (revisions 2, 3 and 4 apply local plan review
  rounds 1, 2 and 3, revision 5 applies manual external plan review
  round 1, revisions 6 and 7 apply local rounds 5 and 6, revision 8
  applies manual external round 2, and revisions 9 and 10 apply local
  rounds 8 and 9; see "Review dispositions")
- **Base commit:** `74cf84a677f32362a07b9fc7b2cb43b990ef75e0` (`master` after
  M1 (PR #4) and the rename to Settle (PR #5) were merged)
- **Branch / PR:** `feature/milestone-2`. The PR to `master` opens after the
  first commit, which is this plan's approval commit (CLAUDE.md, "Git and
  GitHub workflow").
- **Roadmap entry:** `docs/ROADMAP.md` → "M2 — Receipt upload and built-in
  parsing"
- **Registry:** `docs/ai-workflow/registry/milestone-2-registry.json`
- **Requirement mapping:** `docs/ai-workflow/requirements/milestone-2-mapping.json`
- **Artifact declarations:** `docs/ai-workflow/registry/milestone-2-artifacts.json`

## Goal

Upload a photo or PDF of a receipt and get M1's item list filled in
automatically, for free and entirely in the browser. After M2 a user can:

- pick a receipt file, take a photo on a phone, or drop a file on the page
  (JPEG, PNG, HEIC or PDF);
- have it read on their own device: image clean-up, text reading with
  Tesseract.js, and a rule-based parser for Portuguese and English
  receipts;
- have a Portuguese fiscal QR code, when there is one, give a reliable date,
  merchant NIF, total and IVA breakdown;
- review the result in the M1 editor, with a live check of the items
  against the receipt total and the doubtful lines marked, then split it as
  in M1;
- fall back to typing the bill in whenever reading fails.

No receipt data leaves the browser.

## Decisions taken in this plan

| # | Decision | Chosen | Source |
|---|----------|--------|--------|
| D1 | Where receipt reading lives | A new feature folder `app/src/features/receipt/`. Pure modules (model, parser, fiscal QR, reconciliation, bill conversion, clean-up math) are separate from browser adapters (decoding, OCR worker, QR scanner) and from React. | M1's D1 pattern: pure logic stays unit-testable |
| D2 | The shared reader interface (the plug-in point for later readers) | `ReceiptReader { id; read(source, { signal, onProgress }) → Promise<ReadResult> }`. `source` is the decoded `ReceiptSource` (the pages as RGBA pixels, plus a PDF's text layer if it has one, and the file's name, type and size). `ReadResult` is `{ ok: true, receipt: ParsedReceipt }` or `{ ok: false, error }`. Decoding, QR scanning, reconciliation and bill conversion sit **outside** the reader and run the same way for every reader, so a later reader (bring-your-own-key AI, now a roadmap backlog item, or a hosted reader in the paid layer) only turns pages into a `ParsedReceipt`. Neither Tesseract.js nor an AI API accepts raw RGBA, so a shared **page encoder**, `encodePage(page) → Blob` (PNG), sits outside the reader too: `OffscreenCanvas.convertToBlob` in the browser (with `canvas.toBlob` as a fallback), and `pngjs` in the Node tests. It's injected into `createBuiltInReader`, and any other reader can use it for its own upload. | Roadmap M2 ("image in, structured receipt out"). Verified in the tesseract.js 7.0.0 sources: the browser `loadImage` accepts URLs, `img`/`canvas`, `OffscreenCanvas` and `Blob`/`File`, and the Node `loadImage` accepts paths, URLs, base64 and encoded `Buffer`s, never pixel arrays (round 1, I-3). |
| D3 | `ParsedReceipt` | `{ merchant?, merchantTaxId?, date?, currencyHint?, items: ParsedItem[], subtotal?, tax?, tip?, discount?, total?, warnings }`. Amounts are integer cents (`Cents`), dates are ISO `YYYY-MM-DD`, and each `ParsedItem` is `{ name, quantity: Ratio, unitPrice: Cents, lineTotal: Cents, needsCheck }`. | Plan default |
| D4 | OCR engine and languages | **Tesseract.js 7** (`tesseract.js` + `tesseract.js-core` 7, Apache-2.0) with the `por` + `eng` LSTM `best_int` models (`@tesseract.js-data/por`, `@tesseract.js-data/eng`, MIT). The models are 1.4 MB + 3.0 MB gzipped, downloaded from the app's own origin on the first scan and cached in IndexedDB by Tesseract.js. OCR runs in a Web Worker, created for each scan and terminated after it, so the page stays responsive and a phone gets its memory back. | Roadmap M2 names Tesseract.js. A spike (Node 24, `tesseract.js@7.0.0`) read a rendered 11-line PT receipt, rotated 3° with noise, at 93 % confidence in about 0.5 s. |
| D5 | Fiscal QR decoder | **`zxing-wasm` 3** (`zxing-wasm/reader`, MIT, maintained, 0.95 MB wasm). It's tried on the whole page first, then on the page's bottom half scaled up 2×, where these codes usually sit. | Roadmap suggests "zxing-js". `@zxing/library` is in maintenance mode. jsQR is unmaintained and weaker on small codes. The spike read a PT fiscal payload back from a rotated receipt image. |
| D6 | PDF | **`pdfjs-dist` 6** (Apache-2.0), loaded only when a PDF is opened, with `isEvalSupported: false`. A PDF with a text layer (a digital receipt or e-fatura) is read from its text, with no OCR and every line at full confidence. pdf.js's `getTextContent` gives positioned fragments, not lines, so the fragments are grouped into lines by baseline (`y` within half the fragment height), sorted by `x`, and joined with single spaces. A page "has a text layer" when it gives at least 20 non-space characters; otherwise it's read by OCR. Its first 3 pages are always rendered at 2× as well, for QR scanning and the image preview, and a PDF without a text layer is read from those pages by OCR. | Plan default: text is exact when it's there |
| D7 | HEIC | First the browser's own decoder (`createImageBitmap`, which works in Safari). If that fails, **`heic-to`**'s CSP build (LGPL-3.0, about 3 MB, self-contained with no remote fetch) is loaded only for that file. **The LGPL-3.0 licence is accepted** (the user's decision on open question 1, manual review M-I-3). Its obligations are met this way: `heic-to`'s CSP build is copied **unmodified** by `vendor-assets.mjs` into `vendor/heic-to/`, never bundled or minified by Vite, and loaded from there with a dynamic `import()` of the `assets.ts` URL, so it stays a separate file that a user can replace with their own build. Its licence text, and the licences of the libraries it bundles (libheif, libde265, checked from the installed package in CP2), are copied next to it. `app/public/THIRD_PARTY_NOTICES.md`, served as `/THIRD_PARTY_NOTICES.md` and linked from the Settings page, names every vendored package with its version, licence and upstream source URL. ADR 0002 records all of this. | Roadmap: "Accept … HEIC". Open question 1, resolved: LGPL-3.0 accepted |
| D8 | Self-hosted assets, never a CDN | By default, Tesseract.js, zxing-wasm and pdf.js each fetch workers, wasm or data from jsDelivr. Every one of those paths is set to the app's own origin: `workerPath`, `corePath`, `langPath` (with `workerBlobURL: false`), zxing's `locateFile`, and pdf.js's `workerSrc`, `wasmUrl` and `standardFontDataUrl`. A script, `app/scripts/vendor-assets.mjs`, copies the needed files from `node_modules` into `app/public/vendor/` (git-ignored). It runs as `predev`, `prebuild` and `prepreview`, so CI's `npm run build` includes them. `assets.ts` is the one place that lists the URLs. | Roadmap "No receipt data leaves the browser"; ADR 0001 key-safety note (few dependencies, no third-party scripts) |
| D9 | Content-Security-Policy | The production build's `index.html` gets a CSP `<meta>`, added by a small Vite plugin with `apply: 'build'` (the dev server's HMR needs looser rules): `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'; img-src 'self' blob: data:; style-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'`. `connect-src 'self'` means the **document** can't send anything to another origin. **Its limit:** a `<meta>` policy doesn't reach dedicated workers. A same-origin worker takes its policy from its own response headers, and a static host sends none by default. So the Tesseract and pdf.js workers, which fetch the OCR core and the models, are bound by D8's same-origin paths, not by this CSP. CP2 tests that every URL handed to a worker is same-origin, and the real-browser check watches the workers' requests too. Header-delivered CSP (which does bind workers) comes with hosting in M6. CP2 checks the policy in a real browser against the preview build. **Static-only constraint** (manual review M-I-1): `connect-src 'self'` still allows a request to the app's own origin, so the CSP alone doesn't prove that no receipt data leaves the browser. The stronger guarantee is that the app is a **static client with no endpoint to receive anything** (ADR 0001: no server until M9), and M2 makes that a checked rule: (1) `app/src` never calls `fetch`, `XMLHttpRequest`, `navigator.sendBeacon`, `WebSocket` or `EventSource` (an ESLint rule), so the only network reads are the libraries' own GETs of the static files `assets.ts` names; (2) the policy's `form-action` is `'none'`; (3) the real-browser check (CP2 on page load, and CP4 with real scans through the finished scan section; round 8, R8-I-1), run by `app/scripts/check-requests.mjs`, records **every** request, from the document and from each dedicated worker, with its URL, method, request headers (including the ones the browser adds itself, such as `Cookie` and `Referer`) and body. It requires each request to be a `GET` with no body and no query string, for a file in the build output, carrying only standard browser request headers (round 8, R8-O-2), and no value from the scanned receipt (merchant, NIF, date, item names and amounts, subtotal, tax, tip, discount, total, and the fiscal QR's payload and fields, both as expected and as the app actually read them; R8-O-1) may appear anywhere in that metadata (manual review round 2, M-I-4). `blob:` and `data:` URLs (the image preview's object URL, and the libraries reading `Blob`s) never leave the browser, so they're allowed and listed separately (round 5, R5-O-2). Any later feature that sends data (the M7 endpoint, M9 accounts) is a new decision, outside M2. Any library that needs `'unsafe-eval'` or a remote origin is a **stop condition**, and loosening the policy is a decision for the user. | Enforces "no receipt data leaves the browser" for the document. D8 plus a test covers the workers (round 1, I-5). `theme-init.js` is already an external script for this reason (M0). |
| D10 | Image clean-up | These are pure functions over RGBA pixels: EXIF orientation (applied at decode by `createImageBitmap`'s `imageOrientation: 'from-image'`), then scaling: a short side under 800 px is doubled, **unless** that would take the long side past 2400 px, and the long side is then capped at 2400 px (so the cap always wins; a 2000 × 700 page stays at 2000 × 700), then Rec. 601 grayscale, then a linear contrast stretch between the 1st and 99th luminance percentiles. Last comes **straightening**: a projection-profile skew estimate over −15°…+15° in 0.5° steps, on an 800-px binarized copy, rotating the page if the estimate is at least 0.5°. There's no hard binarization, because Tesseract thresholds by itself. | Roadmap: "grayscale, contrast, straightening". Perspective correction is out of scope. |
| D11 | Parser rules | See "Parsing rules" below. The parser takes lines of text with a confidence each, whether from OCR or a PDF text layer, and never throws. | Roadmap: PT and EN formats |
| D12 | Which total is trusted | A valid fiscal QR's total (`O`) comes first. Otherwise the printed total that parsing rule 8 selects: the first *total* line after the items region, unless a later one replaces it under rule 8 (round 3, R3-I-1). When both exist and differ, the QR's total is used and a warning says the printed total disagrees. | Roadmap: "check the parsed items against that total" |
| D13 | Turning a receipt into a bill | The import **keeps the current people and payer** and replaces the items and tax, tip and discount. Each item is assigned to everyone, weight 1 (M1 D3). Names are cut to 60 characters, and past 100 items only the first 100 are kept, with a warning. An adjustment read from the receipt (tax, service or tip, discount) is only applied when doing so makes items + adjustments equal the trusted total exactly. The combinations are tried in a fixed order, and the first one that closes wins: none, tax, tip, discount, tax + tip, tax + discount, tip + discount, then all three. If none closes, all three stay at none, and the mismatch shows in the check panel. The tax and tip modes are kept from the current bill. An applied adjustment that would fail `validateBill` (for example a proportional one on a zero items subtotal) stays none. So PT and UK receipts, where IVA/VAT is included in the prices, get no tax. A US receipt, where subtotal + tax (+ tip) = total, gets its tax (and tip) as fixed amounts. The result always passes `validateBill`, which is tested. | M1 D6 (tax is extra, not included). Open question 3 (keep the people) |
| D14 | Review step (the check panel) | A "Receipt check" panel above the items shows the merchant, date and NIF, the trusted total and where it came from ("from the fiscal QR code" or "read from the receipt"), and IVA included (QR `N`) if known. It has a **live** comparison: the bill total `G` from `computeSplit` against the trusted total, as "Matches" or "Items add up to X, Y less than the receipt". It lists warnings and has a "Show receipt image" disclosure (in memory only). Items from lines with OCR confidence under 60 carry a visible "Check" marker, cleared when that item's name, quantity or unit price is edited (not by assignment or share changes). M1's `Item` has no field for this, and the draft stays unchanged, so the flags are the ids of the flagged items, kept in the receipt summary (D15). Clearing a flag saves the summary, so the markers survive a refresh. | Roadmap: "Warn when the items don't add up to the receipt total" |
| D15 | Saved receipt summary | The panel's data (not the image) is saved under `localStorage['settle.receipt']` as `{ version: 1, receipt }`, where the `ReceiptSummary` is the header facts, the trusted total and its source, the IVA total, the warnings and `flaggedItemIds`, so a refresh keeps the check alongside M1's saved bill. It's validated on read, and anything bad drops the summary but keeps the bill. "New bill", "Dismiss" and a new import clear or replace it. The receipt image is **never stored**: its object URL is revoked on a new import, New bill or leaving the page. | M1 D11 pattern. The draft (`settle.bill`) keeps version 1 and is unchanged. |
| D16 | Failure handling | Every failure is a typed error with its own message, and **the current bill stays untouched**: `unsupportedType`, `tooLarge` (over 20 MB), `tooManyPixels` (a page over 40 megapixels, read from the file's header before decoding where possible; see CP2; its message says how to fix it: "Take the photo at normal resolution, or crop it."; the limit is a deliberate memory-safety trade-off: an RGBA bitmap of a 48-MP photo is about 190 MB, and browsers don't guarantee decode-time downscaling without first allocating the full bitmap, so the photo is refused rather than risking a crash on a phone (manual review M-O-3)), `decodeFailed`, `ocrFailed`, `assetsUnavailable` (the reader couldn't load, e.g. offline on a first scan), `noItems` (no line items found), and `cancelled`. Each message ends with "You can type the items in below.", and the manual editor is right there. | Roadmap: "Any parsing failure falls back to the manual editor" |
| D17 | While reading | The editor is `inert` and `aria-busy` while a scan runs, so nothing typed during the scan is lost when the import replaces the items. A status line (`role="status"`) shows the phase: opening, "loading the reader (first time only)", reading text with a percentage, and checking the QR code. A **Cancel** button aborts the scan and terminates the worker. | Plan default |
| D18 | Currency | Amounts are read as cents whatever the symbol, with no conversion, as in M1 D9. If the receipt's symbol (`€`/`EUR`, `£`/`GBP`, `$`/`US$`/`USD`) differs from the region's currency, a warning suggests changing it in Settings → Region. | M1 D9 |

## Parsing rules (D11, specified)

Input: lines `{ text, confidence }` in reading order. For several pages,
the lines are joined in page order, and regions are found across the
joined lines. Output: a
`ParsedReceipt`. All matching is case-insensitive and accent-insensitive
(`serviço` = `SERVICO`).

1. **Normalise** each line: collapse whitespace. Inside tokens that look
   like numbers, fix common OCR swaps (`O`/`o` → `0`, `l`/`I`/`|` → `1`,
   `S` → `5` when surrounded by digits) and close up `1, 50` → `1,50`.
2. **Amounts.** An amount is `-?\d{1,3}(\.\d{3})+,\d{2}`,
   `-?\d{1,3}(,\d{3})+\.\d{2}` or `-?\d+[.,]\d{2}`. Spaces are **never** a
   thousands separator: receipt printers don't group that way, and a
   column line such as `Arroz 1 100,00` (quantity 1, price 100,00) must
   not read as `1 100,00` (round 1, I-2). The amount is optionally with a currency symbol or code before or
   after it, and optionally followed by one tax-code letter (`4,40 A`, as on
   PT supermarket receipts). The decimal separator is whichever of `,`/`.`
   comes last with exactly two digits after it, independent of the region.
   It's parsed to cents exactly (never through floats).

   An amount is always a **whole token** (round 2, R2-I-3): bounded by
   whitespace, the start or end of the line, or a currency symbol or code,
   never matched inside a longer run of digits and separators. So
   `28.09.26` is never `09.26`. A token that is a valid date under rule 5
   is never an amount, and neither is a time (`hh.mm` or `hh:mm`) that
   follows `hora`/`time` or sits next to a date on the same line.
3. **Classify** each line by keywords. Keywords match **whole words or
   phrases** after case and accent folding (so `tax` doesn't match
   `taxa`, and `total` doesn't match inside `subtotal`). Punctuation
   outside amounts and dates separates words, so `TOTAL (IVA incluído)`
   reads as the words `total iva incluido` (round 3, R3-I-2). The groups
   are checked in the order below, and within a group the longest phrase
   is checked first, so the more specific reading always wins (round 1,
   I-1):
   - *ignore*: payment and footer lines (`troco`, `change`, `multibanco`,
     `mb way`, `visa`, `mastercard`, `cash`, `numerário`, `dinheiro`,
     `entregue`, `tendered`, `pago`, `pagamento`, `paid`, `payment`, the
     card payment phrases `pago com cartão`, `cartão de crédito`,
     `cartão de débito`, `card payment`, `credit card`, `debit card`, a
     line whose whole description is `card` or `cartão`, `atcud`,
     `processado por programa`, `capital social`, `obrigado`,
     `thank you`). `card` and `cartão` on their own aren't ignore words,
     because on PT supermarket receipts they're usually the loyalty card
     (round 6, R6-I-1). *ignore* never overrides a line that also matches
     *total*, so `Total Multibanco 12,50` is still a total, and it never
     overrides a line with a *discount* keyword, so `Desconto MB Way 0,50`
     is a discount. (A negative amount alone doesn't count: change printed
     as `Troco -1,60` stays ignored rather than becoming a bill
     discount.) `iva incluído`
     isn't an ignore phrase: it qualifies a total (`TOTAL (IVA incluído)
     23,40` is the total) and is otherwise just text (round 2, R2-I-1);
   - *tax summary*: `total iva`, `iva total`, `total vat`, `vat total`,
     `total tax`, `tax total` (before *total*, because each contains the
     word `total`; these lines count as tax, rule 8). A line that also
     has an "included" qualifier (`incluído`, `incluida`, `incl`, `inc`,
     `c/` (the word `c` after folding), `com`, `included`, `including`) is **not** a tax summary: it
     falls through to *total*, so `TOTAL IVA INCLUÍDO 23,40`,
     `TOTAL (IVA incluído) 23,40` and `Total VAT incl. 23.40` are totals
     (round 3, R3-I-2);
   - *savings summary*: `total poupança`, `total poupanças`,
     `poupança total`, `total desconto`, `total descontos`,
     `total de descontos`, `total savings`, `you saved` (before *total*;
     informational, so they're ignored, because the savings are already
     in the item and discount lines). A line that would be a *total* but
     whose amount is negative is a savings summary too, never the total
     (round 3, R3-O-3);
   - *subtotal*: `subtotal`, `sub-total`, `sub total`, and the pre-tax
     totals `total s/ iva` (`total s iva` after folding), `total sem iva`,
     `total iliquido`, `total excl vat`, `total ex vat`,
     `total excluding vat`, `total before tax`, `net total`, `total net`
     (before *total*, because each contains the word `total`; manual
     review M-I-2);
   - *total*: `total a pagar`, `total c/ iva` (`total c iva`),
     `total com iva`, `total inc vat`, `total incl vat`,
     `total including vat`, `total eur`, `total due`, `amount due`,
     `balance due`, `a pagar`, `total`;
   - *tip/service*: `taxa de serviço`, `service charge`, `serviço`,
     `service`, `gratuity`, `tip` (before *tax*, so `taxa de serviço` is
     never tax);
   - *tax*: `sales tax`, `iva`, `vat`, `tax`, and tax-table lines. A
     tax-table line is a percentage followed by one or two amounts, and it
     counts as one only **outside the items region**, or when it has no
     description beyond tax words, rates and tax codes. Inside the items
     region, `1 Bitoque 23% 9,50` is an item (rule 6), never tax
     (round 2, R2-I-2);
   - *discount*: `desconto`, `desc.`, `poupança`, `promoção`, `promo`,
     `discount`, `saving(s)`, or any line whose amount is negative;
   - *item*: any other line in the items region that ends in an amount
     and has at least 2 letters of description. The amount can be
     followed by a rate (`\d{1,2}([.,]\d+)? ?%`) or a tax code (`A`,
     `(C)`), and a rate or code can also sit between the description and
     the amounts.

   Inside the items region, a line that matches *ignore*, *tip/service*
   or *discount* is still an **item** when its amount isn't negative and
   the matched phrase doesn't start its description (after any quantity).
   So `Menu Promoção 7,50` and `Menu Serviço 9,00` are items, while
   `Desconto 0,50` right after an item still reduces it (rule 7) and
   `Taxa de serviço 5,00` is still a service charge (round 3, R3-O-1).
   This override never applies to a **payment line** (manual review
   M-O-2): a line with an unambiguous payment word (`multibanco`,
   `mb way`, `visa`, `mastercard`, `cash`, `numerário`, `dinheiro`,
   `entregue`, `tendered`, `troco`, `change`, `pago`, `pagamento`,
   `paid`, `payment`), or with one of *ignore*'s card payment phrases, or
   whose whole description is `card`/`cartão`. A payment line is always
   ignored, and it also ends the items region. On its own, `cartão`/`card`
   is usually a loyalty card on PT supermarket receipts, so it doesn't make
   a payment line. A line that matches *total* or *subtotal* is never a
   payment line, so `Total Multibanco 23,40` and `Total paid 25.60` are
   totals (manual review round 2, O-EXT-1). A line with a negative amount,
   or one that matches *discount*, is never a payment line, so `Desc. Cartão Continente
   -0,40` inside the items is still a discount that reduces the item
   above it (rule 7), and the items after it are kept (round 5,
   R5-I-1).
4. **Regions.** The header runs until the first item line, and the items
   region runs until the first subtotal, total or payment line. Item lines after
   that are ignored.
5. **Header facts.**
   - *Merchant*: the first header line with at least 3 letters that isn't
     a document title (`fatura`, `fatura simplificada`, `recibo`,
     `receipt`, `invoice`), an address (it starts with a digit, or is a
     postal code `\d{4}-\d{3}`), or a phone number.
   - *NIF*: 9 digits after `NIF`, `N.I.F.` or `contribuinte` (not `VAT`:
     a UK VAT number is also 9 digits, and passes the mod-11 check about 1
     time in 11), accepted only if the Portuguese mod-11 check digit is
     valid.
   - *Date*: `dd-mm-yyyy`, `dd/mm/yyyy`, `dd.mm.yy(yy)` or `yyyy-mm-dd`,
     accepted only if it's a real calendar date.
6. **Quantities.** On an item line:
   - `N x Name P L` or `N x P` (for example `2 x Imperial 2,20 4,40`);
   - `N un x P`;
   - weighted, `0,532 kg x 2,99 €/kg`, with the quantity limited to 3
     decimals;
   - a column layout, `Name Q P L`, when `Q × P` rounds to `L`;
   - a quantity-first column layout, `Q Name P L` or `Q Name L` (the PT
     restaurant "Qtd. Descrição P.Unit. Total" layout, for example
     `2 Imperial 1,10 2,20`), when `Q` is a whole number from 1 to 99 and,
     with `P`, `Q × P` rounds to `L`. Without `P`, the form applies only
     when the header has a quantity column title (`qtd`, `qtd.`, `quant`,
     `qty`), and the unit price is then `L ÷ Q` when that's a whole number
     of cents (round 2, R2-I-2). Otherwise the leading number stays in the
     name, so `3 Queijos 9,00` and `7 Up 1,40` are `1 × L` named
     `3 Queijos` and `7 Up` (round 3, R3-O-2);
   - a quantity-only line with no letters (`2 x 2,20 4,40`) completes the
     item line just before it.

   The printed line total `L` is authoritative. If `round(Q × P)` (M1's
   `lineTotal`) equals `L`, the item keeps `Q` and `P`. Otherwise, and when
   there is no quantity, it becomes `1 × L`.

   The item's **name** is the line's text with the recognised quantity,
   `x`/`un`/`kg`, unit price, line total, rate, tax code and currency tokens
   removed, and trimmed (`2 Imperial 1,10 2,20` → `Imperial`,
   `1 Bitoque 23% 9,50` → `Bitoque`).
7. **Item discounts.** A discount line right after an item reduces that
   item: it becomes `1 × (L − d)`, where `d` is the absolute value of the
   discount line's amount, whether it's printed as `-0,40` or `0,40`
   (manual review round 2, O-EXT-2). If that would go below 0, the whole
   line goes to the bill discount instead. Any other discount line adds to
   the bill discount.
8. **Totals.** `subtotal`, `tax` (a *tax summary* line's amount if there
   is one, otherwise the sum of the tax lines' amounts, or the tax table's
   tax column), `tip` and `total` are taken from their lines. The printed
   total is the **first** *total* line after the items region. Only a
   *total* or *tip/service* line that carries an amount takes part: a
   blank `Total ____` or `Tip ____` line for handwriting is ignored, and
   so is a suggested-tip line, which never counts as the tip: one with
   the words `suggested`/`sugestão`/`sugerida`, or one of two or more
   consecutive tip lines that each carry a percentage (`15% 3.24`,
   `18% 3.89`). A single service line with a rate, such as the UK
   `Service charge 12.5% 5.63`, is still the service charge (manual
   review M-O-1). A later *total* line replaces the
   first only if it uses a more specific phrase (`total a pagar`,
   `total c/ iva`, `total com iva`, `total inc(l) vat`, `total due`,
   `amount due`, `balance due`) and the first one didn't, **or** a
   *tip/service* line sits between the two (a card receipt's
   `Total 21.60 / Tip 4.00 / Total 25.60`; round 3, R3-I-3). So an IVA
   table's or savings summary's line after the real total can never
   become the total (round 2, R2-I-1), and a tip added
   after the first total is never silently dropped.
9. **needsCheck** is set on an item whose line confidence is under 60, or
   whose amount needed an OCR character fix.
10. **Warnings** (typed codes, each with a user-facing message in the UI):
    `noTotal`, `totalMismatchQr` (D12), `itemsTruncated`, `currencyDiffers`
    (D18), `creditNote` (QR document type `NC`), `lowConfidence` (the page's
    mean confidence is under 50: "This photo was hard to read").

## Fiscal QR payload (Portaria 195/2020)

`parseFiscalQr(text)` reads the `*`-separated `KEY:value` fields. It
requires `A` (the issuer's NIF, 9 digits with a valid check digit), `F`
(the date `YYYYMMDD`, a real date) and `O` (the gross total, `\d+\.\d{2}`).
It uses these when present:

- `D` (document type);
- `I1`–`I8`, `J1`–`J8` and `K1`–`K8` (the tax bases and IVA per rate and
  region);
- `N` (total tax);
- `H` (ATCUD).

It returns `{ ok: true, qr }` or `{ ok: false }` and never throws. Any
other QR code is ignored. The QR's facts override the parsed header facts
(date, NIF) and supply the trusted total (D12).

## Prerequisites (before `/milestone-implement`)

- Node 24 and npm, as in M1.
- **New runtime dependencies**, the first since M0, each recorded in
  ADR 0002 (CP2):
  - `tesseract.js@^7`, whose `tesseract.js-core@^7` comes with it;
  - `@tesseract.js-data/por@^1` and `@tesseract.js-data/eng@^1`;
  - `zxing-wasm@^3`;
  - `pdfjs-dist@^6`;
  - `heic-to@^1` (LGPL-3.0, accepted; see D7).
- **New dev dependency:** `pngjs` (MIT, no dependencies), which decodes
  the sample-receipt PNGs to RGBA in the Node tests.
- `rsvg-convert` and `magick` are installed. They're needed only to
  regenerate the sample receipts and the browser-check files, and are not
  a CI or project dependency (as for M0's icons).
- `heif-enc` (libheif's command-line encoder, with its HEVC encoder
  plugin) **isn't installed** on the development machine today, and this
  ImageMagick build has no HEIC support either. It must be installed
  before CP3 generates the browser-check files. Like `rsvg-convert`, it's
  a regeneration-only tool, not a CI or project dependency (manual review
  round 2, A-1; round 8, R8-O-3).
- Headless Brave for `check-requests.mjs` (installed, `/usr/bin/brave`).
- Any other new dependency is a stop condition.

## Checkpoints

<!-- Generated by workflow_state.render_registry_markdown(registry); do not edit by hand. -->
| id | name | depends_on | complexity | session_target |
| --- | --- | --- | --- | --- |
| M2-CP1 | Receipt model, reader interface, rule-based parser, fiscal QR payload, reconciliation and bill conversion (pure) | - | 3 | 1 |
| M2-CP2 | File intake and image pipeline: type sniffing, limits, raster/HEIC/PDF decoding, clean-up (grayscale, contrast, deskew), self-hosted assets, CSP, ADR 0002 | - | 3 | 1 |
| M2-CP3 | Built-in reader (Tesseract.js worker), QR scanning (zxing-wasm), import pipeline, sample receipt corpus with real-OCR tests | M2-CP1, M2-CP2 | 3 | 2 |
| M2-CP4 | Review step UI: scan section (picker, camera, drop), progress and cancel, receipt check panel, flagged items, saved summary, manual fallback | M2-CP3 | 3 | 2 |
| M2-CP5 | READMEs, Settings line, end-to-end scan-to-split test, final verification | M2-CP4 | 2 | 3 |
<!-- End generated table. -->

### M2-CP1 — Pure receipt logic

**Requirements:** REQ-4, REQ-5, REQ-6, REQ-7

**Files** (under `app/src/features/receipt/`)
- `model.ts`: `ParsedReceipt`, `ParsedItem`, `ReceiptWarning`,
  `ReceiptSource`, `ReceiptPage` (`{ width, height, data: Uint8ClampedArray }`),
  `TextLine`, `ReceiptReader`, `ReadResult`, `ReadError` (D2, D3, D16).
- `parse/amounts.ts`: amount tokens (rule 2) and the OCR digit fixes
  (rule 1).
- `parse/keywords.ts`: the keyword tables (rule 3).
- `parse/parseReceiptText.ts`: `parseReceiptText(lines) → ParsedReceipt`
  (rules 3–10).
- `fiscalQr.ts`: `parseFiscalQr(text)` and `isValidNif(digits)`.
- `toBill.ts`: `receiptToBill(receipt, qr, currentBill, ids)`, which
  returns the new `Bill` and the `ReceiptSummary` (D12, D13).
- `reconcile.ts`: `checkReceipt(bill, summary)`, which returns `match`,
  `mismatch` with the difference, `noTotal`, or `billInvalid` (D14).

**Order within CP1** (manual review M-O-4). The modules are built and
tested in this order, and each one's tests pass before the next starts,
as recorded in the checkpoint notes: (1) `model.ts`, `amounts.ts` and
`keywords.ts`; (2) `parseReceiptText`; (3) `fiscalQr.ts`; (4) `toBill.ts`
and `reconcile.ts`. Classification tests (one line in, one group out)
stay separate from the whole-receipt fixtures, so a keyword change shows
up as a precise failure.

**Tests**
- About 25 text fixtures under `receipt/fixtures/text/`, as `.txt`
  transcripts with an `.expected.json` each. They cover:
  - PT restaurant, café and supermarket receipts (weighted items,
    tax-code letters, an item discount, `Poupança`, a multi-rate IVA
    table);
  - a UK pub (VAT included, service charge) and a US diner (subtotal,
    sales tax, tip);
  - OCR-damaged variants (`O`/`0`, `l`/`1`, `1, 50`, merged spaces);
  - a quantity-only follow-on line, a column layout, and payment lines
    after the total;
  - a receipt with no total, and one with no items.
- Unit tests:
  - amounts: `1.234,56`, `1,234.56`, `12,50 €`, `€12.50`, `-0,50`,
    `4,40 A`; `12,5` isn't an amount;
  - NIF check digits, valid and invalid;
  - dates: valid and impossible (`31-02-2026`);
  - `round(Q × P) ≠ L` becomes `1 × L`;
  - keyword precedence (I-1): `SUB TOTAL 10,00` and `SUB-TOTAL 10,00`
    are *subtotal*, `Taxa de serviço 5,00` is *tip/service*, and an item
    named `Taxa extra` doesn't match `tax`;
  - `Arroz 1 100,00` is a column item, quantity 1 and price 100,00, never
    the amount 1 100,00 (I-2);
  - a UK `VAT No 123456789` line never becomes the NIF (O-4);
  - two pages' lines join into one items region (O-5);
  - total selection (R2-I-1): `TOTAL 23,40` followed by an IVA table
    ending in `Total IVA 4,38` gives the total 23,40 and the tax 4,38;
    `IVA Total`, `Total VAT` and `Total tax` lines are tax, never the
    total; `TOTAL (IVA incluído) 23,40` is the total; `Total poupança
    3,20` after the total is ignored; `Total Multibanco 23,40` and
    `Total paid 25.60` are totals, never payment lines (O-EXT-1);
  - total selection (round 3): D12 and rule 8 agree (R3-I-1), since
    `receiptToBill` takes the printed total from the parser;
    `TOTAL IVA INCLUÍDO 23,40` and `Total VAT incl. 23.40` are totals,
    never tax (R3-I-2); `Subtotal 20.00 / Sales tax 1.60 / Total 21.60 /
    Tip 4.00 / Total 25.60` gives the total 25.60, and `receiptToBill`
    applies both the tax and the tip (R3-I-3); `Total descontos -3,20`
    before `TOTAL 20,00` leaves the total at 20,00 (R3-O-3);
  - keywords inside the items region (R3-O-1): `Menu Promoção 7,50` and
    `Gift card 10,00` are items; `Desconto 0,50` after an item still
    reduces it;
  - pre-tax totals (M-I-2): `Total s/ IVA 19,02` followed by
    `Total c/ IVA 23,40` gives the total 23,40, and so does
    `Total sem IVA 19,02` / `TOTAL 23,40`; `Net total 19.50` followed by
    `Total inc VAT 23.40` gives 23.40;
  - placeholders and suggestions (M-O-1): blank `Tip ____` and
    `Total ____` lines after `Total 21.60` leave the total at 21.60 and no
    tip; `Suggested tip` lines and a `15% 3.24 / 18% 3.89 / 20% 4.32`
    block are never the tip, while `Service charge 12.5% 5.63` is;
  - payment lines (M-O-2): with the total line missing,
    `Pago com Visa 23,40`, `Pagamento Multibanco 23,40` and
    `Pago com cartão 23,40` are never items, and the receipt gets
    `noTotal`;
  - loyalty-card lines (R5-I-1, R6-I-1): `Desc. Cartão Continente -0,40`,
    `Poupança Cartão Poupa Mais -0,30` and `Desconto Cartão 0,50` inside
    the items are discounts that reduce the item above them, never items
    or ignored lines, and the items after them are kept; `Troco -1,60`
    after the total is ignored, never a bill discount; `CARD 23.40` after
    a missed total is a payment line;
  - a leading number without a quantity column (R3-O-2): `3 Queijos 9,00`
    is 1 × 9,00 named `3 Queijos`; under a `Qtd Descrição Total` header,
    `2 Imperial 2,20` is 2 × 1,10;
  - item layouts (R2-I-2): `2 Imperial 1,10 2,20` is 2 × 1,10, named
    `Imperial`; `1 Bitoque 23% 9,50` and
    `Bitoque 9,50 23%` are items of 9,50 named `Bitoque`, never tax; a
    `23% 10,16 2,34` line after the total is a tax-table line;
  - dates and times are never amounts (R2-I-3): `Data 28.09.26`,
    `28.09.2026 12.30` and `Hora: 12.30` in the header give no item, and
    the merchant and date around them are still found;
  - `Capital social 50.000,00 €` in the header gives no item (R2-O-5);
  - an item discount larger than its item goes to the bill discount.
- `parseFiscalQr`:
  - a full payload (the spike's);
  - a minimal payload;
  - a bad NIF, a bad date, a missing `O` or a non-fiscal QR → `{ ok: false }`;
  - `D:NC` → the `creditNote` warning;
  - a property test: no generated string throws.
- `receiptToBill`:
  - people and payer are kept, and every item is assigned to everyone;
  - PT: IVA included, so no tax;
  - US: subtotal + tax + tip = total, so both are applied;
  - an adjustment that doesn't close the arithmetic stays none;
  - the combination order (R2-O-2): when both tax alone and tip alone
    would close, tax wins; the tax and tip modes are kept from the current
    bill;
  - 101 items → 100 and `itemsTruncated`;
  - a 70-character name is cut to 60;
  - **every** fixture's bill passes `validateBill`.
- `checkReceipt`: match, mismatch in both directions, no total, and an
  invalid bill.

### M2-CP2 — File intake, image pipeline, assets and CSP

**Requirements:** REQ-1, REQ-2, REQ-3, REQ-10, REQ-11

**Files**
- `receipt/intake.ts`: `sniffType(bytes)` by magic number (JPEG
  `FF D8 FF`, PNG `89 50 4E 47`, PDF `%PDF-`, and HEIC/HEIF by the
  `ftyp` **major** brand: `heic`, `heix`, `heim`, `heis`, `mif1` or
  `msf1`. A file whose major or compatible brands include `avif` is
  AVIF, which is `unsupportedType`. It falls back to the file's MIME type
  and extension only if the bytes are inconclusive. It also has:
  - `checkFile(file)`: the 20 MB limit and the supported types;
  - `readDimensions(bytes)`: the pixel size from the header, without
    decoding (PNG `IHDR`; JPEG's first `SOFn` marker; HEIC's `ispe`
    box where present). A page over **40 megapixels** is refused with
    `tooManyPixels` before any decoding (round 1, I-6). When the
    header can't give the size (a HEIC with no `ispe`), the size is
    checked right after decoding, before any canvas work.
- `receipt/decode.ts` (browser adapter):
  - raster → `ImageBitmap` (with EXIF orientation) → canvas → a
    `ReceiptPage`;
  - HEIC: native decoding, then a lazy `heic-to/csp` fallback (D7);
  - PDF: a lazy `pdfjs-dist`, with up to 3 pages rendered at 2× and,
    when present, the text layer too (D6). The render scale is
    `min(2, √(40 MP ÷ the page's pixel area at scale 1))`, so a huge
    MediaBox can't exceed the pixel limit.
- `receipt/pdfTextLines.ts` (pure): turns a page's text fragments into
  `TextLine`s, and decides whether the page has a text layer (D6).
- `receipt/encodePage.ts`: D2's page encoder (browser version).
- `receipt/preprocess.ts` (pure): `toGrayscale`, `stretchContrast`,
  `estimateSkew`, `rotate` and `fitSize`, with the parameters of D10.
- `receipt/assets.ts`: the same-origin URLs (D8), built from
  `import.meta.env.BASE_URL`.
- `app/scripts/vendor-assets.mjs`: copies these into `public/vendor/`:
  - the Tesseract worker; the three core builds that tesseract.js 7's
    `getCore.js` loads from a directory `corePath` with the default
    LSTM-only engine: `tesseract-core-lstm.wasm.js`,
    `tesseract-core-simd-lstm.wasm.js` and
    `tesseract-core-relaxedsimd-lstm.wasm.js` (R2-O-4); and the
    `por`/`eng` `best_int` models (`<lang>.traineddata.gz`);
  - `zxing_reader.wasm`;
  - the pdf.js worker, wasm and standard fonts;
  - `heic-to`'s CSP build, unmodified, into `vendor/heic-to/` (D7);
  - each vendored package's licence file (and the licences of the
    libraries `heic-to` bundles) into `vendor/licenses/`.

  It checks that every source file exists, failing the build otherwise.
  `app/.gitignore` gets `public/vendor/`, and `package.json` gets the
  `predev`, `prebuild` and `prepreview` hooks.
- `app/scripts/check-requests.mjs`: the real-browser privacy check (D9,
  M-I-4). It starts headless Brave with remote debugging against
  `npm run preview`, and drives it over the DevTools protocol through
  Node 24's built-in `WebSocket`, so it adds no dependency. It
  auto-attaches to every dedicated worker (`Target.setAutoAttach`,
  `flatten: true`, workers paused until their `Network` domain is on),
  and records, for the document and each worker:
  - every request's URL, method and body (`Network.requestWillBeSent`);
  - its full request headers as sent, including browser-added ones
    (`Network.requestWillBeSentExtraInfo`);
  - console CSP violations.

  It has two modes. **Page-load mode** (used in CP2) loads the page and
  checks every request it makes. **Scan mode** (used from CP4, when the
  scan section and check panel exist; round 8, R8-I-1) takes a receipt
  file and that receipt's value set (below), uploads the file through the
  scan section with `DOM.setFileInputFiles`, and waits for the check
  panel. Both modes write the log and a pass/fail report. The log is
  saved with the checkpoint notes. It isn't part of `npm run check`,
  because CI has no browser.
- `app/vite.config.ts`: the `cspMeta()` plugin (D9, `apply: 'build'`).
- `app/eslint.config.js`: the static-only rule (D9): no `fetch`,
  `XMLHttpRequest`, `sendBeacon`, `WebSocket` or `EventSource` in
  `src/`. It applies to production files only. Test files
  (`**/*.test.{ts,tsx}` and test-support files such as
  `encodePage.node.ts`) are exempt, because CP3's corpus test replaces
  `globalThis.fetch` with a failing stub (round 5, R5-O-1).
- `app/public/THIRD_PARTY_NOTICES.md`: every vendored package, its
  version, licence and upstream source URL, with the LGPL-3.0 notice for
  `heic-to` (D7).
- `docs/adr/0002-in-browser-receipt-reading.md`: the dependencies (D4–D7)
  and their licences, including the accepted LGPL-3.0 for `heic-to` and
  how its obligations are met (D7), the self-hosting, the CSP and the
  static-only constraint (D8, D9), the download size,
  and the alternatives (jsQR, `@zxing/library`, the native
  `BarcodeDetector` (not in Firefox or Safari), CDN loading (rejected)).

**Tests**
- `sniffType`:
  - each supported magic number;
  - a `.jpg` that is really a PDF is detected as a PDF;
  - a GIF, or a text file named `.png`, → `unsupportedType`;
  - an AVIF file (major brand `avif`, compatible `mif1`) →
    `unsupportedType`;
  - 20 MB + 1 byte → `tooLarge`.
- `readDimensions`: the right size from PNG, baseline and progressive
  JPEG, and HEIC headers. Crafted headers for 10 000 × 5 000 (50 MP) PNG
  and JPEG files → `tooManyPixels`, without any decode being called. A
  truncated header → decoding proceeds, then the post-decode check applies.
- The PDF render scale for an A4 page and for a 5 m × 5 m MediaBox: the
  latter stays under 40 MP.
- PDF text lines (R2-O-1), from the pure grouping function over
  fragments built in the test: fragments given out of order form the
  right lines, fragments on slightly different baselines join, and a page
  with fewer than 20 non-space characters counts as having no text layer.
- The `tooManyPixels` message tells the user how to fix it (R2-O-6).
- `preprocess`, on synthetic pixel arrays built in the test:
  - grayscale weights;
  - contrast stretch endpoints, and a flat image stays flat;
  - `estimateSkew` recovers −7°, −2°, 0°, +3° and +12° on generated
    striped "text" images, within 0.5°;
  - `fitSize` limits (a 4000 × 3000 image → a 2400-px long side; a
    1000 × 600 image is doubled to 2000 × 1200; a 2000 × 700 image stays
    as it is, because doubling would pass the cap).
- `assets.ts`: every URL is same-origin (starts with the base path), and
  the vendor script's file list covers every URL `assets.ts` names.
- **Worker-bound URLs** (I-5): the exact options passed to Tesseract's
  `createWorker` (`workerPath`, `corePath`, `langPath`,
  `workerBlobURL: false`) and to pdf.js (`workerSrc`, `wasmUrl`,
  `standardFontDataUrl`), captured through stubs, are all same-origin.
- `cspMeta`:
  - the built `index.html` contains the exact policy;
  - the dev server's doesn't.
- Static-only (M-I-1): a lint test shows that `fetch` and
  `navigator.sendBeacon` in a production file under `src/` fail the ESLint
  rule, while the same calls in a `*.test.ts` file don't (R5-O-1), and the
  built policy has `form-action 'none'`.
- `heic-to` module format (R5-O-3): a test imports the vendored CSP build
  the way `decode.ts` does (a dynamic `import()`) and checks that it
  exports the conversion function. If the package ships no ES module
  build, it's loaded unmodified as a classic `<script>` from `vendor/`,
  which `script-src 'self'` allows, and the test checks the global it
  defines instead. It is never wrapped or rebundled (D7).
- Licences (M-I-3): after `vendor-assets.mjs`, the file in
  `vendor/heic-to/` is byte-identical to the package's CSP build, every
  vendored package has its licence file in `vendor/licenses/`, and
  `THIRD_PARTY_NOTICES.md` names every package in the vendor list.
- **Real-browser check** (`check-requests.mjs`), recorded in the
  checkpoint notes: in `npm run preview`, with headless Brave
  (Chromium, whose DevTools protocol also reports dedicated workers'
  requests), load the page. It must show no CSP violations in the
  console. The full request log, from the document and every worker, is
  saved with the notes. Every network entry must be a same-origin `GET`
  with no body and no query string, for a file in the build output.
  `blob:` and `data:` URLs are local, so they're allowed and listed
  separately (D9).

  Every request's header **names** must also come from the browser's
  standard set: `Accept`, `Accept-Encoding`, `Accept-Language`,
  `Cache-Control`, `Connection`, `Cookie`, `Host`, `If-Modified-Since`,
  `If-None-Match`, `Origin`, `Pragma`, `Range`, `Referer`,
  `Upgrade-Insecure-Requests` (sent on every document navigation; round
  9, R9-I-1), `User-Agent`, and `Sec-*`. Names are compared
  case-insensitively, as HTTP defines them, because Brave sends the
  Client Hints as lowercase `sec-ch-ua*` and the rest in Title-Case.
  Any other name, such as an `X-*` header, fails the check,
  so an encoded value in a custom header that a text search can't see is
  still caught (round 8, R8-O-2). The list is a constant in the script,
  and widening it is a reviewed plan change. A positive check comes
  first: CP2's clean page-load run (the document, its scripts and
  styles, and the favicon) must pass the header-name rule, so a list that
  is too tight fails there, visibly, and never later looks like a leak
  (R9-I-1).

  The script's **value-set search** is built in CP2 and exercised by
  CP4's real scans (R8-I-1). For each scan, the log is searched for every
  value in that receipt's **value set** (M-I-4). The set is built from
  two sources. The first is the receipt's `.expected.json` and its QR
  payload:
  - the merchant, the NIF and the date (as printed, as `YYYY-MM-DD` and
    as `YYYYMMDD`);
  - every item name, and every item's unit price and line total;
  - the subtotal, tax, tip, discount and total, where present;
  - the fiscal QR's whole payload, and its `A`, `F`, `H`, `N` and `O`
    fields.

  The second source is **what the app actually read**. OCR output can
  differ from the expected values, so after each scan the script reads
  `settle.bill` and `settle.receipt` from `localStorage` (through
  `Runtime.evaluate`). It adds their item names and amounts, and the
  merchant, NIF, date and totals, to the set (round 8, R8-O-1).

  Amounts are searched with both `,` and `.` as the decimal separator.
  Names are searched case- and accent-insensitively, after URL-decoding
  the metadata. Every value is matched as a whole token, so that `2,20`
  doesn't match inside a version number. The search covers every
  request's URL, method, header names and values, and body. Any match
  fails the check. The structural checks above still apply to every
  request.

  Every run first proves that the check can catch a leak: it has the page
  send one same-origin `GET` with a receipt value in a custom header
  (through `Runtime.evaluate`, not app code), and that run must fail, on
  both the value search and the header-name rule. In page-load mode, the
  planted value is taken from sample 1's value set.

  CP2's own run is page-load mode only, because the scan section and
  check panel arrive in CP4.

### M2-CP3 — Built-in reader, QR scanning, import pipeline, sample corpus

**Requirements:** REQ-3, REQ-5, REQ-7, REQ-8, REQ-9, REQ-10

**Files**
- `receipt/builtInReader.ts`: `createBuiltInReader({ assets,
  encodePage })`, a `ReceiptReader`.
  - A text-layer source goes straight to `parseReceiptText`.
  - Otherwise it runs preprocessing, `encodePage` (D2), then a
    Tesseract worker (`workerBlobURL: false`, D8), `recognize` per
    encoded page, lines with their confidence, and `parseReceiptText`.
  - Its `onProgress` maps Tesseract's statuses to D17's phases, and an
    aborted `signal` terminates the worker.
- `receipt/qrScanner.ts`: `scanFiscalQr(pages)` with zxing-wasm, using
  `locateFile` → `assets.ts` and D5's two attempts per page. It returns the
  first payload that `parseFiscalQr` accepts.
- `receipt/importReceipt.ts`: `importReceipt(file, deps, options)`, which
  runs intake → decode → (reader ∥ QR scan) → `receiptToBill`, and returns
  either `{ ok: true, bill, summary, imageUrl }` or `{ ok: false, error }`
  (D16). `deps` (`decode`, `reader`, `scanQr`) is injected, so the UI tests
  and later readers can swap them.
- `receipt/encodePage.node.ts` (test support only): D2's encoder with
  `pngjs`.
- `receipt/fixtures/receipts/`: the sample corpus (below), its SVG
  sources, and `app/scripts/make-sample-receipts.mjs` (`rsvg-convert` +
  `magick` for rotation, noise, blur and fading). The PNGs are committed,
  so CI needs neither tool.

**Sample corpus** (about 10 receipts, each with `.expected.json`):
1. a clean PT restaurant receipt with a fiscal QR;
2. the same as a "photo": rotated 4°, noise, gray background;
3. a PT supermarket: weighted items, an item discount, tax-code letters, a
   multi-rate IVA table, a QR;
4. a small PT café receipt without a QR;
5. a faded thermal PT receipt (low contrast);
6. a UK pub: VAT included, 12.5 % service charge;
7. a US diner card receipt, laid out `Subtotal / Sales tax / Total / Tip /
   Total` (the tip between two totals, R3-I-3), expected to match with
   both the tax and the tip applied;
8. a mismatch: one item line smudged out, so it has to be flagged;
9. a PT e-fatura PDF with a text layer;
10. a non-receipt image (a paragraph of prose), which gives `noItems`.

**Browser-check files** (M-I-4), under `receipt/fixtures/browser/`. They
are made by `make-sample-receipts.mjs` from the corpus above and
committed, each next to the sample's `.expected.json`. CP3 only creates
them. CP4 scans them in the real browser, because the scan section they
are uploaded through is a CP4 deliverable (round 8, R8-I-1):
- `sample-1.jpg`: sample 1 as a JPEG (`magick`);
- `sample-3.heic`: sample 3 as a HEVC-coded HEIC (`heif-enc`, from
  libheif). Headless Chromium can't decode HEIC, so this scan goes
  through the `heic-to` fallback;
- `sample-6-scanned.pdf`: sample 6 as an image-only PDF with no text
  layer (`magick`);
- `sample-9.pdf`: sample 9, the text-layer e-fatura.

**Tests**
- `receipts.ocr.test.ts` (`@vitest-environment node`) runs every sample
  **offline** through:
  - the **real** Tesseract (Node, with `node_modules` core and
    `langPath`, `cacheMethod: 'none'` so no model files are written to the
    working directory, and pages encoded by `encodePage.node.ts`);
  - the real zxing-wasm, with `locateFile` pointed at
    `node_modules/zxing-wasm/dist/reader/zxing_reader.wasm`, because its
    default is `fastly.jsdelivr.net` in every environment (round 1, I-4);
  - real pdf.js text extraction (its legacy Node build).

  `globalThis.fetch` is replaced for the test by a stub that fails on
  any `http(s):` URL, so a CDN fallback fails the test instead of passing
  silently. The results then go to `receiptToBill`
  and `checkReceipt`. For each sample, either:
  - the check is `match`, and the item count and trusted total equal the
    expected ones; or
  - the sample is expected to be flagged (5 may be, 8 must be), and the
    check is `mismatch` or has `needsCheck` items.

  Sample 10 gives `noItems`. There's a 60 s timeout per file (the spike
  took about 0.5 s per page).
- `importReceipt` with fakes:
  - each `ReadError` passes through, and the current bill isn't touched;
  - `cancelled` when aborted;
  - the QR and reader results are combined per D12;
  - a reader that throws becomes `ocrFailed`.
- `builtInReader` with a stub worker: the progress mapping, and
  termination on abort and after success.

### M2-CP4 — Review step UI

**Requirements:** REQ-1, REQ-6, REQ-9, REQ-10

**Files** (under `app/src/features/receipt/components/`, CSS Modules,
tokens only; `app/src/pages/SplitPage.tsx`)
- `ScanReceipt.tsx`: a "Scan a receipt" section at the top of the Split
  page. It has:
  - "Choose file" (`accept` = JPEG, PNG, HEIC/HEIF, PDF);
  - "Take photo" (`accept="image/*" capture="environment"`);
  - a drop zone over the section, with a visible outline while dragging;
  - the line "Read on this device. The receipt never leaves your
    browser."

  If the bill already has content (more than one item, an item with a
  name or price, or a tax, tip or discount that isn't none), it first
  asks `window.confirm('Replace the current items
  with the receipt's? People stay as they are.')`.
- While reading (D17): the status line, a Cancel button, and the editor
  made `inert` and `aria-busy`.
- `ReceiptCheck.tsx`: the D14 panel. The status is text as well as an icon
  (a ✓ or ⚠ is never the only signal), plus the warnings list, the image
  disclosure and "Dismiss".
- `ItemsSection.tsx` (M1): a "Check" marker on flagged rows, labelled for
  screen readers ("Item 3: check this line"), and cleared by the first
  edit to that item's name, quantity or unit price (D14).
- `receipt/receiptStore.ts`: `loadReceiptSummary`/`saveReceiptSummary`
  (D15), try/catch around storage, as in M1's `draft.ts`.
- `receipt/ReceiptImportProvider.tsx`: provides `importReceipt` with the
  real dependencies. The tests provide fakes.
- `SplitPage.tsx`: after an import it remounts the editor (M1's
  `editorSession`), then moves focus to the check panel's heading. "New
  bill" also clears the summary and the image.

**Tests (Testing Library, fake import)**
- Picking a file (`user.upload`) fills the items and shows the panel with
  "Matches". Editing a price changes the panel to a mismatch, live.
- Each `ReadError` shows its message, and the bill is unchanged.
- The confirm prompt appears only when the bill has content, and
  declining leaves everything unchanged.
- Cancel aborts the scan, and the editor is `inert` only while reading.
- A flagged item shows "Check" until it's edited, and a cleared flag
  stays cleared after a remount (R2-O-3).
- The summary survives a remount (it's saved). New bill and Dismiss
  clear it. A malformed saved summary is ignored and the bill kept.
- A drop event with a file starts the import.
- Accessibility: every control has a label, and the status line is
  `role="status"`.

**Real-browser scans** (`check-requests.mjs` scan mode, D9, M-I-4;
moved here from CP3 in round 8, R8-I-1), recorded in the checkpoint
notes with their full request logs. In `npm run build` then
`npm run preview`, with headless Brave, each of CP3's four browser-check
files is scanned through the scan section: `sample-1.jpg`,
`sample-3.heic` (through the `heic-to` fallback), `sample-6-scanned.pdf`
and `sample-9.pdf`. Each scan runs in its own Brave process with a
fresh temporary `--user-data-dir`, so nothing is served from an earlier
scan's IndexedDB model cache or HTTP cache. tesseract.js 7 reads the
language models from IndexedDB before fetching them, so in a shared
profile only the first OCR scan would request them (round 9, R9-O-1).
The app's own `cacheMethod` is not changed for the test. Each run:
- first proves that the planted header leak is caught (CP2);
- applies CP2's structural checks, header-name allowlist and value-set
  search (the expected values and the values the app read) to every
  request from the document and every worker;
- shows no CSP violations in the console;
- **proves worker capture positively** (round 8, R8-O-4). For the OCR
  scans (the JPEG, the HEIC and the scanned PDF), the log must contain
  the Tesseract core and `*.traineddata.gz` requests. For the two PDF
  scans, it must contain the pdf.js worker script and its own requests
  (wasm or standard fonts, where the file needs them). Each of these must
  be attributed to its worker session, or to whichever session the
  protocol reports it under, as recorded in the notes. A run where an
  expected worker request is missing fails, so a worker that silently
  never attached can't pass as a clean log.

A scan that fails any of these is a stop condition for CP4.

### M2-CP5 — READMEs, Settings, end-to-end, verification

**Requirements:** REQ-11, REQ-12

**Files**
- `README.md`: "What works today" gains receipt scanning (the formats,
  the fiscal QR, the review step, and that it's read on the device). The
  privacy section says receipts are read locally and never uploaded, and
  that the first scan downloads the reader (about 8 MB) from the app
  itself. A "Third-party licences" line points to
  `THIRD_PARTY_NOTICES.md`, including the LGPL-3.0 `heic-to` (D7). The
  "coming soon" wording for M2 is removed.
- `app/README.md`: the `features/receipt/` layout; the vendor-assets script
  and why (D8); the CSP (D9); regenerating the sample receipts; the
  `settle.receipt` storage key, and Tesseract's IndexedDB cache.
- `app/src/pages/SettingsPage.tsx`: a "Third-party licences" link to
  `THIRD_PARTY_NOTICES.md` (D7), with a test. The "Receipt reading" line becomes
  "Built-in: read on this device." It promises no milestone: after the
  roadmap restructure, bring-your-own-key reading is a backlog item, not
  M3 (round 1, I-7). `SettingsPage.test.tsx`'s "comes in M3" assertion is
  replaced.
- `app/src/pages/SplitPage.e2e.test.tsx`: a new test. With `importReceipt`
  backed by fake decode and QR scanning, but the **real** parser run on
  sample 1's OCR text, it uploads a file, checks the items and "Matches",
  assigns items to 3 people, and checks the per-person totals against
  hand-computed values and the settle-up.

**Done when** (milestone):
- `npm run check` and `npm run build` pass, and the `app`,
  `workflow-conformance` and `pr-title` checks are green on the M2 PR.
- The roadmap's M2 "Done when" holds:
  - the sample corpus parses with matching totals or is clearly flagged
    (CP3's corpus test);
  - every failure falls back to the manual editor (CP3 and CP4 tests);
  - no receipt data leaves the browser (D8, the D9 CSP and static-only
    rule, and `check-requests.mjs`'s CP2 page-load log and CP4 real-scan
    logs. Those logs show only same-origin `GET`s of the app's own static
    files, with no body or query and only standard header names, during
    real scans of every file type, with the workers' own requests
    present. No value from the scanned receipt, as expected or as read,
    appears in any request's URL, headers or body, and the check's own
    planted leak is caught);
  - the READMEs are updated.
- In functional review, the user scans real receipts of their own on a
  phone and a desktop.

## Requirement coverage

| Requirement | Checkpoints |
|-------------|-------------|
| REQ-1 Upload: picker, camera, drag and drop; JPEG/PNG/HEIC/PDF | M2-CP2, M2-CP4 |
| REQ-2 Image clean-up (grayscale, contrast, deskew) | M2-CP2 |
| REQ-3 Tesseract.js OCR in the browser, self-hosted | M2-CP2, M2-CP3 |
| REQ-4 Rule-based parser, PT and EN | M2-CP1 |
| REQ-5 Portuguese fiscal QR | M2-CP1, M2-CP3 |
| REQ-6 Review step with total check | M2-CP1, M2-CP4 |
| REQ-7 Shared reader interface | M2-CP1, M2-CP3 |
| REQ-8 Sample receipts match or are flagged | M2-CP3 |
| REQ-9 Failure falls back to the manual editor | M2-CP3, M2-CP4 |
| REQ-10 No receipt data leaves the browser (static-only, checked) | M2-CP2, M2-CP3, M2-CP4 |
| REQ-11 READMEs, ADR 0002 and licence notices | M2-CP2, M2-CP5 |
| REQ-12 End-to-end scan to split | M2-CP5 |

The machine-checked version is
`docs/ai-workflow/requirements/milestone-2-mapping.json`.

## Files touched and review classification

Implementation output lands under paths that `milestone-2-artifacts.json`
protects at the implementation stage:

- `app/**`: the receipt feature, the pages, the scripts, the Vite config,
  the sample corpus and `app/README.md`;
- `docs/adr/0002-in-browser-receipt-reading.md` (the `docs/adr/` prefix);
- `README.md` (repository root): protected by an exact-path entry, moved
  out of the inherited exclusion as in M1, because it's a deliverable
  (REQ-11);
- `.github/workflows/app-ci.yml` and `.github/workflows/release.yml`:
  protected by exact path. M2 doesn't plan to change either, but the
  release zip now also carries `dist/vendor/`, so any change to either is
  bound by technical approval.

`app/public/vendor/` is generated and git-ignored, so it's never in a
bundle. `docs/ROADMAP.md` and `docs/ACTIVE_MILESTONE.md` stay excluded
(workflow bookkeeping). The inherited Gradle-shaped template entries are
harmless.

## Migration, data and backup implications

- **New browser storage:**
  - `settle.receipt`: `{ version: 1, receipt }`, the check panel's
    summary. It's disposable, validated on read, and cleared with New
    bill.
  - Tesseract.js's IndexedDB cache (`keyval-store`) of the two language
    models. It holds public model data, not personal data.
- The draft (`settle.bill`, version 1) is unchanged: an imported bill is an
  ordinary M1 bill. There's no migration, and M1 drafts load as before.
- **Receipt images are never stored**, in either storage.
- **Build output grows** by about 18 MB of `vendor/` files: three OCR
  core builds of 3.9 MB each (the browser loads only one), the 4.3 MB of
  models, and the pdf.js and zxing files. The release zip grows the same way, and the
  split page's own bundle doesn't, because every reader module is loaded
  on first use.

## Out of scope for M2

- BYOK AI or receipt-service readers (a roadmap backlog item, revisited
  after M9's receipt-reading report). M2 only provides the interface and
  the page encoder.
- Perspective correction and cropping to the receipt's edges, and
  auto-rotation beyond EXIF: a sideways photo without EXIF reads badly and
  is flagged with `lowConfidence`.
- Languages other than Portuguese and English, handwriting, and several
  receipts in one image.
- Currency conversion (D18), receipt history, and storing images.
- Offline caching of the reader through a service worker (M6), and a
  header-delivered CSP, which also binds workers (M6, with hosting).

## Open questions (for the plan reviewer / user)

1. **HEIC fallback licence** (D7). **Resolved:** the user accepted
   `heic-to` under LGPL-3.0 (manual external review round 1, M-I-3). D7
   says how its obligations are met.
2. **Real receipts in the test corpus.** The plan's corpus is synthetic,
   rendered and degraded on purpose. Would you like to add a few real
   receipt photos, with anything personal cropped out, as extra committed
   samples? Otherwise real receipts are only tested by hand in functional
   review.
3. **Import keeps the people** (D13). Scanning replaces the items and
   tax, tip and discount, but keeps the people and the payer, so you can
   set up the group first. Is that the behaviour you want?
4. **First-scan download** (D4). The first scan downloads about 8 MB
   (the 3.9 MB reader engine and the 4.3 MB of language models; about
   6 MB if the host compresses) from the app itself.
   It's cached after that. Is that acceptable?

No `docs/TECHNICAL_DECISIONS.md` exists in this repository, so there are
no "Open decision" rows for this plan to finalise.

## Review dispositions

### Local plan review, round 1 (`LOCAL_MODEL_PLAN_REVIEW`, revision 1 → 2)

Each finding was checked against the repository and the libraries'
installed sources before it was applied.

| Finding | Disposition | Evidence and change |
|---------|-------------|---------------------|
| I-1: keyword order and matching | **Accepted** | Rule 3 had *total* before *subtotal* and no matching mode, so `SUB TOTAL` read as a total. Keywords now match whole words or phrases after folding. *subtotal* is checked before *total*, and *tip/service* before *tax*, with the longest phrase first. CP1 adds precedence fixtures. |
| I-2: space grouping in amounts | **Accepted** | Rule 2's `[ .]` made `Arroz 1 100,00` a single amount. Spaces are no longer a separator. CP1 adds the column case. |
| I-3: Tesseract.js needs encoded images | **Accepted** | In tesseract.js 7.0.0, `src/worker/browser/loadImage.js` (lines 46–65) and `src/worker/node/loadImage.js` accept only URLs, elements, canvases, blobs, paths and encoded buffers. D2 adds `encodePage`, injected into the reader, with a `pngjs` version for the Node tests. |
| I-4: zxing-wasm reaches jsDelivr in Node | **Accepted** | `zxing-wasm@3.1.4` `dist/es/share.js`'s default `locateFile` returns `https://fastly.jsdelivr.net/...` in every environment. The corpus test sets `locateFile` to the `node_modules` wasm, uses Tesseract's `cacheMethod: 'none'`, and fails on any `http(s)` fetch. |
| I-5: the meta CSP doesn't bind workers | **Accepted** | A dedicated worker's policy comes from its own response headers. D9 now states the limit. CP2 tests every worker-bound URL, and the browser check watches the workers' requests. A header CSP is noted for M6. |
| I-6: no pixel limit | **Accepted** | D16 adds `tooManyPixels` (40 MP). CP2 reads PNG/JPEG/HEIC dimensions from the header before decoding, and caps the PDF render scale, with tests. |
| I-7: stale milestone references | **Accepted** | `docs/ROADMAP.md` (`d7ee67e`): M3 is the household ledger, BYOK is a backlog item, and the PWA is M6. D2, CP3, "Out of scope" and CP5's Settings line are updated. The Settings line no longer promises a milestone. |
| O-1: doubling vs the long-side cap | **Accepted** | D10: the cap wins. CP2 tests 2000 × 700. |
| O-2: "has content" ignores adjustments | **Accepted** | CP4: a tax, tip or discount that isn't none also counts. |
| O-3: AVIF looks like HEIC | **Accepted** | CP2: HEIC is recognised by the major brand, and any `avif` brand is `unsupportedType`, with a test. |
| O-4: a UK VAT number as a NIF | **Accepted** | Rule 5 no longer reads a NIF after `VAT`. CP1 test. |
| O-5: multi-page joins, and when "Check" clears | **Accepted** | The parsing input joins pages in order. "Check" clears on a name, quantity or price edit only (D14, CP4). |

### Local plan review, round 2 (`LOCAL_MODEL_PLAN_REVIEW`, revision 2 → 3)

Each finding was checked against the plan text, the M1 model and the
libraries' installed sources before it was applied.

| Finding | Disposition | Evidence and change |
|---------|-------------|---------------------|
| R2-I-1: "total" lines combined with tax or savings words | **Accepted** | Rule 3 checked *total* before *tax* and *discount*, and "longest first" applied only within a group, so `Total IVA 2,34` was a total, and rule 8's "last total wins" then made it the receipt total. `iva incluído` in *ignore* dropped `TOTAL (IVA incluído)`. Rule 3 adds *tax summary* and *savings summary* groups before *total*, takes `iva incluído` out of *ignore*, and says *ignore* never overrides *total*. Rule 8 now takes the first total after the items region, which a later line replaces only if it uses a more specific phrase. CP1 adds the fixtures. |
| R2-I-2: quantity-first and IVA-rate item layouts | **Accepted** | Rule 6 had no `Q Name P L` form, and rule 3's tax-table form matched `1 Bitoque 23% 9,50` before *item*. Rule 6 adds the quantity-first forms and the name derivation. Rule 3 limits tax-table lines to outside the items region (or lines with no description), and lets item lines carry a rate or tax code. CP1 adds the fixtures. |
| R2-I-3: dates and times read as amounts | **Accepted** | Rule 2's `-?\d+[.,]\d{2}` had no token boundaries, and rule 5 itself accepts `dd.mm.yy`. Amounts are now whole tokens, and a valid date or a time is never an amount. CP1 adds header fixtures. |
| R2-I-4: I-7 left "M3" in the mapping | **Accepted** | `docs/ai-workflow/requirements/milestone-2-mapping.json` REQ-7 said "so M3 can add readers". It's regenerated at revision 3 with "so later readers (bring-your-own-key AI, a hosted reader) can plug in without changes elsewhere". The review request no longer says "for M3". |
| R2-O-1: PDF text fragments into lines | **Accepted** | D6 says how fragments are grouped into lines and when a page has a text layer. CP2 adds `pdfTextLines.ts` and its tests. |
| R2-O-2: adjustment combination order and modes | **Accepted** | D13 names the order (first match wins) and keeps the tax and tip modes. CP1 test. |
| R2-O-3: where the "Check" flags live | **Accepted** | M1's `Item` (`app/src/features/split/model.ts`) has no flag field, and the draft is unchanged. D14/D15 keep `flaggedItemIds` in the receipt summary. CP4 test. |
| R2-O-4: exact Tesseract core files | **Accepted** | tesseract.js 7 `createWorker` defaults to `OEM.LSTM_ONLY`, and `worker-script/browser/getCore.js` loads `tesseract-core-{relaxedsimd-,simd-,}lstm.wasm.js` from a directory `corePath`. CP2's vendor list names them. |
| R2-O-5: `Capital social` in the header | **Accepted** | Added to *ignore*. CP1 test. |
| R2-O-6: the pixel-limit message | **Accepted** | D16's `tooManyPixels` message says how to fix it. The 40-MP refusal stays. CP2 test. |
| R2-O-7: typo in CP3 | **Accepted** | Fixed. |

### Local plan review, round 3 (`LOCAL_MODEL_PLAN_REVIEW`, revision 3 → 4)

Each finding was checked against the revision-3 plan text before it was
applied.

| Finding | Disposition | Evidence and change |
|---------|-------------|---------------------|
| R3-I-1: D12 contradicts rule 8 | **Accepted** | Revision 3's D12 still said "the last `TOTAL`-type line", while rule 8 had changed to the first total after the items region. D12 now points to rule 8. CP1 test. |
| R3-I-2: `TOTAL IVA INCLUÍDO` read as tax | **Accepted** | Revision 3's *tax summary* group contained `total iva` and said nothing about punctuation, so `TOTAL IVA INCLUÍDO 23,40` and `TOTAL (IVA incluído) 23,40` became tax lines. Rule 3 now says punctuation separates words, and a tax-summary line with an "included" qualifier falls through to *total*. CP1 fixtures for PT and UK. |
| R3-I-3: a tip between two totals is dropped | **Accepted** | Revision 3's rule 8 kept the first total, so `Total 21.60 / Tip 4.00 / Total 25.60` trusted 21.60, and D13's "tax" combination closed without the tip. A later total now also replaces the first when a *tip/service* line sits between them. D13's tax + tip combination then closes on 25.60. CP1 fixture. Sample 7's layout is pinned in CP3. |
| R3-O-1: keyword groups take over item lines | **Accepted** | Inside the items region, an *ignore*, *tip/service* or *discount* line with a non-negative amount is an item unless the matched phrase starts its description. CP1 tests. |
| R3-O-2: leading numbers in names | **Accepted** | The quantity-first form without `P` now needs a quantity column title in the header. Otherwise the number stays in the name. CP1 tests. The revision-3 test `2 Imperial 2,20` → 2 × 1,10 now runs under a `Qtd` header. |
| R3-O-3: plural savings phrases, and negative totals | **Accepted** | *savings summary* adds `total poupanças`, `total descontos` and `total de descontos`. A total-type line with a negative amount is a savings summary. CP1 test. |

### Manual external plan review, round 1 (`MANUAL_EXTERNAL_PLAN_REVIEW`, revision 4 → 5)

Each finding was checked against the plan, ADR 0001, `app/src` and the
repository's workflows before it was applied.

| Finding | Disposition | Evidence and change |
|---------|-------------|---------------------|
| M-I-1: same-origin requests aren't covered by the privacy check | **Accepted** | `connect-src 'self'` does allow a request to the app's own origin, and the revision-4 browser check only required requests to be same-origin. ADR 0001 (lines 13–15) makes the app a purely static client until M9, and `app/src` has no `fetch`/`sendBeacon`/`WebSocket` call today. D9 now makes that a checked rule: an ESLint ban on those APIs in `src/`, `form-action 'none'`, and a full request log (document and workers) during real JPEG, HEIC, scanned-PDF and text-PDF scans, in which every request must be a same-origin `GET` with no body or query for a file in the build, and no receipt text may appear. The "Done when" line and REQ-10 say the same. |
| M-I-2: pre-tax totals become the trusted total | **Accepted** | Revision 4's rule 3 had no pre-tax phrases, so `Total s/ IVA 19,02` was a *total* line. It was the first after the items, and `Total c/ IVA` couldn't replace it (the local round-4 R4-O-1). The pre-tax phrases are now *subtotal*, and the inclusive phrases are more specific totals in rule 8. CP1 fixtures for PT and EN. |
| M-I-3: the HEIC licence decision is open | **Accepted** | The user accepted `heic-to` under LGPL-3.0. D7 says how the obligations are met: an unmodified, separately loaded and replaceable file, the licence texts shipped with it, and `THIRD_PARTY_NOTICES.md` linked from Settings and the README. ADR 0002 records it. CP2 tests. REQ-11 includes the notices. Open question 1 is resolved. |
| M-O-1: blank and suggested tip/total lines | **Accepted** | Rule 8 only counts total and tip lines with an amount, and suggested-tip lines are never the tip. A single service line with a rate stays the service charge (UK sample 6). CP1 tests. |
| M-O-2: payment lines after a missed total | **Accepted** | Payment words are always ignored, never overridden into items, and they end the items region (rules 3 and 4). CP1 test. |
| M-O-3: the 40-MP refusal | **Accepted in part** | The refusal stays: an RGBA bitmap of a 48-MP photo is about 190 MB, and browsers don't guarantee decode-time downscaling without allocating the full bitmap. D16 now records this as a deliberate trade-off. CP2 already tests the refusal (crafted 50-MP headers) and the message. |
| M-O-4: CP1's breadth | **Accepted** | CP1 now has an internal build and test order with a passing gate per module, recorded in the checkpoint notes, and keeps classification tests separate from whole-receipt fixtures. The checkpoint split is unchanged. |

### Local plan review, round 5 (`LOCAL_MODEL_PLAN_REVIEW`, revision 5 → 6)

| Finding | Disposition | Evidence and change |
|---------|-------------|---------------------|
| R5-I-1: loyalty-card lines end the items region | **Accepted** | Revision 5's M-O-2 exception counted `cartão` as a payment word, and made any such line "always ignored" and the end of the items region, so `Desc. Cartão Continente -0,40` dropped the discount and every item after it. `cartão`/`card` now make a payment line only inside a payment phrase, and a negative or *discount* line is never a payment line. CP1 fixtures for both. |
| R5-O-1: the ESLint ban would flag the fetch stub | **Accepted** | `app/eslint.config.js` applies its rules to every `**/*.{ts,tsx}` file, tests included. The static-only rule now applies to production files only, with a test of that scope. |
| R5-O-2: `blob:`/`data:` URLs in the request log | **Accepted** | D9 and the CP2 check allow them as local and list them separately. |
| R5-O-3: `heic-to`'s module format | **Accepted** | CP2 tests the dynamic import of the vendored build, with an unmodified classic-script fallback if the package has no ES module build. |

### Local plan review, round 6 (`LOCAL_MODEL_PLAN_REVIEW`, revision 6 → 7)

| Finding | Disposition | Evidence and change |
|---------|-------------|---------------------|
| R6-I-1: loyalty-card discounts are still *ignore* | **Accepted** | Revision 6's rule 3 still listed `card` and `cartão` in *ignore*, which is checked before *discount*, so `Desc. Cartão Continente -0,40` was ignored, and `Desconto Cartão 0,50` became an item through the R3-O-1 override. Both of the reviewer's remedies are applied, the second one narrowed: `card`/`cartão` leave *ignore*, except in the card payment phrases or as a line's whole description, and *ignore* never overrides a line with a *discount* keyword. "Never overrides a negative amount" isn't used, because change printed as `Troco -1,60` would then become a bill discount (rule 7 adds any other discount line to the bill discount). I traced each rule-3 example against the new group order: `Desc. Cartão Continente -0,40` → discount; `Desconto Cartão 0,50` → discount; `Pago com cartão 23,40` → payment line; `Gift card 10,00` → item; `Troco -1,60` → ignore; `Total Multibanco 12,50` → total. CP1 fixtures. |

### Manual external plan review, round 2 (`MANUAL_EXTERNAL_PLAN_REVIEW`, revision 7 → 8)

Local round 7 approved revision 7, with two optional findings (R7-O-1,
R7-O-2), which are the same as O-EXT-1 and O-EXT-2 below. Each finding
was checked against the revision-7 plan text and the development
machine before it was applied.

| Finding | Disposition | Evidence and change |
|---------|-------------|---------------------|
| M-I-4: the privacy check doesn't inspect request headers, and searches for only two receipt values | **Accepted** | Revision 7's D9 (3) and CP2 check required a same-origin `GET` with no body or query, and searched the log only for "each scanned receipt's merchant name and total". Neither captured request headers, so a receipt value in a header, or any other value, would pass. The review says this finding was left over from manual round 1. It wasn't one of that round's findings (M-I-1 to M-I-3): it narrows M-I-1's check. CP2 adds `app/scripts/check-requests.mjs`, which records URLs, methods, full request headers (browser-added ones included) and bodies from the document and every dedicated worker. It builds a value set per scanned receipt from its `.expected.json` and QR payload (merchant, NIF, date, item names and amounts, subtotal, tax, tip, discount, total, the QR payload and fields), and fails on any match. It first proves that it catches a planted header leak. The structural checks are kept. D9, CP2, the "Done when" line and REQ-10's mapping text say the same. The script uses Node 24's built-in `WebSocket` (`node -e "typeof WebSocket"` prints `function` on Node v24.21.0), so there's no new dependency. |
| A-1 (found while applying M-I-4): where the HEIC scan file comes from | **Added** | M-I-4's value set needs concrete scan files, and revision 7 never said where CP3's HEIC scan came from. On this machine, `magick -list format` shows no HEIC format, `vips`'s HEIF module fails to load (`libheif.so.1` is missing), and `heif-enc` isn't installed. CP3 now names four committed browser-check files made from corpus samples 1, 3, 6 and 9. The HEIC one is made with `heif-enc` (libheif), which is added to the prerequisites as a regeneration-only tool, like `rsvg-convert`. |
| O-EXT-1 (and R7-O-1): the payment-line paragraph doesn't exempt totals | **Accepted** | Rule 3 now says a line that matches *total* or *subtotal* is never a payment line. CP1 adds `Total paid 25.60` next to `Total Multibanco 23,40`. |
| O-EXT-2 (and R7-O-2): the sign of `d` in rule 7 | **Accepted** | Rule 7 says `d` is the absolute value of the discount line's amount. CP1's loyalty-card fixtures already cover both signs. |
| O-EXT-3: `REVIEW_REQUEST.md` lists the HEIC licence as unresolved | **Accepted** | The revision-7 review request still listed "the LGPL HEIC fallback" under unresolved questions. The revision-8 request lists open questions 2–4 only. The plan itself already marked question 1 resolved, so it's unchanged. |

### Local plan review, round 8 (`LOCAL_MODEL_PLAN_REVIEW`, revision 8 → 9)

Each finding was checked against the revision-8 plan text and this
machine before it was applied.

| Finding | Disposition | Evidence and change |
|---------|-------------|---------------------|
| R8-I-1: the CP3 real-scan check drives UI that doesn't exist until CP4 | **Accepted** | Revision 8's CP2 script "uploads the file through the scan section, waits for the check panel", and the check "repeats in CP3 with real scans". The scan section (`ScanReceipt.tsx`) and the check panel (`ReceiptCheck.tsx`) are CP4 files, and CP3's files (`builtInReader.ts`, `qrScanner.ts`, `importReceipt.ts`, the corpus) give the preview page nothing to upload into. No checkpoint could produce the real-scan log that "Done when" relies on. The script now has a page-load mode (CP2) and a scan mode. The four real scans, with the planted-leak proof, are a CP4 test. CP3 only creates the browser-check files. D9 (3), CP2, CP3, CP4 and "Done when" say the same. REQ-10's `checkpoint_ids` already include M2-CP4, so the mapping is unchanged (it has no revision field; corrected in round 9, R9-O-2). |
| R8-O-1: the value set misses what OCR actually read | **Accepted** | For the OCR scans, the values the app holds come from Tesseract, not from `.expected.json`. After each scan, the script adds the values in `settle.bill` and `settle.receipt` (read through `Runtime.evaluate`) to the set. |
| R8-O-2: encoded leaks in custom headers | **Accepted** | The body, the query and the path were constrained structurally, but headers weren't, and a token search can't see a base64 value. CP2 adds a header-name allowlist (standard browser headers and `Sec-*`). The planted leak must now fail both the value search and the allowlist. |
| R8-O-3: the `heif-enc` prerequisite contradicts itself | **Accepted** | `which heif-enc` finds nothing on this machine, while `rsvg-convert` and `magick` are at `/usr/bin`. The Prerequisites now list `heif-enc` separately as not installed, to be installed before CP3 generates the browser-check files. |
| R8-O-4: worker capture is never proven | **Accepted** | The planted leak is sent from the document, so a worker that `Target.setAutoAttach` never attached would log nothing and pass. Each CP4 scan now requires the Tesseract core and model requests (OCR scans) and the pdf.js worker's requests (PDF scans) to be in the log. |

### Local plan review, round 9 (`LOCAL_MODEL_PLAN_REVIEW`, revision 9 → 10)

Each finding was checked against this machine and the installed library
sources before it was applied.

| Finding | Disposition | Evidence and change |
|---------|-------------|---------------------|
| R9-I-1: the header-name allowlist rejects headers the browser always sends | **Accepted** | A headless Brave capture on this machine (CDP over Node 24's `WebSocket`, `Network.requestWillBeSentExtraInfo`) of a static same-origin page with a module script, a worker, `importScripts` and a worker `fetch` showed `Upgrade-Insecure-Requests` on the document navigation, and the Client Hints as lowercase `sec-ch-ua`, `sec-ch-ua-mobile` and `sec-ch-ua-platform`. Every other name was already on the list (`Sec-GPC` under `Sec-*`). CP2 adds `Upgrade-Insecure-Requests`, says names are compared case-insensitively, and requires the clean page-load run to pass the header-name rule. |
| R9-O-1: a shared profile hides the model requests | **Accepted** | tesseract.js 7.0.0 `src/worker-script/index.js` lines 103–110 read each `<lang>.traineddata` from the cache unless `cacheMethod` is `refresh` or `none`, and line 179 writes it by default. So in one profile, only the first OCR scan requests the models, and R8-O-4's positive check would fail the later ones. Each CP4 scan now runs in its own Brave process with a fresh temporary `--user-data-dir`. |
| R9-O-2: the R8-I-1 row names a mapping revision that doesn't exist | **Accepted** | `milestone-2-mapping.json`'s top-level keys are `schema_version`, `work_item_id` and `requirements`. The row now says the mapping is unchanged. |
