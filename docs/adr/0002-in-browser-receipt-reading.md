# ADR 0002 — In-browser receipt reading

- **Status:** Accepted
- **Date:** 2026-09-29
- **Milestone:** M2 — Receipt upload and built-in parsing
  (`docs/milestones/milestone-2-PLAN.md`, decisions D4–D9)

## Context

M2 fills the M1 bill editor from a photo or PDF of a receipt. The roadmap
requires it to be free and read entirely on the device: "No receipt data
leaves the browser." ADR 0001 keeps the app a static client with no server
until M9, and asks for a strict Content Security Policy, no third-party
scripts and few dependencies.

Reading a receipt in the browser needs an OCR engine, a QR decoder for the
Portuguese fiscal QR code, a PDF reader, and a HEIC decoder for iPhone
photos in browsers that can't decode HEIC themselves. These are M2's first
runtime dependencies since M0.

## Decision

### Dependencies (D4–D7)

| Package                                            | Version | Licence    | Role                                                                   |
| -------------------------------------------------- | ------- | ---------- | ---------------------------------------------------------------------- |
| `tesseract.js` (+ `tesseract.js-core`)             | 7       | Apache-2.0 | OCR in a Web Worker (D4)                                               |
| `@tesseract.js-data/por`, `@tesseract.js-data/eng` | 1       | MIT        | the `por` + `eng` LSTM `best_int` models, 1.4 + 3.0 MB gzipped (D4)    |
| `zxing-wasm`                                       | 3       | MIT        | the fiscal QR code, reader build only (D5)                             |
| `pdfjs-dist`                                       | 6       | Apache-2.0 | PDF text layers and page rendering, with `isEvalSupported: false` (D6) |
| `heic-to`                                          | 1       | LGPL-3.0   | the HEIC fallback, CSP build (D7)                                      |

`pngjs` (MIT) is a dev dependency, for decoding the sample receipts in the
Node tests (CP3).

### heic-to and the LGPL-3.0 (D7)

The user accepted the LGPL-3.0 (plan open question 1, manual review
M-I-3). Its obligations are met this way:

- `scripts/vendor-assets.mjs` copies heic-to's `dist/csp/heic-to.js`
  **unmodified** into `public/vendor/heic-to/`. It's never bundled or
  minified by Vite; a test checks the copy is byte-identical.
- The app loads it with a dynamic `import()` of that URL, only when the
  browser's own decoder can't read a HEIC photo, so it stays a separate
  file that a user can replace with their own build of the same interface.
- Its licence text, and a notice for the libraries it bundles (libheif and
  libde265, both LGPL-3.0; the package ships no separate licence file for
  them), are copied to `vendor/licenses/`.
- `app/public/THIRD_PARTY_NOTICES.md`, served as `/THIRD_PARTY_NOTICES.md`
  and linked from the Settings page (CP5), names every vendored package
  with its version, licence and source.

### Self-hosted assets (D8)

By default Tesseract.js, zxing-wasm and pdf.js fetch their workers, wasm
and data from jsDelivr. Every one of those paths points at the app's own
origin instead: Tesseract's `workerPath`, `corePath` and `langPath` (with
`workerBlobURL: false`), zxing's `locateFile`, and pdf.js's `workerSrc`,
`wasmUrl` and `standardFontDataUrl`. `vendor-assets.mjs` copies the files
from `node_modules` into `public/vendor/` (git-ignored) as `predev`,
`prebuild` and `prepreview`, and fails the build if any source is missing.
`src/features/receipt/assets.ts` is the one place that names the URLs.

### Content-Security-Policy (D9)

The production build's `index.html` carries this policy as a `<meta>`,
added by `app/cspMeta.ts` with `apply: 'build'` (the dev server's HMR needs
looser rules):

```text
default-src 'self'; script-src 'self' 'wasm-unsafe-eval';
worker-src 'self' blob:; connect-src 'self'; img-src 'self' blob: data:;
style-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self';
form-action 'none'
```

