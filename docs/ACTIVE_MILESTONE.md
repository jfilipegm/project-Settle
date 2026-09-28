# Active Milestone

## Milestone

**M2 — Receipt upload and built-in parsing** (work item `milestone-2`),
phase `IMPLEMENTING`. Plan revision 10, approved in commit `3af0e18`.
Branch `feature/milestone-2`, PR #6.

## Checkpoints

| id | name | status |
|----|------|--------|
| M2-CP1 | Pure receipt logic | Complete |
| M2-CP2 | File intake, image pipeline, assets and CSP | Not started |
| M2-CP3 | Built-in reader, QR scanning, import pipeline, sample corpus | Not started |
| M2-CP4 | Review step UI | Not started |
| M2-CP5 | READMEs, Settings, end-to-end, verification | Not started |

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
