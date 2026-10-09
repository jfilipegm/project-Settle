// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { cents } from '../../lib/money.ts'
import type { FiscalQr } from './fiscalQr.ts'
import {
  foldText,
  isReceiptKey,
  keyFromQr,
  keyFromSummary,
  receiptKeyForSave,
} from './receiptKey.ts'

function qr(extra: Partial<FiscalQr> = {}): FiscalQr {
  return {
    issuerNif: '502011475',
    date: '2026-10-05',
    total: cents(3847),
    regions: {},
    warnings: [],
    ...extra,
  }
}

describe('the duplicate-receipt key (H11)', () => {
  it('rule 1: the issuer and the ATCUD', () => {
    expect(keyFromQr(qr({ atcud: 'JFX5JJ7K-123', documentType: 'FS' }))).toBe(
      'qr:502011475:JFX5JJ7K-123',
    )
  })

  it('rule 2: without an ATCUD (or the placeholder 0), the issuer, type, date and total', () => {
    expect(keyFromQr(qr({ documentType: 'FS' }))).toBe(
      'qr:502011475:FS:2026-10-05:3847',
    )
    expect(keyFromQr(qr({ atcud: '0', documentType: 'FS' }))).toBe(
      'qr:502011475:FS:2026-10-05:3847',
    )
  })

  it('rule 3: merchant, date and total, folded, only when all are known', () => {
    expect(
      keyFromSummary({
        merchant: '  Pingo  Doce ',
        date: '2026-10-05',
        total: cents(1250),
      }),
    ).toBe('m:pingo doce:2026-10-05:1250')
    expect(foldText('Água Café')).toBe('agua cafe')
    expect(
      keyFromSummary({ merchant: 'Lidl', date: '2026-10-05' }),
    ).toBeUndefined()
    expect(
      keyFromSummary({ date: '2026-10-05', total: cents(1) }),
    ).toBeUndefined()
  })

  it('saves with the import’s key, or rule 3 for an older summary', () => {
    const base = { warnings: [], flaggedItemIds: [] }
    expect(
      receiptKeyForSave({
        ...base,
        receiptKey: 'qr:1:A',
        merchant: 'X',
        date: '2026-01-01',
        total: cents(1),
      }),
    ).toBe('qr:1:A')
    expect(
      receiptKeyForSave({
        ...base,
        merchant: 'Lidl',
        date: '2026-01-01',
        total: cents(100),
      }),
    ).toBe('m:lidl:2026-01-01:100')
    expect(
      receiptKeyForSave({ ...base, merchantTaxId: '502011475' }),
    ).toBeUndefined()
    expect(receiptKeyForSave(null)).toBeUndefined()
  })

  it('accepts only the two key shapes, up to 200 characters', () => {
    expect(isReceiptKey('qr:1:A')).toBe(true)
    expect(isReceiptKey('m:x:2026-01-01:1')).toBe(true)
    expect(isReceiptKey('x:1')).toBe(false)
    expect(isReceiptKey(`m:${'a'.repeat(200)}`)).toBe(false)
    expect(isReceiptKey(42)).toBe(false)
  })
})
