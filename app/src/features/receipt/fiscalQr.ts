/**
 * The Portuguese fiscal QR code (Portaria 195/2020, M2 plan "Fiscal QR
 * payload"), and the NIF check digit the parser also uses.
 */
import { cents, type Cents } from '../../lib/money.ts'
import { isoDate } from './parse/amounts.ts'
import type { ReceiptWarning } from './model.ts'

/**
 * A Portuguese NIF: 9 digits whose last is the mod-11 check digit of the
 * first 8.
 */
export function isValidNif(digits: string): boolean {
  if (!/^\d{9}$/.test(digits)) {
    return false
  }
  let total = 0
  for (let i = 0; i < 8; i++) {
    total += Number(digits[i]) * (9 - i)
  }
  const remainder = total % 11
  const check = remainder < 2 ? 0 : 11 - remainder
  return check === Number(digits[8])
}

/**
 * One tax region's bases and IVA: `I` (mainland), `J` (Azores) or `K`
 * (Madeira), fields 1–8.
 */
export interface FiscalQrRegion {
  /** Field 1: the region's code, `PT`, `PT-AC` or `PT-MA`. */
  country: string
  exemptBase?: Cents
  reducedBase?: Cents
  reducedTax?: Cents
  intermediateBase?: Cents
  intermediateTax?: Cents
  normalBase?: Cents
  normalTax?: Cents
}

export interface FiscalQr {
  /** `A`: the issuer's NIF. */
  issuerNif: string
  /** `F`, as ISO `YYYY-MM-DD`. */
  date: string
  /** `O`: the gross total. */
  total: Cents
  /** `D`: the document type (`FS`, `FT`, `FR`, `NC`, …). */
  documentType?: string
  /** `N`: the total tax. */
  totalTax?: Cents
  /** `H`: the ATCUD. */
  atcud?: string
  regions: Partial<Record<'I' | 'J' | 'K', FiscalQrRegion>>
  warnings: ReceiptWarning[]
}

export type ParseFiscalQrResult = { ok: true; qr: FiscalQr } | { ok: false }

const AMOUNT = /^\d+\.\d{2}$/
const MAX = BigInt(Number.MAX_SAFE_INTEGER)

function amount(value: string | undefined): Cents | undefined {
  if (value === undefined || !AMOUNT.test(value)) {
    return undefined
  }
  const whole = BigInt(value.replace('.', ''))
  return whole > MAX ? undefined : cents(Number(whole))
}

const REGION_FIELDS = [
  'exemptBase',
  'reducedBase',
  'reducedTax',
  'intermediateBase',
  'intermediateTax',
  'normalBase',
  'normalTax',
] as const

function region(
  fields: ReadonlyMap<string, string>,
  key: 'I' | 'J' | 'K',
): FiscalQrRegion | undefined {
  const country = fields.get(`${key}1`)
  if (country === undefined) {
    return undefined
  }
  const result: FiscalQrRegion = { country }
  REGION_FIELDS.forEach((name, i) => {
    const value = amount(fields.get(`${key}${i + 2}`))
    if (value !== undefined) {
      result[name] = value
    }
  })
  return result
}

/**
 * Reads a fiscal QR payload: `*`-separated `KEY:value` fields. `A` (a
 * valid NIF), `F` (a real `YYYYMMDD` date) and `O` (`\d+\.\d{2}`) are
 * required; any other QR code is `{ ok: false }`. An optional field that is
 * malformed is left out. Never throws.
 */
export function parseFiscalQr(text: string): ParseFiscalQrResult {
  try {
    const fields = new Map<string, string>()
    for (const part of text.trim().split('*')) {
      if (part === '') {
        continue
      }
      const colon = part.indexOf(':')
      if (colon <= 0) {
        return { ok: false }
      }
      const key = part.slice(0, colon)
      if (!/^[A-Z]\d?$/.test(key) || fields.has(key)) {
        return { ok: false }
      }
      fields.set(key, part.slice(colon + 1))
    }

    const issuerNif = fields.get('A') ?? ''
    const dateField = /^(\d{4})(\d{2})(\d{2})$/.exec(fields.get('F') ?? '')
    const date = dateField
      ? isoDate(
          Number(dateField[1]),
          Number(dateField[2]),
          Number(dateField[3]),
        )
      : undefined
    const total = amount(fields.get('O'))
    if (!isValidNif(issuerNif) || date === undefined || total === undefined) {
      return { ok: false }
    }

    const qr: FiscalQr = { issuerNif, date, total, regions: {}, warnings: [] }
    const documentType = fields.get('D')
    if (documentType !== undefined && documentType !== '') {
      qr.documentType = documentType
      if (documentType === 'NC') {
        qr.warnings.push('creditNote')
      }
    }
    const totalTax = amount(fields.get('N'))
    if (totalTax !== undefined) {
      qr.totalTax = totalTax
    }
    const atcud = fields.get('H')
    if (atcud !== undefined && atcud !== '') {
      qr.atcud = atcud
    }
    for (const key of ['I', 'J', 'K'] as const) {
      const found = region(fields, key)
      if (found !== undefined) {
        qr.regions[key] = found
      }
    }
    return { ok: true, qr }
  } catch {
    return { ok: false }
  }
}
