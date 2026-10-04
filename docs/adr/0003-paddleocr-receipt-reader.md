# ADR 0003 — PaddleOCR as the receipt reader

- **Status:** Accepted
- **Date:** 2026-10-04
- **Milestone:** M2.5 — Accurate receipt reading
  (`docs/milestones/milestone-2-5-PLAN.md`, decisions P4–P12)
- **Supersedes in part:** ADR 0002's OCR engine (Tesseract.js, D4) and
  its download figures. ADR 0002's QR, PDF, HEIC, self-hosting, CSP and
  static-only decisions stand.

## Context

M2 read receipts with Tesseract.js in the browser. On the user's real
receipts it read none of them with no edit needed (0 of 9 in M2.5's first
measurement, rows 14 %), mostly because thermal-printer text, phone
photos and small app screenshots defeat it even after M2's clean-up. M2.5
had to keep the same promise (free, read entirely on the device, nothing
leaves the browser) with a reader that reads real receipts.

## Decision

The reader is **PaddleOCR**, run in the browser on ONNX Runtime Web, in a
dedicated module worker. Tesseract.js, its models and the image clean-up
tuned for it are removed (CP4).

### Dependencies

| Package                    | Version    | Licence    | Role                                                                    |
| -------------------------- | ---------- | ---------- | ----------------------------------------------------------------------- |
| `ppu-paddle-ocr`           | 6.6.0      | MIT        | PaddleOCR's detection and recognition pipeline, its `web` entry (P4)    |
| `ppu-ocv`                  | 4.0.0      | MIT        | its image helpers, canvas-only in the browser (OpenCV.js never bundled) |
| `onnxruntime-web`          | 1.30.0     | MIT        | the inference runtime: the plain SIMD wasm build only (P4)              |
| PP-OCRv5 mobile detection  | mirror pin | Apache-2.0 | the text-detection model, 4.75 MB (P5)                                  |
| PP-OCRv5 Latin recognition | mirror pin | Apache-2.0 | the recognition model and its dictionary, 8.07 MB (P5)                  |

`@napi-rs/canvas` (MIT) and `jpeg-js` (BSD-3-Clause) are dev
dependencies: the same engine runs in Node for the tests. All licences
are permissive; each licence text, or a notice where a package ships
none, is served under `/vendor/licenses/` and listed in
`app/public/THIRD_PARTY_NOTICES.md`.

### Runtime (P4, P6)

- ONNX Runtime Web runs its **plain wasm build, single-threaded**
  (`numThreads = 1`, `executionProviders: ['wasm']`): no WebGPU provider,
  and no thread workers, which would need cross-origin isolation. The
  build carries exactly one runtime wasm; `scripts/check-build.mjs` fails
  CI otherwise.
- The engine runs in a **dedicated module worker** (`paddle.worker.ts`),
  loaded on the first scan and kept for the next; cancelling or any
  failure terminates it. A failed load is `assetsUnavailable`, a failed
  read `ocrFailed` (D16 unchanged). A PDF's text layer is still read with
  no OCR (D6).
- The library's result cache is off (`noCache`): no page is kept.

### Model hosting (P5)

The models are PaddleOCR's, converted to ONNX and published by the
`ppu-paddle-ocr` project on Hugging Face
(`snowfluke/ppu-paddle-ocr-models`, licence Apache-2.0).
`scripts/vendor-paddle.mjs` downloads them at **one pinned commit**
(`bf1d5edb0335d3262be7caf13f766ba274b4cadd`) and checks a **SHA-256 per
file**; a mismatch fails the build. They're cached in the git-ignored
`app/.paddle-models/` (and by `actions/cache` in CI), never committed, and
served from the app's own origin under `vendor/paddle/`, as every other
reader file is (ADR 0002, D8). The download happens at build time only:
users' browsers fetch the models from Settle's own site.

### The photo quality check (P11)

Before the slow recognition step, the worker runs PaddleOCR's detection
alone and measures the photo (text size, blur, lighting, framing) from
the text boxes. Specific advice shows while the receipt is read; it never
blocks the import and is never stored. Its thresholds are measured on the
local set (`docs/ACTIVE_MILESTONE.md`, CP4).

## Consequences

- **Download (P12).** A first scan fetches about **27.2 MB raw** (15.6 MB
  gzipped): the runtime wasm 14.24 MB, the detection model 4.75 MB, the
  recognition model 8.07 MB, and about 0.1 MB of loader, dictionary and
  code. That's within the plan's 30 MB budget, and over three times
  Tesseract's 8 MB. The browser's HTTP cache keeps it; offline caching
  comes with M6's service worker.
- **Speed (P13).** About 6–8 s per receipt on the development machine
  (single-threaded recognition, about 50 ms per text box), plus 0.2–2.6 s
  for the photo check. The user chose accuracy over speed (2026-10-01):
  up to 30 s per receipt on the phone is acceptable, and threads, a
  lighter model and WebGPU are left for later.
- **Accuracy.** On the user's real receipts, read in a real browser, PaddleOCR
  with M2.5's parser rules reads 15–16 of the 18 tuning images with no
  edit (Tesseract: 0), rows about 96 %, and never a false "Matches". The
  acceptance numbers, held-out receipts included, are in
  `docs/ACTIVE_MILESTONE.md` (CP6).
- **Privacy.** Unchanged: the models and runtime are same-origin GETs from
  the worker, and `check-requests.mjs` passes on real scans with the
  production CSP unchanged (`docs/milestones/milestone-2-5-evidence/`).
- **CSP limit.** As ADR 0002 notes, a `<meta>` policy doesn't bind
  same-origin dedicated workers; the PaddleOCR worker is bound by the
  same-origin paths and watched by the real-browser check, until M6's
  header-delivered policy.

## Alternatives considered

- **Keeping Tesseract.js** with more clean-up: M2's remediation already
  tuned it; on real receipts it stayed at 0 with no edit.
- **A cloud OCR API:** breaks "nothing leaves the browser".
- **PaddleOCR with WebGPU or threads:** faster, but WebGPU isn't
  everywhere and threads need cross-origin isolation (headers a static
  host doesn't send by default). Left for later, by the user's choice of
  accuracy over speed.
- **Loading the models from the mirror at run time:** a third-party origin
  would see every first scan, and the CSP couldn't stay `'self'`.
