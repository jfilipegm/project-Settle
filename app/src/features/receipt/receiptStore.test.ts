import { afterEach, describe, expect, it, vi } from 'vitest'
import { cents } from '../../lib/money.ts'
import type { ReceiptSummary } from './model.ts'
import {
  RECEIPT_STORAGE_KEY,
  loadReceiptSummary,
  saveReceiptSummary,
} from './receiptStore.ts'

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

const SUMMARY: ReceiptSummary = {
  merchant: 'Restaurante O Cantinho',
  merchantTaxId: '123456789',
  date: '2026-09-28',
  currency: 'EUR',
  total: cents(1270),
  totalSource: 'qr',
  ivaTotal: cents(146),
  warnings: ['lowConfidence', 'totalMismatchQr'],
  flaggedItemIds: ['item-2'],
}

function store(receipt: unknown, version: unknown = 1) {
  localStorage.setItem(
    RECEIPT_STORAGE_KEY,
    JSON.stringify({ version, receipt }),
  )
}

describe('receiptStore (D15)', () => {
  it('round-trips a summary, and a minimal one', () => {
    saveReceiptSummary(SUMMARY)
    expect(loadReceiptSummary()).toEqual(SUMMARY)

    saveReceiptSummary({ warnings: [], flaggedItemIds: [] })
    expect(loadReceiptSummary()).toEqual({ warnings: [], flaggedItemIds: [] })
  })

  it('removes the summary for null', () => {
    saveReceiptSummary(SUMMARY)
    saveReceiptSummary(null)
    expect(localStorage.getItem(RECEIPT_STORAGE_KEY)).toBeNull()
    expect(loadReceiptSummary()).toBeNull()
  })

  it('keeps only known fields', () => {
    store({ ...SUMMARY, image: 'data:image/png;base64,AAAA' })
    expect(loadReceiptSummary()).toEqual(SUMMARY)
  })

  it.each([
    ['an unknown version', SUMMARY, 2],
    ['no warnings list', { ...SUMMARY, warnings: undefined }, 1],
    ['an unknown warning', { ...SUMMARY, warnings: ['boom'] }, 1],
    ['bad flagged ids', { ...SUMMARY, flaggedItemIds: [1] }, 1],
    ['a numeric merchant', { ...SUMMARY, merchant: 42 }, 1],
    ['an unknown currency', { ...SUMMARY, currency: 'JPY' }, 1],
    ['a fractional total', { ...SUMMARY, total: 12.7 }, 1],
    ['an unknown total source', { ...SUMMARY, totalSource: 'guess' }, 1],
    ['a total without a source', { ...SUMMARY, totalSource: undefined }, 1],
    ['not an object', 'receipt', 1],
  ])('drops a summary with %s', (_name, receipt, version) => {
    store(receipt, version)
    expect(loadReceiptSummary()).toBeNull()
  })

  it('drops unparseable JSON, and survives storage that throws', () => {
    localStorage.setItem(RECEIPT_STORAGE_KEY, '{')
    expect(loadReceiptSummary()).toBeNull()

    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    expect(loadReceiptSummary()).toBeNull()
    expect(() => {
      saveReceiptSummary(SUMMARY)
    }).not.toThrow()
  })
})
