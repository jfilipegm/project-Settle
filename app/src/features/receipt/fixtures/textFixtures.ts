/**
 * Test support: the text receipt fixtures under `text/`. Each `.txt` is a
 * transcript, one line per receipt line, and may start a line with
 * `[c=NN] ` to give it an OCR confidence (95 otherwise). Its
 * `.expected.json` is the whole `ParsedReceipt`, with amounts as decimal
 * strings (`"3.20"`) and quantities as decimals (`"0.532"`).
 */
import type { Cents, Ratio } from '../../../lib/money.ts'
import type { ParsedReceipt, ReceiptWarning, TextLine } from '../model.ts'

export interface ExpectedItem {
  name: string
  quantity: string
  unitPrice: string
  lineTotal: string
  needsCheck: boolean
}

export interface ExpectedReceipt {
  merchant?: string
  merchantTaxId?: string
  date?: string
  currencyHint?: string
  items: ExpectedItem[]
  subtotal?: string
  tax?: string
  tip?: string
  discount?: string
  total?: string
  warnings: ReceiptWarning[]
}

export interface TextFixture {
  name: string
  lines: TextLine[]
  expected: ExpectedReceipt
}

const texts = import.meta.glob<string>('./text/*.txt', {
  query: '?raw',
  import: 'default',
  eager: true,
})
const expectations = import.meta.glob<ExpectedReceipt>(
  './text/*.expected.json',
  { import: 'default', eager: true },
)

function toLines(text: string): TextLine[] {
  return text
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => {
      const match = /^\[c=(\d+)\] (.*)$/.exec(line)
      return match
        ? { text: match[2] ?? '', confidence: Number(match[1]) }
        : { text: line, confidence: 95 }
    })
}

export function loadTextFixtures(): TextFixture[] {
  return Object.entries(texts)
    .map(([path, text]) => {
      const name = path.replace(/^\.\/text\//, '').replace(/\.txt$/, '')
      const expected = expectations[`./text/${name}.expected.json`]
      if (expected === undefined) {
        throw new Error(`Fixture ${name} has no .expected.json`)
      }
      return { name, lines: toLines(text), expected }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** `320` → `"3.20"`. */
export function decimal(value: Cents): string {
  const sign = value < 0 ? '-' : ''
  const magnitude = Math.abs(value)
  return `${sign}${Math.floor(magnitude / 100)}.${String(magnitude % 100).padStart(2, '0')}`
}

/** `532/1000` → `"0.532"`, `2/1` → `"2"`. */
export function ratioDecimal({ numerator, denominator }: Ratio): string {
  const places = Math.round(Math.log10(denominator))
  const whole = Math.floor(numerator / denominator)
  const fraction = String(numerator % denominator)
    .padStart(places, '0')
    .replace(/0+$/, '')
  return fraction === '' ? String(whole) : `${whole}.${fraction}`
}

/** A parsed receipt in the fixtures' shape, for a whole-object comparison. */
export function toExpectedShape(receipt: ParsedReceipt): ExpectedReceipt {
  const shape: ExpectedReceipt = {
    items: receipt.items.map((item) => ({
      name: item.name,
      quantity: ratioDecimal(item.quantity),
      unitPrice: decimal(item.unitPrice),
      lineTotal: decimal(item.lineTotal),
      needsCheck: item.needsCheck,
    })),
    warnings: receipt.warnings,
  }
  if (receipt.merchant !== undefined) shape.merchant = receipt.merchant
  if (receipt.merchantTaxId !== undefined)
    shape.merchantTaxId = receipt.merchantTaxId
  if (receipt.date !== undefined) shape.date = receipt.date
  if (receipt.currencyHint !== undefined)
    shape.currencyHint = receipt.currencyHint
  if (receipt.subtotal !== undefined) shape.subtotal = decimal(receipt.subtotal)
  if (receipt.tax !== undefined) shape.tax = decimal(receipt.tax)
  if (receipt.tip !== undefined) shape.tip = decimal(receipt.tip)
  if (receipt.discount !== undefined) shape.discount = decimal(receipt.discount)
  if (receipt.total !== undefined) shape.total = decimal(receipt.total)
  return shape
}