**`worker-src` differs from the approved plan.** D9 planned
`worker-src 'self'`. In M2-CP2 every heic-to build turned out to start its
decoder with `new Worker(URL.createObjectURL(blob))`, which that policy
blocks, so the HEIC fallback would fail in Chrome and Firefox. D9 makes
loosening the policy the user's decision, and on 2026-09-29 the user chose
to allow `blob:` workers rather than drop the fallback or reopen the plan.
The risk is small: a worker created from a `blob:` URL inherits the
creating document's policy, `connect-src 'self'` included, so it's more
constrained than the same-origin Tesseract and pdf.js workers, which a
`<meta>` policy doesn't reach. heic-to stays unmodified.

**Its limit.** A `<meta>` policy binds the document (and `blob:` workers),
not same-origin dedicated workers, which take their policy from their own
response headers; a static host sends none by default. The Tesseract and
pdf.js workers are bound by D8's same-origin paths, which a test checks,
and the real-browser check watches their requests. A header-delivered CSP,
which does bind workers, comes with hosting in M6.

### Static-only constraint (D9, manual review M-I-1)

`connect-src 'self'` still allows a request to the app's own origin, so
the CSP alone doesn't prove that no receipt data leaves the browser. The
guarantee is that the app is a static client with no endpoint to receive
anything, and M2 makes that a checked rule:

1. An ESLint rule refuses `fetch`, `XMLHttpRequest`, `WebSocket`,
   `EventSource` and `navigator.sendBeacon` in production files under
   `src/` (tests may stub them). The only network reads are the libraries'
   own GETs of the files `assets.ts` names.
2. The policy's `form-action` is `'none'`.
3. `app/scripts/check-requests.mjs` drives headless Brave over the DevTools
   protocol and records every request, from the document and each
   dedicated worker, with its URL, method, request headers and body. Each
   must be a same-origin `GET` with no body and no query string, for a
   file in the build output, with only standard browser header names, and
   no value from the scanned receipt may appear anywhere in it. The app is
   served through a small logging proxy, which records every request that
   reaches the origin with its headers exactly as received. The same checks
   run over that log, and every request in it must also be in the
   protocol's log. Chromium sends no `requestWillBeSentExtraInfo` for
   worker requests, so for those the proxy is the only record of the
   headers as sent. The saved logs keep every header value and the value
   set, and `check-requests.mjs audit --log <file>` re-checks them
   offline. It runs on page load in CP2, and with real scans in CP4. It's
   not part of `npm run check`, because CI has no browser.

Any later feature that sends data (the M7 endpoint, M9 accounts) is a new
decision.

## Consequences

- **Download size.** The first scan downloads about 8 MB of the app's own
  files (one OCR core build, the two models, and the QR and PDF code); the
  build output grows by about 23 MB, because it carries all three core
  builds, the pdf.js decoders and fonts, and heic-to. Every reader module is
  loaded on first use, so the Split page's own bundle doesn't grow.
  Tesseract.js caches the models in IndexedDB.
- **Offline.** A first scan needs the network, to fetch the reader from the
  app's own origin (`assetsUnavailable` otherwise). Offline caching comes
  with the service worker in M6.
- **Releases.** The release zip now also carries `dist/vendor/`.

## Alternatives considered

- **jsQR** for the fiscal QR code: unmaintained and weaker on small codes.
- **`@zxing/library`**: in maintenance mode.
- **The native `BarcodeDetector`**: not in Firefox or Safari.
- **Loading the libraries from a CDN** (their default): rejected. A
  third-party origin would see every scan's requests, and a strict CSP
  couldn't stay `'self'`.
- **Dropping the heic-to fallback** (M2-CP2): HEIC would only be read
  where the browser decodes it natively (Safari). Rejected by the user in
  favour of allowing `blob:` workers.
