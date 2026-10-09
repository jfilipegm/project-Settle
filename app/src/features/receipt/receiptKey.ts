/**
 * The duplicate-receipt key (M4 plan, H11), computed at import while the
 * parsed fiscal QR code is in hand, and stored with the receipt summary,
 * so it survives a reload exactly as computed (M-I-1).
 */
import type { FiscalQr } from './fiscalQr.ts'
import type { ReceiptSummary } from './model.ts'

const MAX_LENGTH = 200

/** Case- and accent-folded, spaces collapsed: "Continente  Bom Dia". */
export function foldText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('en')
    .replace(/\s+/g, ' ')
    .trim()
}

/** A stored key the reader accepts: `qr:` or `m:`, at most 200 characters. */
export function isReceiptKey(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^(qr|m):/.test(value) &&
    value.length <= MAX_LENGTH
  )
}

function bounded(key: string): string | undefined {
  return key.length <= MAX_LENGTH ? key : undefined
}

/**
 * Rules 1 and 2: a fiscal QR code with an ATCUD (one Portuguese fiscal
 * document), else the issuer, document type, date and total.
 */
export function keyFromQr(qr: FiscalQr): string | undefined {
  const atcud = qr.atcud?.trim()
  if (atcud !== undefined && atcud !== '' && atcud !== '0') {
    return bounded(`qr:${qr.issuerNif}:${atcud}`)
  }
  return bounded(
    `qr:${qr.issuerNif}:${qr.documentType ?? ''}:${qr.date}:${String(qr.total)}`,
  )
}

/** Rule 3: merchant, date and total, only when all three are known. */
export function keyFromSummary(
  summary: Pick<ReceiptSummary, 'merchant' | 'date' | 'total'>,
): string | undefined {
  const merchant =
    summary.merchant === undefined ? '' : foldText(summary.merchant)
  if (
    merchant === '' ||
    summary.date === undefined ||
    summary.total === undefined
  ) {
    return undefined
  }
  return bounded(`m:${merchant}:${summary.date}:${String(summary.total)}`)
}

/**
 * The key to save an expense with: the one computed at import, or, for a
 * summary saved before M4 (no `receiptKey`), rule 3 only (H11). A summary
 * without a QR code can never produce a `qr:` key.
 */
export function receiptKeyForSave(
  summary: ReceiptSummary | null,
): string | undefined {
  if (summary === null) return undefined
  return summary.receiptKey ?? keyFromSummary(summary)
}
