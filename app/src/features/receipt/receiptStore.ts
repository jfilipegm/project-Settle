/**
 * The saved receipt summary (M2 plan, D15): the check panel's data, kept
 * next to M1's saved bill so a refresh keeps the check. Never the image.
 * It's disposable: anything that can't be trusted is dropped, and the bill
 * is kept.
 */
import {
  SUPPORTED_CURRENCIES,
  type Cents,
  type MoneyCurrency,
} from '../../lib/money.ts'
import type { ReceiptSummary, ReceiptWarning } from './model.ts'

export const RECEIPT_STORAGE_KEY = 'settle.receipt'
export const RECEIPT_VERSION = 1

const WARNINGS: readonly ReceiptWarning[] = [
  'noTotal',
  'totalMismatchQr',
  'itemsTruncated',
  'currencyDiffers',
  'creditNote',
  'lowConfidence',
]

type Json = unknown

function isObject(value: Json): value is Record<string, Json> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isStringList(value: Json): value is string[] {
  return (
    Array.isArray(value) && value.every((entry) => typeof entry === 'string')
  )
}

function isCents(value: Json): value is Cents {
  return typeof value === 'number' && Number.isSafeInteger(value)
}

/** The summary's shape, rebuilt from known fields only; `null` if bad. */
function readSummary(value: Json): ReceiptSummary | null {
  if (
    !isObject(value) ||
    !isStringList(value.warnings) ||
    !value.warnings.every((warning) =>
      WARNINGS.includes(warning as ReceiptWarning),
    ) ||
    !isStringList(value.flaggedItemIds)
  ) {
    return null
  }
  const summary: ReceiptSummary = {
    warnings: value.warnings as ReceiptWarning[],
    flaggedItemIds: value.flaggedItemIds,
  }
  for (const key of ['merchant', 'merchantTaxId', 'date'] as const) {
    const field = value[key]
    if (field === undefined) continue
    if (typeof field !== 'string') return null
    summary[key] = field
  }
  if (value.currency !== undefined) {
    if (!SUPPORTED_CURRENCIES.includes(value.currency as MoneyCurrency)) {
      return null
    }
    summary.currency = value.currency as MoneyCurrency
  }
  for (const key of ['total', 'ivaTotal'] as const) {
    const field = value[key]
    if (field === undefined) continue
    if (!isCents(field)) return null
    summary[key] = field
  }
  if (value.totalSource !== undefined) {
    if (value.totalSource !== 'qr' && value.totalSource !== 'printed') {
      return null
    }
    summary.totalSource = value.totalSource
  }
  if ((summary.total === undefined) !== (summary.totalSource === undefined)) {
    return null
  }
  // R24: the lines a cut left out. The app never writes an empty list; a
  // stored one reads as absent, so "0 lines" can never be shown.
  if (value.removedLines !== undefined) {
    if (!Array.isArray(value.removedLines)) {
      return null
    }
    const lines: { name: string; amount: Cents }[] = []
    for (const line of value.removedLines as Json[]) {
      if (
        !isObject(line) ||
        typeof line.name !== 'string' ||
        !isCents(line.amount)
      ) {
        return null
      }
      lines.push({ name: line.name, amount: line.amount })
    }
    if (lines.length > 0) {
      summary.removedLines = lines
    }
  }
  return summary
}

/**
 * The saved summary, or `null`: nothing saved, an unknown version, a bad
 * shape, or storage that can't be read.
 */
export function loadReceiptSummary(): ReceiptSummary | null {
  try {
    const stored = window.localStorage.getItem(RECEIPT_STORAGE_KEY)
    if (stored === null) {
      return null
    }
    const saved: Json = JSON.parse(stored)
    if (!isObject(saved) || saved.version !== RECEIPT_VERSION) {
      return null
    }
    return readSummary(saved.receipt)
  } catch {
    return null
  }
}

/**
 * Saves the summary, or removes it for `null`. A storage error is ignored:
 * the summary stays in memory.
 */
export function saveReceiptSummary(summary: ReceiptSummary | null): void {
  try {
    if (summary === null) {
      window.localStorage.removeItem(RECEIPT_STORAGE_KEY)
    } else {
      window.localStorage.setItem(
        RECEIPT_STORAGE_KEY,
        JSON.stringify({ version: RECEIPT_VERSION, receipt: summary }),
      )
    }
  } catch {
    // Storage is full, disabled or blocked.
  }
}
