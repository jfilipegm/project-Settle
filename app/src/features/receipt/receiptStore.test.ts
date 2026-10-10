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

  it('keeps the lines a cut left out across a reload (R24)', () => {
    const withCut: ReceiptSummary = {
      ...SUMMARY,
      removedLines: [
        { name: 'Tazal', amount: cents(1877) },
        { name: 'MULT IBANCO', amount: cents(1677) },
      ],
    }
    saveReceiptSummary(withCut)
    expect(loadReceiptSummary()).toEqual(withCut)
    // Saved without them (before R24, or no cut): loads without them.
    saveReceiptSummary(SUMMARY)
    expect(loadReceiptSummary()).not.toHaveProperty('removedLines')
  })

  it('reads a stored empty list of removed lines as absent (R24)', () => {
    store({ ...SUMMARY, removedLines: [] })
    const loaded = loadReceiptSummary()
    expect(loaded).toEqual(SUMMARY)
    expect(loaded).not.toHaveProperty('removedLines')
  })

  it.each([
    ['not a list', 'Tazal'],
    ['a line with no name', [{ amount: 1877 }]],
    ['a fractional amount', [{ name: 'Tazal', amount: 18.77 }]],
    ['a line that is not an object', [['Tazal', 1877]]],
  ])('drops a summary whose removed lines are %s (R24)', (_name, lines) => {
    store({ ...SUMMARY, removedLines: lines })
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

describe('the duplicate-receipt key in the summary (M4 plan, H11)', () => {
  it('keeps a valid key across a reload, additively at version 1', () => {
    saveReceiptSummary({ ...SUMMARY, receiptKey: 'qr:123456789:ABC-1' })
    expect(loadReceiptSummary()).toEqual({
      ...SUMMARY,
      receiptKey: 'qr:123456789:ABC-1',
    })
  })

  it('reads a summary saved before M4 (no key) as before', () => {
    store({ ...SUMMARY })
    expect(loadReceiptSummary()).toEqual(SUMMARY)
  })

  it('reads an invalid key as absent, keeping the summary', () => {
    store({ ...SUMMARY, receiptKey: 'nonsense' })
    expect(loadReceiptSummary()).toEqual(SUMMARY)
  })
})
