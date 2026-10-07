# Active Milestone

## Milestone

None active. The last milestone, M2.5 — Accurate receipt reading (work
item `milestone-2-5`), is `MILESTONE_COMPLETE`, accepted on 2026-10-07.

## Next action

Plan **M3 — Households, members and the expense ledger**
(`docs/ROADMAP.md`) with `/milestone-plan`: turn one-off bills into a
household's running expense history.

Before planning, and after the user merges PR #9 (M2.5) into `master`
(see CLAUDE.md, "Git and GitHub workflow"): run
`git switch master && git pull && git switch -c feature/milestone-3`.
After the first commit, open the M3 PR.

## Last completed: M2.5 — Accurate receipt reading

Receipts are read by PaddleOCR instead of Tesseract.js, still for free
and entirely in the browser:

- **CP1:** the local test set (format v2, real receipts kept local only,
  never committed) and one accuracy measure, in Node and a real browser,
  with the Tesseract baseline.
- **CP2:** the PaddleOCR reader (`ppu-paddle-ocr` on ONNX Runtime Web,
  PP-OCRv5 mobile models) behind M2's `ReceiptReader` interface, in a
  worker, its assets self-hosted under the existing CSP.
- **CP3:** image clean-up and parser tuning on the local set.
- **CP4:** the committed corpus moved to PaddleOCR, the photo quality
  check (tips for blurred, dark, small or cut-off photos), and Tesseract
  retired.
- **CP5:** the row-by-row review ("Review lines"): the image with a box
  per read line, each line's role, "Add as item" and "Add a missed line".
- **CP6:** the acceptance measurement, privacy scans, ADR 0003, the
  licence notices, Settings and the READMEs.
- **CP6A** (plan amendment, revisions 9–10): browsers that can't run the
  reader (no WebAssembly, e.g. Lockdown Mode, or no SIMD) get a note
  naming the cause, Choose PDF only, and `readerUnsupported` instead of
  a wrong "check your connection".

Measured (browser, two runs, 21 local images, 18 tuning and 3 held out):
tuning receipts with no edit 15 of 18 (83.3 %) in both runs; held out 5
of 6 run-results; rows 96.0–96.5 %; prices 97.5 %; **0 false
"Matches"**. Below the roadmap's 94 % aim: the plateau was accepted by
the user at CP3 (2026-10-03) and the measurement at CP6 (2026-10-04).

Verification:
- `npm run check` (typecheck, lint, format, 52 test files: 1084 passed,
  1 skipped) and `npm run build` pass; the request-privacy scans
  (`check-requests.mjs`) pass, with logs in
  `docs/milestones/milestone-2-5-evidence/`.
- `app`, `workflow-conformance` and `pr-title` are green on GitHub
  (PR #9).
- Implementation review: three external rounds (REVISE, REVISE, then
  APPROVE); technical approval `64a2b1d`.
- Functional review: round 1 checklist `f1727fe`; no findings were
  written; the user accepted the milestone on 2026-10-07.

Carried forward (not blockers):
- **The 94 % aim.** More real receipts first (the set has 19 distinct
  receipts, 3 held out, against the plan's 20 and 5; the roadmap's 30),
  then, if the local route stays short, the opt-in "enhanced reading"
  with the user's own AI key (the user's decision; it changes a guiding
  principle).
- **The phone reading times** (P13) were not timed, the user's decision
  (2026-10-04); the reading was found fast on the iPhone 13.
- **The CP6A iPhone checks** (Lockdown Mode on and off for the site,
  checklist flows 8–9) were deferred by the user on 2026-10-05; no
  result for them is recorded here. The behaviour is covered by the
  headless-Brave runs with WebAssembly removed.
- Remembering the user's corrections on the device (roadmap: Future).
- Receipts from other countries: prefer general parser rules; revisit
  now that M2.5 is done.
- Not in M2.5: cropping and perspective correction, handwriting, editing
  a read line's text in "Review lines", offline caching of the reader
  (M6).

## Current blockers

None.

## Active plan

None. M2.5's plan is archived at
`docs/milestones/completed/milestone-2-5-PLAN.md` (M0's, M1's, M2's and
M2's remediation child's are in the same folder).

## Functional review checklist

None. M2.5's round-1 checklist is in commit `f1727fe`.

<!--
This file is `workflow_state.FUNCTIONAL_CHECKLIST_PATH`. It is
repository-local state: workflow-manager generates it once at bootstrap and
never overwrites it on update.
-->
