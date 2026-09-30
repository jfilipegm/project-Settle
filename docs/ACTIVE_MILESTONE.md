# Active Milestone

## Milestone

None active. The last milestone, M2 — Receipt upload and built-in
parsing (work item `milestone-2`), is `MILESTONE_COMPLETE`, accepted on
2026-09-30, with its remediation child `milestone-2-remediation-1`
(accepted the same day).

## Next action

Plan **M2.5 — Accurate receipt reading** (`docs/ROADMAP.md`, work item
`milestone-2-5`) with `/milestone-plan`: move the built-in reader to
PaddleOCR and reach 94–100 % of real receipts read with no edit needed,
measured on a local test set of at least 30 real receipts (the user is
gathering them; local only, never committed).

PR #6 (M2) is merged, and the branch `feature/milestone-2.5` is cut from
`master` (the 2026-09-30 roadmap change is its first commit).

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

None. M2's plans are archived at
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
